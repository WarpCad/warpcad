---
title: Combine the six Raspberry Pi screen rows into one Library item with a Screen model dropdown
category: core
kind: feature
priority: medium
model: sonnet
milestone: M16
depends: []
status: open
---

## Goal

Requested by the user on 2026-10-15. The Raspberry Pi section of the Library panel lists six
screens as six separate rows — `raspberrypi.touchDisplay7inch` ("7-inch Touch Display"),
`raspberrypi.touchScreen2` ("Touchscreen 2"), `raspberrypi.miniPiTFT` ("Mini PiTFT"),
`raspberrypi.piTFT22` ("PiTFT 2.2"), `raspberrypi.piTFT24` ("PiTFT 2.4") and
`raspberrypi.hyperPixel4Rectangular` ("HyperPixel 4") — each its own registry entry
(`src/core/kernel/registry.js:1467-1499`) with its own recipe file. That is exactly the "undifferentiated
dropdown built by iterating a feature registry" shape `CLAUDE.md`'s Interaction Model warns against,
one level up: six rows for one *kind* of thing (a Raspberry Pi display) the same way `raspberrypi.bplus`
would be four rows (one per board revision) if `core-014a` had not already fixed that for the board
itself with a single `model` param and a `choice` dropdown (`modelChoice(BPLUS_MODELS, …)`,
`registry.js:1411-1420`), and `raspberrypi.cameraModule` the same way for the camera
(`registry.js:1435-1445`).

"Done" is: the Raspberry Pi section of the Library has **one** "Raspberry Pi Screen" row with a
**Screen model** dropdown offering the six screens above, in the same place and with the same
behaviour as the Pi board's own Model dropdown (`ui-031`) — chosen before dragging, and editable
afterwards in the Inspector, where changing it rebuilds the placed group as the newly chosen screen.
Dropping it places exactly the screen the dropdown names, with exactly the parts and geometry the
existing per-screen recipe already produces — this task recombines *rows*, not geometry, so no screen's
dimensions, part names or `TODO/core-016`/`core-017` dimensional-accuracy work are touched.

## Why this is simpler than it looks: the six screens are already correct and stay as they are

Unlike the Pi board (`core-014a`), where one factory branches on `model` to build genuinely related
dimension-table variants of the same board, these six screens are six **unrelated physical products**
with six independent recipe files, no shared dimension table and no shared part names. Collapsing them
into one row does not mean merging their geometry into one function the way `bplus.js` merges four board
revisions — it means adding one **dispatching** registry entry that picks which existing, unmodified
recipe function to call, based on the `model` param's value, and removing the Library-row metadata (not
the registry entries themselves) from the six it replaces.

That split matters for compatibility: a document saved before this task has `raspberrypi.touchScreen2`
(etc.) records with no `model` param, because those ops take none today. Those **registry entries must
keep existing and keep evaluating exactly as they do now** — `buildRows` (`src/core/library.js:171-208`)
only turns a registry entry into a Library row when it carries `ui` metadata; an entry with no `ui` still
evaluates fine, it is simply invisible to the panel. So the fix is:

1. **Leave the six recipe files and their registry entries alone**, except deleting their `ui: { label,
   defaults }` object (`registry.js:1467-1499`) so `buildRows` stops turning each into its own row. They
   stay fully registered and `evaluateOp` still expands a pre-existing `raspberrypi.touchScreen2` record
   exactly as it does today — this is a **replay-only, not legacy-path**, compatibility story, simpler
   than `core-057`'s `kit.phone` migration because no recipe's own logic needs an "old shape" branch at
   all.
2. **Add one new registry entry**, `raspberrypi.screen`, `composite(0, screen, { label: 'Raspberry Pi
   Screen', defaults: { model: 'touchDisplay7inch' }, choice: modelChoice(SCREEN_MODELS, { … }) })`,
   following the exact `modelChoice`/`choiceOptionsOf` mechanism `bplus` and `cameraModule` already use
   (`registry.js:243-255`, `:1773-1796`) so the option list is derived off the recipe's own exported
   list rather than hand-copied a second time, per those two entries' own precedent.
