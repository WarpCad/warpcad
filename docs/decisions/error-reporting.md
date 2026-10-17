# Error reporting: Sentry (`@sentry/vue`; source maps uploaded with `curl`)

**Status:** accepted 2026-10-17 (`TODO/build-004`). The user asked for Sentry by name; this record
still compares it against real alternatives, as `CLAUDE.md`'s Library decisions section requires.

## What the app needs

- Production errors from the Pages deploy (`app.warpcad.com`) with **readable stack traces**.
- **No secret in the bundle or the repository.** Only the DSN (submit-only by design) may be public.
- **Inert by default.** No DSN: nothing is sent and nothing extra is allowed by the CSP. No auth
  token: nothing is uploaded and nothing about the build changes.
- **Nothing private leaves the browser**: no document content, no AI key or GitHub token
  (`src/storage/tokenStorage.js`), no URL hash fragment (`#/gist/<id>`), no IndexedDB contents.
- No backend of our own (`docs/decisions/hosting.md`), so the reporting target must be a hosted
  service or a third-party instance.

## Options compared

Numbers fetched 2026-10-17 from the npm registry and the GitHub and GitLab APIs.

| | Sentry (`@sentry/vue`) | GlitchTip (Sentry-compatible, self-hosted or hosted) | Bare `window.onerror` POST | No reporting |
|---|---|---|---|---|
| Source-map unminifying | Yes (`@sentry/vite-plugin` upload) | Yes (accepts the same SDK and source-map uploads) | No (we would build symbolication) | n/a |
| Vue error handler, unhandled rejections | Yes (`app.config.errorHandler`, global handlers) | Same SDK | Hand-written | n/a |
| Needs a server we run | No (hosted) | Yes, or a paid hosted plan | Yes (an endpoint, storage, rate limiting, abuse control) | No |
| SDK in the bundle | See "Bundle cost" below | Same SDK | ~0 | 0 |
| SDK licence | MIT (npm `license` field) | Same SDK | n/a | n/a |
| Server licence | Server is FSL (not used; we use their hosted service) | MIT, self-hostable | n/a | n/a |
| Stars | `getsentry/sentry-javascript` 8,762; `getsentry/sentry` 45,590 | GitLab `glitchtip-backend` 361, `glitchtip-frontend` 69 | n/a | n/a |
| Issues, open / closed (SDK repo) | 420 open / 9,191 closed (4.4% open) | not published in a comparable form | n/a | n/a |
| Last release | `@sentry/vue` 11.8.0 on 2026-10-15 (2 days before this record) | GitLab last activity 2026-10-16 | n/a | n/a |
| Maintainers | Company-staffed: 100+ contributors on the SDK repo; the npm scope is published by the `sentry-bot` account | Small team (a company, but far fewer contributors) | Us | n/a |

### Rejection table

| Option | Why not |
|---|---|
| GlitchTip | Someone must run or pay for an instance, which this static-only, no-backend project does not have, and the SDK in the browser would be the same Sentry SDK anyway. It stays a drop-in later: it speaks the Sentry protocol, so only the DSN changes (and the CSP host). |
| Bare `window.onerror` POST | Needs an endpoint we do not have, no source-map support (so no readable stacks, the main goal), and every privacy rule below would be ours to get wrong with no battle-tested grouping, rate limiting or dedupe. |
| No reporting, rely on user reports | This is the status quo. It misses every error a user does not bother to describe, and gives no stack at all from a phone. The cost of reporting is bounded by the scrubbing rules below. |

## Decision

**Sentry**, the hosted service, with `@sentry/vue` 11.8.0 as a production dependency and
source maps uploaded by a `curl` step in the Pages workflow. (`@sentry/vite-plugin` was used first
and dropped on 2026-10-17, `build-009`; see the next section.)

### Change 2026-10-17 (`build-009`): no build plugin

`@sentry/vite-plugin` 11.8.0 pulled the build-time package `sentry@0.45.0`, licensed
**`FSL-1.1-Apache-2.0`** (source-available, not open source). `npm run licenses` checks production
dependencies only and never saw it, and nothing of it reached `dist/`, but it does not fit an AGPL
project's toolchain. The project owner ruled to drop the plugin. The Sentry decision itself stands.

- `package.json` and the lockfile no longer contain the plugin, `@sentry/bundler-plugins`, `sentry`
  or any FSL package (`scripts/sentry-upload.spec.js` guards it).
