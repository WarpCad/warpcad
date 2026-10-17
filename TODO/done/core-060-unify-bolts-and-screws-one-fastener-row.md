---
title: One fastener part for bolts and screws — a Type dropdown (socket cap, hex, pan head, flat head, wood screws) and a Size list per type
category: core
kind: feature
priority: medium
model: opus
milestone: M16
depends: []
status: done
---

> **Retired 2026-10-17.** Shipped as specified in one pass (not split). `hardware.bolt` is the one
> fastener op with `type`/`spec`/`length`/`fit`; legacy `{ spec: 'm10 hex' }` bolts are read through
> `normalizeBoltParams` and never rewritten on load. Wood-screw Fit comes from the Albany County
> Fasteners *Wood Screw Pilot Hole Guide* (no #11/#13/#15; #16 has no wood Fit; #10's clearance is
> 0.0025" under nominal, ported as published). Deviations: `paramsForDrop` (not only the Library
> panel) reconciles Size and Fit after a Type pick, so a drag, the ghost and the AI share one path;
> the History row's Edit form still shows a legacy bolt's legacy Spec form (submitting writes the
> new shape); `e2e/fastener-types.e2e.js` seeds its legacy file through the document store rather
> than a fixture file; the `screw-family.ndjson` docs fixture was deleted because the picture is now
> made by dragging.

## Goal

Requested by the user on 2026-10-15: *"Bolts and screws should be the same function with dropdowns
for panhead and wood screws."*

Today the project has two fastener ops, and they don't match each other:

| | `hardware.bolt` | `hardware.screw` |
|---|---|---|
| Library row | **Bolt** (`registry.js:1355-1358`) | **none**. Deliberately left without `ui` (`registry.js:1380-1391`), so a screw can only come from a file or the AI |
| Head | baked into the `spec` key: `'m2.5 socket'`, `'m10 hex'` | a separate `head` param: `'PanHead'`, `'FlatHead'` |
| Sizes | metric socket `m1.6`–`m20`, metric hex `m10`–`m20`, imperial socket `#0`–`1`, imperial hex `1/4`–`1` (`tables/bolt-specs.js`, generated from `jscad-hardware@5.0.0`) | `m4`, plus wood screws `#4`–`#12` (`tables/screw-specs.js`, ported from `1.1.0` only) |
| Fit / clearance | `fit` (`tap`/`close`/`loose`) and a hidden `tap` clearance part | none |

From the user's point of view a socket-cap bolt and a pan-head screw are the same thing: a fastener
with a head style, a size and a length. Having to know which of two ops one lives in, with two
different ways of choosing the head and one of them not draggable at all, is a modelling artefact.

"Done" is:

- **One** fastener row in the Library's Hardware section. Before you drag it you choose a **Type**:
  - **Socket cap**
  - **Hex head**
  - **Pan head**
  - **Flat head** (countersunk)
  - **Wood screw, pan head**
  - **Wood screw, flat head**
- Beside Type there is a **Size** list that offers only the sizes that exist for that type.
- **Length** and **Fit** are edited in the Inspector, where **Type** and **Size** can also be changed
  after placement and the part rebuilds in place.
- Every file saved before this change, with either op, opens and builds **byte-identically**.

## Design decisions

- **Extend `hardware.bolt`; don't add a third op.** `hardware.bolt` is already the Library row
  (`data-testid` in 15 e2e files), the AI partner's schema (`src/ai/tools/schema.spec.js:185`), a
  variable-binding special case (`core/variables.js:777`), and an op that kit and Raspberry Pi recipes
  emit internally for their mounting hardware (`rpi-recipe-kit.js`, `kit.board.js` and others). Making
  it the single fastener function keeps all of that working and means no record ever has to be
  rewritten. A new `hardware.fastener` op would also work, but it would have to re-establish every one
  of those links.
- **New param shape: `{ type, spec, length, fit? }`**, where `spec` becomes the bare size (`'m2.5'`,
  `'#8'`, `'1/4'`).
  - `type` is one of `'socket' | 'hex' | 'pan' | 'flat' | 'woodPan' | 'woodFlat'`.
  - Use a single `type` rather than separate `head` and `thread` dropdowns, because the tables don't
    cover every combination: there is no hex or socket wood screw, and the hex sizes are not the
    socket sizes. Two independent dropdowns would let the user build an impossible pair and then
    refuse it.
