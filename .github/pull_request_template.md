## What and why

<!-- One or two sentences. Link the TODO/<id>.md or issue this closes. -->

## How it was checked

<!-- Which TODO/ACCEPTANCE.md scenarios you drove by hand in the running app, at which
     viewports and in which browsers, and the PASS/FAIL result for each. -->

## Checklist

- [ ] Every commit is signed off (`git commit -s`, see `CONTRIBUTING.md`)
- [ ] New files carry an SPDX marker (`node scripts/spdx.mjs --fix`)
- [ ] `npm run typecheck` and `npm run test:unit -- --run` pass
- [ ] A user-visible control is reachable from the real app: an `e2e/*.e2e.js` spec that navigates to `/`
- [ ] Its `docs/` page is added or updated, with a step-by-step example (and `e2e/docs/` pictures)
- [ ] Specs touching the viewport, kernel, touch or persistence run on Chromium, Firefox and WebKit
- [ ] Any closed finding whose subsystem this extends has had its original repro re-run

<!-- Leave a box unticked, with a reason, when it doesn't apply. -->

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
