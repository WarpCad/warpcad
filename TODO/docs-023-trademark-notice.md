---
title: Add a trademarks notice for the product and service names the app uses
category: docs
kind: feature
priority: high
model: sonnet
milestone: M18 — Launch: publish, app.warpcad.com, Sentry and GA
depends: []
status: open
---

## Goal

A reader of the repository, and of the hosted Help, sees a short statement that product and
service names used in WarpCad belong to their owners, are used only to identify compatible
parts or services, and imply no affiliation or endorsement.

The pre-publish review (2026-10-17) counted the names in the app source: Raspberry Pi (57
mentions), iPhone (37), Apple (17), Pixel (8), Galaxy (4), Samsung (2), Adafruit (3) and
Pimoroni (1). Using them to name a compatible part is ordinary nominative use, and the
review saw no brand logos in the tree. There is no trademark statement anywhere in the
repository today (the only matches are in the licence texts).

## Interaction model

Not applicable. This is prose in existing documents. It adds no control; the Help pages are
bundled from `docs/` (`ui-061`), so the text appears in the app without any new component.

## Affected files

- `LICENSING.md` (a new "Trademarks and names" section after "Dependencies"; this file is the
  repository's licence map, so the notice belongs with it)
- `README.md` (one sentence in the licence area pointing to that section)
- `docs/hardware-library.md` (a one-line note that part names are used to identify
  compatible parts, linking to the section)
- `scripts/help-build.mjs` is untouched: it already bundles `docs/*.md`, and a link between
  pages is all that is needed.

## Proposed fix

1. Write the section. It names the owners of the marks it lists, in this form: *"Raspberry
   Pi is a trademark of Raspberry Pi Ltd. iPhone is a trademark of Apple Inc. Galaxy is a
   trademark of Samsung Electronics. Pixel is a trademark of Google LLC. Adafruit is a
   trademark of Adafruit Industries. Pimoroni is a trademark of Pimoroni Ltd."* Before using
   each sentence, check the owner's current name and mark in the owner's own trademark page,
   and fix the sentence if it differs. Also cover the services the app calls or names: Claude
   and Anthropic, GitHub, Sentry, Google Analytics and OpenJSCAD.
2. State the rule in one line: names identify what a part is compatible with; WarpCad is not
   affiliated with, or endorsed by, any of them.
3. Add a rule for later contributors to `CONTRIBUTING.md` or `CLAUDE.md`'s Licensing section:
   no third-party logo or brand image goes into the repository without a licence check.
4. Do **not** do a trademark search for the name "WarpCad" in this task. That is a decision for
   the owner, and it is out of scope here.

## Effort

S (< 1 hr).

## Testing

- `npm run spdx` passes (no new file, but the edited Markdown files keep their markers).
- A unit or guard check that every product name this TODO lists, when it appears in `src/`
  outside specs, also appears in the Trademarks section. If a new brand name is added later,
  the guard fails until the section is updated. Put it in `scripts/` beside
  `scripts/heavySpecTimeouts.spec.js`, and name the exact list in the spec.
- `e2e/docs-media.spec.js` (the `guards` project) still passes: no media added.
- E2E: none; no control changes. The Help page that links to the section is already covered by
  `e2e/help.e2e.js`; re-run it at laptop width to confirm the new link resolves.
- Acceptance scenarios: none.

## Documentation

- **Page**: `LICENSING.md` (the new section), `README.md` (one sentence) and
  `docs/hardware-library.md` (one line).
- **Example**: n/a (no usage steps; a statement).
- **Media**: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