- **Legacy shapes are read, never rewritten on load.** Add one pure function, `normalizeBoltParams`,
  that every consumer calls: the recipe, `paramOptions` / `PARAM_SCHEMAS`, `bom.js`'s `detailOf`,
  `paramEdit.js`, the AI schema, and `variables.js`. It does the following:
  - A `hardware.bolt` record with **no `type`** is today's shape. Split its `spec` on the last space:
    `'m10 hex'` becomes `{ type: 'hex', spec: 'm10' }`, and `'1/4 socket'` becomes
    `{ type: 'socket', spec: '1/4' }`. It must then expand to exactly the `OpRecord[]` it does today.
    The pinned `1.1.0` rows (`bolt-specs.js:73-100`) are still the ones looked up, so a saved `m10 hex`
    keeps its 18 mm head.
  - The first Inspector edit of such a body writes the new shape. That is an ordinary edit and one Undo
    step (`ui-044`). A document is never migrated just by opening it, which matches `docs-022`'s rule
    that record lines are byte-identical.
  - Kit and Raspberry Pi recipes that emit `hardware.bolt` with a legacy `spec` keep doing so. Don't
    touch them in this task.
- **`hardware.screw` stays registered, unchanged, still with no `ui`.** It is replay-only, like the six
  screen ops in `core-058`. A saved screw keeps building and keeps its own Inspector fields. The new
  `pan`/`flat`/`woodPan`/`woodFlat` types reuse its geometry code (head cylinder or cone, thread
  cylinder) by moving the shared builder into a helper both recipes call. Then write a byte-identical
  oracle test: a `hardware.screw` `m4` PanHead record must expand exactly as it did before the helper
  was extracted.
- **Size tables per type.** Port and generate only. Do not invent dimensions (`screw-specs.js:14`'s
  standing rule):

  | `type` | Sizes | Source |
  |---|---|---|
  | `socket`, `hex` | exactly today's `boltSpecs` rows, split by their suffix | `bolt-specs.js`, unchanged |
  | `pan` | `m4` | `jscad-hardware@5.0.0` `MetricScrews`, the same single row `1.1.0` had. **A real table gap:** 5.0.0 ships no other metric pan-head machine-screw table. A fuller ISO 7045/7380 table is a table-only follow-up, not something to make up here |
  | `flat` | `M2, M2.5, M3, M4, M5, M6, M8, M10` | 5.0.0 `src/metric.js` `MetricFlatHeadScrews` (head height K, head diameter D2): add it to `scripts/generate-hardware-tables.mjs` |
  | `woodPan`, `woodFlat` | `#2`–`#16` | 5.0.0 `src/imperial.js` `ImperialWoodScrews` with `WoodScrewDiameter`: add it to the generator. Its `#4`–`#12` rows must equal today's `screwSpecs` rows exactly. Assert that in `hardware-tables.spec.js`, as `core-052` did for the bolt rows |

- **Fit follows the type.** `socket` and `hex` keep today's `fit` and `tap` part. `pan` and `flat` get
  `fit` from the same metric tap table the socket rows already use (`ScrewTapSizes`, the source of
  `fitDiameterMm`) wherever a row exists for that size. Their `tap` part is the head and thread grown
  by the clearance, as for a bolt. For `flat` that grown cone is the countersink cut, which is the
  thing a user actually needs to subtract. `woodPan` and `woodFlat` get their own Fit, described
  next. Fit options come from `type` and `spec` together, extending the `fit` options derived from
  `spec` that `PARAM_SCHEMAS['hardware.bolt']` already has (`registry.js:1922-1929`). A size with no
  fit data has no Fit field and no `tap` part. Fit is hidden, never guessed.
