import { isMintedId, WORKSPACE_ID_PREFIX } from "./identity.js";
import type { Workspace } from "./types.js";

/**
 * Validation at the boundary, not everywhere.
 *
 * Anything arriving from AppSync, from S3 or from a form is `unknown` until
 * one of these says otherwise. Inside the app a `Workspace` is trusted,
 * because it can only have got there through here.
 *
 * Hand-rolled rather than zod: this package has no dependencies, which is what
 * lets a Lambda import it without dragging a validation library into a cold
 * start. A fork that wants zod should add it here and nowhere else.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Every reason `value` is not a Workspace. Empty means it is one. */
export function workspaceProblems(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["not an object"];
  const w = value as Record<string, unknown>;
  const problems: string[] = [];

  if (!isMintedId(w.slug, WORKSPACE_ID_PREFIX)) {
    problems.push(`slug is not a minted id: ${JSON.stringify(w.slug)}`);
  }
  if (!isNonEmptyString(w.name)) problems.push("name is missing or blank");
  if (!isNonEmptyString(w.group)) problems.push("group is missing or blank");
  if (!isNonEmptyString(w.objectKey)) problems.push("objectKey is missing or blank");
  if (typeof w.version !== "number" || !Number.isInteger(w.version)) {
    problems.push("version is not an integer");
  }

  return problems;
}

export function isWorkspace(value: unknown): value is Workspace {
  return workspaceProblems(value).length === 0;
}

/**
 * Throws with EVERY problem rather than the first.
 *
 * A validator that reports one field at a time turns a malformed row into a
 * sequence of deploys. Listing all of them costs one `join`.
 */
export function assertWorkspace(value: unknown): asserts value is Workspace {
  const problems = workspaceProblems(value);
  if (problems.length > 0) {
    throw new Error(`not a Workspace: ${problems.join("; ")}`);
  }
}
