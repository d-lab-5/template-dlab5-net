/**
 * The package's only entry point.
 *
 * packages/site imports from "@dlab5/app-core", never from a deep path into
 * dist/. Keeping one barrel means the internal file layout can change without
 * touching the site, and it is the list to read to see what this package is.
 */
export {
  mintId,
  isMintedId,
  mintWorkspaceId,
  WORKSPACE_ID_PREFIX,
} from "./identity.js";

export {
  ADMIN_GROUP,
  GROUP_PREFIX,
  LOCK_STALE_AFTER_MS,
  groupForWorkspace,
  isLockLive,
  objectKeyForWorkspace,
} from "./types.js";
export type { Workspace } from "./types.js";

export {
  assertWorkspace,
  isWorkspace,
  workspaceProblems,
} from "./validate.js";