- **Wood-screw Fit comes from a published pilot-hole chart, not from `jscad-hardware`.** The user
  confirmed on 2026-10-15 that `WoodScrewDiameter`'s unlabelled columns (`src/imperial.js:220`) are
  not a reliable source for pilot holes. So:
  - **Step 1 of this task is choosing the source.** It must be a published chart that gives, per gauge,
    the **hardwood pilot**, the **softwood pilot** and the **shank clearance** hole. Prefer a fastener
    manufacturer's or a standards body's chart over a hobby blog. Record the URL, the retrieval date
    and the units in the new table's module doc. Port the numbers as data (dimensional facts, cited),
    in the source's own units, converted with `inchToMm` at the boundary (`CLAUDE.md`'s licensing
    rules: no copied prose from an incompatible source).
  - **Don't interpolate or invent.** A gauge the chosen chart doesn't cover has no wood Fit. If no
    acceptable chart is found at all, stop and ask the user. Don't fall back to the jscad columns.
  - **Fit values** for `woodPan`/`woodFlat`:
    - `clearance`: the hole the shank passes through freely, for the piece being fastened down;
    - `hardwood` and `softwood`: the pilot hole for the piece the thread bites into.

    The default when switching to a wood type is `softwood`, which is closest to a printed-plastic
    boss, this app's common case.
  - **The `tap` part for a wood screw** is the head grown by the `clearance` fit's clearance (for
    `woodFlat` that grown cone is the countersink), plus a thread cylinder **at the chosen fit's hole
    diameter**. That diameter is the hole itself, not a growth of the screw's thread: a pilot is
    narrower than the thread, which is the point of a pilot.
- **Part names stay stable across a Type change.** Every type builds `head` and `thread`. Types with a
  fit build `tap`, and the existing hidden `tap-headClearSpace` where today's bolt has it. Switching
  from socket to a wood screw keeps `tap` wherever the new size has fit data, and loses it only where
  it doesn't. A Snap/Align or boolean that referenced `tap`
  goes through the existing broken-reference repair dialog (`ui-052`) with no new aliasing.
- **Library row**:
  - Label **Bolt / screw** (the user's choice, 2026-10-15), so both words find it. The op name stays
    `hardware.bolt`.
  - A pre-drag **Type** `choice` (`modelChoice`-style, `registry.js:263`).
  - A pre-drag **Size** extra choice whose options depend on the chosen Type. This needs one small
    addition to `LibraryPanel.vue`'s extra-choice rendering: options computed from
    `paramOptions(op, { type })` instead of a static list. When Type changes and the current Size isn't
    offered, fall back to that type's default size (`socket m3`, `hex m10`, `pan m4`, `flat M3`,
    `woodPan #8`, `woodFlat #8`).
  - Row defaults stay **`hex`, `m10`, 20 mm, `loose`**, today's bolt exactly, so acceptance scenarios
    and docs that drop a default bolt don't change meaning.
- **Bill of materials**:
  - label **Bolt / screw**;
  - detail `M2.5 socket × 8 mm`, `M3 flat × 10 mm`, `#8 wood flat × 25 mm`;
  - a legacy `{ spec: 'm2.5 socket' }` bolt and a new `{ type: 'socket', spec: 'm2.5' }` bolt of the
    same length tally as **one** line, because the detail is computed from normalised params;
  - an old `hardware.screw` keeps its own line and label (`ui-038`).

## Interaction model

- **Precondition**: none to drag (a creation row). Inspector editing needs exactly one placed fastener
  selected, as today.
- **Trigger**:
  - **Library → Hardware → Bolt / screw**. Pick **Type**, then **Size**, from the dropdowns beside the row
    (siblings of the drag handle, not children, `LibraryPanel.vue:44-50`), then drag.
  - After placement, the Inspector's **Type**, **Size**, **Length** and **Fit** (Fit only for types
    that have one).
- **Feedback**:
  - The ghost shows the chosen head style while dragging.
  - The dropped part shows it too: a pan head reads as a domed/flat cylinder, a flat head as a cone, a
    hex as a prism.
  - The Inspector lists the four fields. For a wood screw, Fit offers clearance, hardwood and softwood.
    Fit is hidden only for a size with no fit data.
  - The BOM line reads e.g. `Bolt / screw M3 flat × 10 mm × 1`.
  - Changing Type in the Inspector rebuilds the part in place, with the repair dialog if a reference
    breaks.
- **Placement**: drag into the 3D view; the preview follows the pointer and the part commits on
  release. It is never spawned at the origin.
- **Selection response**: the Inspector shows Type, Size, Length and Fit plus Transform. The transform
  gizmo attaches as for every part. Part drill-down (`ui-016`) lists `head`, `thread` and `tap` (when
  present).
- **Selection count**: n/a (a creation row and a single-body edit).
- **Small-screen behavior**: on a phone the Type and Size dropdowns stack under the row label in the
  Library sheet, each 44 px tall. This is the same layout the phone row's Model and Case use
  (`core-057`). The Inspector fields are the same as on desktop.

## Affected files

- `src/core/kernel/recipes/hardware.bolt.js`: `normalizeBoltParams`, the `type` dispatch, and pan/flat
  heads via the shared builder.
