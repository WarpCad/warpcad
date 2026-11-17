// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's watchers (`TODO/ui-108`): what re-syncs the scene, the sketch editor and the
 * overlays when the document, the timeline, the selection or the editor change.
 *
 * Moved out of `Viewport.vue` without a behaviour change, in the same order: the body sync is
 * declared before the framing watcher so the meshes exist before the camera moves. Every
 * collaborator is handed in, so a unit test can drive the stores and see what runs.
 *
 * @module composables/useViewportWatchers
 */
import { watch } from 'vue'

/**
 * @typedef {object} ViewportWatcherDeps
 * @property {any} documentStore
 * @property {any} timeline
 * @property {any} hiddenPartVisibility
 * @property {any} sketchEditor
 * @property {any} selection
 * @property {any} alignReference
 * @property {any} hoverHighlight
 * @property {any} repeatSession
 * @property {any} colorPreview
 * @property {() => boolean} presentation Is this the Shared view (`TODO/io-016`)?
 * @property {any} sketchDraw
 * @property {any} sketchHandler
 * @property {any} sketchPreview
 * @property {any} sketchSnapper
 * @property {any} pointer
 * @property {any} referenceImage
 * @property {() => void} syncBodies
 * @property {() => void} frameLoadedContent
 * @property {() => void} aimAtSketch
 * @property {() => void} applySketchBodyVisibility
 * @property {(force?: boolean) => void} syncSketchPaths
 * @property {() => void} scheduleRender
 * @property {() => void} applySelectionMaterial
 * @property {() => void} applyHover
 * @property {() => void} applyRepeatOutlines
 * @property {() => void} paintBodies
 */

/**
 * Register every viewport watcher. Call during mount; call each returned function on unmount.
 *
 * @param {ViewportWatcherDeps} deps
 * @returns {(() => void)[]} The stop handles.
 */
export function registerViewportWatchers(deps) {
  const {
    documentStore,
    timeline,
    hiddenPartVisibility,
    sketchEditor,
    selection,
    alignReference,
    hoverHighlight,
    repeatSession,
    colorPreview,
    presentation,
    sketchDraw,
    sketchHandler,
    sketchPreview,
    sketchSnapper,
    pointer,
    referenceImage,
    syncBodies,
    frameLoadedContent,
    aimAtSketch,
    applySketchBodyVisibility,
    syncSketchPaths,
    scheduleRender,
    applySelectionMaterial,
    applyHover,
    applyRepeatOutlines,
    paintBodies,
  } = deps
  return [
    watch(() => documentStore.version, syncBodies),
    // Entering, leaving or moving a preview changes what is on screen without
    // changing the document, so it needs its own trigger.
    watch(() => timeline.previewStep, syncBodies),
    // `TODO/ai-017`: Watch shows the Assistant's fork, which changes with every tool call and
    // with no live-document mutation at all; starting and ending a Watch moves this too.
    watch(() => timeline.watchRevision, syncBodies),
    // The Show hidden parts toggle (`TODO/ui-047`) changes what is on screen with
    // no document mutation at all — spreading the reactive Set into a fresh array
    // is what makes this getter re-run on every add/delete, since two different
    // arrays are never `===` even when their contents happen to match.
    watch(() => [...hiddenPartVisibility.shown], syncBodies),
    // A loaded document (restore / Open), as opposed to an edit: frame it. Declared
    // after the `syncBodies` watcher so the meshes exist before the camera moves.
    watch(() => documentStore.loadRevision, frameLoadedContent),
    // `TODO/io-016`: the Shared view's project arrives through Watch, not a load; frame it too.
    watch(
      () => timeline.watchRevision,
      () => {
        if (presentation()) frameLoadedContent()
      },
    ),
    // The sketch editor (`TODO/sketch-001`). Opening it aims the camera straight at the
    // active slice and hides the edited body's own mesh behind the live preview; every
    // draft edit re-projects the outlines and asks the worker for a new preview.
    watch(
      () => sketchEditor.active,
      (active) => {
        if (active) {
          sketchDraw.end(true)
          sketchHandler.endDrag(true)
          aimAtSketch()
        } else {
          sketchDraw.end(true)
          sketchHandler.drag.active = false
          sketchHandler.drag.beforeDraft = null
          sketchPreview.clear()
          // The photo is a tracing aid: it leaves the scene, and its memory, with the editor.
          pointer.cancelScaleDrag()
          referenceImage.release()
        }
        applySketchBodyVisibility()
        syncSketchPaths(true)
        sketchPreview.request()
      },
    ),
    watch(
      () => sketchEditor.draft,
      () => {
        syncSketchPaths(true)
        // A point drag replaces the draft on every move; the worker builds the preview once,
        // on release (`sketchHandler.endDrag`), rather than once per pointer event.
        if (!sketchHandler.drag.active) sketchPreview.request()
        scheduleRender()
      },
    ),
    watch(
      () => [
        sketchEditor.activeSlice,
        sketchEditor.selectedProfileId,
        sketchEditor.hoverProfileId,
        sketchEditor.selectedVertex,
        sketchEditor.hoverVertex,
        sketchEditor.tool,
        sketchEditor.chainPointCount,
      ],
      () => {
        syncSketchPaths(true)
        scheduleRender()
      },
    ),
    // A marker left over from the last tool, slice or snap state would point at nothing.
    watch(() => [sketchEditor.tool, sketchEditor.activeSlice, sketchEditor.snapEnabled], () => sketchSnapper.hide()),
    watch(() => documentStore.version, applySketchBodyVisibility),
    // The reference photo (`TODO/sketch-003`): which one, where, and how opaque all live in the
    // draft; a photo added this session lives in the editor until Done.
    watch(
      () => [sketchEditor.active, sketchEditor.draft, sketchEditor.activeSlice, sketchEditor.assetsVersion, sketchEditor.frame, documentStore.version],
      () => referenceImage.sync(),
    ),
    watch(
      () => [sketchEditor.imageTool, sketchEditor.scaleAPx, sketchEditor.scaleBPx],
      () => {
        referenceImage.syncOverlay()
        scheduleRender()
      },
    ),
    watch(() => selection.ids, applySelectionMaterial, { deep: true }),
    watch(() => alignReference.originOnly, applySelectionMaterial),
    // The object list's hover (`TODO/ui-049`). The store hands out a fresh object only on
    // a real change, so this fires at hover-change rate, never pointer rate.
    // `TODO/ui-092`: a Prompts view row's parts, at the same change rate.
    watch([() => hoverHighlight.target, () => hoverHighlight.many], applyHover),
    // A Repeat session's target outlines (`TODO/ui-069`): its seed and ticked targets.
    watch(() => [repeatSession.seed?.bodyId, repeatSession.outlined.join(',')], applyRepeatOutlines),
    // The Inspector's colour picker, while it is open (`TODO/ui-037`): the mesh
    // follows every `input` event with no document write. Repaint only — the
    // selection has not changed, so the twins stay as they are.
    watch(() => [colorPreview.bodyId, colorPreview.subPart, colorPreview.color], paintBodies),
    // Pick depth changes nothing about *which* body is selected, so it never
    // reaches the watcher above — but it does change what the overlays draw
    // (`TODO/ui-016`: the dimension lines shrink to the part, the gizmo goes).
    // `overlaySync.syncAnnotations` runs from the render callback, so without this the
    // gizmo would simply stay on screen until the next camera move: the exact
    // class of "it passed its own test and still looked broken" defect
    // SECOND-ATTEMPT.md is about.
    watch(() => selection.subPart, scheduleRender, { deep: true }),
  
  ]
}
