// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one adapter between the Inspector's Color control and the document
 * (`TODO/ui-037`).
 *
 * A separate module rather than folded into `useParamCommands.js`: a param edit
 * rebuilds the creation record and restores the pose (three records, one
 * `batch`), whereas a colour pick is exactly one `style.recolor` record that
 * never touches geometry. Sharing a file would mean sharing nothing but a name.
 *
 * ## One pick, one record, one Undo step
 *
 * A native `<input type="color">` fires `input` continuously while its picker is
 * open, and `change` once. So:
 *
 * - `input` → {@link preview}: the running colour goes into the UI-only
 *   `colorPreview` store, which the viewport paints straight onto the mesh. No
 *   record, no Undo step — the live feedback `TODO/ui-037`'s Interaction model
 *   asks for, on `ui-012`'s live-drag precedent.
 * - `change` → {@link setColor}: exactly one record for the whole gesture, via
 *   `document.setColorOverride` (`TODO/data-005`), and the preview ends in the
 *   same breath.
 *
 * A second pick on the same body appends one more record that **supersedes the
 * first** — it chains on the lineage's terminal, which the first pick's record now
 * is — so the History list shows each pick as its own step on that body, and one
 * Undo steps back exactly one pick. It is never a second, independent body entry.
 *
 * ## Addressing
 *
 * `subPart` is `ui-016`'s single drilled-in part name, exactly what
 * `setColorOverride` takes. Omitted means the whole body. See
 * `src/core/colorOverride.js` for how the two combine on screen.
 *
 * @module composables/useColorCommands
 */

import { ownOverrideOf } from '../core/colorOverride.js'
import { useColorPreviewStore } from '../stores/colorPreview.js'
import { useDocumentStore } from '../stores/document.js'

/**
 * @returns {{
 *   preview: (bodyId: string, color: number, subPart?: string) => void,
 *   cancelPreview: () => void,
 *   setColor: (bodyId: string, color: number, subPart?: string) => void,
 *   resetColor: (bodyId: string, subPart?: string) => void,
 * }}
 */
export function useColorCommands() {
  const documentStore = useDocumentStore()
  const colorPreview = useColorPreviewStore()

  /**
   * The override this exact key already has, if any.
   *
   * @param {string} bodyId
   * @param {string | undefined} subPart
   */
  function ownOf(bodyId, subPart) {
    const body = documentStore.raw.bodies().find((candidate) => candidate.id === bodyId)
    return ownOverrideOf(body?.colorOverrides, subPart)
  }

  return {
    preview(bodyId, color, subPart) {
      colorPreview.set(bodyId, color, subPart)
    },

    cancelPreview() {
      colorPreview.clear()
    },

    setColor(bodyId, color, subPart) {
      // Cleared first and unconditionally: whether or not a record follows, the
      // gesture is over, and a preview left behind would keep painting a colour
      // the document does not hold.
      colorPreview.clear()
      const own = ownOf(bodyId, subPart)
      // Re-picking the colour already in force is not a mutation — the same rule
      // `translateBy` applies to a zero-length drag.
      if (own && own.color === color) return
      // Every mutation goes through the command layer inside an origin-tagged
      // transaction (CLAUDE.md Architecture); `'local'` because this is the
      // user's own pick. An existing alpha is kept: the native picker has no
      // alpha channel, so re-picking a hue must not silently make a
      // translucent part opaque.
      documentStore.setColorOverride(
        bodyId,
        {
          color,
          ...(own?.colorAlpha !== undefined ? { colorAlpha: own.colorAlpha } : {}),
          ...(subPart !== undefined ? { subPart } : {}),
        },
        { origin: 'local' }
      )
    },

    resetColor(bodyId, subPart) {
      colorPreview.clear()
      // Nothing of this key's own to reset: not a mutation, and not an Undo step.
      if (!ownOf(bodyId, subPart)) return
      documentStore.clearColorOverride(bodyId, subPart !== undefined ? { subPart } : {}, { origin: 'local' })
    },
  }
}
