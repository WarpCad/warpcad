/**
 * Whether sketch mode is active — UI state, hoisted out of `Viewport.vue`
 * (`TODO/ui-041`).
 *
 * It used to be a private ref of the viewport, on the argument that nothing outside
 * the viewport needs to know. The Objects list is the first thing that does: in sketch
 * mode a click on a solid deliberately selects nothing (a body in the selection would
 * light a Union button in a mode where that toolbar is hidden), so a list row that
 * *did* select one would be a second, unguarded route to exactly that state. The list
 * reads this to disable itself and say why.
 *
 * The viewport is still the only thing that switches it, and clears it when it goes
 * away, so the original worry — a mode left on by something with no way to turn it off
 * — does not come back.
 *
 * @module stores/sketchMode
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSketchModeStore = defineStore('sketchMode', () => {
  const active = ref(false)
  return { active }
})
