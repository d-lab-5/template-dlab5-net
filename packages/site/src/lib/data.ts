import { generateClient } from "aws-amplify/api";
import type { Workspace } from "@dlab5/app-core";

/**
 * The AppSync client, and everything layered on it.
 *
 * The client is deliberately UNTYPED rather than parameterised with `Schema`
 * from backend/amplify/data/resource. Importing that type would pull
 * @aws-amplify/backend into the site's TypeScript program, and with it the
 * graphql 15 tree that ADR-0001 keeps out of the frontend. The result shapes
 * below are narrow, hand-written for that reason, and MUST BE KEPT IN STEP
 * with data/resource.ts by hand. Constraint 12 in the dlab5-fullstack-template skill.
 *
 * Verify the boundary still holds:
 *   npx tsc --noEmit -p packages/site/tsconfig.json --listFiles \
 *     | grep -c '@aws-amplify/backend/'      # must print 0
 *
 * Queries are written out as GraphQL strings rather than built through the
 * generated models client, for the same reason: the models client is where
 * the schema type would otherwise be needed.
 */

export type { Workspace };

/** What objectProxy returns for a read or a write. */
export interface ObjectAccess {
  key: string;
  exists: boolean;
  url?: string | null;
  etag?: string | null;
}

/* -- queries --------------------------------------------------------------- */

const WORKSPACE_FIELDS = `
      slug
      name
      description
      group
      objectKey
      version
      lockedBy
      lockedAt
`;

const LIST_WORKSPACES = /* GraphQL */ `
  query ListWorkspaces {
    listWorkspaces {
      items {${WORKSPACE_FIELDS}}
    }
  }
`;

const GET_WORKSPACE = /* GraphQL */ `
  query GetWorkspace($slug: ID!) {
    getWorkspace(slug: $slug) {${WORKSPACE_FIELDS}}
  }
`;

const CREATE_WORKSPACE = /* GraphQL */ `
  mutation CreateWorkspace($input: CreateWorkspaceInput!) {
    createWorkspace(input: $input) {${WORKSPACE_FIELDS}}
  }
`;

const OBJECT_ACCESS_FIELDS = `
      key
      exists
      url
      etag
`;

const READ_OBJECT = /* GraphQL */ `
  mutation ReadObject($slug: String!) {
    readObject(slug: $slug) {${OBJECT_ACCESS_FIELDS}}
  }
`;

const WRITE_OBJECT = /* GraphQL */ `
  mutation WriteObject(
    $slug: String!
    $body: String!
    $etag: String
    $expectAbsent: Boolean
  ) {
    writeObject(
      slug: $slug
      body: $body
      etag: $etag
      expectAbsent: $expectAbsent
    ) {${OBJECT_ACCESS_FIELDS}}
  }
`;

/* -- plumbing -------------------------------------------------------------- */

interface GraphQLResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * AppSync returns errors ALONGSIDE data rather than instead of it, so a
 * caller that only reads `.data` silently drops failures. Everything goes
 * through here so that cannot happen in one call site and not another.
 */
function unwrap<T>(result: GraphQLResult<T>): T {
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join("; "));
  }
  if (!result.data) throw new Error("The API returned no data.");
  return result.data;
}

const client = () => generateClient();

/* -- workspaces ------------------------------------------------------------ */

/**
 * Every workspace the caller may see.
 *
 * The list comes from the Workspace table, NOT from the user's Cognito groups.
 * AppSync applies the authorization rules server-side, so an app-admins member
 * sees every workspace while everyone else sees only theirs. Deriving the list
 * from `session.workspaceSlugs` looks equivalent and gets admins wrong.
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const result = (await client().graphql({
    query: LIST_WORKSPACES,
  })) as GraphQLResult<{ listWorkspaces: { items: Workspace[] } }>;
  return unwrap(result).listWorkspaces.items;
}

/**
 * One workspace's metadata row.
 *
 * Separate from `listWorkspaces` because a workspace page needs the row
 * itself: its NAME is what the page is titled with, and under ADR-0003 the id
 * in the URL is opaque and says nothing a reader can use.
 *
 * Returns null when the row does not exist OR the caller may not see it.
 * AppSync does not distinguish the two, and neither should the UI — doing so
 * would let any signed-in user enumerate workspace ids.
 */
export async function getWorkspace(slug: string): Promise<Workspace | null> {
  const result = (await client().graphql({
    query: GET_WORKSPACE,
    variables: { slug },
  })) as GraphQLResult<{ getWorkspace: Workspace | null }>;
  return unwrap(result).getWorkspace ?? null;
}

/**
 * Creates the workspace row.
 *
 * NOTE, and this is the template's one deliberate rough edge: this calls the
 * GENERATED create mutation, which writes the row and nothing else. The
 * `app-<slug>` Cognito group named by `group` must then be created by hand in
 * the console, or the workspace is one only app-admins can open.
 *
 * When that becomes tiresome, replace this with a call to an admin Lambda that
 * does both — see the note at the foot of backend/amplify/backend.ts. The
 * Cognito calls need admin permissions the browser must never hold, so the
 * check belongs in the function, not here.
 */
export async function createWorkspace(input: {
  slug: string;
  name: string;
  description?: string;
  group: string;
  objectKey: string;
}): Promise<Workspace> {
  const result = (await client().graphql({
    query: CREATE_WORKSPACE,
    variables: {
      input: {
        slug: input.slug,
        name: input.name,
        description: input.description || undefined,
        group: input.group,
        objectKey: input.objectKey,
        version: 0,
      },
    },
  })) as GraphQLResult<{ createWorkspace: Workspace }>;
  return unwrap(result).createWorkspace;
}

/* -- the object ------------------------------------------------------------ */

/**
 * Loads a workspace's object.
 *
 * Two hops: AppSync hands back a short-lived presigned GET, then the browser
 * fetches the bytes from S3 directly. The object never travels through
 * AppSync, which has neither the payload limits nor the pricing for it.
 *
 * The ETag comes back alongside the content because it is the token a later
 * save must present. Without it the save would have to be unconditional, and
 * objectProxy refuses those.
 */
export async function loadObject<T = unknown>(
  slug: string
): Promise<{ value: T | null; etag: string | null }> {
  const result = (await client().graphql({
    query: READ_OBJECT,
    variables: { slug },
  })) as GraphQLResult<{ readObject: ObjectAccess }>;

  const access = unwrap(result).readObject;
  // A workspace with no object yet is a legitimate empty state, not an error.
  if (!access.exists || !access.url) return { value: null, etag: null };

  const response = await fetch(access.url);
  if (!response.ok) {
    throw new Error(`Could not read the workspace object (${response.status}).`);
  }
  return { value: (await response.json()) as T, etag: access.etag ?? null };
}

/**
 * Saves a workspace's object.
 *
 * `etag` is what `loadObject` last returned; pass null for the first save.
 * The precondition is enforced in S3 by objectProxy, so a concurrent save
 * fails loudly rather than silently discarding someone's work. Catch the
 * error and offer a reload — the message it throws already says so.
 */
export async function saveObject(
  slug: string,
  value: unknown,
  etag: string | null
): Promise<string | null> {
  const result = (await client().graphql({
    query: WRITE_OBJECT,
    variables: {
      slug,
      body: JSON.stringify(value),
      etag: etag ?? undefined,
      expectAbsent: etag === null ? true : undefined,
    },
  })) as GraphQLResult<{ writeObject: ObjectAccess }>;
  return unwrap(result).writeObject.etag ?? null;
}
