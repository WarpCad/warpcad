---
title: Docs media — selection, Inspector, transform gizmo, parameters, colour, delete
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

Illustrate everything that happens *after* a shape exists: select it, read its size,
move/rotate it with the gizmo while the numbers follow, edit parameters, recolour, align,
hide parts, delete. Embed in `docs/selection-and-inspector.md`. The key pedagogical movie is
the gizmo drag with the Inspector's position fields updating live — it demonstrates the
CLAUDE.md rule that gizmo and numeric fields drive one transform.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/selection-and-inspector.md` (update).
- **Example** — "Click the cube. The Inspector shows its size and position and handles
  appear on it. Drag the red arrow — the X field changes as you drag. Type `25` into X and
  press Enter — the cube moves to X = 25 mm."

## Media inventory

Spec: `e2e/docs/selection-inspector.docs.js`.

| Name | Kind | Shows | Viewport |
|---|---|---|---|
| `select-body` | still | Cube selected: outline, gizmo handles, Inspector open, oriented dimension lines (`ui-023`). | laptop |
| `select-click` | movie | Click empty space (nothing selected, Inspector empty) → click cube → Inspector fills. | laptop |
| `select-marquee` | movie | Drag-box multi-select over two bodies; count readout appears (`ui-024`). | laptop |
| `gizmo-translate` | movie | Drag a translate arrow; Inspector position field changes live. Split view not needed — Inspector is on screen. | laptop |
| `gizmo-rotate` | movie | Drag a rotate ring; direction arrows visible (`ui-022`); angle field updates. | laptop |
| `gizmo-handles` | still | Translate and rotate handles, cropped, 3D appearance (`ui-021`). | laptop |
| `inspector-numeric-edit` | movie | Type a value into a position field; cube jumps to match. | laptop |
| `inspector-param-edit` | movie | Edit a primitive parameter (cylinder diameter); mesh updates; one undo step (`ui-044`). | laptop |
| `inspector-composite-param-edit` | still | Hardware bolt's Spec dropdown / dependent-repair dialog (`ui-052`). | laptop |
| `inspector-colour` | movie | Change a body's colour (`ui-037`). | laptop |
| `inspector-object-list` | still | Objects list with parts expanded (`ui-042`/`ui-049`). | laptop |
| `inspector-hidden-parts` | still | "Show hidden parts" revealing tap/clearance parts (`ui-047`). | laptop |
| `align-to-origin` | movie | Align-to-origin button; body jumps to the origin (`ui-050`). | laptop |
| `delete-body` | movie | Delete a body; dependents banner if applicable (`ui-051`). | laptop |

(Rename — `ui-056` — is still open; add `inspector-rename` here when it lands.)

## Affected files

- `e2e/docs/selection-inspector.docs.js`, `docs/selection-and-inspector.md`,
  `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Gizmo drags must use real handle positions: project the handle's world point to screen
through the app's own projection (reuse the approach in `gizmo-transform.e2e.js`), then
`humanDrag` from there. Static stills start from a loaded fixture, not a replayed drag.
Mask nothing here — if a timestamp is visible, it is a bug in the shot.

## Effort

L (14 items; split the spec by section if a single file is unwieldy — still one task).

## Testing

- Each movie asserts its end state (new position value, body count, colour) so a silently
  failing drag cannot produce a plausible-looking GIF of nothing.
- Engines: Chromium only. Viewports: laptop.
- `TODO/ACCEPTANCE.md`: scenario 2 (hardware property edit — gizmo/inspector sync) must be
  driven by hand after this lands. Closed findings: re-run `ui-012`, `ui-017`, `ui-048`
  repros (gizmo transform sync, gizmo scale, oversized flat handles) against what the
  recordings show.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
