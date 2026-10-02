---
title: Let the AI see and measure its own work — viewport capture and geometry analysis tools
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-002]
status: open
---

## Goal

The second attempt's failure mode (`SECOND-ATTEMPT.md`) was code that claims success without
anything proving it works. An AI that builds a wing without looking at it will repeat that.
"Done": the model can render the current scene from named views and get numbers back —
bounds, volume, minimum wall thickness, watertightness, fit against a build volume — and the
system prompt (`ai-005`) requires it to check before declaring a part finished.

## Design

- `capture_view({ view: 'iso'|'top'|'front'|'right'|'back'|'bottom'|'left', ids?, width? })`
  → a PNG the provider layer attaches as an image part. Rendered from the **real** viewport
  scene (`src/render/`), through an offscreen render target so it neither moves the user's
  camera nor flashes the screen. The mesh bridge keeps typed arrays non-reactive; reuse it.
  Optional `highlight: ids` (selection colour) and `section: { axis, offsetMm }` (a cut
  view, which is how a hollow print is checked). In the MCP transport (no GPU) the tool is
  absent from `list_tools`, and the prompt says so — never a tool that fails every time.
- `measure({ ids })`: bounds (mm, min/max per axis), volume, surface area, centre of mass;
  built on `src/core/kernel/measure.js` and `watertight.js`, which already exist — extend,
  don't duplicate.
- `check_printability({ ids, buildVolumeMm?, minWallMm?, nozzleMm? })`: watertight/manifold,
  fits the build volume (and in which orientation), thinnest wall found by sampling, and
  features smaller than the nozzle. Returns a list of `{ severity, message, where }` with
  coordinates the model can act on. Heuristic, and says so; it never claims "printable".
- `check_clearance({ a, b })`: minimum gap or interpenetration volume between two bodies.
  Needed for the Pi enclosure case and for a wing joint that must slide.
- All results are small JSON. Images are downscaled (`ai-004`).

## Interaction model

- **Precondition**: n/a for the user; the tools run during a turn.
- **Trigger**: the model calls them. A person sees them as activity rows (`ai-006`) with the
  captured image as an expandable thumbnail, so the human can see what the model saw.
- **Feedback**: thumbnail + numbers in the row; a failed check is a visibly distinct row.
- **Small-screen behavior**: thumbnails are tappable to full-size; same as `ai-006`.

## Documentation

Extend `docs/ai-partner.md`: *What the assistant checks*. Example: "Ask *check whether this
fits a 220 mm bed*. The activity row shows a top-view thumbnail and the result: *Fits at 214
× 52 × 18 mm; thinnest wall 1.2 mm — below your 1.6 mm minimum at the trailing edge.*"

## Affected files

- `src/ai/tools/capture.js`, `measure.js`, `printability.js`, `clearance.js` (+specs);
  `src/render/offscreenCapture.js` (new, in render because it touches three.js);
  `src/core/kernel/measure.js`, `watertight.js` (extend); registry hookup.

## Effort

L. Thin-wall sampling over a loft is the risky part: take a measured benchmark (frame and
worker cost on a 100-slice wing) per `.claude/prompts/perf-benchmark.md` before and after,
and run it in the kernel worker, never on the main thread.

## Testing

- **Unit**: known solids (a 10 mm cube is 1000 mm³, a 2 mm-wall tube reports 2 mm), a solid
  with a 0.3 mm sliver flagged, a non-watertight mesh flagged, two overlapping spheres give
  the analytic overlap within `toBeCloseTo` tolerance, empty selection, one body, a group.
- **E2E** (`e2e/ai-capture.e2e.js` → `/`): capture does **not** change the user's camera,
  selection or render a visible flash; the PNG is non-blank (a pixel-variance check — the
  second attempt's "scene too dark to see" bug). Three viewports; **all three engines**
  (WebGL offscreen targets diverge across engines).
- **Acceptance**: re-drive 1, 7, 11 (export) — measured volume equals the exported mesh's.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
