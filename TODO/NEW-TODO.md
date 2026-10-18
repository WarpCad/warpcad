# Enter new todo requests

New requests, one per section so they can be bulk created.

## Run e2e against `npm run build` + `npm run preview`, not `npm run dev`

Make the default Playwright run build the app and serve it with `vite preview`, instead of
starting the dev server. The aim is faster e2e runs, and tests that exercise the code that
ships. `playwright.config.js` already has this as an opt-in (`E2E_PREVIEW=1`, `TODO/ai-004`);
make it the default. Keep the dev server only as an explicit opt-out for debugging.

Things the implementing task should check, because they change behaviour under the default run:

- The preview build carries the production Content-Security-Policy, so specs that pass on dev
  may need review.
- The production service worker is active in preview, and WebKit currently blocks it in preview
  mode. Decide whether that exemption stays.
- Measure wall-clock for the fast run before and after, and report the one-off build cost.
- Update `.claude/commands/test.md` and the `E2E_PREVIEW` notes to match.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
