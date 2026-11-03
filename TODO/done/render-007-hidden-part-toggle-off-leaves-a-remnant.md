---
title: Turning Show hidden parts off can leave a steady remnant on the canvas at the bolt's base, under load
category: render
kind: finding
priority: medium
model: opus
depends: []
status: done
---

> **What actually shipped (2026-11-03).** No app change. The remnant was the gizmo's Z-arm `drop-shadow` (`Gizmo.vue`, `.tgizmo__arm`), which Firefox keeps painting under the snapshot helper's `visibility:hidden`. The fix is in `e2e/inspector-hidden-parts.e2e.js` `snapshotCanvas`: the hidden overlays also get `filter:none` and `backdrop-filter:none`. The 40 px threshold, the poll and the assertion are unchanged. Users are not affected: the app hides the gizmo with `v-if`/`v-show`, and a hand drive at laptop and phone showed a byte-identical canvas after toggle-off.

## Problem

`e2e/inspector-hidden-parts.e2e.js:232` ("toggling Show hidden parts draws a translucent overlay, and toggling off reverts it") failed in the full e2e matrix run on 2026-10-30 (4595 passed, 1346 failed or skipped). The assertion that failed was `toggling off reverts the canvas to how it looked before`: 120 changed pixels against a limit of 40, polled for 20 s without ever dropping below the limit.

This is not a slow teardown, and it is not a timing race the poll can absorb. The residual is **steady**. Polling does not converge on it, so widening the poll budget (5 s, then 20 s, in `c0e11f3`, and the Firefox poll in `00ec80d`) cannot fix it. The same test recorded 119 changed pixels on Firefox on 2026-10-02 (`00ec80d`), and was not reproduced in roughly 800 stress runs before `c0e11f3`. It has now shown up three times.

What was measured on a local tree, using a temporary probe spec (deleted; the findings are reproducible from the steps below):

