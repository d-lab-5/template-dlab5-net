import * as React from "react";
import type { HeadFC, PageProps } from "gatsby";
import { Shell } from "../components/Shell";
import { useSession } from "../components/AuthGate";
import { NewWorkspaceForm } from "../components/NewWorkspaceForm";
import { listWorkspaces } from "../lib/data";
import type { Workspace } from "../lib/data";

/**
 * The launcher.
 *
 * Reached only after AuthGate has a session, so there is no signed-out branch
 * to handle here — and no page below needs one either. That is the whole point
 * of gating at the root.
 */
const IndexPage: React.FC<PageProps> = () => {
  const session = useSession();
  const [workspaces, setWorkspaces] = React.useState<Workspace[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    listWorkspaces()
      .then(setWorkspaces)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  return (
    <Shell>
      <div className="app-hero">
        <div className="app-hero__copy">
          {/* No standing copy here. The cards below say what this page is for,
              and a paragraph explaining the product to someone who has already
              signed in is a paragraph nobody reads twice. */}
          {session.isAdmin && !creating && (
            <div className="app-hero__actions">
              <button
                type="button"
                className="app-button"
                onClick={() => setCreating(true)}
              >
                New workspace
              </button>
            </div>
          )}

          <dl className="app-stats">
            <div className="app-stat">
              <dt>{workspaces?.length ?? "—"}</dt>
              <dd>Workspaces</dd>
            </div>
            <div className="app-stat">
              <dt>
                {session.groups.filter((g) => g.startsWith("app-")).length}
              </dt>
              <dd>Groups you hold</dd>
            </div>
            <div className="app-stat">
              <dt>{session.isAdmin ? "admin" : "member"}</dt>
              <dd>Your role</dd>
            </div>
          </dl>
        </div>
      </div>

      {session.isAdmin && creating && (
        <NewWorkspaceForm
          onCreated={(workspace) =>
            setWorkspaces((current) => [...(current ?? []), workspace])
          }
        />
      )}

      <h1 className="app-cards__heading">Workspaces</h1>

      {error && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}

      {!workspaces && !error && <p className="app-muted">Loading…</p>}

      {workspaces?.length === 0 && (
        <div className="app-empty">
          <p>
            {session.isAdmin
              ? "No workspaces yet."
              : "You do not have access to any workspace."}
          </p>
          <p className="app-muted">
            {session.isAdmin ? (
              <>Use &ldquo;New workspace&rdquo; above to create the first one.</>
            ) : (
              <>
                Access is granted by adding your account to a workspace&rsquo;s{" "}
                <code>app-&lt;slug&gt;</code> group in Cognito. Ask an
                administrator.
              </>
            )}
          </p>
        </div>
      )}

      {workspaces && workspaces.length > 0 && (
        <ul className="app-cards">
          {workspaces.map((workspace) => (
            <li key={workspace.slug}>
              <a className="app-card" href={`/w/${workspace.slug}/`}>
                <span className="app-card__title">{workspace.name}</span>
                {workspace.description && (
                  <span className="app-card__body">{workspace.description}</span>
                )}
                {/* The id, deliberately not shown. ADR-0003: never render an id
                    where a name belongs. What a reader needs here is who is in
                    the middle of editing, not the partition key. */}
                {workspace.lockedBy && (
                  <span className="app-card__meta">
                    being edited by {workspace.lockedBy}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
};

export default IndexPage;

export const Head: HeadFC = () => <title>Workspaces · template.dlab5</title>;