- `build.sourcemap` is still `'hidden'` only when `SENTRY_AUTH_TOKEN` is set. The
  *Upload source maps to Sentry* step in `.github/workflows/pages.yml` then creates the release and
  posts each bundle file (with a `Sourcemap` header) and its `.map` to
  `POST /api/0/organizations/{org}/releases/{version}/files/` with `curl --fail`, under the name
  `~/<BASE_PATH>/assets/<file>`. The next step deletes every `.map` from `dist/`.
- Release name: `SENTRY_RELEASE` for the upload and `VITE_SENTRY_RELEASE` for `Sentry.init` are the
  same expression (the commit SHA); the spec checks they stay equal.
- Behaviour change from the plugin: an upload error now **fails the job** (the plugin only logged),
  so a Sentry outage can block a deploy. Chosen deliberately: a silent pass would ship unreadable
  stacks unnoticed. With `SENTRY_DSN` set but the token, org or project missing, the step warns and
  skips.
- Not confirmed against a live project: the legacy release-files API is documented by Sentry, but
  was not exercised here. See `TODO/VERIFY.md` build-009.

### Licence result (`npm run licenses`)

- `npm run licenses` (production dependencies, the existing allow-list, unchanged) **passes** with
  `@sentry/vue` installed: every package in its tree is MIT, ISC, BSD or Apache-2.0.
- **Resolved by `build-009` (history):** `@sentry/vite-plugin` pulled the
  npm package `sentry@0.45.0`, which declares **`FSL-1.1-Apache-2.0`** (Functional Source License;
  converts to Apache-2.0 two years after each release; it forbids offering a competing product).
  It is a **build-time-only** dependency (the upload CLI), it is not in `--production`, and nothing
  of it reaches `dist/`. It is therefore outside the allow-list's scope, and the list was not
  edited. The rest of the plugin tree (`@sentry/bundler-plugins`, `glob`, `dotenv`, `magic-string`,
  `oxc-parser`, `supports-color`) is MIT, BlueOak-1.0.0 or BSD-2-Clause. If the FSL package is not
  acceptable in a copyleft project's *build* toolchain, the fallback is to drop the plugin and
  upload with `curl` against Sentry's API in the workflow (more code, no new licence).

### Keys: what is secret

| Value | Secret? | Where | Why |
|---|---|---|---|
| DSN | No (by design) | GitHub Actions **variable** `SENTRY_DSN`, passed to the build as `VITE_SENTRY_DSN` | The browser must use it; it can only submit events. |
| Auth token | **Yes** | GitHub Actions **secret** `SENTRY_AUTH_TOKEN`, never `VITE_`-prefixed | Uploads releases and source maps. Create it with only `project:releases` and `org:read`, named for this repo's Pages workflow so it can be revoked alone. |
| Org, project slug | No | Actions variables `SENTRY_ORG`, `SENTRY_PROJECT` | Names only. |

Chosen storage: a **repository secret** (the `build` job declares no `environment`, so an
environment-scoped secret would be empty there). The token is read in exactly one place, the
`npm run build` step's `env:` in `.github/workflows/pages.yml`, which has no `pull_request`
trigger, so forks never receive it. The workflow never `echo`es an env value. Local use: a
gitignored `.env.sentry.local` (covered by `.env.*` and `*.local`), or leave it unset.

### Build

- `build.sourcemap` is `'hidden'` **only when `SENTRY_AUTH_TOKEN` is set**: maps are generated,
  the bundle carries no `//# sourceMappingURL`, the workflow uploads them and then deletes every
  `dist/**/*.map`, so Pages never serves them. With no token the build
  is unchanged (no maps, no plugin). The logic is `sentryBuildOptions()` in
  `scripts/sentry-build.mjs`, unit-tested.
- Release name: `SENTRY_RELEASE` (the commit SHA in CI), the same value as `VITE_SENTRY_RELEASE`
  given to `Sentry.init`. A mismatch is the usual reason Sentry shows minified frames.

### CSP: the ingest host (the part that needs the project owner)

The Sentry ingest host depends on the region of the project the owner creates: EU
(`*.ingest.de.sentry.io`), US (`*.ingest.us.sentry.io`) or the legacy global host
(`*.ingest.sentry.io`). The code does not guess. **The host is read from the DSN at build time**
(`connectSrcFromDsn()` in `scripts/sentry-build.mjs`) and the **exact host of that DSN** (for
example `https://o123.ingest.us.sentry.io`, narrower than any wildcard) is appended to the
production `connect-src` by a build-only Vite plugin. Consequences:

- `index.html` as committed is unchanged and has no Sentry host, so a build without a DSN allows
  nothing extra, which is the tightest possible default.
