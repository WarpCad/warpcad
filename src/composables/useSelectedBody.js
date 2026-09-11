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
import { composeDeg } from '../core/rotation.js'
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
    return describeSelection(documentStore.raw.bodies(), selection.ids, {
      // The pick depth (`TODO/ui-016`), and the records a drilled-into part's
      // own op/params are recovered from. `records` is a plain array of JSON
      // lines, not geometry, so reading it here costs nothing like the bodies
      // above do — and it is read inside the *cheap*-invalidation computed on
      // purpose, since it only ever changes when `version` does.
      subPart: selection.subPart,
      records: documentStore.raw.records,
    })
  })

  return computed(() => {
    const base = described.value
    const body = base.body
    // The common case — nothing being dragged — returns the very same object,
    // so no allocation and no downstream invalidation happen at rest. A body
    // drilled into a sub-part never takes the preview path at all: there is no
    // gizmo to drag in that state, and a preview delta measured for the whole
    // group would slide the part's box away from the part.
    if (!body || body.subPart || !preview.isActive || preview.bodyId !== body.id) return base

    const dx = preview.txMm
    const dy = preview.tyMm
    const dz = preview.tzMm
    const [min, max] = body.boundsMm
    const [localMin, localMax] = body.localBoundsMm
    return {
      state: base.state,
      count: base.count,
      body: {
        ...body,
        positionMm: [body.positionMm[0] + dx, body.positionMm[1] + dy, body.positionMm[2] + dz],
        // Composed, not added (`TODO/core-004`). A previewed ring drag is a
        // world-frame delta on top of the body's current orientation, exactly
        // like the record it commits into — so the ghost has to compose it the
        // same way `src/core/transform.js` will, or a drag on an already-rotated
        // body would swing the dimension-line box one way during the gesture and
        // settle somewhere else on release. Going through the one helper is what
        // keeps the preview and the commit from being able to disagree.
        rotationDeg: composeDeg(
          [preview.rxDeg, preview.ryDeg, preview.rzDeg],
          body.rotationDeg,
        ),
        // Translated, not re-measured: an axis-aligned box slides with the body.
        // A *rotated* preview's true bounds would need the turned solid, which is
        // exactly the kernel work this preview exists to avoid doing per frame —
        // the dimension lines settle onto the real bounds on release.
        boundsMm: [
          [min[0] + dx, min[1] + dy, min[2] + dz],
          [max[0] + dx, max[1] + dy, max[2] + dz],
        ],
        // The **local** box only ever translates (`TODO/ui-023`): turning a body
        // cannot change the size of the body, so a rotate preview leaves these
        // three numbers alone and only the previewed `rotationDeg` above swings
        // the drawn box round. That is strictly better than the world box, which
        // visibly grows and shrinks mid-drag and then snaps at release — and it
        // costs no kernel work, because there is nothing to re-measure.
        localBoundsMm: [
          [localMin[0] + dx, localMin[1] + dy, localMin[2] + dz],
          [localMax[0] + dx, localMax[1] + dy, localMax[2] + dz],
        ],
      },
    }
  })
}
