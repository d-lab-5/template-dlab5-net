import * as React from "react";
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from "aws-amplify/auth";
import { ADMIN_GROUP, GROUP_PREFIX } from "@dlab5/app-core";
import { GuestLanding } from "./GuestLanding";
import { isConfigured } from "../lib/amplify";

export interface Session {
  username: string;
  email?: string;
  groups: string[];
  isAdmin: boolean;
  /** Cognito groups named `app-<slug>` map 1:1 to workspaces the user opens. */
  workspaceSlugs: string[];
}

const AuthContext = React.createContext<Session | null>(null);

/** Throws outside AuthGate, which cannot happen: AuthGate wraps every page. */
export function useSession(): Session {
  const session = React.useContext(AuthContext);
  if (!session) throw new Error("useSession used outside AuthGate");
  return session;
}

async function readSession(): Promise<Session> {
  /*
   * getCurrentUser() FIRST, and separately.
   *
   * It only needs the user pool. fetchAuthSession() additionally touches the
   * identity pool, and a misconfigured identity pool should degrade the
   * session — no groups, no email — rather than drop an otherwise signed-in
   * user back to the sign-in form. Combining the two calls is the version of
   * this that looks tidier and logs people out for the wrong reason.
   */
  const user = await getCurrentUser();

  let groups: string[] = [];
  let email: string | undefined;
  try {
    const session = await fetchAuthSession();
    const payload = session.tokens?.idToken?.payload ?? {};
    groups = (payload["cognito:groups"] as string[] | undefined) ?? [];
    email = payload.email as string | undefined;
  } catch (err) {
    console.warn("[app] could not read auth session claims", err);
  }

  return {
    username: user.username,
    email,
    groups,
    isAdmin: groups.includes(ADMIN_GROUP),
    workspaceSlugs: groups
      .filter((g) => g.startsWith(GROUP_PREFIX) && g !== ADMIN_GROUP)
      .map((g) => g.slice(GROUP_PREFIX.length)),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * A password input with a reveal toggle.
 *
 * Worth the twenty lines: an admin-provisioned password is transcribed from
 * somewhere else — an email, a terminal, a password manager — and a wrong
 * character produces the same "Incorrect username or password" as a wrong
 * account. Without a way to look, the two are indistinguishable and the user
 * retypes the same mistake.
 *
 * The button is `type="button"`. Inside a <form> the default is "submit", so
 * omitting it makes the eye submit the form — half-typed — on every click.
 *
 * It stays out of the tab order (`tabIndex={-1}`): someone tabbing from the
 * password to the submit button should reach the submit button. It is still
 * reachable by pointer and announced to a screen reader through aria-label,
 * whose text tracks the state so it says what the next press will do.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = React.useState(false);

  return (
    <label className="app-field app-field--password" htmlFor={id}>
      <span>{label}</span>
      <span className="app-field__control">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          className="app-field__reveal"
          onClick={() => setShown((previous) => !previous)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          title={shown ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {shown ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <path d="m1 1 22 22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
    </label>
  );
}

function SignInForm({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [needsNewPassword, setNeedsNewPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsNewPassword) {
        await confirmSignIn({ challengeResponse: newPassword });
      } else {
        const res = await signIn({ username: email, password });
        // Accounts are created by an admin with a temporary password, so this
        // challenge is the NORMAL first-login path, not an edge case. Leaving
        // it out makes every new user's first sign-in fail silently.
        if (
          res.nextStep?.signInStep ===
          "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
        ) {
          setNeedsNewPassword(true);
          setBusy(false);
          return;
        }
      }
      await onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <GuestLanding>
      <form className="app-gate__card" onSubmit={submit}>
        {/* h2, not h1: GuestLanding owns the page heading. A second h1 would
            leave the page with no single subject. */}
        <h2 className="app-gate__title">Sign in</h2>
        <p className="app-gate__subtitle">
          {needsNewPassword
            ? "Choose a new password to finish setting up your account."
            : "Sign in to continue."}
        </p>

        {needsNewPassword ? (
          <PasswordField
            id="app-new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
        ) : (
          <>
            <label className="app-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <PasswordField
              id="app-password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
            />
          </>
        )}

        {error && (
          <p className="app-gate__error" role="alert">
            {error}
          </p>
        )}

        <button className="app-button" type="submit" disabled={busy}>
          {busy ? "Signing in…" : needsNewPassword ? "Set password" : "Sign in"}
        </button>
      </form>
    </GuestLanding>
  );
}

function Unconfigured() {
  return (
    <main className="app-gate">
      <div className="app-gate__card">
        <h1 className="app-gate__title">Backend not configured</h1>
        <p className="app-gate__subtitle">
          This build has no <code>amplify_outputs.json</code>. Run{" "}
          <code>npm run backend:sandbox</code> then{" "}
          <code>npm run backend:sync-outputs</code>, or redeploy the branch so
          the backend phase runs.
        </p>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Gatsby renders every page at build time with no window and no Amplify. The
 * gate is the single place that knows this: during SSR it always renders the
 * neutral frame and never its children, so page components — which may call
 * useSession() freely — only ever run in the browser behind a real session.
 */
const isBrowser = typeof window !== "undefined";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<"loading" | "out" | "in">("loading");
  const [session, setSession] = React.useState<Session | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const refresh = React.useCallback(async () => {
    try {
      const next = await readSession();
      setSession(next);
      setState("in");
    } catch {
      setSession(null);
      setState("out");
    }
  }, []);

  React.useEffect(() => {
    if (!isConfigured()) return;
    void refresh();
  }, [refresh]);

  /*
   * The neutral frame is what the build emits for every page AND what the
   * client renders on its very first pass, so hydration always matches before
   * any state moves. Gating on `mounted` as well as `isBrowser` matters for
   * the unconfigured case, which would otherwise render <Unconfigured/> on the
   * client against a blank frame from the server.
   */
  if (!isBrowser || !mounted) {
    return <main className="app-gate" aria-busy="true" />;
  }

  if (!isConfigured()) return <Unconfigured />;

  // Render nothing rather than the app while we do not yet know: showing the
  // shell first and swapping it for a sign-in form is the flash of
  // authenticated content the gate exists to prevent.
  if (state === "loading") return <main className="app-gate" aria-busy="true" />;

  if (state === "out" || !session) return <SignInForm onSignedIn={refresh} />;

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export async function signOutAndReload(): Promise<void> {
  await signOut();
  window.location.assign("/");
}

export { ADMIN_GROUP };
