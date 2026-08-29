import * as React from "react";
import type { HeadFC } from "gatsby";
import { Shell } from "../components/Shell";
import { useSession } from "../components/AuthGate";

/**
 * Account settings.
 *
 * Its own page rather than a panel inside a workspace, because an account is
 * not scoped to one: it carries its owner's groups and therefore reaches every
 * workspace they can reach. Putting it under a workspace would say otherwise.
 *
 * An API key would belong here too, for the same reason: it carries its
 * owner's groups and reaches everything they reach.
 */
const SettingsPage: React.FC = () => {
  const session = useSession();

  return (
    <Shell>
      <div className="app-pagehead">
        <h1>Settings</h1>
        <span className="app-badge">{session.isAdmin ? "admin" : "member"}</span>
      </div>

      <div className="app-panel">
        <h2 className="app-panel__title">Account</h2>
        <dl className="app-stats">
          <div className="app-stat">
            <dt>{session.email ?? session.username}</dt>
            <dd>Signed in as</dd>
          </div>
          <div className="app-stat">
            <dt>{session.groups.length}</dt>
            <dd>Cognito groups</dd>
          </div>
        </dl>
        <p className="app-panel__hint">
          Groups: {session.groups.length ? session.groups.join(", ") : "none"}.
          Being added to a group does not change tokens you already hold — sign
          out and back in if a new workspace has not appeared.
        </p>
      </div>

      <div className="app-panel" style={{ marginTop: "1rem" }}>
        <h2 className="app-panel__title">Put your account screens here</h2>
        <p className="app-panel__hint">
          API keys, notification preferences, a personal access token — anything
          that belongs to the person rather than to a workspace, and therefore
          reaches every workspace they can open.
        </p>
      </div>
    </Shell>
  );
};

export default SettingsPage;

export const Head: HeadFC = () => <title>Settings · template.dlab5</title>;
