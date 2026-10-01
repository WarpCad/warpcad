---
title: Bill-of-Materials panel — tally placed hardware/kit-part bodies by spec
category: ui
kind: feature
priority: low
model: sonnet
milestone: M7
depends: [ui-030]
status: done
---

> **Shipped note.** Landed as scoped, with the panel folded into the Inspector as a section (`display/BillOfMaterials.vue`) rather than a standalone panel. The tally is a pure `src/core/bom.js` (a `useBillOfMaterials` composable is only the reactive seam); `BodySummary` gained a plain-JSON `params` field so the BOM never reaches into the raw document. Rows key on op + spec (+ length for bolts/screws, width × height for kit parts, model for Pis); `fit` is deliberately ignored. The e2e is Chromium-only at all three viewports. Clicking a row to select its bodies was considered and not built.

## Goal

A read-only readout tallying placed hardware/kit-part bodies by spec (e.g. "M4 Bolt ×
3"), matching `jscad-hardware`'s own built-in BOM-tracking convention — confirmed live
inside the library's own recipe functions, not just an app-level habit of the surveyed
corpus (~26 of ~80 surveyed projects read `Hardware.BOM` back out). "Done" looks like: a
panel listing every distinct hardware/kit-part spec currently in the document, with a
count for each, updating live as bodies are placed, edited, or deleted.

**Placement, not this panel, is the real prerequisite** — a body has to be both
placeable (`ui-030`/`ui-031`) and identifiable by spec before it can be tallied. This
task depends directly on `ui-030` (already in progress) and benefits from `ui-031`
(more tallyable recipe kinds) and `core-027` (the Screw family; V1 gave screws no BOM
key, so this panel derives one from `hardware.screw`'s `{ head, spec, length }` params —
see `recipes/hardware.screw.js`'s module doc) without strictly blocking on them
— it can ship against whatever hardware recipes are Library-reachable when it lands and
pick up more automatically as later tasks add rows, since it reads the document's
placed bodies generically rather than a fixed list.

## Interaction model

- **Precondition** — none; a passive, always-available readout, not a selection-gated
  Operation.
- **Trigger** — per `CLAUDE.md`'s Component Categories, lives in `inspector/` or
  `display/` (a read-only badge/counter panel, matching `display/`'s own stated purpose
  "read-only badges, counters, status indicators") — likely a persistent small panel or
  a toggleable one, decide at Step 2 against how much screen space it competes for with
  the Inspector/Library at laptop width.
- **Feedback** — the list updates live as bodies are placed/edited/deleted; no commit
  action of its own since it's read-only.
- **Placement** — n/a; a passive readout.
- **Selection response** — n/a; not selection-driven (though clicking a BOM row to
  select/highlight the matching bodies in the viewport would be a natural, low-cost
  addition worth considering at Step 2, not required by this task's own Goal).
- **Selection count** — n/a.
- **Small-screen behavior** — per `CLAUDE.md`'s phone-first rule: a persistent panel at
  laptop width, collapsible/overlay at phone/tablet — likely folded into the existing
  Inspector sheet as a new section rather than a fourth independent phone-width panel
  competing with Library/Inspector/(eventually) Timeline/AI chat.

## Documentation

- **Page** — new `docs/bill-of-materials.md`, or a section in `docs/selection-and-
  inspector.md` if Step 2 folds this into the Inspector panel rather than a standalone
  one.
- **Example**: "Place three M4 bolts and a washer — the Bill of Materials panel shows
  'M4 Bolt × 3' and 'M6 Washer × 1', updating as you add, edit, or remove parts."

## Affected files

- `src/components/display/` or `src/components/inspector/` (per the placement decision
  above) — the new panel component.
- `src/core/document.js` — likely no change; this reads `bodies()`'s existing output
  and groups by each body's `op`/`params.spec` (or equivalent), a pure derived-state
  computation rather than a new document-model field.
- `src/composables/useBillOfMaterials.js` (new) — the derived tally, framework-free
  logic per `CLAUDE.md`'s "geometry logic belongs in `src/core/`" rule extended to any
  non-trivial derived state, not just geometry.
- `docs/bill-of-materials.md`.

## Proposed fix

A pure derived-state feature: group `document.bodies()`'s current output by
`op`+`params.spec` (the same fields the Inspector's Parameters section already reads
read-only for a hardware body, per `ui-029`'s established convention), count each
group, and render the tally. No new document-model field, no new mutation path — this
is the read-only counterpart to every write-side task in this milestone, and should be
the lowest-risk task in the M5-M7 set for exactly that reason.

## Effort

S/M — a pure derived-state readout with no document-model change and no new mutation
path; `model: sonnet` — no numerical or architectural ambiguity, closely mirrors the
Inspector's existing read-only param display.

## Testing

- New `useBillOfMaterials.spec.js`: a document with three `hardware.bolt` bodies at the
  same spec tallies as one row with count 3; different specs tally as separate rows;
  removing a body updates the count live; a non-hardware body (a plain primitive) is
  excluded from the tally, not shown as a spec-less row.
- New `e2e/bill-of-materials.e2e.js` (required, new reachable panel) — place two Bolts
  (once `ui-030` provides a real Library row) or a stand-in composite if that task
  hasn't landed with a spec field yet, confirm the panel shows the correct count;
  place a third with a different spec, confirm a second row appears. Runs at all three
  reference viewports (a new panel, per `CLAUDE.md`'s layout rule) — Chromium-only
  engine scope is defensible here (no WebGL/canvas/persistence path, pure DOM/state),
  state this explicitly rather than default to the full matrix unreasoned.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly, per this task's own roadmap entry.
- **Closed-finding regression surface**: none — a read-only feature with no document
  mutation path to regress.
