---
title: The Library remembers each part's last-used params and the next drag uses them
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M16
depends: [core-060]
status: open
---

## Goal

Requested by the user on 2026-10-15: *"if I drag a screw in, then change the size to a m2.5 socket
head, the next screw dragged in should be a m2.5 socket head."*

Written against the unified **Bolt / screw** row from `core-060` (bolts and screws become one
`hardware.bolt` part with a **Type** and a **Size** dropdown), which lands first. Before that task, the
same row is today's **Bolt**, and "Socket cap M2.5" is today's Spec `m2.5 socket`.

Today every drag from a parametric Library row starts from the registry's fixed `ui.defaults`. Drop a
**Bolt / screw**, change it to **Socket cap**, **Size** `m2.5` and **Length** `8` in the Inspector, then drag
**Bolt / screw** again and you get the row's default, an `m10 hex × 20 mm` (`registry.js:1355-1358`), that you
have to fix the same way. Building an enclosure means placing the same fastener six or eight times, so the user repeats the
same three Inspector edits every time.

Half of this already exists. Rows with a pre-drag dropdown (`ui-031`'s Pi **Model**, `core-057`'s phone
**Case**, `core-058`'s **Screen model**) keep their chosen value between drags in `LibraryPanel.vue`'s
component-local `chosen`/`chosenExtra` (`LibraryPanel.vue:242-292`). Three things are missing:

1. **Inspector edits don't reach the Library.** Changing a placed Pi from model 4 to model 5 in the
   Inspector leaves the Library's Model dropdown on 4, and a Bolt / screw's Length and Fit (and any Type or Size
   set in the Inspector rather than on the row) are never carried forward.
2. **The memory is lost on reload** (and whenever the panel unmounts), because it is `reactive()`
   state inside the component.
3. **You can't see it or reset it.** A row with no dropdown would quietly drop something other than
   its defaults with nothing on screen saying so, which is the *"I see things appearing, but I don't
   know what they do"* failure `CLAUDE.md`'s Interaction Model warns about.

"Done" is: drag Bolt / screw, set it to Socket cap `m2.5`, 8 mm in the Inspector, drag Bolt / screw again, and the
**ghost** and the **committed** second screw are both `M2.5 socket × 8 mm` (the first one stays as it
is). The Bolt / screw row's Type and Size dropdowns now show Socket cap and `m2.5`, its summary line shows
`× 8 mm`, and a **↺ Reset** button puts the row back to `M10 hex × 20 mm`. This survives a reload. The same mechanism covers every parametric Library
row without a per-row case: Nut, Washer, Bearing, the Kit parts, every Raspberry Pi row, the Gears rows
once `ui-057` lands, and user parts under **My parts** that expose params.

## Design decisions (made here, so `/fix-todo` doesn't re-derive them)

- **What is remembered**: for each Library row's `op`, the params the Inspector's schema exposes for
  that op (`paramOptions(op, params)`, `registry.js` `PARAM_SCHEMAS` / `runtimeParamSchema`). Because
  the schema decides, a new parametric row is covered automatically and a param the Inspector can't
  edit (bolt `clearLength`) is never stored. **Not remembered**: color and name (style records, not
  params), transform, and anything outside the schema.
- **Which rows**: every row in the **Hardware**, **Kit Parts**, **Raspberry Pi** and **My parts**
  sections (and **Gears** when it exists) whose op has a non-empty schema. **Excluded**:
  - **Primitives**. A box's size describes that one box, not a choice of part, and no CAD tool makes
    the next cube 50 mm because you resized the last one.
  - **Text**. The next label should not repeat the last label's text.
  - **The STL/model-import Units choice.** It belongs to the import flow.

  Put the exclusion on the section (a `remembersParams` flag on the section definitions in
  `library.js:157-165`, carried onto each built row as `row.remembersParams`), not a hard-coded op
  list in the component.
- **Whose edits update it**: only **local, user-driven** choices, which happen at two points:
  1. a committed Inspector or History-row param edit on a placed body of that op
     (`useParamCommands.js` `setCompositeParams` when it commits directly, `:132`, and the repair path
     when the user applies a repair and the edit commits with it, `:234`/`:286`). An edit that returns
     `needsRepair` and is then cancelled commits nothing and remembers nothing.
  2. a change to the row's own pre-drag dropdown(s).

  The following never update it: AI turns, MCP or live-bridge calls, merges, opening a file, undo and
  redo. The memory means "what *you* last picked", the same scoping-by-origin rule `CLAUDE.md` applies
  to undo. An AI turn that places an M3 must not change what your next drag drops. **Undo does not roll
  the memory back**: undoing the M2.5 edit leaves the next Bolt / screw drag at M2.5. State this in the docs.
  Making the memory follow undo would turn it into document state, which it is not.
- **Edit an older instance and it still counts**: editing *any* placed screw, including one placed last
  week, updates the Bolt / screw memory. The last committed choice wins.
- **Variable bindings are resolved, not stored.** If the edited param is bound (`{ "$var": "…" }`,
  `core/variables.js`), store the value it resolved to. The memory is not tied to a project, and the
  next project may have no such variable.
- **Where it lives**: a new UI-only Pinia store, persisted per device across projects in
  `localStorage` under `warpcad.library.lastParams`. Follow `stores/settings.js`'s localStorage
  boundary: every read and write in `try/catch`, so a throwing or corrupt store means "nothing
  remembered", never an error. It is a preference, not document state, so it is not written to the
  project file and does not merge.
- **Validated on every read, not trusted**: a stored value can go stale when a size is removed from a
  table, a user part is deleted, or a dependent option list changes (a bolt's `fit` options come from
  its `spec`). Before a remembered set is used, merge it over the row's registry defaults and validate
  the result against `paramOptions(op, merged)`, the same check `requireSchemaParams` applies to an
  edit (`paramEdit.js:641`):
  - an unknown key is dropped;
  - an enum value that is no longer an option falls back to that key's registry default;
  - if the result still doesn't validate (the default `fit` isn't valid for the remembered `spec`), the
    whole memory for that op is discarded and the row uses its registry defaults.

  Never hand `placement.begin` a set that `evaluateOp` would refuse.
