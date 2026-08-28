import * as React from "react";
import {
  groupForWorkspace,
  mintWorkspaceId,
  objectKeyForWorkspace,
} from "@dlab5/app-core";
import { createWorkspace } from "../lib/data";
import type { Workspace } from "../lib/data";

/**
 * Creating a workspace.
 *
 * The id is MINTED here rather than derived from the name (ADR-0003), and both
 * the Cognito group and the S3 key are computed from that id by the helpers in
 * @dlab5/app-core — the same helpers the backend would use. Doing the
 * derivation inline "just this once" is how the two sides drift.
 *
 * The id is shown once, in the confirmation, because someone has to type it
 * into the Cognito console to create the group. That is the ONE place an id
 * belongs in the UI, and it is why the confirmation exists at all.
 */
export function NewWorkspaceForm({
  onCreated,
}: {
  onCreated: (workspace: Workspace) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Workspace | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const slug = mintWorkspaceId();
      const workspace = await createWorkspace({
        slug,
        name: name.trim(),
        description: description.trim() || undefined,
        group: groupForWorkspace(slug),
        objectKey: objectKeyForWorkspace(slug),
      });
      setCreated(workspace);
      onCreated(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="app-panel">
        <h2 className="app-panel__title">{created.name} created</h2>
        <p className="app-panel__hint">
          The row exists. Nobody but an administrator can open it yet, because
          its Cognito group does not exist — this template creates the row and
          not the group. In the Cognito console, create a group named{" "}
          <code>{created.group}</code> and add the people who should have
          access.
        </p>
        <p className="app-panel__hint">
          Adding someone to a group does not change the tokens they already
          hold. They will need to sign out and back in, or the app has to call{" "}
          <code>fetchAuthSession(&#123; forceRefresh: true &#125;)</code>.
        </p>
      </div>
    );
  }

  return (
    <form className="app-panel" onSubmit={submit}>
      <h2 className="app-panel__title">New workspace</h2>

      <label className="app-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>

      <label className="app-field">
        <span>Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && (
        <p className="app-error" role="alert">
          {error}
        </p>
      )}

      <div className="app-hero__actions">
        <button className="app-button" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </form>
  );
}
