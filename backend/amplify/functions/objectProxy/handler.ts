import type { AppSyncResolverEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ADMIN_GROUP, claimsOf } from "../shared/claims";

/**
 * Per-workspace access to the object in S3.
 *
 * THIS IS THE SECURITY BOUNDARY for workspace content. The `defineStorage`
 * rules are coarse, the AppSync `allow.authenticated()` rule only says the
 * caller is signed in, and the UI's checks are ergonomics. Everything that
 * decides whether *this* person may touch *this* workspace happens here.
 *
 * Reads hand back a short-lived presigned GET, so the object never travels
 * through AppSync. Writes go through this function rather than a presigned
 * PUT, because the correctness mechanism is an S3 `If-Match` precondition and
 * doing it here means the condition cannot be dropped, altered or replayed by
 * the caller. ADR-0004.
 */

const URL_TTL_SECONDS = 300;

// Constructed at module scope so the connection pool survives a warm
// invocation. Neither client reads configuration; both take the execution
// role and region from the Lambda environment.
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET = process.env.OBJECT_BUCKET_NAME!;
const WORKSPACE_TABLE = process.env.WORKSPACE_TABLE_NAME!;

type Action = "read" | "write";

interface Args {
  slug: string;
  /** The object to store. Present on `write` only — the discriminator. */
  body?: string;
  /**
   * The ETag the caller believes is current. Required for `write` unless
   * `expectAbsent` is set. A mismatch is a lost update and is refused.
   */
  etag?: string;
  /** Set on the very first write, when there is no object to match against. */
  expectAbsent?: boolean;
}

export interface ObjectAccessResult {
  /** Presigned GET. Only on `read`, and only when the object exists. */
  url?: string;
  /** Current ETag, so a subsequent write can name what it is replacing. */
  etag?: string;
  /** False when the workspace has no object yet — a legitimate empty state. */
  exists: boolean;
  key: string;
}

/** A refusal the caller is allowed to see. Anything else becomes a 500. */
class Refused extends Error {}

/**
 * Resolves the workspace and confirms the caller may touch it.
 *
 * Throws the SAME message whether the workspace is missing or merely
 * forbidden. Distinguishing them would let any signed-in user enumerate
 * workspace ids by watching which error comes back.
 */
async function authorize(slug: string, identity: unknown) {
  const { groups } = claimsOf(identity);

  const { Item } = await ddb.send(
    new GetCommand({ TableName: WORKSPACE_TABLE, Key: { slug } })
  );

  const denied = new Refused("No such workspace, or you cannot access it.");
  if (!Item) throw denied;

  const workspaceGroup = Item.group as string | undefined;
  const permitted =
    groups.includes(ADMIN_GROUP) ||
    (workspaceGroup !== undefined && groups.includes(workspaceGroup));
  if (!permitted) throw denied;

  return { key: (Item.objectKey as string) || `workspaces/${slug}/data.json` };
}

/**
 * The current ETag, or undefined when there is no object.
 *
 * "No object yet" must be distinguishable from "not allowed", which is why
 * backend.ts grants `s3:ListBucket` on the bucket in addition to the object
 * actions: without it S3 answers HeadObject on a missing key with 403
 * AccessDenied rather than 404, since it will not reveal whether an object
 * exists to a caller who cannot list. A brand-new workspace would then look
 * exactly like a permissions failure.
 */
async function head(key: string): Promise<string | undefined> {
  try {
    const r = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key })
    );
    return r.ETag;
  } catch (err) {
    const name = (err as { name?: string }).name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
      return undefined;
    }
    throw err;
  }
}

export const handler = async (
  event: AppSyncResolverEvent<Args> & { info?: { fieldName?: string } }
): Promise<ObjectAccessResult> => {
  const { slug, body, etag, expectAbsent } = event.arguments;

  /*
   * Which mutation this is, decided from the ARGUMENTS rather than from
   * event.info.fieldName alone.
   *
   * Both mutations share this handler, and relying on the field name has
   * failed silently before: the write took the read branch, returned
   * {exists:false} and stored nothing, with no error anywhere. `body` is
   * present on exactly one of the two, so it is the reliable discriminator.
   * The field name is kept as a cross-check and logged, so a future mismatch
   * is visible rather than silent.
   */
  const fieldName = event.info?.fieldName;
  const action: Action = body !== undefined ? "write" : "read";
  if (fieldName && fieldName !== `${action}Object`) {
    console.warn(
      `[objectProxy] field ${fieldName} but arguments say ${action}`
    );
  }

  try {
    const { key } = await authorize(slug, event.identity);

    if (action === "read") {
      const current = await head(key);
      if (current === undefined) return { exists: false, key };

      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        { expiresIn: URL_TTL_SECONDS }
      );
      return { exists: true, key, url, etag: current };
    }

    // -- write ------------------------------------------------------------
    //
    // The precondition is not optional. A caller that supplies neither an
    // ETag nor expectAbsent is asking to overwrite whatever is there, which
    // is exactly the lost update this function exists to prevent.
    if (!expectAbsent && !etag) {
      throw new Refused(
        "A write needs the ETag it is replacing, or expectAbsent for the " +
          "first one."
      );
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ...(expectAbsent ? { IfNoneMatch: "*" } : { IfMatch: etag }),
      })
    );

    // Re-read rather than trusting the PutObject response: the caller's next
    // write must name an ETag S3 will actually accept.
    return { exists: true, key, etag: await head(key) };
  } catch (err) {
    if (err instanceof Refused) throw new Error(err.message);

    // A failed precondition is a normal outcome of two people editing, not a
    // fault. It gets its own message so the UI can offer "reload and retry"
    // instead of a stack trace.
    const name = (err as { name?: string }).name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (name === "PreconditionFailed" || status === 412 || status === 409) {
      throw new Error(
        "Someone else saved this workspace while you were editing. Reload " +
          "to pick up their changes, then save again."
      );
    }

    // Everything else is a bug or an outage. Log the detail, return a generic
    // message: an S3 or DynamoDB error text can name a bucket or a table.
    console.error("[objectProxy] unexpected failure", err);
    throw new Error("The workspace store is unavailable. Try again.");
  }
};