- **Quiet machine:** the test passes alone on `chromium-laptop` (6 s), passes 72 of 72 runs (8 repeats across each of the nine projects, 16 workers), and passes the full file across all nine projects at 12 workers. It does not reproduce at low load.
- **Under load:** at 16 parallel workers, toggling off produced a steady residual in a minority of runs. Each logged residual is the same small patch: a bounding box of about 10 × 20 px at x 230–239, y 346–366, on a 524 × 1127 canvas (the phone project's canvas; every logged residual was on that size). Its magnitude varies run to run: a plateau of 20–28 px (under the threshold of 40), and a plateau of 140–156 px (the failing case). Single-frame spikes of 122–124 px also appeared and cleared on the next frame.
- **What the patch looks like:** comparing a crop of the baseline with a crop after toggle-off shows the left of the two shank bars ending slightly lower and reading slightly more opaque after the toggle, as if a faint trace of the translucent clearance were left at the base of the shank.
- **A viewport resize clears it:** after a one-pixel resize and back, the same run's residual fell to about 5 px (noise). The scene data and the rebuilt meshes are therefore correct; something that a redraw or a resize removes is still on the canvas.

Ruled out by reading or measuring, so do not re-check these first:

- **The baseline is not captured mid-animation.** After a drop, the canvas is static: zero drift at every 100 ms step over 2.5 s, at low load.
- **The renderer is not skipping frames.** `renderFrame` and `scheduleRender` in `src/components/viewport/Viewport.vue` (around lines 788–800) are straightforward, and `createViewport().render()` in `src/render/scene.js:253` has no dirty-flag short circuit, so it draws every time it is called.
- **Nothing overrides the clear.** No `autoClear`, scissor, or `clearDepth` overrides exist in `src/`, so a stale drawing buffer should not be able to persist. (`preserveDrawingBuffer: true` is set, but a full clear still runs every frame.)
- **The Library toast is not involved.** It only shows on save, import and duplicate, not on drop.

Not established: whether the remnant is an orphaned or unremoved three.js object left by the rebuild, or an ordering artifact of transparent geometry that a resize re-sorts. A deselect-and-reselect experiment was started to separate the overlay from the general selection rebuild, but it was confounded (deselecting changes the selection visuals on purpose, so the baseline does not hold), and it was not completed.

Why it matters beyond the test: if the remnant is real, a user who hides a bolt's clearance again may see a faint ghost at its base until the view changes. That is a user-visible defect whether or not the test is kept.

## Affected files

- `src/components/viewport/Viewport.vue:1917-2030` — `syncBodies()`. The toggle-off path, which is the part that matters: `bodiesGroup.remove(existing)` then `disposeBodyObject(existing)` then a fresh `createBodyObject(...)`, followed by `applySelectionMaterial()`, `applyHover()` and `applyRepeatOutlines()`.
- `src/components/viewport/Viewport.vue:2038-2080` — `applySelectionMaterial()`. It rebuilds the x-ray twins per part, and the twin path for hidden parts depends on `isPartDrawn`.
- `src/components/viewport/Viewport.vue:2094-2132` — `applyHover()`. It can add a transient hidden-part mesh to the body container, and that transient is removed by `removeHoverArtifacts()`.
- `src/render/mesh.js` — `createBodyObject`, `disposeBodyObject`, `addXrayTwin`, `HIDDEN_PART_ALPHA` (line 330), and the translucent material path.
- `src/stores/hiddenPartVisibility.js` — the toggle's set, watched at `Viewport.vue:3696`.
- `e2e/inspector-hidden-parts.e2e.js:232-265` — the test, and its `snapshotCanvas` / `changedPixels` helpers.

## Proposed fix

Investigate first, then fix what the investigation shows. Do not change the poll, the 40-pixel threshold, or the test's assertion.

1. **Instrument, don't guess.** Add a temporary, test-only read-out (for example a `data-*` count on the viewport element, or a `window` hook behind the existing test-mode pattern if one exists) that reports, after each sync: the number of children in `bodiesGroup`, the number of children in each body container, the number of transient and x-ray twin meshes, and the ids of any meshes not reachable from `bodyMeshes`. Remove the hook before the fix lands.
2. **Reproduce under load.** Repeat the toggle cycle at 16 workers on `chromium-laptop` until the residual shows up, and record the instrumented state for a failing run against a passing one. A resize clearing it is the clue to chase: if an orphaned or unremoved object exists in one run and not the other, that is the cause.
3. **Fix the cause the instrument shows.** Likely candidates to check first, in order: an x-ray twin or hover transient that is added to a container but not removed on rebuild (look at `removeHoverArtifacts` against `disposeBodyObject`); a transparent mesh whose material is shared with the rebuilt body and is not cleared; a draw-order artifact of translucent geometry that a resize re-sorts.
4. **If it cannot be reproduced after a serious attempt** (say 800 runs at 16 workers, as before), say so in this file with the counts, and close it as load-only with that evidence. Do not widen the threshold to hide it.

## Effort

M (a few hours) to instrument and reproduce. L if the cause is in the material or sort path and needs a design change in `src/render/mesh.js`.

## Testing

- The existing test `e2e/inspector-hidden-parts.e2e.js:232` must pass as written. Its threshold of 40 stays.
- A repeat of that test at 16 workers, `--repeat-each=16`, with no failures across the matrix, before the finding is closed.
- **Engines:** Chromium, Firefox and WebKit. Firefox has already shown this (119 pixels, `00ec80d`), and WebKit matters for the translucent material path. Run all three at phone, tablet and laptop, because the canvas size differs (the failing patch was on a 524 × 1127 canvas).
- **Acceptance scenarios:** scenario 5 (the Inspector's Show hidden parts and the bolt's clearance, per `TODO/ACCEPTANCE.md`), re-driven by hand at laptop and phone. Re-drive the hidden-part toggle by hand, not only through the spec.
- **Closed-finding regression:** `00ec80d` (the Firefox overlay revert, 119 pixels) and `c0e11f3` (the 5 s poll budget). Re-run their original repro: a full-matrix run with the toggle-off check under load, against the new code.
- The new e2e behaviour is covered by the existing spec. Do not add a separate test that asserts the remnant away.

## Documentation

None; this changes no user-visible control. The hidden-part toggle's docs page (`docs/hardware-library.md`, "Bolts and screws") stays as it is unless the fix changes what a user sees.
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