- **One source of truth for dropdown rows**: `chosen` and `chosenExtra` in `LibraryPanel.vue` are
  replaced by reads from the new store. The dropdown's `v-model` writes the store, and an Inspector
  edit to a placed Pi's model moves the Library's Model dropdown to match.

## Interaction model

- **Precondition**: none to drag (a creation row, as today). The memory for a row exists once you have
  committed a param edit on a placed body of that op, or changed that row's dropdown.
- **Trigger**: unchanged. Drag the row (`onRowPointerDown`, `LibraryPanel.vue:302-321`), which now
  passes `overridesFor(row)` built from the store instead of `chosen`. New control: a **↺ Reset**
  button on the row (`data-testid="library-reset-<op>"`, `aria-label="Reset Bolt / screw to its default"`).
  It appears only when the remembered set differs from the registry defaults, and clearing it returns
  that row to its defaults.
- **Feedback**:
  - On the row, a one-line summary under its label, e.g. `M2.5 socket × 8 mm`
    (`data-testid="library-remembered-<op>"`). Build the text with the Bill of materials' own
    `detailOf` (`core/bom.js:55`, exported for this purpose) so the Library and the BOM describe the
    same part in the same words.
  - A dropdown row shows the remembered value in its dropdown, with the summary listing only the params
    the dropdown doesn't already show (nothing, for the Pi board).
  - During the drag, the ghost already reflects the overrides (`placement.js:119`), so it previews the
    remembered part.
  - After the drop, the Inspector shows the remembered values.
- **Placement**: unchanged. Drag into the 3D view, the preview follows the pointer, and the part commits
  on release.
- **Selection response**: unchanged. The dropped body selects as today, and its Inspector fields show
  the remembered params.
- **Selection count**: n/a (a 0-operand creation row).
- **Small-screen behavior**: on a phone the summary wraps onto its own line under the row label in the
  Library sheet, and the Reset button is a 44 × 44 px tap target at the row's right edge, beside the
  drag handle and not inside it. It must not start a drag, for the same reason the dropdown is a sibling
  of the drag button and not a child (`LibraryPanel.vue:44-50`). Tablet and laptop use the same layout
  with more horizontal room.

## Affected files

