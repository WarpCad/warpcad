---
title: A Cube inside a group cannot be given a corner radius or rounded axis
category: ui
kind: finding
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 from the owner's report on huzzah-feather-esp8266.ndjson)
depends: []
status: open
---

## Problem

`core-080` gave the Cube an optional **Corner radius** and **Rounded axis**. A Cube dragged in from the
Library shows both in the Inspector. A Cube that is already a **part of a group** shows neither, so the
owner cannot turn it into a rounded rectangle.

Reproduce with `~/Documents/huzzah-feather-esp8266.ndjson`:

1. Open the file. It holds the group **esp8266 feather**, whose part **USB clearance cutter** is a
   `primitive.cuboid` (size 7.6 × 10.8 × 5, Hidden by default).
2. Select the group, then step into the part **USB clearance cutter**.
3. The Inspector shows **PARAMETERS → Size** only. No Corner radius, no Rounded axis. The note under
   Transform says the part is "shown here for measurement only".

Two causes, both in the sub-part path:

1. **The field list skips the native schema.** `describeSubPart` in `src/core/inspector.js` builds
   `params` with `fieldsFor(...)` alone. The whole-body path wraps the same call in
   `withNativeSchema(...)`, which is what appends Corner radius and Rounded axis (and shows the default
   when the record omits the key). The sub-part path never calls it.
2. **A sub-part has no edit path.** `describeSubPart` documents its params as frozen: "no record of its
   own to target". The part's creation record (`cuboid-iehsuz-951`) is still in the log, reachable
   through the `group.merge` record's `consumes`, so a swap-in-place edit (`document.reviseRecords`,
   the path `paramEdit.js` uses for a whole body) can reach it. Nothing wires the Inspector's field
   edit to it for a part inside a group, and the group's `members` metadata (name, hidden, colours)
   must survive the re-fold.

Fixing only cause 1 would show fields that cannot be committed, which is worse than hiding them.

## Affected files

- `src/core/inspector.js` — `describeSubPart` (params), `withNativeSchema`.
- `src/core/paramEdit.js` — `paramEditability`, `paramEditRecord`: accept a part's creation record as
  the root, found through the group's `consumes` lineage.
- `src/components/inspector/Inspector.vue` — the Parameters section for `isSubPart` (currently
  read-only), and the transform note (Position and Rotation stay measurement-only).
- `src/composables/useParamCommands.js` — route the edit and run the impact check.
- `e2e/rounded-cube.e2e.js` — new group case.
- `docs/` — the page that documents the rounded Cube's fields (add a "Inside a group" example).

## Proposed fix

1. Run the sub-part's field list through `withNativeSchema`, the same as a whole body, so Corner radius
   and Rounded axis appear with the default shown.
2. Make a sub-part's parameters editable when its creation record is a native primitive with params of
   its own (`paramEditability` already refuses composites, booleans and groups; keep those refusals and
   say why on screen). Resolve the part name to its creation record through the group's `members` and
   `consumes`, then reuse the existing replace-in-place path. A later step's `style.recolor` and
   `group.setPartHidden` carry the part name, which must not change.
3. Position and Rotation stay read-only for a part (move the whole group), as today.
4. A radius too big for the body is refused with the named limit, the same message the whole-body path
   gives (`core-080`), shown where the user can see it (note `ui-100`).
5. Confirm a **Hidden by default** part still leaves Size, Export and whole-shape cuts after the edit
   (`ui-099`'s surface).

## Effort

M (a few hours): the field list is one line, the edit routing through a group's lineage is the work.

## Testing

- Unit, `src/core/inspector.spec.js`: `describeSubPart` for a Cube part lists Corner radius and Rounded
  axis, with the default Z when the record omits `roundAxis`.
- Unit, `src/core/paramEdit.spec.js`: editing a part's radius swaps its creation record, the group
  re-folds, the part keeps its name, colour and Hidden flag. A radius larger than half the shortest
  side along the rounded plane is refused, not clamped. A composite part stays refused with a reason.
- E2E, `e2e/rounded-cube.e2e.js` (new group case, navigates to `/`): load a project whose group has a
  Cube part, step into it, set Corner radius 2 and Rounded axis X, and confirm the viewport outline and
  the Inspector agree. Undo restores the sharp cube. Reload and confirm the radius persists. All three
  engines (WebGL and persistence), all three viewports, with a snapshot at each.
- Re-drive the owner's file: open `huzzah-feather-esp8266.ndjson` (use a copy), round the USB clearance
  cutter, and confirm the cutter is still hidden by default and the feather's Size is unchanged.
- Acceptance scenarios to re-drive: 6 (group vs. sub-part selection), 12 (edit a step in the middle of
  the history and confirm it replays), 32 (merge two groups and cut with a hidden part).
- Closed findings to re-run: `ui-016` (sub-part selection, the origin of the frozen params), `ui-097`
  and `ui-099` (part ticks and the colour of a Hidden by default part), and `core-080`'s own
  reproduction steps.

## Interaction model

- **Precondition:** exactly one part of a group is selected (stepped into from the group), and its
  creation record is a native primitive with described params.
- **Trigger:** the Corner radius field and Rounded axis select under PARAMETERS in the Inspector, the
  same controls a whole Cube has.
- **Feedback:** the part's outline rounds in the viewport, Size is unchanged, and the History gains or
  revises the step.
- **Placement:** n/a.
- **Selection response:** the Inspector shows the part's fields; no transform gizmo attaches (a part
  moves with its group).
- **Selection count:** n/a.
- **Small-screen behavior:** same as desktop; the fields reflow in the Inspector sheet. Rounded axis
  must meet tap size in WebKit at phone width (note `ui-101`).

## Documentation

- **Page:** the `docs/` page that covers the Cube's Corner radius, plus the groups page.
- **Example:** open a project with a group, click the group, then click a Cube in its Parts list. Type
  `2` in Corner radius, press Enter, and choose X under Rounded axis. The part's corners round and the
  group's other parts do not move. Units are millimetres.
- **Media:** a shot of a part's Inspector with the two fields, from an `e2e/docs/*.docs.js` shot, embedded
  on that page.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
