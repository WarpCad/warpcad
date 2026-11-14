// SPDX-License-Identifier: AGPL-3.0-or-later
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Whether a CSS media query matches right now, kept current while the component is mounted
 * (`TODO/ui-116`: a popover that is inline on a tablet and a sheet on a phone picks its frame in
 * script, because a stylesheet cannot swap a component). No `matchMedia` (a test double, an old
 * engine) reads as `false`.
 *
 * @param {string} query A media query, such as `(max-width: 640px)`.
 * @returns {import('vue').Ref<boolean>}
 */
export function useMediaQuery(query) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const matches = ref(supported && window.matchMedia(query).matches)
  /** @type {MediaQueryList | null} */
  let list = null
  /** @param {MediaQueryListEvent} event */
  const onChange = (event) => {
    matches.value = event.matches
  }
  onMounted(() => {
    if (typeof window.matchMedia !== 'function') return
    list = window.matchMedia(query)
    matches.value = list.matches
    list.addEventListener?.('change', onChange)
  })
  onBeforeUnmount(() => list?.removeEventListener?.('change', onChange))
  return matches
}
