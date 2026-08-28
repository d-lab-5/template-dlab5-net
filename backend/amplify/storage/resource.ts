import { defineStorage } from "@aws-amplify/backend";

/**
 * Object storage for workspace content and static assets.
 *
 *   workspaces/<slug>/data.json     the workspace object — SOURCE OF TRUTH
 *   assets/*                        branding and icon sets
 *
 * The access rules below are coarse ON PURPOSE. `defineStorage` rules are
 * baked in at deploy time, so they cannot express "the caller is in group
 * app-<slug>" for a group that will be created by hand next month. Per-tenant
 * authorization therefore lives in the objectProxy function, which checks the
 * caller's `cognito:groups` against Workspace.group and hands back a
 * short-lived presigned URL. The browser never talks to S3 directly.
 *
 * THESE RULES ARE NOT THE SECURITY BOUNDARY for workspace data. They exist so
 * that the bucket is not world-open and so that app-admins retain a
 * console-free escape hatch. ADR-0004.
 */
export const storage = defineStorage({
  name: "appStorage",
  access: (allow) => ({
    "workspaces/*": [allow.groups(["app-admins"]).to(["read", "write", "delete"])],
    "assets/*": [
      allow.groups(["app-admins"]).to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
    ],
  }),
});
