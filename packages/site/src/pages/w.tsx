import * as React from "react";
import type { HeadFC, PageProps } from "gatsby";
import { Shell } from "../components/Shell";
import { getWorkspace } from "../lib/data";
import type { Workspace } from "../lib/data";

/**
 * Every route under /w/.
 *
 * This is a client-only page (see `onCreatePage` in gatsby-node.ts): there is
 * no build-time list of workspace ids, and a workspace's content is
 * authenticated per-group data in S3, so there is nothing to statically
 * render. The id and the view come out of the URL at runtime.
 *
 * ONE page component for all five views rather than five matchPath routes.
 * The alternative needs a hosting rewrite per route (CLAUDE.md constraint 11)
 * — configuration that lives outside this repository and that nobody will
 * remember to add.
 *
 * When a view outgrows a `case`, move it to its own component in
 * src/components/ and keep the switch as the router. Do not turn the switch
 * into a lookup table: the whole value of it is that the reader sees every
 * route a workspace has in one screenful.
 */

const VIEWS = [
  "overview",
  "items",
  "reports",
  "import",
  "export",
] as const;

type View = (typeof VIEWS)[number];

/**
 * `/w/w-4k9mqhtx2p/items/` → `{ slug, view }`.
 *
 * A missing or unrecognised trailing segment resolves to "overview" rather
 * than 404: /w/<slug>/ is the workspace's home, and a typo in a view name is
 * better answered with the workspace than with a dead end.
 */
function parse(pathname: string): { slug?: string; view: View } {
  const parts = pathname.split("/").filter(Boolean); // ["w", slug, view?]
  const slug = parts[1];
  const candidate = parts[2] as View | undefined;
  return {
    slug,
    view: candidate && VIEWS.includes(candidate) ? candidate : "overview",
  };
}

const WorkspacePage: React.FC<PageProps> = ({ location }) => {
  const { slug, view } = parse(location.pathname);

  const [workspace, setWorkspace] = React.useState<Workspace | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "denied">(
    "loading"
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!slug) {
      setState("denied");
      return;
    }
    getWorkspace(slug)
      .then((found) => {
        setWorkspace(found);
        // null covers both "no such workspace" and "not yours". AppSync does
        // not distinguish them and neither does this screen — telling them
        // apart would let anyone enumerate ids.
        setState(found ? "ready" : "denied");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setState("denied");
      });
  }, [slug]);

  if (state === "loading") {
    return (
      <Shell workspace={slug ? { slug, active: view } : undefined}>
        <p className="app-muted">Loading…</p>
      </Shell>
    );
  }

  if (state === "denied" || !workspace || !slug) {
    return (
      <Shell>
        <h1>Not available</h1>
        <div className="app-empty">
          <p>No such workspace, or you do not have access to it.</p>
          <p className="app-muted">
            Access is granted by adding your account to the workspace&rsquo;s{" "}
            <code>app-&lt;slug&gt;</code> group in Cognito.
          </p>
          {error && (
            <p className="app-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell workspace={{ slug, name: workspace.name, active: view }}>
      <div className="app-pagehead">
        <h1>{LABELS[view]}</h1>
        <span className="app-muted">{workspace.name}</span>
      </div>
      <ViewBody view={view} workspace={workspace} />
    </Shell>
  );
};

const LABELS: Record<View, string> = {
  overview: "Overview",
  items: "Items",
  reports: "Reports",
  import: "Import",
  export: "Export",
};

/**
 * The placeholders.
 *
 * Each one names what belongs there and, where blueprinting has a worked
 * version, points at it. A placeholder that only says "TODO" is a placeholder
 * that gets deleted and reinvented.
 */
function ViewBody({
  view,
  workspace,
}: {
  view: View;
  workspace: Workspace;
}) {
  switch (view) {
    case "overview":
      return (
        <div className="app-panel">
          <h2 className="app-panel__title">This workspace at a glance</h2>
          <dl className="app-stats">
            <div className="app-stat">
              <dt>{workspace.version ?? 0}</dt>
              <dd>Revisions</dd>
            </div>
            <div className="app-stat">
              <dt>{workspace.lockedBy ? "locked" : "free"}</dt>
              <dd>Edit state</dd>
            </div>
          </dl>
          <p className="app-panel__hint">
            The workspace object lives in S3 at <code>{workspace.objectKey}</code>{" "}
            and is read through <code>loadObject()</code> in{" "}
            <code>src/lib/data.ts</code>, which returns the content and the ETag
            a later save must present. Build the real screen on that pair.
          </p>
        </div>
      );

    case "items":
      return (
        <div className="app-panel">
          <h2 className="app-panel__title">Whatever this app is about</h2>
          <p className="app-panel__hint">
            The workspace&rsquo;s own content: the list, the board, the canvas.
            It comes from <code>loadObject()</code>, is edited in memory, and
            goes back through <code>saveObject(slug, value, etag)</code>. Handle
            the rejected save — objectProxy throws a message that already tells
            the reader to reload — because that is the case a demo never hits
            and a second user hits on their first afternoon.
          </p>
        </div>
      );

    case "reports":
      return (
        <div className="app-panel">
          <h2 className="app-panel__title">Derived views</h2>
          <p className="app-panel__hint">
            Anything computed from the workspace rather than stored in it.
            Compute it in <code>@dlab5/app-core</code> rather than in the
            component: it is then testable with <code>node --test</code>, and a
            future Lambda or CLI can produce the same answer.
          </p>
        </div>
      );

    case "import":
      return (
        <div className="app-panel">
          <h2 className="app-panel__title">Getting things in</h2>
          <p className="app-panel__hint">
            Parse in <code>@dlab5/app-core</code>, validate at the boundary with{" "}
            <code>assertWorkspace</code>-style checks that report every problem
            at once, and only then write. Blueprinting&rsquo;s{" "}
            <code>packages/core/src/import/</code> is the worked version.
          </p>
        </div>
      );

    case "export":
      return (
        <div className="app-panel">
          <h2 className="app-panel__title">Getting things out</h2>
          <p className="app-panel__hint">
            A round trip that is only ever tested against itself proves nothing.
            Blueprinting&rsquo;s <code>verify:bundle</code> exports, re-imports
            under a fresh id, exports THAT and compares byte for byte — going
            back out through S3 is the point.
          </p>
        </div>
      );
  }
}

export default WorkspacePage;

export const Head: HeadFC = () => <title>Workspace · template.dlab5</title>;
