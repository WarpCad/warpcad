---
title: Hook up Sentry error reporting and source-map upload in the build and the Pages workflow
category: build
kind: feature
priority: medium
model: sonnet
depends: []
status: done
---

> **Retirement note (2026-10-17 12:17 UTC).** Shipped as specified, with these differences. (1) The Sentry ingest host is **derived from `VITE_SENTRY_DSN` at build time** (`scripts/sentry-build.mjs`, a build-only Vite plugin) and the exact DSN host is appended to the production `connect-src`; `index.html` itself is unchanged, so a build with no DSN allows nothing extra. (2) `build.sourcemap: 'hidden'` applies **only when `SENTRY_AUTH_TOKEN` is set** (no token: no maps, no plugin); `workbox.sourcemap: false` stops the service worker's own maps being published. (3) Sentry 11 removed `sendDefaultPii`; privacy is `dataCollection` with every collector off (the old key would have been a silent no-op while the new defaults send more). (4) An event whose only URL fragment is its own `request.url` is kept with the fragment stripped, not dropped (dropping would lose every error raised while Help is open). (5) `@sentry/vue` and `@sentry/vite-plugin` pinned exactly at 11.8.0. Decision record: `docs/decisions/error-reporting.md` (bundle: +117.71 kB minified, +39.91 kB gzip on the main chunk).
>
> **Not verified, and cannot be from here:** the spec's live smoke test (production build with the real DSN and token, a thrown error arriving in Sentry with a readable stack, the Pages workflow's upload line, the release listing). The implementing session had no Sentry account, DSN, org, project or token. Everything else is proved with mocks at the SDK boundary and production builds; the operator steps are in `TODO/VERIFY.md`. **Open for the owner:** (a) the region/ingest host is whatever the DSN says, nothing to choose in code, but the CSP only allows it if `SENTRY_DSN` is set as an Actions variable; (b) `@sentry/vite-plugin` pulls the build-time-only package `sentry@0.45.0`, licensed `FSL-1.1-Apache-2.0`, which is outside `npm run licenses` (production only) and was not added to any allow-list; say if a source-available licence in the build toolchain is unacceptable.

## Goal

Get production errors from the deployed app into a Sentry project, with readable stack traces, and
do it without any secret reaching the browser bundle or the public repository.

Done means all of these hold:

- A runtime error in the production build (`npm run build` output, served from GitHub Pages) appears
  in the Sentry project within a minute, with the original source file and line, not minified names.
- A local `npm run build` and `npm run dev` with no Sentry configuration still work and send
  nothing: no DSN means Sentry is inert, and no auth token means no upload.
- The Pages workflow (`.github/workflows/pages.yml`) uploads source maps on every deploy, using a
  token that exists only as a GitHub secret.
- The app never sends document contents, the user's own AI API key (`src/storage/tokenStorage.js`),
  or anything from the URL hash or the IndexedDB project to Sentry.

Decision first, per `CLAUDE.md`'s Library decisions: write `docs/decisions/error-reporting.md`
before adding the dependency. It compares at least Sentry (`@sentry/vue` + `@sentry/vite-plugin`)
against two or three real alternatives (a self-hosted GlitchTip or similar, a bare `window.onerror`
POST to a small endpoint, and "no reporting, rely on user reports"), with the usual features, size,
stars, issue ratio, release recency and maintainer count, plus a rejection table. The user has asked
for Sentry specifically, so the record can be short on the winner, but the comparison must still
be real. The SDK licence is MIT and passes `npm run licenses`; confirm that when it is installed.

## Interaction model

n/a — this adds no user-visible control, panel or gesture. Error reporting runs in the background
and has no trigger or on-screen feedback.

## Documentation

n/a — no user-visible control is added or changed. Sentry is an operator concern, so the setup steps
belong in `docs/decisions/error-reporting.md` and in this file's Proposed fix, not in the user docs.

## Affected files

- `docs/decisions/error-reporting.md`                 (new: the Library decision, with the data behind it)
- `src/core/errorReporting.js`                        (new: the one place that calls the SDK; no-op without a DSN)
- `src/main.js`                                       (call `initErrorReporting()` once, before the app mounts)
- `vite.config.js`                                    (`build.sourcemap: 'hidden'`; add the Sentry Vite plugin, active only when the token is set)
- `index.html`                                        (production CSP `connect-src` gains the Sentry ingest host; see Proposed fix)
- `.github/workflows/pages.yml`                       (pass the token, org, project and release into the build step)
- `.gitignore`                                        (ignore `.env` and `.env.*`; the file currently has no env rule)
- `package.json`                                      (`@sentry/vue` as a dependency, `@sentry/vite-plugin` as a dev dependency)
- `src/core/errorReporting.spec.js`                   (new: unit tests, see Testing)