- Only an `https:` DSN is honoured; anything malformed adds nothing (and then Sentry's own requests
  would be blocked, visible as a console CSP error, never as a widened policy).
- `connect-src` is never widened to `https:` or to a wildcard. `e2e/csp.e2e.js` asserts that the
  policy contains no `https:`/`*` source and at most this one extra host.

### Runtime and privacy (`src/core/errorReporting.js`)

- No DSN: `initErrorReporting()` returns without calling `Sentry.init`.
- **`dataCollection` with every optional collector off** (user info, cookies, headers, bodies, query strings, GraphQL, AI, DB, queue arguments, stack-frame variables). Sentry 11 removed `sendDefaultPii` from the SDK (checked in the installed types and code) and its `dataCollection` defaults are *on*, so leaving it out would have sent more, not less; **no replay**, **no tracing** (`tracesSampleRate: 0` and the tracing,
  replay and feedback integrations removed), no console, DOM or history breadcrumbs, Vue
  `attachProps: false` (component props can hold document content), no user, project name or
  document content in tags or context.
- **One scrubbing function** (`scrubEvent`, with `scrubBreadcrumb`) is the single place that
  decides. It removes `request.data`, cookies, `extra`, and the `x-api-key`, `authorization` and
  cookie headers; it drops any event or breadcrumb whose text matches an API-key pattern
  (Anthropic `sk-ant-…`, GitHub `ghp_…`/`github_pat_…`), including a key **split across two
  fields** (it also tests all string values joined); it strips the fragment from `request.url` and
  the referrer, and drops any other event or breadcrumb that still contains a URL fragment.
  - Refinement of the original wording: an event whose only fragment is its own `request.url` (the
    SDK adds `location.href` automatically) is **kept with the fragment removed**, not dropped.
    Dropping it would discard every error raised while the Help overlay (`#/help/<page>`) is open.
- What is still sent: the error message and stack, the browser and OS, the release, and the page
  URL without its fragment. An error message that itself quotes document text would be sent; the
  app does not build messages from document content on purpose, but that is the residual risk.

### Bundle cost

Measured with `npm run build` (Vite 8), main chunk `dist/assets/index-*.js`, with no DSN and no
token (the SDK is bundled either way, because `main.js` imports it statically so errors during
mount are caught):

| | minified | gzip |
|---|---|---|
| Before (`@sentry/vue` absent) | 1,706.27 kB | 509.01 kB |
| After | 1,823.98 kB | 548.92 kB |
| Delta | +117.71 kB | **+39.91 kB (+7.8%)** |

A dynamic `import('@sentry/vue')` behind the DSN check would take the cost off builds without a
DSN, at the price of missing errors thrown before the chunk loads. Not done; revisit if the
bundle budget matters more than first-seconds coverage.

### Build behaviour verified (production build, fake token, unreachable `SENTRY_URL`)

- Hidden maps are generated (`map:` sizes in the build log), the bundle and service worker carry
  **no** `sourceMappingURL`, and `dist/` holds **zero** `.map` files afterwards (including
  `sw.js.map`, which needed `workbox.sourcemap: false`: Workbox runs after the Sentry plugin).
- The token string does not appear in any `dist/` file.
- A failed upload (no network) logs `[sentry-vite-plugin] Error …` but does **not** fail the
  build, and the maps are still deleted. A Sentry outage therefore cannot block a deploy; the cost
  is unreadable stacks for that release. Watch for the log line.
- With no token: no maps, no plugin, bundle byte-identical to a build without Sentry's build code.

### Not verified here

A real event reaching a real Sentry project with a readable stack needs the owner's DSN and token,
which the implementing session did not have. Everything else (no-DSN inertness, init options,
scrubbing, hidden maps and deletion, the CSP host) is proved with mocks at the SDK boundary and
with production builds. The operator checklist is in `TODO/VERIFY.md`.

## Operator steps

1. Create a Sentry project (platform: Vue / browser) and copy its DSN.
2. Create an auth token (`project:releases`, `org:read`) named for this repository's Pages workflow.
3. GitHub → Settings → Secrets and variables → Actions: variables `SENTRY_DSN`, `SENTRY_ORG`,
   `SENTRY_PROJECT`; secret `SENTRY_AUTH_TOKEN`.
4. Run the Pages workflow with `workflow_dispatch`; the log should show the plugin uploading, and
   the Sentry release list should show the commit SHA.
5. Smoke test with a production build and the real DSN and token: throw from the browser console
   and check the event arrives with a readable stack. Do not add a test button to the app.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