3. **The new `screen(params)` recipe is a pure dispatcher**: `{ touchDisplay7inch, touchScreen2,
   miniPiTFT, piTFT22, piTFT24, hyperPixel4Rectangular }[params.model]()`, called with whatever params
   that screen's own recipe takes beyond `model` (today: none — each is `defaults: {}`), returning its
   `OpRecord[]` unchanged. No renaming of parts: each screen keeps the part names its own recipe already
   gives it (`display`, the TFT's own named sub-parts, etc.), because `library.spec.js`'s
   existing per-screen part-name assertions and any saved project's `{ id, pieces }` references must
   keep meaning what they mean today, whichever row the user clicked.
4. **Model values are the six screens' own existing op suffixes** (`'touchDisplay7inch'`,
   `'touchScreen2'`, `'miniPiTFT'`, `'piTFT22'`, `'piTFT24'`, `'hyperPixel4Rectangular'`) — self-documenting
   and already unique, the way `cameraModule`'s `'v1' | 'v2' | 'v3' | 'hq' | 'arducam-hq'` are strings
   rather than `bplus`'s numeric revisions.
5. **No part-name aliasing across a model change** (unlike `BPLUS_PART_ALIASES`, `registry.js:144-151`):
   these six products share no connector, so switching the Inspector's Screen model dropdown from one
   screen to an unrelated one legitimately orphans any Snap/Align that referenced the old screen's named
   sub-part — the existing broken-reference repair dialog (`ui-052`) already handles that case and needs
   no change here. State this explicitly in Step 2 so nobody tries to invent a cross-product alias table
   where none is meaningful.

## Interaction model

- **Precondition** — none; it is a creation action, so it follows the Library's placement rules.
- **Trigger** — the Raspberry Pi section's new **Raspberry Pi Screen** row, with a **Screen model**
  dropdown beside it (choose before you drag, as with the Pi board's own Model dropdown — also editable
  afterwards in the Inspector, where a changed model rebuilds the placed group in place).
- **Feedback** — a preview follows the pointer and the screen commits on release. The Inspector names the
  placed group by the chosen screen's existing label (e.g. "Touchscreen 2"), exactly as it does today for
  whichever row produced it, and lists the same parts that screen's recipe has always produced.
- **Placement** — drag into the 3D view; preview follows the pointer, commits on release, like every other
  Library row (`CLAUDE.md` Interaction Model). Do not spawn at the origin.
- **Selection response** — selecting the placed body and drilling into its parts (`ui-016`) works exactly
  as it does today for each screen — this task does not touch pick-depth or part structure.
- **Selection count** — n/a; this is a 0-operand creation row, not an operation.
- **Small-screen behavior** — the Screen model dropdown sits under the row on a phone, 44 px tall, reusing
  the same row component the Pi board's Model dropdown already uses in the Library sheet (`ui-031`).

## Affected files

- `src/core/kernel/registry.js` — remove `ui` from the six screen entries (`:1467-1499`); add
  `raspberrypi.screen`'s entry with `modelChoice`/`choice`; add a `PARAM_SCHEMAS` entry with
  `enumParam('Screen model', choiceOptionsOf('raspberrypi.screen'))`, next to the `bplus`/`cameraModule`
  entries at `:1788-1796`.
- `src/core/kernel/recipes/raspberrypi.screen.js` (new) — the dispatcher recipe and its exported
  `SCREEN_MODELS` list (the single source `modelChoice` reads, per the existing convention).
- `src/core/library.js` — `ROW_ORDER` (`:135-140`): replace the six screen entries with one
  `raspberrypi.screen` entry, in the same position (after the Pi accessories, before Text).
- `src/core/library.spec.js` — the six screens' current row-count/label assertions collapse to one row;
  add assertions that each `model` value still builds the same part names and bounds the six pre-existing
  per-screen specs already assert (do not delete those specs' own geometry assertions — just stop
  asserting they each have their own Library row).
- `src/core/kernel/recipes/raspberrypi.screen.spec.js` (new) — see Testing.
- `docs/hardware-library.md` ("Raspberry Pi parts" section, the screenshot and prose at lines ~88-128)
  and `docs/primitive-placement.md`'s "Placing a Raspberry Pi part" section — update the row count and add
  the Screen model dropdown's own explanation, the way the Model dropdown is already documented there for
  the board.
- `e2e/docs/` — regenerate the Library screenshot (`library-rpi-section.png`) once the row collapses to
  one; see Documentation below.
