---
title: Restore the 3D view after a lost WebGL context instead of telling the user to reload the page
category: render
kind: finding
priority: high
model: opus
milestone: M19
depends: [build-017]
status: open
---

## Problem

`src/components/viewport/Viewport.vue` `onContextLost` (around line 3521) calls
`preventDefault()`, withdraws `capture_view`, and shows *"The 3D context was lost (the browser
released the GPU). Reload the page to restore the view."* There is **no `webglcontextrestored`
handler**, so the view never comes back by itself.

In a browser that is merely poor. **In the iOS app it is a dead end**: there is no browser chrome
and no reload button, so the user has to kill the app and lose any unsaved edits since the last
autosave. WKWebView is reported to drop WebGL contexts after backgrounding
(`docs/decisions/native-mobile-shell.md` Q1, "Context loss after backgrounding"), and the decision
record's Recommendation 5 makes this a precondition for any store build. If `build-018` item 4
finds the WebContent process can be killed outright and Tauri does not reload it, that case lands
here too.

## Interaction model

- **Precondition**: the WebGL context has been lost (`webglcontextlost` fired).
- **Trigger**: none in the normal case. On `webglcontextrestored` the renderer rebuilds GPU
  resources (geometries, materials, textures, render targets, the grid, gizmos, the orientation
  cube) from the document and the existing non-reactive mesh cache, with no reload. If the context
  is **not** restored within 3 s, the banner offers a **Restore view** button
  (`data-testid="viewport-restore"`). It disposes the renderer and creates a fresh one on the same
  canvas, or a new canvas if the old one stays lost. It is never a page reload, so undo stacks and
  the AI-turn stack survive.
- **Feedback**: while lost, the banner reads *"The 3D view was paused by the system. Restoring…"*.
  On success it disappears and the scene is back with the same camera, selection and gizmo. If
  **Restore view** fails twice, the banner says so and offers **Save a copy** (the existing save
  path), so the user's work is never trapped.
- **Placement / Selection count**: n/a.
- **Selection response**: unchanged. The selection and the Inspector survive the restore.
- **Small-screen behavior**: the banner and its button sit above the phone bottom sheet, with a
  44 px tap target and no horizontal scroll at 390 px.

## Documentation

- **Page**: `docs/viewport-navigation.md`, a short section "If the 3D view goes blank". Also link
  it from `docs/ios-app.md`.
- **Example**: "Switch to another app for a few minutes and come back. If the 3D view shows
  *Restoring…*, wait a moment; if it shows **Restore view**, tap it. Your parts, selection and
  undo history are kept."
- **Media**: `e2e/docs/viewport-restore.docs.js`, a still of the banner with **Restore view**
  (`docs/screenshots/viewport-restore.png`), embedded in `docs/viewport-navigation.md`.

## Affected files

- `src/components/viewport/Viewport.vue` (`onContextLost`, a new `onContextRestored`, the
  listener wiring near line 3616 and the teardown near 3773).
- `src/render/` (wherever renderer, scene resources and the mesh bridge are created). The rebuild
  belongs there, not in the component. Extract a `rebuildGpuResources(renderer, scene)` if none
  exists.
- A banner component under `src/components/viewport/` if the existing message element cannot hold
  a button.
- `e2e/viewport-context-restore.e2e.js`, `e2e/docs/viewport-restore.docs.js`.

## Proposed fix

1. Keep `preventDefault()` on loss (it is what allows a restore). Stop the frame loop while lost,
   so nothing calls into a dead context.
2. On `webglcontextrestored`, re-initialise three.js state (`renderer.initTexture`/material
   recompiles happen lazily; geometries need `needsUpdate` or re-upload from the retained typed
   arrays). Then re-enable `capture_view` and restart the loop. Three.js (pinned 0.185.1) handles
   part of this internally. Read its `WebGLRenderer` context-restore path first and do only what it
   does not.
3. The 3-second fallback disposes and recreates the renderer. It must not touch the document,
   undo, or the kernel worker.
4. A debug hook to force loss in tests: `WEBGL_lose_context.loseContext()` /
   `restoreContext()`, reachable from e2e via `page.evaluate` on the canvas, with no production
   switch needed.

## Effort

M.

## Testing

- **`e2e/viewport-context-restore.e2e.js` navigates to `/`**: place two bodies and select one,
  then force loss with `WEBGL_lose_context`. Assert the banner. Restore, then assert the banner is
  gone, both bodies render (pixel probe, not only the DOM), the selection and Inspector are
  unchanged, and **Undo** still undoes the last placement. A second case never restores: the
  **Restore view** button appears after 3 s and works.
- Runs on **Chromium, Firefox and WebKit** (WebGL-sensitive), at **phone, tablet and laptop** with
  a snapshot of the banner at each (an overlay).
- **Acceptance scenarios to re-drive**: 1 (two bodies remain visible), 7 (touch-only navigation
  after a restore), 10 (save and reload). **On device**: background the iOS app for 5 minutes and
  return (`build-018` item 4's condition), then report PASS/FAIL.
- **Closed findings re-run**: the second attempt's "scene too dark to see anything" (lighting must
  be rebuilt, not just geometry) and "dragging only rotated the grid" (navigation chrome must
  reattach after a renderer recreate).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
