/**
 * The shapes both sides of the app agree on.
 *
 * This module is the ONE place the Workspace shape is written down for the
 * frontend. It is deliberately hand-written rather than derived from the
 * Amplify schema: importing `Schema` from `backend/amplify/data/resource`
 * would pull `@aws-amplify/backend` — and with it graphql 15 — into the site's
 * TypeScript program, which is the thing ADR-0001 exists to prevent.
 *
 * The cost of that is real and worth naming: this file and
 * `backend/amplify/data/resource.ts` must be kept in step BY HAND. When you
 * add a field to the model, add it here in the same commit.
 */

/**
 * A tenant. Everything a signed-in person works on hangs off one.
 *
 * `slug` is the minted opaque id (ADR-0003) — `w-` plus ten characters. It is
 * the DynamoDB partition key, and both `group` and `objectKey` are computed
 * from it. Never render it where a name belongs.
 */
export interface Workspace {
  slug: string;
  name: string;
  description?: string | null;
  /** The Cognito group whose members may read this workspace: `app-<slug>`. */
  group: string;
  /** S3 key of the workspace's object, normally `workspaces/<slug>/data.json`. */
  objectKey: string;
  /**
   * Bumped on every successful write. ADVISORY ONLY — correctness comes from
   * the S3 ETag precondition in objectProxy (ADR-0004). This exists so the UI
   * can say "you are three revisions behind" without fetching the object.
   */
  version: number;
  /**
   * Advisory edit lock. Considered stale after 30 minutes so a crashed browser
   * cannot park a workspace forever. It improves the UX of concurrent editing;
   * it does not enforce it.
   */
  lockedBy?: string | null;
  lockedAt?: string | null;
}

/** How long a lock is honoured before the UI treats it as abandoned. */
export const LOCK_STALE_AFTER_MS = 30 * 60 * 1000;

/** The Cognito group naming scheme. Change it here and in auth/resource.ts. */
export const GROUP_PREFIX = "app-";
export const ADMIN_GROUP = "app-admins";

/** `app-w-4k9mqhtx2p` — the group that may read one workspace. */
export const groupForWorkspace = (slug: string): string =>
  `${GROUP_PREFIX}${slug}`;

/** `workspaces/w-4k9mqhtx2p/data.json` — where its object lives in S3. */
export const objectKeyForWorkspace = (slug: string): string =>
  `workspaces/${slug}/data.json`;

/** True while `lockedAt` is recent enough that the lock should be respected. */
export function isLockLive(
  workspace: Pick<Workspace, "lockedAt">,
  now: number = Date.now()
): boolean {
  if (!workspace.lockedAt) return false;
  const at = Date.parse(workspace.lockedAt);
  return Number.isFinite(at) && now - at < LOCK_STALE_AFTER_MS;
}
