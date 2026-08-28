/**
 * Minting opaque ids.
 *
 * A workspace's id is minted, never derived from its name. Names change; ids
 * cannot, because the id is the DynamoDB partition key, and both the Cognito
 * group (`app-<id>`) and the S3 prefix (`workspaces/<id>/`) are computed from
 * it. Deriving an id from a name means a rename is a migration. ADR-0003.
 *
 * The alphabet excludes the characters that get misread when someone copies an
 * id out of a console by eye — 0/O, 1/l/I — so a support conversation about
 * "workspace w-g0hkm..." does not turn into a spelling exercise.
 */

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Ten characters of the alphabet above is ~49 bits. */
const LENGTH = 10;

/**
 * `crypto.getRandomValues`, not `Math.random`.
 *
 * Not because an id is a secret — it is not, it appears in URLs — but because
 * `Math.random` is seeded per process and two Lambdas cold-starting in the
 * same millisecond have collided in the wild. `crypto` is available unflagged
 * on Node 18+ and in every browser this app supports.
 *
 * Rejection sampling rather than `% ALPHABET.length`: 256 is not a multiple of
 * 31, so the modulo would make the first few letters slightly likelier. The
 * bias is harmless here and the fix is three lines, so there is no reason to
 * ship the biased version and explain it later.
 */
function randomChars(length: number): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  const buffer = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * `mintId("w")` → `"w-4k9mqhtx2p"`.
 *
 * The prefix says what kind of thing the id names, so a value read out of a
 * log or a URL identifies itself without its surrounding field name.
 */
export function mintId(prefix: string): string {
  if (!/^[a-z]{1,4}$/.test(prefix)) {
    throw new Error(`id prefix must be 1-4 lowercase letters, got "${prefix}"`);
  }
  return `${prefix}-${randomChars(LENGTH)}`;
}

/** True for a value shaped like `mintId(prefix)` output. */
export function isMintedId(value: unknown, prefix: string): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${prefix}-[${ALPHABET}]{${LENGTH}}$`).test(value)
  );
}

/** The prefix workspaces are minted with. */
export const WORKSPACE_ID_PREFIX = "w";

export const mintWorkspaceId = (): string => mintId(WORKSPACE_ID_PREFIX);