- `src/core/libraryDefaults.js` (new, framework-free): `effectiveDefaultsFor(row, remembered, schemaFn)`
  (merge plus the validation rules above) and `rememberedFrom(op, params, schemaFn)` (filters a body's
  params down to the schema keys and resolves bindings). Pure functions, no storage.
- `src/core/libraryDefaults.spec.js` (new): see Testing.
- `src/stores/libraryDefaults.js` (new): the Pinia store with `remember(op, params)`, `reset(op)` and
  `overridesFor(row)`, with localStorage load and save behind `try/catch` (pattern:
  `stores/settings.js:22-110`).
- `src/stores/libraryDefaults.spec.js` (new).
- `src/core/library.js`: `remembersParams` on the section definitions (`:157-165`) and on built rows;
  `userLibrarySection` (`:322`) sets it too.
- `src/core/bom.js`: export `detailOf` (or a thin named wrapper) for the row summary.
- `src/components/layout/LibraryPanel.vue`: remove `chosen`/`chosenExtra` (`:242-292`), read and write
  the store, render the summary line and the Reset button.
- `src/composables/useParamCommands.js`: call `remember(root.op, record.params)` after each successful
  local commit (`:132`, `:198` if a composite reaches it, `:234`, `:286`). This composable is the
  boundary that makes "local user only" true: AI and MCP tools do not go through it. Confirm that with
  a grep of `src/ai/tools/`, and say so in the module doc.
- `src/composables/useParamCommands.spec.js`: see Testing.
- `TODO/ACCEPTANCE.md` scenario 2 (*Hardware property edit*): its step 1 expects a freshly dropped bolt
  to be `m10 hex`. Add "on a fresh browser profile, or after pressing ↺ Reset on the Bolt / screw row" so the
  scenario still holds for someone who has used the app before.
- `e2e/library-remember-params.e2e.js` (new), and `e2e/docs/hardware-library.docs.js` (a new shot).
- `docs/hardware-library.md`, `docs/primitive-placement.md`: see Documentation.

## Effort

