---
title: From a drawing to a library group — attach an image, set scale, build the parts, check against the picture
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-005, ai-007, sketch-003, core-037, ui-055]
status: open
---

## Goal

> Here is a drawing of a raspberry pi 7 create a group object to be added to the library.

"Done": a person attaches a drawing, the assistant works out the scale, builds a **group**
(board plate, mounting holes, each connector as a named sub-part), shows its result laid
over the drawing so both can see whether it matches, and saves it to **My parts**
(`ui-055`) on request.

**The Raspberry Pi 7 does not exist yet — on purpose.** The input will be a *mechanical
drawing* (dimensioned views), not a photo. The model has no memory of this board, so every
dimension must come from a callout on the drawing or from the user, never from "what a Pi
looks like". Behaviour under test: a dimension that is not printed is **asked about or
flagged as assumed**, never guessed. Scenario 18 uses a fixture drawing of a fictional board.

## Design

- **Dimensions first.** A mechanical drawing carries its scale as callouts. Before building
  anything the agent reads them into a table (feature, value, unit, which view, tolerance)
  shown in the transcript, cross-checks them (a dimension chain that does not sum to the
  overall length is reported), and takes heights from side/front views rather than assuming
  them. For a photo instead, it falls back to a ruler or a named standard. If it cannot
  establish a dimension, it **asks** (`ai-005`'s clarify path) and does not invent one.
  It sets the reference image's scale with `sketch-003`'s mechanism, so the picture is at
  real size under the sketch grid.
- **Image tools** (extend `src/ai/tools/`): `get_reference_image({ sliceId })` (downscaled
  image part), `set_reference_scale({ sliceId, fromPx, toPx, distanceMm })`, and
  `locate_in_image({ query })` → boxes in **image pixels** *and* **mm after scale**. These
  are the model's hands for measuring: it looks, proposes coordinates, and the overlay
  (below) is how it finds out it was wrong. Where `sketch-004`'s Auto-trace exists, its
  outline is offered as a *starting* polyline, never trusted.
- **Build**: board outline and holes as one sketch (Solid/Hole), connectors as separate
  bodies with names and colours, then `group.assemble` with explicit part names so they stay
  addressable (`group.snap`/`align` use them). Heights that a top-down drawing cannot give
  are **asked or flagged as assumed** in the transcript and recorded as intent.
- **Overlay check**: `capture_view({ view: 'top', overlay: 'reference' })` renders the model
  semi-transparent over the reference image at the established scale and returns the image;
  the agent compares, adjusts, and repeats up to N times, then reports the residual
  ("the SD slot is 1.5 mm off") rather than claiming a match.
- **Save**: when asked (or by prompt), calls `save_to_library` → `core-037`'s
  `definePartFromSelection`, with the exposed parameters it judged useful (e.g. `clearanceMm`).
  Saving is a **user-visible confirmation step**: the tool proposes name and parameters in
  the transcript and the Save is committed only after the user taps Confirm. A model does
  not write to the user's persistent library unprompted.
- **Privacy**: the image leaves the browser only as part of the user's own request to
  their own provider (`ai-004`); the chat says "image sent" the first time per project.

## Interaction model

- **Precondition**: a key (`ai-004`); an attached image; for the overlay, a slice with a
  reference image.
- **Trigger**: **Attach** in the chat composer (`ai-006`) — or **drag an image file onto
  the viewport** to attach (desktop) — then Send. The Confirm button on the Save proposal
  is `ai-save-confirm`.
- **Feedback**: activity rows for *Set scale 85.0 mm from "board length"*, *Built board +
  4 holes*, *Added USB-A, Ethernet…*; the overlay thumbnail; the new group selected in the
  viewport with its sub-parts listed; a final summary naming assumptions.
- **Placement**: the built group is **placed** at the origin of the sketch plane with its
  reference image scale (the AI-equivalent of a drop); the user can drag it or use the
  gizmo afterward, and a placed copy from the library comes through the normal drag.
- **Selection response**: the new group is selected; Inspector lists sub-parts.
- **Small-screen behavior**: attach opens the phone's camera / photo picker; overlay and
  Save-confirm are readable in the half-height sheet.

## Documentation

Extend `docs/ai-partner.md`: *Making a part from a drawing or photo*. Example: "Tap
**Assistant**, **Attach** a photo of the board next to a ruler, type *this is a Raspberry
Pi 5-style board, make a library part*. When it asks, say the board is 85 mm long. Check the
overlay thumbnail, then tap **Confirm** on *Save to library*."

## Affected files

- `src/ai/tools/image.js`, `overlay.js`, `library.js` (+ specs), `src/render/offscreenCapture.js`
  (overlay mode), `src/ai/prompt.js` (scale-first, no-recall rules), `docs/ai-partner.md`;
  drag-onto-viewport attach in `Viewport.vue` (thin).

## Effort

XL. Split if the first run finishes scale + build + overlay: the Save-confirm step is its
own task.

## Testing

- **Unit**: pixel↔mm conversion at a known scale (`toBeCloseTo`); a refused unknown scale;
  a reference image that is hostile (huge, SVG with script, truncated) — handled by
  `sketch-003`'s sanitiser, and a spec here proves this path cannot bypass it.
- **E2E** (`e2e/ai-drawing.e2e.js` → `/`, scripted provider): attach an image fixture of a
  known 85×56 board, assert the scale, the group's sub-part names, the overlay thumbnail
  is non-blank, Save needs Confirm, and the part is in My parts. Three viewports; all
  three engines.
- **Live model run (not CI)**: `ai-010`'s scenario 18 with a real key; the transcript and
  the overlay residual are logged.
- **Acceptance**: 18 (new), plus re-drive 9, 3, 10 and `sketch-003`'s own repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
