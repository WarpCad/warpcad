---
title: Prove a cold https://app.warpcad.com/#/help/<page> link opens Help on that page
category: testing
kind: feature
priority: medium
model: sonnet
milestone: M20
depends: []
status: open
---

## Goal

The home page (`docs-027`) links every docs page as `https://app.warpcad.com/#/help/<slug>`.
The code path exists (`src/components/layout/HelpSheet.vue`: `onMounted` → `openFromHash()`,
`HASH_RE = /^#\/help\/([\w-]+)$/`), but **no e2e spec opens the app cold on a help hash**. Every
`e2e/` spec reaches Help by clicking. Once another site links to that URL, it is a public
contract, and nothing guards it today. It is also directly at risk from `perf-003` ("Defer code
unused at boot"), which names File ▾ → Help among its triggers. If `HelpSheet` stops mounting
at boot, its `onMounted` never runs, and a link from the home page lands on an empty viewport
with no error.

Done means a spec loads `/#/help/<slug>` in a fresh context (no prior visit, no service worker)
and the Help sheet is open on that page, at all three viewports and on all three engines. An
unknown slug gives a readable outcome rather than a dead end.

## Interaction model

No new control. This pins the behaviour of an existing entry point, the URL hash, which is now
also reached from outside the app:

- **Precondition**: none. A first visit, with nothing in IndexedDB.
- **Trigger**: opening `https://app.warpcad.com/#/help/<slug>` (a link on `warpcad.com`, a
  bookmark, a shared URL). `<slug>` is a page slug (`booleans`) or a `TOPICS` id.
- **Feedback**: the app boots, and the Help sheet opens over the viewport on that page, titled
  as in Contents. **×** or Esc closes it and leaves an empty scene. Closing clears the hash
  (`ui-061` item 7's mirror), so a reload does not reopen it.
- **Unknown slug** (a page renamed after the home page was built): decide and pin one outcome.
  **Proposed:** the sheet opens with a short "This page has moved or no longer exists" line and
  Contents open, not the network-error Retry state. If today's behaviour is the Retry state,
  fixing that is part of this task (`src/stores/help.js` / `HelpSheet.vue`; check the
  `help/index.json` order before fetching a page).
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: same as opening Help from the File menu: full-width sheet at
  390×844 with Contents folded behind its button.

## Documentation

- **Page**: `docs/help.md`, a short "Linking to a page" section: the URL form, that it works
  from any website or bookmark, and that it closes like any other Help view.
- **Example**: "Paste `https://app.warpcad.com/#/help/booleans` into the address bar. WarpCad
  opens with Help on *Combining shapes*. Press **×**; the address bar goes back to
  `app.warpcad.com/` and the empty scene is ready."
- **Media**: none new. The existing `help-contents-phone.png` already shows the sheet at phone
  width. If the unknown-slug line is new UI, add one still, `help-unknown-page.png`, from
  `e2e/docs/help.docs.js`, embedded in the same section.

## Affected files

- `e2e/help-deep-link.e2e.js` (new)
- `src/stores/help.js`, `src/components/layout/HelpSheet.vue` (only if the unknown-slug outcome
  needs a fix)
- `docs/help.md`
- `TODO/perf-003-defer-code-unused-at-boot.md` Testing: this spec named as a gate (done in the
  commit that wrote this file)

## Proposed fix

1. Write the spec first and run it. It may pass today; if so, the task is mostly the guard plus
   the unknown-slug decision.
2. Cases: a page slug (`booleans`), a topic id (any key of `src/help/topics.js`), `readme`, an
   unknown slug, and `#/gist/<id>` still taking priority (no Help sheet).
3. Pin the unknown-slug outcome as above.
4. Wait on the sheet's own loaded state, not a timeout. Help loads `help/index.json` and the
   page lazily.

## Effort

S.

## Testing

- **`e2e/help-deep-link.e2e.js` navigates to `/#/help/<slug>`** in a new browser context. It
  asserts the sheet is visible with the page's title, closes with Esc, the hash clears, and an
  empty scene remains. It runs at all three viewports (phone/tablet/laptop) with a snapshot at
  each, and on **Chromium, Firefox and WebKit**: this is the boot path (service-worker
  registration and IndexedDB open run beside it), and WebKit stands in for iPhone Safari, where
  most home-page visitors will tap the link.
- **Acceptance scenarios to re-drive**: **1** (two independent primitives), started from a cold
  `/#/help/getting-started` load at phone width: close the sheet, place a box and a sphere, and
  both stay visible.
- **Closed findings to re-run**: `ui-061` item 7's hash mirror (closing clears the hash; a
  `#/gist/<id>` hash is never overwritten).
- `perf-003` must keep this spec green. Its Testing section now names it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
