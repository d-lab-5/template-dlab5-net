# CLAUDE.md — D-LAB-5 fullstack template

Guidance for Claude Code working in this repository.

## Have you just forked this?

**Run the rename first, before writing any code:**

```bash
node scripts/rename.mjs --name "Fleet" --slug fleet --prefix fl \
  --domain fleet.dlab5.net --repo d-lab-5/fleet-dlab5-net --dry-run
```

Drop `--dry-run` when the diff looks right, then reinstall — the workspace
package names changed, so the symlinks in `node_modules` no longer resolve:

```bash
rm -rf node_modules packages/*/node_modules package-lock.json
npm install && npm --prefix backend install && npm test && npm run build
```

What is placeholder, and expected to go:

| Placeholder | Replace with |
|---|---|
| `packages/site/src/pages/w.tsx` — five stub views | your actual screens |
| `Shell.tsx` → `railItems()` / `toolItems()` | your menu |
| `GuestLanding.tsx` → hero copy and `<Art/>` | what your app is |
| `packages/core/src/types.ts` → `Workspace` | your domain noun |
| `backend/…/data/resource.ts` → `Workspace` model | your schema |
| this section of `CLAUDE.md`, and `README.md` | your project |

What is **not** placeholder, and should survive: `AuthGate`, `amplify.ts`,
`useTheme`, `gatsby-ssr.tsx`, `gatsby-node.ts`, `amplify.yml`, `objectProxy`,
the hardening in `backend.ts`, `tokens.css`, and the constraints below. Those
are the point of the template.

## What this is

A runnable skeleton, not a product. Gatsby 5 / React 18 in front, an AWS
Amplify Gen 2 backend behind, one Cognito gate over the whole thing. The shape
is lifted from `~/D-LAB-5/blueprinting-dlab5-net`, which is where to look when
this repository is too thin to answer a question.

The tenant noun here is **Workspace**. It is minted, group-scoped, and its
content is one object in S3.

> Treat this repository as public. Read `SECURITY.md` before committing.
> Never commit `amplify_outputs.json`, AWS account IDs or ARNs, `.env` files,
> or real names, emails and hostnames.

## Layout

```
backend/            Amplify Gen 2 backend. NOT an npm workspace — see ADR-0001.
packages/core/      Domain logic. Pure TS, no React, no AWS, no DOM.
packages/site/      The Gatsby 5 app (@dlab5/app-site).
docs/adr/           Architecture Decision Records. Read these first.
scripts/rename.mjs  Turns this template into a project.
scripts/verify-auth.mjs   The only check that proves the gate against real AWS.
```

## Commands

```bash
npm install && npm --prefix backend install   # two installs; separate trees

npm run dev:web                     # http://localhost:8000
npm run build                       # must pass with NO amplify_outputs.json
npm test                            # packages/core, node --test
npm run backend:typecheck

npm --prefix backend run sandbox:once   # deploy a personal AWS sandbox + sync
npm run backend:sync-outputs            # copy amplify_outputs.json into the site
npm --prefix backend run sandbox:delete

APP_USER=… APP_PASSWORD=… npm run verify:auth   # ADR-0002 invariants, live
npm run rename -- --name "Fleet" --slug fleet --prefix fl --dry-run
```

`verify:auth` drives the real `aws-amplify/auth` client through the same
sequence `AuthGate` uses — `signIn`, the new-password challenge,
`confirmSignIn`, `fetchAuthSession`, `cognito:groups` — against whatever
`backend/amplify_outputs.json` points at. Add `--new-password '…'` for an
account still in `FORCE_CHANGE_PASSWORD`. Run it after any change to
`auth/resource.ts`, `backend.ts` or `AuthGate.tsx`. Everything else in this
repository proves the code agrees with itself; this is the only thing that
proves it agrees with AWS.

## Non-obvious constraints

These will bite. Each is load-bearing and each has cost someone time.

1. **`backend/` must not become an npm workspace.** Gatsby needs graphql 16 and
   the Amplify data construct needs graphql 15; one hoisted tree cannot satisfy
   both. ADR-0001.
2. **`graphql: ^16` is a direct dependency of `packages/site` on purpose.**
   `aws-amplify` v6 drags in graphql 15 transitively. Whichever npm hoists is
   what `graphql-compose` resolves, and if 15 wins, `gatsby build` dies in
   `buildSchema` with *"Cannot create as TypeComposer …
   GraphQLScalarType(Date)"*. Naming 16 makes it win deterministically. Do not
   "clean up" that dependency — nothing imports it.
3. **`AuthGate` is mounted in `gatsby-ssr` as well as `gatsby-browser`**, via
   one shared `src/wrap-page-element.tsx`. Leaving it out of SSR breaks the
   build, because page components call `useSession()` and Gatsby would render
   them directly. The gate short-circuits on `typeof window === "undefined"`.
   ADR-0002.
4. **Amplify is configured in `gatsby-browser` only, never in `gatsby-ssr`.**
   `src/lib/amplify.ts` uses `require`, not `import … with { type: "json" }`,
   which Gatsby's Babel pipeline rejects. The missing-file warning during a
   build with no outputs is expected and handled.
