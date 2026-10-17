---
title: Drop @sentry/vite-plugin (FSL-1.1-Apache-2.0 via sentry@0.45.0) and upload source maps with curl
category: build
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **What shipped (2026-10-17):** as proposed, plus two things the plugin used to do implicitly. The
> workflow creates the release before uploading (the plugin did), and uploads each bundle file with a
> `Sourcemap` header beside its `.map` (hidden maps leave no `sourceMappingURL`). A separate step deletes
> every `.map` from `dist/` before the Pages artifact. An upload error now fails the job (the plugin only
> logged). Guarded by `scripts/sentry-upload.spec.js`. The live upload is unverified: `TODO/VERIFY.md` build-009.

## Problem

The dev-only package `@sentry/vite-plugin` pulls in the build-time package
`sentry@0.45.0`, which is licensed `FSL-1.1-Apache-2.0`. That licence is source-available,
not open source, and does not fit the AGPL project's build toolchain. `npm run licenses`
checks production dependencies only, so it never sees the package. Nothing from it
reaches `dist/`, so the risk is licensing, not shipped code.

The user ruled on 2026-10-17 (question 4 of the decision list): drop the plugin and upload
source maps with `curl` in the workflow.

## Affected files

- `package.json` (remove `@sentry/vite-plugin`)
- `package-lock.json` (regenerate)
- `vite.config.js:6` and `vite.config.js:184` (the plugin import and its use)
- `scripts/sentry-build.mjs` (`sentryBuildOptions` returns a `plugin` option to drop)
- `.github/workflows/pages.yml` (add a `curl` step that uploads the maps after build)
- `docs/decisions/error-reporting.md` (record the change; the Sentry decision stands)
- `TODO/VERIFY.md` build-004 row 6 (the licence question is now resolved; close the row)

## Proposed fix

1. Remove `@sentry/vite-plugin` from `package.json`, and regenerate the lockfile.
2. Remove the plugin from `vite.config.js`. Keep `hidden` source maps, so they are emitted
   but not referenced from the shipped bundle.
3. In `.github/workflows/pages.yml`, after the build, upload each `.map` file to Sentry's
   releases API with `curl`. Set the release to the commit SHA, as the plugin did. Use the
   existing `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` secrets and variables.
   Skip the step when `SENTRY_DSN` is unset, as the build does now.
4. Update `docs/decisions/error-reporting.md` with the change and the reason. Do not change
   the decision to use Sentry.

## Effort

S (< 1 hr for the code). The workflow step needs one real run to confirm, which the user
must do with the Sentry project.

## Testing

- `npm run typecheck` and `npm run licenses` pass.
- `npm run build` with no DSN produces no `.map` reference in the bundle, and Sentry stays
  inert.
- `npm run spdx` passes.
- Unit specs for `scripts/sentry-build.mjs` are updated to match the removed `plugin` option.
- Chromium only: this touches no WebGL, WASM or persistence path, and the change is
  build-time.
- Acceptance scenarios: none. This touches no user-visible surface.
- Not verifiable here: a real map upload to Sentry. The user runs the Pages workflow with
  the secrets set, as `TODO/VERIFY.md` build-004 rows 3 and 4 describe.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
