---
title: Add Google Analytics (GA4) to the hosted app, with a checklist of the steps only you can do
category: build
kind: feature
priority: low
model: sonnet
milestone: none (not yet placed in TODO/ROADMAP.md)
depends: []
status: open
---

## Goal

Add Google Analytics 4 so the owner can see usage of the hosted WarpCad app (GitHub Pages). The
expected audience is small, mostly the owner, so this is a light measurement, not a product
analytics programme.

Done means:

- The hosted app sends GA4 page views, and nothing else of note, to a GA4 data stream the owner
  controls.
- It does **not** send anything from `npm run dev`, from a local preview, or from the test runs.
  The owner's own development traffic must not show up as usage.
- The measurement ID comes from build configuration, not from a hard-coded value in source, so it
  can be changed or removed without a code edit.
- A checklist of the manual steps the owner must do (below) is complete and kept in this file.

## Checklist (you, not Claude)

These steps need your Google account or a GitHub setting. Claude can't do them.

1. **Create a separate property.** Decided 2026-10-16: WarpCad gets its own GA property, so its
   numbers are apart from jwc.dev. In Google Analytics (the same Google account is fine), create a
   new property, then add a **web data stream** for the WarpCad host (for example
   `https://<your-github-user>.github.io`, with the path if WarpCad is served under one: check
   `BASE_PATH` in `.github/workflows/pages.yml`).
2. **Copy the Measurement ID** (`G-XXXXXXXXXX`). It is public: it ends up in the page the browser
   loads, so it is not a secret. Give it to Claude, or set it yourself in step 3.
3. **Set the repository variable**: GitHub → WarpCad repo → **Settings → Secrets and variables →
   Actions → Variables** → **New repository variable**, name `GA_MEASUREMENT_ID`, value the ID.
   The Pages workflow passes it to the build. (If you'd rather not use a variable, skip this and
   tell Claude; the ID can live in the build config instead.)
4. **Data retention.** In **Admin → Data settings → Data retention**, set the event data retention
   to **2 months** (the shortest) unless you want longer history. Turn off **Google signals** under
   **Data collection** if you do not want cross-device reporting.
5. **Internal traffic.** Optional. The app already skips localhost, but if you ever open the hosted
   app from your own browser, add your IP under **Admin → Data streams → Configure tag settings →
   Define internal traffic** and turn on the internal-traffic filter.
6. **Verify after the first deploy.** Open the hosted app, then in GA go to **Reports → Realtime**
   and confirm one active user with the page path. Then open **Admin → DebugView** (with the
   Google Analytics Debugger browser extension switched on) to see the page view arrive with its
   parameters.
7. **Consent: no banner** (decided 2026-10-16). GA still sets cookies, so the **Documentation** note
   must say so plainly. If you later share the link widely or serve users in the EU/UK, tell
   Claude, because that reopens this decision and adds a consent UI surface.
8. **Tell Claude when the first real numbers show up**, if you want the **Documentation** note
   (`docs/`, see below) to say what is measured.

## Interaction model

Not applicable. This adds no user-visible control, panel or gesture. The only visible surface is
the `Consent` decision in step 7 above, which is a manual choice, not an app control.

## Documentation

Not applicable to the app's user docs, because the feature is not a control. The privacy point is
worth recording, though: add a short section to `docs/getting-started.md` or a new `docs/privacy.md`
(your choice) that says the hosted app uses Google Analytics for page views, what it does not send,
and how a visitor can opt out (for example, a browser extension). Name the page in the PR body.
Confirm the sidebar entry if a new page is added (`.claude/commands/docs.md` Step 4).

## Affected files

- `index.html`: add the GA script and the Content-Security-Policy changes. The existing CSP is
  `script-src 'self'` with `connect-src 'self' https://api.anthropic.com https://api.github.com`
  (`index.html:18`), so an inline `gtag` snippet will be blocked. Load GA from a module file
  instead, and add `https://www.googletagmanager.com` to `script-src` and
  `https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com`
  to `connect-src`. Do not loosen anything else.
