import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { objectProxy } from "../functions/objectProxy/resource";

/**
 * DynamoDB holds *metadata and structural references only*.
 *
 * A workspace's actual content is an object in S3 at
 * `workspaces/<slug>/data.json`, which is the source of truth — ADR-0004.
 * That split is why `objectKey`, `version` and the lock fields live on
 * Workspace: they are the coordination record for a file this API does not
 * itself store.
 *
 * KEEP IN STEP BY HAND with `packages/core/src/types.ts`. The site cannot
 * import `Schema` from this file — that would pull `@aws-amplify/backend`, and
 * graphql 15, into its TypeScript program and break the build (ADR-0001) — so
 * the frontend's copy of this shape is hand-written. Adding a field here means
 * adding it there in the same commit.
 */
const schema = a.schema({
  /**
   * A tenant.
   *
   * `group` names the Cognito group that may read the workspace and its
   * object, conventionally `app-<slug>`. The group is created by hand in the
   * Cognito console; nothing here creates it, so a Workspace row pointing at a
   * non-existent group is simply a workspace nobody but app-admins can open.
   *
   * Members get read on the METADATA ROW only. They change the object, which
   * lives in S3 behind objectProxy — not these fields. Creating and renaming
   * workspaces is an administrative act because it has to be paired with a
   * Cognito group anyway.
   */
  Workspace: a
    .model({
      /** Minted, never derived from the name. ADR-0003. */
      slug: a.id().required(),
      name: a.string().required(),
      description: a.string(),
      group: a.string().required(),

      /** S3 key of the object, normally `workspaces/<slug>/data.json`. */
      objectKey: a.string().required(),

      /**
       * Monotonic counter bumped on every successful write. Advisory only —
       * correctness comes from the S3 ETag precondition in objectProxy. This
       * exists so the UI can say "you are 3 revisions behind" without
       * fetching the object.
       */
      version: a.integer().default(0),

      /**
       * Advisory edit lock. Considered stale after 30 minutes so a crashed
       * browser cannot park a workspace forever. It improves the UX of
       * concurrent editing; it does not enforce it.
       */
      lockedBy: a.string(),
      lockedAt: a.datetime(),
    })
    .identifier(["slug"])
    .authorization((allow) => [
      allow.group("app-admins"),
      allow.groupDefinedIn("group").to(["read"]),
    ]),

  /** What objectProxy hands back for both reads and writes. */
  ObjectAccess: a.customType({
    /** Presigned GET. Absent on writes and when no object exists yet. */
    url: a.string(),
    /** Current ETag — the token a subsequent write must present. */
    etag: a.string(),
    exists: a.boolean().required(),
    key: a.string().required(),
  }),

  /**
   * Reading and writing a workspace's object.
   *
   * Custom mutations rather than generated CRUD, because the authorization
   * question — "is the caller in this workspace's group?" — cannot be
   * expressed in a static rule when the group will be created next month.
   * `.authorization(allow => [allow.authenticated()])` here means "signed in
   * is enough to CALL this"; the function then decides whether the caller may
   * touch this particular workspace. Do not read the rule as the boundary.
   *
   * A READ hands back a short-lived presigned GET rather than the bytes: an
   * object can be megabytes, and AppSync is not a file transfer protocol.
   *
   * A WRITE does the opposite and passes the body THROUGH the function rather
   * than handing out a presigned PUT. That is deliberate: the correctness
   * mechanism is an S3 `If-Match` precondition, and doing the PUT here means
   * the condition cannot be dropped, altered or replayed by the caller.
   */
  readObject: a
    .mutation()
    .arguments({ slug: a.string().required() })
    .returns(a.ref("ObjectAccess"))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(objectProxy)),

  writeObject: a
    .mutation()
    .arguments({
      slug: a.string().required(),
      /** The object to store, serialised. */
      body: a.string().required(),
      /**
       * The ETag the caller last read. The write is refused unless S3 still
       * holds it — that precondition, not the advisory lock, is what makes
       * concurrent editing correct.
       */
      etag: a.string(),
      /** Set on the very first write, when there is no object to match. */
      expectAbsent: a.boolean(),
    })
    .returns(a.ref("ObjectAccess"))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(objectProxy)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Cognito only. There is no API key and no IAM mode: every caller is a
    // signed-in person or a signed-in agent, and an API key would be a second
    // authorization story to keep correct. ADR-0002.
    defaultAuthorizationMode: "userPool",
  },
});
