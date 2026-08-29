# D-LAB-5 fullstack template

A runnable skeleton for a D-LAB-5 web application: **Gatsby 5 / React 18** in
front, an **AWS Amplify Gen 2** backend behind, and one Cognito gate over the
whole thing. Fork it, rename it, and start on the part that is actually yours.

It is deliberately not a product. What it carries is the shape — and the dozen
constraints that shape has already cost someone a day each to discover, written
down in [`CLAUDE.md`](CLAUDE.md) and [`docs/adr/`](docs/adr/).

## What you get

| | |
|---|---|
| **Auth** | Cognito user pool, no guest tier, no self-signup, admin-created accounts with the new-password challenge handled. One gate at the root, so a new page cannot be unprotected. |
| **Data** | One `Workspace` model, group-scoped. DynamoDB holds the pointer row; the content is an object in S3. |
| **Storage** | An `objectProxy` Lambda that is the real authorization boundary, hands back presigned GETs, and enforces an `If-Match` precondition on every write. |
| **Frontend** | One shell component, a collapsible rail with a placeholder menu, a light/dark theme with no flash on load, and a token palette defined in both themes. |
| **Build** | An `amplify.yml` whose comments encode why every line is the way it is. The build passes with no backend deployed. |
| **Dev loop** | `npm run demo` — a guided menu that checks the environment, deploys a sandbox, makes a demo user and starts the dev server. `npm run dev` is the same without the menu. |
| **Tests** | `node --test` over `packages/core`, plus `verify-auth.mjs` for the live sign-in path. |

## Getting started

```bash
nvm use                                        # Node 22
npm install && npm --prefix backend install    # separate trees — ADR-0001
npm run demo                                   # guided menu — start here
```

`npm run demo` checks your environment first (Node, dependencies, AWS
credentials, region, file watchers) and prints the fix for anything missing,
rather than failing four minutes into a deploy. Then it offers:

```
  1  Create sandbox  — deploy, make the demo user, start the dev server
  2  Delete sandbox           (no sandbox to delete)
  3  Start dev server only    (deploy one first)
  0  Exit
```

Options that cannot work yet are dimmed and say why. Creating the sandbox also
provisions an account you can sign in as straight away:

| | |
|---|---|
| email | `demo-user@example.com` |
| password | `Demo-user$1` |

Both are shaped by Cognito, not by preference: the username must be an email
(the pool signs in by email), and the password needs an uppercase letter (the
pool's default policy wants upper, lower, digit and symbol). Override with
`DEMO_EMAIL` / `DEMO_PASSWORD`.

Once you know the ropes, `npm run dev` is the same thing without the menu — it
deploys the sandbox, wires its outputs into the site, starts Gatsby on
http://localhost:8000, and re-wires on every redeploy.

No AWS, or you only want the frontend:

```bash
npm run dev -- --web-only
```

You will then see the "backend not configured" notice. That is correct, and the
build passing in that state is a property worth keeping — a frontend-only
rebuild must never fail the branch.

Once the backend is up, create a user in the Cognito console and add them to
`app-admins`. There is no sign-up: the landing page is the sign-in page.

### Which AWS account?

Nothing in this repository names one. `ampx sandbox` uses the ordinary AWS SDK
credential chain — `AWS_ACCESS_KEY_ID…`, then `AWS_PROFILE` or `--profile`,
then the `[default]` profile in `~/.aws`, then SSO or an instance role — so the
account is whatever your shell already points at.

That is convenient and it is how a sandbox ends up in production by accident,
so `npm run dev` prints the account, region, profile and sandbox name and makes
you look before it creates anything:

```
▸ AWS
  account     123456789012
  region      eu-central-1
  profile     default
  sandbox     frankuwe
```

Use a different one with `npm run dev -- --profile work`, and run a second
sandbox side by side with `--identifier qa`. Sandboxes are per-person: the
stack name embeds your system username, so two people never collide.

A sandbox is a real deployment holding a real Cognito pool, S3 bucket and
DynamoDB tables. It costs a little and it outlives your terminal — Ctrl-C
stops the dev server, not the backend. Remove it deliberately:

```bash
npm --prefix backend run sandbox:delete
```

## Forking it

```bash
node scripts/rename.mjs --name "Fleet" --slug fleet --prefix fl \
  --domain fleet.dlab5.net --repo d-lab-5/fleet-dlab5-net --dry-run
```

The script rewrites the CSS prefix, the design tokens, the Cognito group names,
the theme attribute and storage key, the package names, the domain and the
titles — all of which have to move together. Drop `--dry-run`, then reinstall,
because the workspace package names changed:

```bash
rm -rf node_modules packages/*/node_modules package-lock.json
npm install && npm --prefix backend install && npm test && npm run build
```

The first section of [`CLAUDE.md`](CLAUDE.md) lists what is placeholder and
expected to be deleted, and what should survive untouched.

## Stack

Gatsby 5 · React 18 · TypeScript · AWS Amplify Gen 2 · Cognito · AppSync ·
DynamoDB · S3 · npm workspaces · Node 22.

## Where to look when this is too thin

[`~/D-LAB-5/blueprinting-dlab5-net`](https://github.com/d-lab-5/blueprinting-dlab5-net)
is where this template came from, and it has the worked version of everything
stubbed here: provisioning a tenant and its Cognito group in one mutation, a
document store with classification, API keys over Cognito custom auth, and an
MCP server.

## Licence

MIT — see [LICENSE](LICENSE).
