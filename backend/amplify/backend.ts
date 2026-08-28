import { defineBackend } from "@aws-amplify/backend";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { objectProxy } from "./functions/objectProxy/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  objectProxy,
});

/* ------------------------------------------------------------------------ *
 * Auth hardening — neither switch is exposed by defineAuth.
 * ------------------------------------------------------------------------ */

const { cfnUserPool, cfnIdentityPool } = backend.auth.resources.cfnResources;

// Accounts are created by an administrator, who must also place the user in
// the right per-workspace group. Closing self-signup at the USER POOL level
// rather than hiding it in the UI keeps that invariant true even if someone
// calls the Cognito API directly. ADR-0002.
cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

// Nothing here is world-readable. Refusing unauthenticated identities removes
// the guest IAM role entirely rather than leaving it present but unused.
cfnIdentityPool.allowUnauthenticatedIdentities = false;

/* ------------------------------------------------------------------------ *
 * Point-in-time recovery.
 *
 * The Workspace row carries the objectKey and version that make the S3 object
 * findable and its concurrency checkable. Losing the row orphans the object,
 * which is still sitting in the bucket under an id nobody can now name.
 * ------------------------------------------------------------------------ */

backend.data.resources.cfnResources.amplifyDynamoDbTables[
  "Workspace"
].pointInTimeRecoveryEnabled = true;

/* ------------------------------------------------------------------------ *
 * objectProxy.
 *
 * Gen 2 does NOT auto-grant cross-resource IAM to a function wired as a
 * custom-mutation handler, so every permission below is explicit. This block
 * is the pattern to copy for the next function a fork adds — including the
 * habit of granting the narrowest action that does the job and saying, in a
 * comment, what the function must therefore be unable to do.
 * ------------------------------------------------------------------------ */

const workspaceTable = backend.data.resources.tables["Workspace"];
const bucket = backend.storage.resources.bucket;
const proxyLambda = backend.objectProxy.resources.lambda;

// Read-only on Workspace: the function decides whether a caller may touch an
// object, and never edits the workspace row itself. Bumping `version` is the
// caller's job through the generated mutation, precisely so that this
// function cannot rewrite the metadata it is authorising against.
proxyLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["dynamodb:GetItem"],
    resources: [workspaceTable.tableArn],
  })
);

// Scoped to the workspaces/ prefix rather than the whole bucket. The function
// has no business reading branding assets, and will not be able to when
// someone later puts something more interesting under assets/.
proxyLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:GetObject", "s3:PutObject"],
    resources: [`${bucket.bucketArn}/workspaces/*`],
  })
);

// ListBucket is required to tell "no object yet" from "not allowed".
//
// Without it S3 answers HeadObject on a missing key with 403 AccessDenied
// rather than 404 NotFound, because it will not reveal whether an object
// exists to a caller who cannot list. A workspace that simply has no object
// yet then looks identical to a permissions failure, and the empty state
// becomes an error screen. Granted on the BUCKET itself — ListBucket is a
// bucket-level action — and conditioned to the same prefix as the object
// grant above.
proxyLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:ListBucket"],
    resources: [bucket.bucketArn],
    conditions: { StringLike: { "s3:prefix": ["workspaces/*"] } },
  })
);

// Names, not ARNs: the handler needs something it can pass to GetCommand and
// PutObjectCommand. Resolvable here because objectProxy sits in the data
// stack (see its resource.ts) and the bucket is a plain cross-stack export.
backend.objectProxy.addEnvironment(
  "WORKSPACE_TABLE_NAME",
  workspaceTable.tableName
);
backend.objectProxy.addEnvironment("OBJECT_BUCKET_NAME", bucket.bucketName);

/* ------------------------------------------------------------------------ *
 * NOT HERE, and deliberately so.
 *
 * An admin function that mints a workspace row AND its `app-<slug>` Cognito
 * group in one call. In this template the row is created through the
 * generated mutation and the group by hand in the console, which is honest
 * about the state and keeps the backend to one example function.
 *
 * When a fork needs it, copy
 * `blueprinting-dlab5-net/backend/amplify/functions/projectAdmin/`. Read its
 * comments first: an IAM grant naming `backend.auth.resources.userPool.
 * userPoolArn` closes a CloudFormation cycle, because the auth stack already
 * references function code. The working shape is to wildcard the userpool ARN
 * to this account and region, and to recover the real pool id at runtime from
 * the caller's token issuer — which is authoritative anyway, since it is the
 * pool that signed the request. That cost a deploy to find out.
 * ------------------------------------------------------------------------ */

export default backend;