- `src/analytics/` (new): a small module that, when `import.meta.env.PROD` and the host is not
  `localhost`, injects the `gtag.js` script for the configured ID and sends one page view. It is
  framework-free and has no runtime effect when the ID is unset. It lives outside `src/core/`
  because it touches the DOM and the network, and is loaded by `src/main.js` only.
- `vite.config.js`: expose `GA_MEASUREMENT_ID` through `define` or `import.meta.env`.
- `.github/workflows/pages.yml`: pass the repository variable `GA_MEASUREMENT_ID` into the build.
- `docs/decisions/analytics.md` (new): a short decision record. GA is a third-party service rather
  than an npm dependency, so the Library-decisions rule (several options compared) applies in
  spirit: list the realistic options (GA4, Plausible / Umami self-hosted, no analytics, server logs
  from GitHub Pages) with the reason GA was picked. Tell the user if they want the self-hosted path
  instead, which needs a different stack.
- `e2e/analytics-guard.e2e.js` (new, see Testing): blocks the GA hosts so tests never send hits.
- `e2e/csp.e2e.js`: extend with the GA CSP assertion (see Testing).

## Proposed fix

1. Read `GA_MEASUREMENT_ID` at build time. When it is empty, the module does nothing, so local
   builds and forks carry no tag.
2. Gate on `import.meta.env.PROD` and `location.hostname !== 'localhost'` (and `127.0.0.1`) so
   `npm run dev` never reports.
3. Load `gtag.js` from `https://www.googletagmanager.com/gtag/js?id=<ID>` as a module
   (`script-src` allows it once the CSP is updated). Send `page_view` once on load. Leave the
   default enhanced-measurement events off in the config call unless the owner asks for them.
4. Keep the CSP change to the minimum listed under Affected files. Verify with the browser console
   that nothing else is blocked.

## Effort

S. The code is small. The checklist is the bulk of the work and is the owner's.

## Testing

- **Unit** (`src/analytics/analytics.spec.js`): with an empty ID, nothing is injected; with an ID on
  a non-production build or on `localhost`, nothing is injected; with an ID in production, exactly
  one `gtag.js` script is added and one `page_view` is queued. Mock `document` and the network at
  the boundary (the project rule: no real network in unit tests).
- **E2E** (`e2e/analytics-guard.e2e.js`, navigates to `/`): use `page.route` to block every
  `googletagmanager.com` and `google-analytics.com` request, then assert the app still loads, the
  Library drop still works, and no request was attempted during the dev run. This is the spec that
  keeps tests from sending real hits.
- **CSP**: extend the existing `e2e/csp.e2e.js` (the guard for `index.html`'s policy,
  `ai-004`, `docs/decisions/ai-partner.md` decision 8) rather than adding a second CSP check. Its
  "policy is live" assertions must still pass, and an unlisted host must still be refused. Add one
  assertion that the GA script loads with no `securitypolicyviolation` in the production build.
  The guard runs against the production build, which carries the CSP `<meta>`; a dev-server run
  can pass while the production policy blocks the script, so the GA check runs there too.
- **Engines**: Chromium only. Analytics is a plain script, not WebGL, canvas, or persistence.
  Say so explicitly here; do not run the full matrix for it.
- **Viewports**: one project (desktop). No layout change.
- **Acceptance scenarios to re-drive by hand**: none. This does not touch the viewport, kernel,
  bridge, or persistence. The first real-browser check is the step 6 Realtime report, owned by the
  checklist.
- **Closed findings whose repro gets re-run**: `build-002` (the white flash on load). The GA script
  runs in `<head>`-adjacent code and can delay first paint if it is not deferred. Re-run its repro
  on the production build and confirm no white flash regression.

## Notes

Raised by the user on 2026-10-16 in `TODO/NEW-TODO.md`. The user already has GA on the home page
(`jwc.dev`, in the `johnwebbcole.gitlab.io` project), which is outside this repository; this task
does not change that site.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