5. **The build must succeed without `amplify_outputs.json`.** A frontend-only
   rebuild has no backend phase. `amplify.yml` tolerates the copy failing, and
   `AuthGate` renders its "backend not configured" notice.
6. **Per-tenant Cognito groups are `app-<slug>`, created by hand.** They cannot
   be declared in `defineAuth` (a deploy per tenant) and cannot be referenced
   from `defineStorage` (rules are static at deploy time). That is exactly why
   S3 goes through a proxy Lambda. ADR-0002, ADR-0004.
7. **Adding a user to a group does not change their existing tokens.** Call
   `fetchAuthSession({ forceRefresh: true })` after a group change. This looks
   like a caching bug every single time.
8. **Writes are whole-object and carry an S3 `If-Match` ETag precondition.**
   That, not the advisory `lockedBy`/`lockedAt` lock, is the correctness
   mechanism. ADR-0004.
9. **`GATSBY_`-prefixed environment variables are public.** They are inlined
   into the bundle at build time.
10. **Local dev needs raised inotify limits.** Gatsby exhausts the default and
    dies with `ENOSPC: System limit for number of file watchers reached`:
    `sudo sysctl -w fs.inotify.max_user_watches=524288 fs.inotify.max_user_instances=1024`.
    Amplify's build container is unaffected.
11. **Client-only routes need an Amplify Hosting rewrite, which lives outside
    this repo.** `/w/*` is a `matchPath` route, so no file exists at
    `/w/<slug>/`. The catch-all rule serves the right HTML but returns 404,
    which needs an explicit 200 rewrite *ahead* of it — order matters:

    ```
    /w/<*>  ->  /w/index.html   200
    /<*>    ->  /index.html     404-200
    ```

    Adding another client-only route means adding another rule. There is no
    file in the repository that captures this; set it with
    `aws amplify update-app --custom-rules`. This is why `w.tsx` routes five
    views itself instead of registering five `matchPath` pages.
12. **The Amplify client in `packages/site` is deliberately untyped.**
    Importing `Schema` from `backend/amplify/data/resource` would pull
    `@aws-amplify/backend` — and graphql 15 — into the site's TypeScript
    program, undoing constraint 1. The result shapes in `src/lib/data.ts` are
    hand-written for that reason and must be kept in step with
    `data/resource.ts` **by hand**. Check with:
    `npx tsc --noEmit -p packages/site/tsconfig.json --listFiles | grep -c '@aws-amplify/backend/'` — must be 0.
13. **A change to `global.css` needs a clean build to appear.** `npm run build`
    reuses the cached stylesheet and emits the *identical* content hash, so the
    page renders with the old CSS and the edit looks like it did nothing:

    ```bash
    rm -rf packages/site/.cache packages/site/public && npm run build
    ```

    Confirm the change actually shipped rather than trusting the build:
    `grep -ro "app-your-class{[^}]*}" packages/site/public/*.css`. More than one
    `styles.*.css` in `public/` is the symptom.
14. **Every token in `tokens.css` must be defined in BOTH themes.** A component
    reading one that exists only in dark renders with an invalid value in
    light, and the failure is invisible until someone toggles. In particular
    `--app-surface-raised` must not equal `--app-bg` in light, or everything
    "raised" is painted invisible.

## House conventions

- **TypeScript**, npm workspaces, Node 22 (`.nvmrc`).
- Package split follows `d-lab-5/gatsby-techradar`: a pure-TS `core` with no
  React, and a thin `site`. Add a presentational `react` package when a second
  consumer appears, not before.
- Plain CSS with custom-property tokens in `packages/site/src/styles/tokens.css`.
  No Tailwind, no CSS-in-JS — the tokens must be readable from outside the
  React tree, because anything embedded later injects its own chrome.
- **One shell component.** The DHC Portal ended up with two and the seam still
  shows. If a screen needs a different frame, add a prop.
- **An id is minted, never derived from a name** (ADR-0003), and never rendered
  where a name belongs.
- Compute in `packages/core`, render in `packages/site`. Anything in core is
  testable with `node --test` and reusable by a Lambda or a CLI; anything in a
  component is neither.
- Record decisions as ADRs in `docs/adr/`, numbered, with the *consequences*
  section actually filled in. That section is the one people read.
- Commits: see the `git-commit` skill. `stage` is the integration branch; `main`
  is only updated by a promotion PR.

## Related repos worth reading before inventing something

| Repo | Why |
|---|---|
| `~/D-LAB-5/blueprinting-dlab5-net` | **The source of this template.** Worked versions of everything stubbed here: `projectAdmin` (mint a row and its Cognito group together, with the CloudFormation-cycle workaround), the document store, API keys via custom auth, an MCP server, and a `GuestLanding` that draws the domain rather than decoration. |
| `~/D-LAB-5/atmanyoga-fullstack` | The original topology: workspace + non-workspace backend, `amplify.yml`, SSR-safe Amplify config. |
| `~/digitalhomeCloud/digitalhome-cloud-darkfactory` | `repos/core/amplify/` for Gen 2 patterns and the storage-proxy Lambda. Skills: `dhc-amplify-gen2`, `dhc-security-audit`. |
| `d-lab-5/gatsby-techradar` (GitHub) | The package split. |