- `src/core/kernel/recipes/fastener-geometry.js` (new): the head/thread/clearance builder extracted from
  `hardware.screw.js`.
- `src/core/kernel/recipes/hardware.screw.js`: calls the shared builder; output unchanged.
- `src/core/kernel/tables/wood-screw-holes.js` (new): per-gauge hardwood pilot, softwood pilot and
  shank clearance, in millimetres, ported from the chosen published chart with its citation in the
  module doc.
- `src/core/kernel/tables/screw-specs.js`, `hardware-tables.generated.js`, and
  `scripts/generate-hardware-tables.mjs`: flat-head and wood-screw rows from `5.0.0`; a pan/flat fit
  lookup.
- `src/core/kernel/registry.js`:
  - the `hardware.bolt` `ui` block: label, `choice`, extra Size choice, defaults;
  - `PARAM_SCHEMAS['hardware.bolt']` (`:1922`): Type, Size depending on Type, Length, Fit depending on
    Type and Size;
  - the comment at `:1380-1391` updated to say screws are reached through the Bolt / screw row's Type.
- `src/components/layout/LibraryPanel.vue`: extra-choice options that depend on another choice.
- `src/core/bom.js`: `detailOf` / `labelOf` for the normalised shape.
- `src/core/paramEdit.js`, `src/core/variables.js:777`: the `fit` dependency becomes `['type', 'spec']`;
  edits read normalised params.
- `src/ai/tools/` (schema and `create.js:9`'s note on `hardware.screw`): the AI places pan, flat and
  wood screws through `hardware.bolt` with `type`. Update the tool description so the model knows the
  types exist.
- Specs next to each file above, plus `e2e/fastener-types.e2e.js` (new).
- `TODO/ACCEPTANCE.md`: scenario 2 step 3 (Spec `m10 hex` → `1/4 socket` becomes Type **Socket cap**,
  Size **1/4**) and scenario 5 (wording only; `tap` is unchanged). Any step that says "Bolt row" now
  says "Bolt / screw row".
- `docs/hardware-library.md` and the other `docs/` pages that name the **Bolt** row
  (`bill-of-materials.md`, `snap-align.md`, `primitive-placement.md`, `selection-and-inspector.md`,
  `groups.md`).

## Effort

L. This involves a generator extension, legacy-shape normalisation threaded through six consumers, a
shared-geometry extraction with byte-identical oracles, a dependent pre-drag dropdown, and a sweep of
about 15 e2e specs and 6 docs pages for the row's new label. Splitting is reasonable if `/fix-todo`
finds it too big:

- **(a)** tables plus normalisation plus recipe, with no UI change (still labelled Bolt, Type only in
  the Inspector);
- **(b)** the Library row's Type/Size dropdowns, the label, and the docs;
- **(c)** the wood-screw pilot-hole table and wood Fit. Until (c) lands, wood types show no Fit.

Say which in the commit if it's split.

## Testing

- **Unit**:
  - `normalizeBoltParams`: every `boltSpecs` key round-trips (legacy → normalised → the same row);
  - unknown types and sizes are refused in the existing wording style;
  - **byte-identical oracle**: every legacy `hardware.bolt` fixture
    (`__fixtures__/hardware.bolt.m10-hex-20-loose.json`, and one per suffix family) and every
    `hardware.screw` fixture expands exactly as before. The oracle is the pre-change output, pinned
    into a fixture **before** the refactor;
  - `#4`–`#12` wood rows equal today's `screwSpecs`;
  - a flat-head `tap` is the head cone grown by the clearance (`toBeCloseTo`, 1e-9);
  - every `wood-screw-holes.js` row matches the cited chart's value converted to mm (`toBeCloseTo`,
    1e-9), and for every gauge `hardwood pilot < shank clearance` and
    `softwood pilot <= hardwood pilot`;
  - a wood `tap` thread's diameter is the chosen fit's hole diameter exactly, and its head is grown by
    the `clearance` fit's clearance;
  - a wood gauge the chart doesn't cover has no Fit in `paramOptions` and no `tap` part;
  - BOM: a legacy and a normalised M2.5 socket tally as one line;
  - the tessellation goldens (`__fixtures__/tessellation-legacy-golden.json`) are unchanged.