## Proposed fix

### 1. Keys: what is secret and what is not

Sentry has two credentials, and they have different sensitivity. Treat them differently.

| Value | Secret? | Where it lives | Why |
|---|---|---|---|
| **DSN** (`https://<key>@o<n>.ingest.sentry.io/<project>`) | No, by design | GitHub Actions **variable** (`vars.SENTRY_DSN`), passed as `VITE_SENTRY_DSN` | The browser must send events to it, so it is always visible in the bundle. It can only *submit* events, never read them. Worst case is noise or quota abuse, which Sentry's rate limits and allowed-domains setting contain. |
| **Auth token** (`SENTRY_AUTH_TOKEN`) | **Yes** | GitHub Actions **secret** only | It can upload releases and source maps, and with broad scopes it can read or delete project data. Never prefix it with `VITE_`. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | No | GitHub Actions **variables** | Only names; the plugin needs them to find the project. |

Rules that keep the token out of the browser and the repo:

- **Never name it `VITE_*`.** Vite inlines every `import.meta.env.VITE_*` value into the client
  bundle. The Sentry Vite plugin runs in Node inside `vite.config.js`, reads `process.env`, and is
  never imported by client code, so the token never reaches the bundle.
- **Make the token narrow.** Create it in Sentry (Settings → Developer settings → Internal
  Integration, or an org auth token) with only `project:releases` and `org:read`. It cannot read
  events or change alerts. Give it a name that says it is for this repo's Pages workflow, so it can
  be revoked without touching anything else.
- **Store it in the `github-pages` environment, not as a repo-wide secret, if you want the
  narrowest scope.** Environment secrets are only handed to jobs that declare
  `environment: github-pages`. The current `build` job in `pages.yml` does **not** declare one, only
  `deploy` does, so an environment secret would be empty in `build`. Either add
  `environment: github-pages` to `build` (this also makes the environment's protection rules apply to
  the build step, which is fine for a single-maintainer repo), or store the token as a repo secret.
  The repo-secret route is simpler; pick one and say which in the decision record.
- **Local development uses a gitignored file, never the repo.** Put `SENTRY_AUTH_TOKEN` in
  `.env.sentry.local` (ignored by the new `.env.*` rule), or leave it unset. With no token, the
  plugin does nothing and the build works. Do not paste the token into chat, a TODO file, a commit
  message or `TROUBLESHOOTING.md`.
- **GitHub masks secrets in logs**, but only the exact value. A token printed with a prefix or
  base64-encoded will not be masked. The Pages workflow does not `echo` env values; keep it that
  way.
- **Forks never get secrets.** The Pages workflow runs only on `workflow_run` for `main` in this
  repo, so no fork pull request can reach the token. Do not add a `pull_request` trigger to this
  workflow without rethinking that.

### 2. Build: source maps uploaded, not published

- In `vite.config.js`, set `build.sourcemap: 'hidden'`. Hidden maps are generated but not referenced
  from the bundle.
- Add the Sentry Vite plugin. Its `sourcemaps` option deletes the `.map` files after upload, so
  GitHub Pages never serves them. Source maps on a public site hand out the unminified source; that
  is the point of hiding them.
- Set the release name from the commit, so the browser events and the uploaded maps match:
  `release: { name: process.env.SENTRY_RELEASE ?? process.env.GITHUB_SHA }` in the plugin config,
  and the same value into `VITE_SENTRY_RELEASE` for `Sentry.init`. A mismatch is the usual reason
  Sentry shows minified frames.
- The plugin activates only when `SENTRY_AUTH_TOKEN` is set. Without it, the build is unchanged.

### 3. Runtime: `src/core/errorReporting.js`

- `initErrorReporting()` reads `import.meta.env.VITE_SENTRY_DSN`. If it is empty or missing, it
  returns without calling `Sentry.init`, so local and test runs send nothing.
- Vue error handling goes through `@sentry/vue`'s `app.config.errorHandler` integration, installed
  in `src/main.js` before mount. Global `window` errors and unhandled rejections come from the
  SDK's default integrations.
- Privacy settings, explicit and not left to defaults:
  - `sendDefaultPii: false`.
  - **Session replay: off.** Replay records the screen, which would capture the project geometry
    and the AI chat.
  - **Breadcrumbs: no DOM input values and no network request bodies.** Filter `fetch` breadcrumbs
    so a `fetch` to an AI provider does not record its request body or its `x-api-key` header.
  - `beforeSend` drops any event whose serialized text contains the stored API key pattern or a
    hash fragment from the URL, and strips `request.data` and `extra` on every event. Keep the
    scrubbing in one tested function, not spread across call sites.
  - Traces are off for now. Performance is measured by `.claude/prompts/perf-benchmark.md`, not by
    Sentry, and tracing would add a network hop to the frame path.
