import assert from "node:assert/strict";
import { test } from "node:test";

// Imported from dist/, not src/. That is the point of running `npm run build`
// first in the test script: these assertions run against the artefact
// packages/site actually consumes, so a broken exports map fails here rather
// than during a Gatsby build.
import {
  groupForWorkspace,
  isLockLive,
  isMintedId,
  isWorkspace,
  mintId,
  mintWorkspaceId,
  objectKeyForWorkspace,
  workspaceProblems,
} from "../dist/index.js";

test("a minted id carries its prefix and a fixed length", () => {
  const id = mintWorkspaceId();
  assert.match(id, /^w-[23456789abcdefghjkmnpqrstuvwxyz]{10}$/);
  assert.ok(isMintedId(id, "w"));
  assert.ok(!isMintedId(id, "d"), "the prefix is part of the shape");
});

test("two mints differ", () => {
  const ids = new Set(Array.from({ length: 500 }, mintWorkspaceId));
  assert.equal(ids.size, 500);
});

test("the alphabet excludes the characters people misread", () => {
  const ids = Array.from({ length: 200 }, mintWorkspaceId).join("");
  for (const banned of ["0", "1", "l", "o", "i"]) {
    assert.ok(!ids.includes(banned), `minted ids must not contain "${banned}"`);
  }
});

test("a bad prefix is refused rather than sanitised", () => {
  assert.throws(() => mintId("W"), /1-4 lowercase letters/);
  assert.throws(() => mintId(""), /1-4 lowercase letters/);
});

test("group and object key are derived from the id, never from the name", () => {
  const slug = mintWorkspaceId();
  assert.equal(groupForWorkspace(slug), `app-${slug}`);
  assert.equal(objectKeyForWorkspace(slug), `workspaces/${slug}/data.json`);
});

test("validation reports every problem at once", () => {
  const problems = workspaceProblems({ slug: "not-minted", version: 1.5 });
  assert.ok(problems.length >= 4, `expected several problems, got ${problems}`);
  assert.ok(problems.some((p) => p.includes("slug")));
  assert.ok(problems.some((p) => p.includes("name")));
  assert.ok(problems.some((p) => p.includes("version")));
});

test("a well-formed workspace validates", () => {
  const slug = mintWorkspaceId();
  assert.ok(
    isWorkspace({
      slug,
      name: "Fleet",
      group: groupForWorkspace(slug),
      objectKey: objectKeyForWorkspace(slug),
      version: 0,
    })
  );
});

test("a lock goes stale", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  const fresh = new Date(now - 60_000).toISOString();
  const old = new Date(now - 60 * 60_000).toISOString();
  assert.ok(isLockLive({ lockedAt: fresh }, now));
  assert.ok(!isLockLive({ lockedAt: old }, now));
  assert.ok(!isLockLive({ lockedAt: null }, now));
});
