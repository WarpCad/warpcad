---
title: Save to library refuses a repeat body, up front, so a repeat can never be saved into a part
category: ui
kind: finding
priority: medium
model: sonnet
depends: [core-061]
status: done
---

> **Shipped as written.** One detail differs from the spec: a repeat is always its own record in
> the closure that `capturePart` walks (via `target`/`operands`), so no `params.source` walk was
> needed; `capturePart` checks the op directly. `holdsRepeat` (`src/core/userPartTools.js`) is the
> shared check for the gate and the AI tool.

## Problem

*Save to library…* is an end step: a person finishes a part, then saves it once so it can be
dragged into other projects. A repeat (`pattern.repeat`, `core-061`) is the opposite kind of
thing, a live link that re-aims its source at each target. Letting the two meet is a mistake:
a saved part that holds a repeat would have to carry the pattern vocabulary into every project
that drops it, and a repeat of a part that was itself saved or dropped from the library is the
start of a recursive, library-filling loop. `ui-073` (owner decision 2026-10-17) proposed
saving the repeat's source with it. The owner reversed that on 2026-10-17: **remove the
ability, don't make it work.**

Today the save does not work, but it fails by accident. The button is enabled for a repeat
body (`saveToLibraryGate`, `src/core/userPartTools.js:36`, only checks count, preview and
`inactive`), and the tap ends in `capturePart` throwing `step "rep-1" (pattern.repeat) is not
allowed in a part` (`src/core/userPart.js:1235`). That is a late error from a deep walk, not a
rule: someone who adds `pattern.` to `ALLOWED_OP_PREFIXES` later turns the accident into the
feature. Two other doors are open as well: a repeat *inside* a group that is saved, and the
AI's `save_to_library` proposal (`src/ai/tools/library.js`).

## Affected files

- `src/core/userPartTools.js` (`saveToLibraryGate`: new `repeat` input, new reason)
- `src/core/userPart.js` (`capturePart`: refuse a `pattern.repeat` anywhere in the saved
  closure with a message that names the rule; keep `ALLOWED_OP_PREFIXES` without `pattern.`)
- `src/stores/library.js` (`saveGate`: pass whether the selected body is, or contains, a repeat)
- `src/components/layout/SaveToLibraryButton.vue`, `SaveToLibrarySheet.vue` (show the reason line)
- `src/ai/tools/library.js` (`save_to_library` refuses with the same sentence; no proposal)
- `src/core/userPartTools.spec.js`, `src/core/userPart.spec.js`, `src/stores/library.spec.js`,
  `src/ai/tools/library.spec.js` (update)
- `TODO/ui-073-save-repeat-saves-its-source.md` (retire: superseded by this file)

## Proposed fix

1. **Gate.** `saveToLibraryGate` takes `repeat` (true when the one selected body is a repeat
   body, or a group whose closure contains a `pattern.repeat` step). When true it returns
   `{ enabled: false, reason: "A repeat can't be saved to the library — it's a live link to
   its source. Save the source part instead." }`. The Inspector button is disabled and the
   visible reason line shows it (phone has no hover).
2. **Core backstop.** `capturePart` refuses any `pattern.repeat` in the closure it walks, with
   that same sentence, before the generic "not allowed in a part" error. The walk must follow
   `params.source` and `params.seed.id` as well as `target` and `operands`, so a repeat reached
   only through a param is still found. A spec pins that `ALLOWED_OP_PREFIXES` has no
   `pattern.`, so the rule can't be undone silently.
3. **AI path.** `save_to_library` returns a refusal in core's words, and never builds a
   proposal for a repeat. The system prompt's library line (`src/ai/prompt.js:112`) gets one
   clause saying a repeat can't be saved.
4. **No loop.** Nothing creates a part from a part automatically: add a spec that a Library
   drop of a user part, followed by a repeat of it, still cannot be saved while the repeat is
   in the saved closure, and that no code path calls the save more than once per tap or per
   confirmed AI proposal.
5. Retire `ui-073` as superseded.

Out of scope: baking a repeat into plain records when saving (`ui-073` option 1). Revisit
only if the owner asks for it.

## Effort

S to M (an hour or two).

## Testing

- Unit (RED first): the gate returns the repeat reason for a repeat body and for a group
  containing one; `capturePart(piBoltRepeated(), 'rep-1', ...)` throws the new sentence, and so
  does a group whose repeat is reached only through `params.source`; the same save with the
  repeat removed still succeeds.
- Unit: `ALLOWED_OP_PREFIXES` does not contain `pattern.`.
- Unit: `save_to_library` on a repeat refuses and creates no proposal.
- E2E: a new case in `e2e/user-library.e2e.js` that navigates to `/`, builds a repeat, selects
  it and checks the button is disabled with the reason line visible, then selects the source and
  checks it is enabled. All 9 projects (phone layout shows the reason line without hover).
- Acceptance scenarios: 1 to 3 (placement and library drops) and 18, re-driven on laptop and
  phone Chromium. Scenario 22 is "Merge a copy of the project", not My parts.
- Closed-finding regression: `ui-055` (save to library) and `core-061` (repeat), re-run
  their repro steps.
- Engines: all three (the save writes to IndexedDB).

## Interaction model

- **Precondition**: exactly one body is selected and it is not a repeat, and contains none.
- **Trigger**: *Save to library…* in the Inspector and toolbar, unchanged.
- **Feedback**: for a repeat, the button is disabled and a visible line says why and what to
  do instead.
- **Placement**: n/a. **Selection response**: unchanged. **Selection count**: exactly 1.
- **Small-screen behaviour**: same as desktop; the reason is a visible line, not only a tooltip.

## Documentation

- **Page**: `docs/user-library.md` (a short note under saving a part: a repeat can't be saved).
- **Example**: make *Bolt 1 ×3*, select it, see *Save to library…* greyed with the reason;
  select *Bolt 1* itself, tap *Save to library…*, name it, and it appears in My parts.
- **Media**: n/a unless the Inspector still changes shape; if a still of the reason line is
  added, name it under `e2e/docs/` and embed it on that page.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