M. The mechanics follow patterns the code already has (`overridesFor` → `placement.begin`, the
settings store's localStorage boundary, the schema-driven Inspector). The careful parts are the
stale-value validation for dependent enums and keeping the commit hook on local-origin edits only.

## Testing

- **Unit** (`core/libraryDefaults.spec.js`):
  - a remembered `{ type: 'socket', spec: 'm2.5', length: 8 }` merges over the Bolt / screw row's defaults
    to `{ type: 'socket', spec: 'm2.5', length: 8, fit: 'loose' }`;
  - a remembered `spec` that isn't a size for the remembered `type` falls back to that type's default
    size;
  - a remembered `fit` that isn't an option for the remembered `type` and `spec` falls back. If the default fit is
    also invalid there, the whole set is discarded;
  - an unknown key is dropped;
  - a `{ "$var" }` binding is stored as its resolved value;
  - a Primitives or Text row is never remembered;
  - a user-part op whose definition no longer exists yields its row defaults (or nothing, if the row is
    gone);
  - `rememberedFrom` keeps only schema keys (bolt `clearLength` is not stored).
- **Store** (`stores/libraryDefaults.spec.js`):
  - `localStorage.getItem`/`setItem` throwing leaves the store empty and working;
  - corrupt JSON loads as empty;
  - `reset(op)` removes only that op;
  - the round trip survives a fresh store instance.
- **Composable** (`useParamCommands.spec.js`):
  - a direct commit calls `remember` with the post-edit params;
  - a `needsRepair` result does not call it;
  - an applied repair calls it once;
  - none of this adds a document record or an Undo step (re-run `ui-044`'s "one Undo step per edit"
    assertion with the hook in place).
- **E2E** (`e2e/library-remember-params.e2e.js`, navigates to `/`, real pointer drags):
  1. Drag Bolt / screw in, set Type Socket cap, Size `m2.5` and Length `8` in the Inspector, then drag Bolt / screw
     in again. Assert the second screw's Inspector reads Socket cap / `m2.5` / `8`, the row's Type and
     Size dropdowns show the same, the first bolt is unchanged and
     still present (two bodies; *adding one must not overwrite the other*, the second attempt's own
     failure), and the row shows `M2.5 socket × 8 mm`.
  2. Reload, drag Bolt / screw, and assert it is still Socket cap `m2.5`.
  3. Press **↺ Reset**, drag Bolt / screw, and assert Hex `m10` × 20. The summary and the Reset button are gone.
  4. Drag a Pi board, change **Model** in the Inspector, and assert the Library row's Model dropdown
     now shows the new model.
  5. Run a reset-free check that an AI/MCP-origin param change (drive it through the existing
     `e2e/fixtures/ai/` replay harness) does **not** change the row summary.

  Runs at **all three viewports** (the row summary and the Reset button change the Library sheet's
  layout at phone width), with a snapshot of the Bolt / screw row at each. Runs against **all three engines**
  (Chromium/Firefox/WebKit) for steps 1-3 because the reload step is a persistence path, and
  `localStorage` behaves differently in WebKit's private and ITP modes. Steps 4-5 are Chromium-only.
- **Existing specs to sweep**: grep `e2e/` and `e2e/docs/` for flows that edit a part's params and
  then drag the **same row** again in the same test, expecting registry defaults (e.g. the
  `docs/hardware-library.md` "matching M2.5 bolt and nut" movie). Playwright starts each test with
  empty storage, so only same-test sequences can change. Fix each one by pressing Reset or by asserting
  the new behaviour.
- **Acceptance scenarios to re-drive by hand**:
  - **1** (two independent primitives): the placement path changed, and this is the
    overwrite-on-add regression's home;
  - **2** (hardware property edit): with its updated fresh-profile precondition, then once more without
    resetting, to see the remembered bolt;
  - **3** (a Library drag renders complete): ghost and commit from remembered overrides;
  - **15** (change a part's model under a dependent): the repair path now also records memory.

  Report PASS/FAIL for each.
- **Closed findings whose repro gets re-run**:
  - `ui-053`: the first Library drag after Escape was ignored, in the same `onRowPointerDown` path this
    task rewires;
  - `ui-031`: the pre-drag Model choice must still drive the drop, now from the store;
  - `ui-044`: a param edit is one Undo step, and the new hook must not add one;
  - `ui-052`: repair-dialog commits.

## Documentation

- **Page**: `docs/hardware-library.md`, a new subsection *The Library remembers your last choice*
  under "Hardware: bolts, nuts, washers and bearings", linked from the Raspberry Pi and Kit sections.
  Also a short paragraph in `docs/primitive-placement.md` where Library dragging is introduced,
  including that **Primitives and Text always start from their defaults**. State the undo rule (undo
  does not change what the next drag drops) and the AI rule (AI and MCP edits don't change it).
- **Example**:
  1. Drag **Bolt / screw** into the 3D view.
  2. In the Inspector set **Type** to **Socket cap**, **Size** to `m2.5` and **Length** to `8` (mm). The
     Bolt / screw row in the Library now shows Socket cap and `m2.5` in its dropdowns, and `× 8 mm` under its
     label.
  3. Drag **Bolt / screw** in again. The new screw is already an M2.5 socket cap, 8 mm long.
  4. To go back to the default, press **↺** on the Bolt / screw row. It returns to Hex `m10`, 20 mm.
- **Media**: a new shot, `docs/screenshots/library-remembered-bolt.png`, from
  `e2e/docs/hardware-library.docs.js`, showing the Bolt / screw row with its remembered dropdowns, summary and Reset button, embedded
  in the new subsection. Update the existing "matching M2.5 bolt and nut" example and movie if the
  sweep above changes its flow. `npm run docs:media`, then `e2e/docs-media.spec.js` must stay green.

## Notes

- `core-058` (the Raspberry Pi Screen row, in progress) gets this automatically: its **Screen model**
  dropdown becomes a store-backed dropdown like the board's. There's no ordering dependency either way.
  Whichever lands second adapts to the other.
- Bolts and screws become one part in `core-060` (this task's dependency). Pan-head, flat-head and
  wood screws are Types of the same row, so their sizes and lengths are remembered by the same
  mechanism. The legacy `hardware.screw` op stays replay-only with no row, and is never remembered.
- Out of scope, possible follow-ups:
  - remembering **color** per part (a style record, so it needs its own rule for which recolor
    counts);
  - a per-project rather than per-device memory;
  - a "remember" toggle in Settings. Add one only if hand-driving shows the always-on behaviour
    surprises people.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
