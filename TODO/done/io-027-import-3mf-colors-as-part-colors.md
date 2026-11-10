---
title: Import a 3MF's object colours as each part's colour
category: io
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-10 at the owner's request)
depends: []
status: done
---

> **Shipped (io-027):** colours are read from `basematerials` and `colorgroup` through the object's `pid`/`pindex`, or from its uniform triangles, and reach `group.assemble` as optional `params.colors` (the recipe tier). **Decision on item 4:** a one-part 3MF stays uncoloured (it has no group, and wrapping it would change how the part selects); the docs say so. **Still open:** the `docs/import.md` still-image (`e2e/docs`), the step23mf `compatibility.md` row (other repo), and a hand check of the pads and all 24 LEDs on the NeoPixel file (scenario 31 is PARTIAL, see `TODO/VERIFY.md`).

## Goal

**In user terms:** the owner converted Adafruit's
[1586 NeoPixel Ring 24x](https://github.com/adafruit/Adafruit_CAD_Parts) STEP with `step23mf`, which reported
`41 part(s), 4 color(s)`. **File → Import model…** brought in all 41 parts, but every one draws in the theme
palette, so the green board, the 24 white LEDs and the amber pads all look the same. The file holds the
colours. WarpCad drops them.

Done means: import that file, drag the My parts row into the view, and see the board green (`#447766`), the
LEDs white (`#F6F6F3`) and the pads amber (`#E8AD23`, `#E68C14`). Click twice to narrow to one LED: the
Inspector's **Color** row reads `#f6f6f3`, and **Reset** after a recolour goes back to `#f6f6f3`, not to
the palette. A file with no colours imports exactly as it does today.

**Not in scope:** per-triangle colours (a `p1` on `<triangle>` that differs within one object, such as
`step23mf`'s six-face-colour cube probe). Each part has one colour, so a part whose triangles disagree is
left to the palette. File that separately if it is wanted.

## Where the colours are lost (established 2026-11-10)

- The file is correct. `3D/3dmodel.model` has one `<basematerials id="1">` with four `<base displaycolor=…>`
  entries, and each of the 41 mesh objects carries `pid="1" pindex="N"` (index 0 ×1, 1 ×24, 2 ×15,
  3 ×1). Objects 2–42 are meshes, object 43 (`PCB Component`) is `<components>` over them, object 44
  (`Adafruit NeoPixel Ring 24 B v3`) wraps 43, and the single build item is 44.
- `src/io/meshFormats/threeMf.js:79-87` lists the materials extension in `UNDERSTOOD_EXTENSIONS` only so a
  file that *requires* it is not refused. Nothing reads `pid`, `pindex`, `basematerials` or `colorgroup`.
  `ThreeMfPart` (`:92-98`) has no colour field.
- `src/io/meshPart.js` `meshAssemblyDefinition` (`:115`) and `AssemblyPart` have no colour either.
- The `group.assemble` kernel op (`src/core/kernel/registry.js:1933-1956`) calls
  `add(group, geometry, names[index])` with no options, so it could not carry one even if it were given one.
- The user docs already say so: `docs/import.md:144` "**Ignored:** colours and materials". `step23mf`'s
  `docs/compatibility.md:22` marks WarpCad ❌ for object and triangle colours.

## Interaction model

No new control. What changes is what an existing import shows.

- **Precondition:** n/a (any 3MF import).
- **Trigger:** unchanged: **File → Import model…** or My parts → **Import model file…**, then drag the row in.
- **Feedback:** each part draws in the file's colour. The Library row's thumbnail shows the colours too, if
  it renders through the same path (check it).
- **Placement:** unchanged (dragged in, as `io-024`).
- **Selection response:** a drilled-in part's Inspector **Color** row shows the file colour, the same way a
  washer's shows its recipe `#808080` (`render-003`). Reset returns to it.
- **Selection count:** n/a.
- **Small-screen behavior:** same as desktop. Nothing new to lay out.

## Proposed fix

1. **Reader** (`threeMf.js`): parse `<basematerials>` (`<base displaycolor="#RRGGBB[AA]">`) and, from the
   materials namespace, `<colorgroup>` (`<color color="#RRGGBB[AA]">`) into a map from resource id to a
   list of colours. Resolve each mesh object's colour from its `pid`/`pindex`. If the object has none,
   fall back to its triangles: when every triangle resolves (its own `pid`/`p1`, else the object's) to the
   same colour, use that one. Otherwise there is no colour. Add `color?: number` (`0xRRGGBB`) and
   `colorAlpha?: number` (omitted at 1, the `core/kernel/colors.js` convention) to `ThreeMfPart`. Hex
   parsing is strict: anything but `#RRGGBB` or `#RRGGBBAA` means no colour, never a throw. Colour is not
   geometry, so a bad colour must not refuse the file.
2. **Duplicates:** `io-024` collapses duplicate (mesh, transform) pairs. The colour belongs to the placed
   part, not to the shared `asset.mesh`. Two parts sharing one mesh in two colours stay two coloured parts.
   Keep the first colour when an exact duplicate placement disagrees, and say so in a test.
3. **Definition** (`meshPart.js`): carry the colour through `AssemblyPart` into the definition.
   Recommended: an optional `params.colors` on `group.assemble`, one entry per operand
   (`{ color, colorAlpha? }` or `null`), passed to `add()` as `{ color, colorAlpha }`. That makes the file
   colour the **recipe tier** in `core/colorOverride.js` (palette → recipe → user whole-body → user
   sub-part), so Reset lands on it and a user recolour still wins. `params` is already free-form in
   `validateUserPart`, so no `RECORD_FIELDS` change is needed. Old documents without `colors` fold exactly
   as before. Validate the array the same way `names` is validated (length, `assertRecordColor`).
   - *Rejected alternative:* baking `style.recolor` records with `subPart` into the definition. It renders,
     but it puts the file's colours in the **user** tier, so Reset would go to the palette and the colour
     would read as something the person chose.
4. **A one-part 3MF** has no group (`MESH_MODEL_ID` is the `import.mesh` itself). Check whether a recipe
   colour on a non-group body is drawn. If not, the simplest honest option is a one-part `group.assemble`,
   provided that doesn't change how the part selects. Otherwise leave one-part files uncoloured and note it
   in the docs. Decide while implementing, and record which one in the shipped note.
5. **Worker transport** already carries `Group.colors` (`core-026`). Confirm the colours survive a
   round trip and a reload from IndexedDB.
6. **Docs:** `docs/import.md:144`: move "colours" from **Ignored** to what is kept, and keep "materials"
   (names, textures, multi-properties) ignored. Then update `step23mf`'s `docs/compatibility.md` WarpCad row
   (object colours ✅, triangle colours ❌ unless a part's triangles agree).

## Affected files

- `src/io/meshFormats/threeMf.js` (parse and resolve colours)
- `src/io/__fixtures__/threeMf.js` (a coloured fixture: `basematerials` plus `colorgroup`, one object
  coloured only through uniform `p1`, one with mixed triangle colours, one with a bad hex)
- `src/io/meshPart.js` (`AssemblyPart.color`, `meshAssemblyDefinition` → `group.assemble` `params.colors`)
- `src/stores/modelImport.js` / `src/io/meshJob.js` (wherever reader parts become `AssemblyPart`s)
- `src/core/kernel/registry.js` (`group.assemble` takes optional `params.colors`)
- `e2e/import-3mf.e2e.js`
- `docs/import.md`

## Testing

- **Unit:** reader colour resolution (object-level `basematerials`, `colorgroup` with alpha, uniform
  per-triangle fallback, mixed triangles → none, out-of-range `pindex` → none, bad hex → none, no colours
  → the parts are byte-identical to today). `group.assemble` with and without `colors`, and with a
  wrong-length array refused. `meshAssemblyDefinition` emits `colors` only when some part has one.
- **E2E** (`e2e/import-3mf.e2e.js`, at `/`): import a coloured fixture, drag it in, drill to a part, assert
  the Inspector Color row shows the file colour, recolour, Reset, and assert it is back. This touches the
  viewport, WebGL materials and IndexedDB, so it runs on **all three engines** at the three viewports, per
  `CLAUDE.md` Browser Support.
- **Acceptance:** re-drive scenario 31 (*Import a 3MF and use one part as a reference*) with the
  NeoPixel file at `~/src/3mf-test/1586 NeoPixel Ring 24x/24x NeoPixel Ring 1586.3mf`, work on a copy,
  and confirm Align and Subtract against one coloured part still behave.
- **Regression surface:** `io-024`'s own reproduction (the FreeCAD Feather file, which has no colours)
  imports unchanged: 29 parts, theme palette.

## Documentation

- **Page:** `docs/import.md` (the 3MF section).
- **Example:** "Choose **File → Import model…** and pick a 3MF that has colours (one written by step23mf,
  PrusaSlicer or Bambu Studio). Drag the new My parts row into the view. Each part keeps the colour it had
  in the file. Click the model, then click one part again to narrow to it: the Inspector's **Color** row
  shows that colour, and **Reset** after a recolour brings it back."
- **Media:** one still of a coloured 3MF import, from an `e2e/docs/*.docs.js` shot, embedded in
  `docs/import.md`. Use a small committed fixture, not the owner's file.

## Effort

M (a few hours)

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