- `src/ai/tools/` — if a tool description lists the six screen ops by name, update it so the AI partner
  places `raspberrypi.screen` with a `model` value instead.

## Effort

S. No geometry changes and no new dimension data — the six recipes are reused verbatim. The careful part
is making sure `buildRows`/`ROW_ORDER`/`PARAM_SCHEMAS` and the docs stay in sync with the row collapse,
and that a saved document's bare `raspberrypi.touchScreen2`-style record (no `model`) still replays.

## Testing

- **Unit** (`raspberrypi.screen.spec.js`):
  - every value in `SCREEN_MODELS` dispatches to the right underlying recipe and returns byte-identical
    `OpRecord[]` to calling that recipe directly (the oracle is the existing recipe, not a re-derivation);
  - an unknown `model` value is rejected with the same wording style `bplus` uses for an unknown model;
  - `choiceOptionsOf('raspberrypi.screen')` returns exactly six options with the labels the panel is
    expected to show.
  - `library.spec.js`: the Raspberry Pi section has exactly one row for the screens (down from six), its
    `choice` lists all six model values, and dropping each model value still produces the part names and
    bounding box the six now-pre-existing per-screen specs already assert.
  - **Replay**: a hand-pinned fixture record `{ op: 'raspberrypi.touchScreen2', params: {} }` (today's
    shape, no `model`) still expands identically after this change — add one such fixture per screen, the
    way `ui-060` added `snapAlignReplay.spec.js` for its own row collapse.
- **E2E** (`e2e/raspberrypi-screen-library.e2e.js`, navigates to `/`, real mouse): open the Library, choose
  each Screen model in turn and drag it in, assert the Inspector's group label and parts list match that
  screen's existing identity; change the model in the Inspector after placement and assert the group
  rebuilds in place with the new screen's parts. Chromium-only across the three viewports (no new
  WebGL/WASM/persistence surface — this reuses `evaluateOp` and the existing drag-drop mechanism
  unchanged), since the drag-and-drop gesture itself is already covered cross-engine by the Pi board's own
  Model-dropdown spec and this task introduces no new rendering path.
- **Acceptance scenarios to re-drive by hand**: **3** (a Library drag renders complete, not partial — now
  six different possible shapes behind one row) and **6** (group versus sub-part selection, for whichever
  screen was last placed). Report PASS/FAIL for each.
- **Closed findings whose repro gets re-run**: `ui-031` (the Raspberry Pi section's `ui` metadata rollout
  — re-run its check that every Raspberry Pi row renders and drags), `core-016`/`core-017` (the two
  screens' and four small displays' own dimensional-accuracy fixtures — re-run their specs unchanged, to
  confirm the dispatcher didn't drift any of the six), and `ui-052` (broken-reference repair dialog —
  re-run its repro against a Snap/Align that references a part orphaned by a Screen-model change).

## Documentation

- **Page** — `docs/hardware-library.md`'s "Raspberry Pi parts" section and `docs/primitive-placement.md`'s
  "Placing a Raspberry Pi part" section, both updated for the new row count and the Screen model dropdown.
- **Example** — "Open **Library → Raspberry Pi**. Next to **Raspberry Pi Screen** choose **Screen model:
  Touchscreen 2**, then drag it onto the grid. Changed your mind? Select the placed screen, and in the
  Inspector change **Screen model** to **Mini PiTFT** — the group rebuilds in place as the new screen."
- **Media** — regenerate `docs/screenshots/library-rpi-section.png` (the Raspberry Pi section now has one
  fewer... five fewer rows) via `npm run docs:media`; add a shot of the Screen model dropdown open, showing
  all six options. `e2e/docs-media.spec.js` must stay green (no orphan, no dead link) — the old screenshot
  reference at `docs/hardware-library.md:90` already points at this file, so no new image name is needed
  unless the dropdown-open shot is added as a second file.

## Notes

- Not in scope: adding a seventh screen, changing any screen's dimensions or part names, or giving the
  screens a shared dimension table the way the Pi board revisions have one — they remain six independent
  recipes behind one dispatcher, because they are six independent products.
- If a future screen is added, it is a second case in the dispatcher and a new `SCREEN_MODELS` entry — no
  new Library row, which is the whole point of doing this now rather than letting a seventh row accrete.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
