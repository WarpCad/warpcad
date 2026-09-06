/**
 * The current selection, described for the UI.
 *
 * The thin reactive wrapper over `src/core/inspector.js`, and the one place the
 * selection store and the document meet. Both the Inspector panel and the
 * viewport's overlays consume it, so there is a single answer to "what is
 * selected and how big is it" rather than two that can disagree — the same
 * reason `render-001` kept one camera model behind two input paths.
 *
 * Deliberately *not* deep-reactive over geometry: the description carries plain
 * numbers only (bounds, size, position, param values). CLAUDE.md's Performance
 * section calls Vue deep-reactivity over a kernel solid's vertex arrays a
 * performance bug, so `document.raw` is read imperatively here and only the
 * summary crosses into reactive land.
 *
 * @module composables/useSelectedBody
 */

import { computed } from 'vue'

import { describeSelection } from '../core/inspector.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useTransformPreviewStore } from '../stores/transformPreview.js'

/**
 * @returns {import('vue').ComputedRef<import('../core/inspector.js').SelectionDescription>}
 *   Recomputed when the selection changes or the document mutates — **not** per
 *   frame. The viewport re-projects this description every frame; it does not
 *   re-derive it.
 *
 *   During a gizmo drag the description also carries the *uncommitted* preview
 *   delta (`src/stores/transformPreview.js`), which is what makes the Inspector's
 *   fields, the gizmo itself and the dimension lines all track the drag live
 *   rather than jumping at release. That live layer is deliberately a **second**
 *   computed on top of the first: the expensive half — `describeSelection`, which
 *   measures a bounding box off real kernel geometry — depends only on the
 *   document version and the selection, so a `pointermove` re-runs the cheap
 *   arithmetic below and never re-measures a solid.
 */
export function useSelectedBody() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const preview = useTransformPreviewStore()

  const described = computed(() => {
    // Read the version so a document mutation invalidates the description: the
    // bodies themselves live outside Vue's reactivity on purpose.
    void documentStore.version
    return describeSelection(documentStore.raw.bodies(), selection.ids)
  })

  return computed(() => {
    const base = described.value
    const body = base.body
    // The common case — nothing being dragged — returns the very same object,
    // so no allocation and no downstream invalidation happen at rest.
    if (!body || !preview.isActive || preview.bodyId !== body.id) return base

    const dx = preview.txMm
    const dy = preview.tyMm
    const dz = preview.tzMm
    const [min, max] = body.boundsMm
    return {
      state: base.state,
      count: base.count,
      body: {
        ...body,
        positionMm: [body.positionMm[0] + dx, body.positionMm[1] + dy, body.positionMm[2] + dz],
        rotationDeg: [
          body.rotationDeg[0] + preview.rxDeg,
          body.rotationDeg[1] + preview.ryDeg,
          body.rotationDeg[2] + preview.rzDeg,
        ],
        // Translated, not re-measured: an axis-aligned box slides with the body.
        // A *rotated* preview's true bounds would need the turned solid, which is
        // exactly the kernel work this preview exists to avoid doing per frame —
        // the dimension lines settle onto the real bounds on release.
        boundsMm: [
          [min[0] + dx, min[1] + dy, min[2] + dz],
          [max[0] + dx, max[1] + dy, max[2] + dz],
        ],
      },
    }
  })
}
