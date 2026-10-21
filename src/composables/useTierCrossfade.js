// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A crossfade for a panel's tier change (`TODO/ui-079`).
 *
 * A label width that transitions inside a `flex-wrap` row re-wraps on every frame and jumps, so a
 * tier change is not animated by width at all. Instead the content swaps in the same frame the
 * panel dips to a low opacity, and the panel fades back up. The CSS owns the look: a one-shot
 * `opacity 0.4 → 1` animation over {@link CROSSFADE_MS} while `fading` is true. It is an
 * animation keyed on the flag, never a standing `opacity` transition, so anything else that sets
 * the panel's opacity takes effect at once.
 *
 * Only a *tier* change fades; a width change inside one tier never reaches the watcher, because
 * the source is the tier name, not the width. The first value is taken as-is with no fade, so
 * the first frame is already right. Under `prefers-reduced-motion: reduce` the swap is instant.
 *
 * @module composables/useTierCrossfade
 */

import { onBeforeUnmount, ref, watch } from 'vue'

/** How long the fade back up runs, in ms. The CSS animation's duration must match. */
export const CROSSFADE_MS = 150

/** @returns {boolean} */
function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * @template {string} T
 * @param {() => T} source the tier to follow (a getter over the layout store)
 * @returns {{ tier: import('vue').Ref<T>, fading: import('vue').Ref<boolean> }} `tier` is what to
 *   render; `fading` is true from the swap until the fade back up has run.
 */
export function useTierCrossfade(source) {
  const tier = /** @type {import('vue').Ref<T>} */ (ref(source()))
  const fading = ref(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer

  function cancel() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  watch(source, (next) => {
    tier.value = next
    cancel()
    if (prefersReducedMotion()) {
      fading.value = false
      return
    }
    fading.value = true
    timer = setTimeout(() => {
      timer = undefined
      fading.value = false
    }, CROSSFADE_MS)
  })

  onBeforeUnmount(cancel)

  return { tier, fading }
}
