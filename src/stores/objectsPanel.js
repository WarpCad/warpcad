/**
 * The Objects list's state and its one action — **UI only** (`TODO/ui-041`).
 *
 * The list exists because a body can be entirely inside another, and every other
 * selection route in the app is a raycast that hits the enclosing solid first. Its rows
 * name a body and select it through the **ordinary** selection store, so a body picked
 * from here is indistinguishable, downstream, from a clicked one: same highlight, same
 * Inspector, same gizmo, same count gate for the Operations toolbar.
 *
 * ## Two selections, still never one (`data-002` §13)
 *
 * A History row is a *timeline step*; an Objects row is a *body*. This store touches
 * `useSelectionStore` and never `useTimelineStore.selectRow`, and the timeline store
 * never touches this one — the same separation §13 confirmed. The only thing the two
 * panels share is the one bottom dock/sheet slot, which `AppView.vue` arbitrates so at
 * most one of them is open at a time.
 *
 * ## What the rows show
 *
 * Whatever the viewport is *announcing* — {@link BodySummary}s from the live document,
 * or from the previewed prefix while History is previewing. It reads the same two
 * sources `Viewport.vue`'s `announcedBodies` does, so the list cannot name a body the
 * scene does not contain: a body past a rollback marker, or one whose step is
 * suppressed, has no summary at all and therefore no row.
 *
 * @module stores/objectsPanel
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { formatMmValue } from '../core/units.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useSketchModeStore } from './sketchMode.js'
import { useTimelineStore } from './timeline.js'

/**
 * @typedef {object} ObjectRow
 * @property {string} id A body's lineage-root id — what the selection store holds.
 * @property {string} name Display name (`Cube 1`, `Bolt 1`).
 * @property {string} size `W × D × H mm`, off the world-axis bounding box — what tells a
 *   40 mm shell from the 10 mm bolt inside it when both are called something generic.
 * @property {boolean} selected
 * @property {number} order 1-based position in the selection (1 = Subtract's base), or 0.
 * @property {'base' | 'secondary' | 'none'} role
 */

export const useObjectsPanelStore = defineStore('objectsPanel', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const timeline = useTimelineStore()
  const sketchMode = useSketchModeStore()

  /** Default closed on every device, every load, like History (§13). Not persisted. */
  const open = ref(false)

  /**
   * Why the rows cannot select right now, or `''`. Printed in the panel rather than
   * left as a silently dead list — the "looks live but isn't" class.
   */
  const disabledReason = computed(() => {
    if (timeline.previewing) return 'Previewing history — read-only. Go back to the latest state to select.'
    if (sketchMode.active) return 'Sketch mode — leave it to select solids.'
    return ''
  })

  /** The scene as announced: the previewed prefix while previewing, else the live one. */
  const bodies = computed(() => timeline.previewBodies ?? documentStore.bodies)

  /** @type {import('vue').ComputedRef<ObjectRow[]>} */
  const rows = computed(() =>
    bodies.value.map((body) => {
      const index = selection.ids.indexOf(body.id)
      const [min, max] = body.bounds
      return {
        id: body.id,
        name: body.name,
        size: `${formatMmValue(max[0] - min[0])} × ${formatMmValue(max[1] - min[1])} × ${formatMmValue(max[2] - min[2])} mm`,
        selected: index !== -1,
        order: index + 1,
        role: index === -1 ? 'none' : index === 0 ? 'base' : 'secondary',
      }
    })
  )

  /** @param {boolean} next */
  function setOpen(next) {
    open.value = next
  }

  function toggle() {
    setOpen(!open.value)
  }

  /**
   * Select the body a row names.
   *
   * - **Plain** — the row becomes the whole selection, and any pick depth is dropped: a
   *   row names a *body*, so choosing it means the whole body, the way a first click on
   *   a group in the viewport does.
   * - **Additive** — Shift/Ctrl/Cmd-click on the row, or the row's own check button,
   *   which is how a touch screen (no Shift key) reaches "2 selected". Exactly what
   *   Shift-click in the viewport does: `toggle`, which is also the one path that
   *   leaves a pick depth alone, so `ui-040`'s sub-part operands still compose.
   *
   * A no-op while {@link disabledReason} is set, and for an id the announced scene
   * does not contain — never a selection of a body that is not there.
   *
   * @param {string} id
   * @param {boolean} [additive]
   * @returns {boolean} Whether the selection changed.
   */
  function choose(id, additive = false) {
    if (disabledReason.value) return false
    if (!bodies.value.some((body) => body.id === id)) return false
    if (additive) {
      selection.toggle(id)
    } else {
      selection.select(id)
      selection.stepUp()
    }
    return true
  }

  return { open, bodies, rows, disabledReason, setOpen, toggle, choose }
})