- No user identity, no project name, no document content in tags or context. If a later task wants
  one of these, it gets its own decision.

### 4. CSP: the ingest host must be allowed

`index.html` carries the production Content-Security-Policy. `vite build` copies it byte-for-byte
(`devContentSecurityPolicy` in `vite.config.js` only relaxes the dev server). Without a change, the
browser blocks every Sentry request, and the failure is silent in the app and visible only in the
console.

Add the Sentry ingest host to `connect-src` in `index.html`, using the exact host from the DSN:
`https://*.ingest.sentry.io` for EU-region projects, or `https://*.ingest.us.sentry.io` for US. Do
not widen it to `https:`. `e2e/csp.e2e.js` must keep passing against the production build
(`E2E_PREVIEW=1`), and the test should assert the new host is present and that nothing broader was
added.

### 5. Workflow: the one place the token is read

In `.github/workflows/pages.yml`, add to the `build` job's `npm run build` step:

```yaml
env:
  BASE_PATH: ${{ steps.pages.outputs.base_path }}
  VITE_SENTRY_DSN: ${{ vars.SENTRY_DSN }}
  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
  SENTRY_ORG: ${{ vars.SENTRY_ORG }}
  SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}
  SENTRY_RELEASE: ${{ github.event.workflow_run.head_sha || github.sha }}
  VITE_SENTRY_RELEASE: ${{ github.event.workflow_run.head_sha || github.sha }}
```

Then, in the repository's settings (done by the user, not in code):

1. Create the Sentry project (a browser / Vue platform project) and copy its DSN.
2. Create the auth token as in section 1.
3. GitHub → Settings → Secrets and variables → Actions: add the variables `SENTRY_DSN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`, and the secret `SENTRY_AUTH_TOKEN` (or the environment-scoped
   version, if that route was chosen).
4. Run `workflow_dispatch` once and check the build log for the plugin's "uploaded source maps"
   line, and check the Sentry release page for the commit SHA.

Verify before trusting it: a throwaway error thrown from a deliberately added test button is **not**
the right check, because it would ship to production. Instead, run the production build locally
with `VITE_SENTRY_DSN` pointed at the real project and a `SENTRY_AUTH_TOKEN`, trigger an error from
the browser console (`throw new Error('sentry smoke')` inside a `page.evaluate`-style helper, or from
devtools), and confirm the event arrives with a readable stack. Then discard the local build.

### 6. Housekeeping

- `docs/decisions/error-reporting.md` records the decision, the scrubbing rules and the key
  handling above, so the next reader does not have to rediscover them.
- Add a Sentry section to `SECURITY.md`'s reporting guidance: which data is sent, and that the
  project does not send document contents or AI keys.
- Run `npm run licenses` and `npm run spdx` after `git add`; the new `.md` and `.js` files need
  their markers.

## Effort

M (a few hours). The code is small; the decision record, the scrubbing tests and the CSP and
secrets wiring are most of it.

## Testing

- **Unit (`src/core/errorReporting.spec.js`, Vitest, Chromium-independent):**
  - With no DSN, `initErrorReporting()` does not call `Sentry.init` (mock the SDK at the boundary,
    per `CLAUDE.md`'s Always mock at the boundary).
  - With a DSN, it calls `init` with `sendDefaultPii: false`, replay off, and tracing off.
  - `beforeSend` removes `request.data`, `extra`, and any breadcrumb whose text contains the
    stored-key pattern. Cover the degenerate cases: an empty event, an event with no breadcrumbs,
    and a key-shaped string split across two fields.
- **E2E:** `e2e/csp.e2e.js` re-runs against the production build (`E2E_PREVIEW=1`) and asserts the
  new ingest host is in `connect-src` and nothing broader was added. Chromium is enough for that
  spec, because it reads the policy from the document.
- **E2E smoke:** the existing full suite must still pass, since `main.js` now calls the init path on
  every boot. No new `*.e2e.js` for Sentry itself: a real event cannot be asserted against Sentry's
  ingest from a test without a live key, and the key must not be in CI for tests.
- **Manual, once, after the first deploy:** the step-5 check above (one smoke event arrives with a
  readable stack). Log it in `TODO/VERIFY.md` as a one-off, since it needs the live project.
- **Acceptance scenarios:** none directly. Initialisation runs on the boot path that every scenario
  shares, so the full suite covers that. Say so in the run record.
- **Closed-finding regressions:** none, unless a closed finding covers the CSP. If one does, re-run
  its repro against the new policy.
- **Browser engines:** Chromium for the new unit and CSP specs. The existing WebKit and Firefox runs
  already cover boot, so no extra engine coverage is needed for this task.
- **Small-screen behaviour:** n/a (no UI).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