- **E2E** (`e2e/fastener-types.e2e.js`, navigates to `/`, real pointer):
  - for each Type, choose it and a Size on the Bolt / screw row, drag in, and assert the Inspector's Type and
    Size, the part list (`tap` present or absent), and the BOM line;
  - change Type in the Inspector from Socket cap to Wood screw, flat head, and assert an in-place
    rebuild with Fit now offering clearance, hardwood and softwood (defaulting to softwood);
  - open a fixture project that holds a legacy `hardware.bolt` and a `hardware.screw`, and assert both
    build and keep their BOM lines;
  - run at **all three viewports** (the row gains stacked dropdowns at phone width), with a snapshot of
    the Hardware section at each;
  - run against **all three engines** for the drag-and-rebuild steps (kernel output and the rendered
    head shape).
- **Existing e2e sweep**: about 15 specs reference the Bolt row or `hardware.bolt`. Re-run all of them.
  Fix only the ones that find the row by its visible text "Bolt" or by the `m10 hex` spec value. The
  `data-testid` is unchanged.
- **Acceptance scenarios to re-drive by hand**:
  - **2** (hardware property edit, as rewritten);
  - **3** (a Library drag renders complete);
  - **5** (hidden-part boolean with the bolt's tap clearance; also try it once with a **flat head**,
    where the tap is the countersink);
  - **15** (change a part's model under a dependent: Type change with a Snap on `tap`);
  - **10** (save, reload, nothing changed: a legacy file must replay byte-identically).

  Report PASS/FAIL for each.
- **Closed findings whose repro gets re-run**:
  - `core-052` (bolt table completeness and the pinned rows);
  - `core-027` (the screw family's geometry and colours);
  - `ui-038` (BOM tallying);
  - `ui-052` (repair on a lost `tap`);
  - `core-050` (a variable bound to a bolt's `fit` and `spec`).

## Documentation

- **Page**: `docs/hardware-library.md`. The "Hardware" table's **Bolt** row and the separate "Screws"
  subsection (which today says *"Screws have no Library row yet"*) merge into one **Screws and bolts**
  section covering the six types, their size ranges, what Fit means for each (and, for wood screws,
  clearance versus hardwood and softwood pilot, with the chart's citation). Update the other pages that
  say "drag **Bolt**" so they say "drag **Bolt / screw**".
- **Example**:
  1. Open **Library → Hardware**. Next to **Bolt / screw**, choose **Type: Flat head** and **Size: M3**, then
     drag it onto your part.
  2. In the Inspector set **Length** to `10` (mm) and **Fit** to `close`.
  3. To countersink the hole, tick **Show hidden parts**, select your part, then add the screw's `tap`
     as the second operand of **Subtract**.
  4. The Bill of materials reads `Bolt / screw M3 flat × 10 mm × 1`.

  A second example, for wood screws: choose **Type: Wood screw, flat head** and **Size: #8**, drag it
  onto a printed boss, and set **Fit** to `softwood`. Subtracting its `tap` leaves a pilot hole the
  thread bites into, plus the countersink.
- **Media**:
  - regenerate `docs/screenshots/library-hardware-section.png`, `docs/media/hardware-drag-bolt.gif`
    (keep the file name or rename it with its embed, but don't orphan it) and
    `docs/screenshots/hardware-screw-family.png` (now placed by dragging, showing all six types side
    by side);
  - add `docs/screenshots/library-screw-type-dropdown.png` (the Type dropdown open).

  All are produced by `e2e/docs/hardware-library.docs.js` through `npm run docs:media`, and
  `e2e/docs-media.spec.js` must stay green.

## Decisions from the user (2026-10-15)

1. **Wood-screw pilot holes**: use a different, published source. `jscad-hardware`'s
   `WoodScrewDiameter` columns aren't reliable for this. See "Wood-screw Fit comes from a published
   pilot-hole chart" above.
2. **Row label**: **Bolt / screw**. The op name stays `hardware.bolt`; the visible label, the BOM label
   and the docs wording change.

## Notes

- `ui-068` (the Library remembers last-used params) depends on this task. It remembers `type`, `spec`,
  `length` and `fit` together, so drag a Bolt / screw, set it to **Socket cap M2.5**, and the next Bolt / screw
  drag is a Socket cap M2.5.
- Not in scope:
  - pointed or tapered wood-screw threads (V1 draws every thread as a plain cylinder);
  - button-head and other ISO 7380 types;
  - migrating the kit and Raspberry Pi recipes' internal legacy `spec` strings.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
