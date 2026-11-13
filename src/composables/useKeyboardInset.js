// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'

/**
 * How much of the layout viewport the on-screen keyboard covers, in CSS pixels (`TODO/ui-110`).
 * Measured from `visualViewport` while `isActive()` is true; 0 where there is no `visualViewport`,
 * where the browser resizes the layout viewport itself, and while inactive.
 *
 * @param {() => boolean} isActive
 * @returns {{ keyboardInsetPx: import('vue').Ref<number> }}
 */
export function useKeyboardInset(isActive) {
  const keyboardInsetPx = ref(0)
  const measure = () => {
    const visual = window.visualViewport
    if (!visual) return
    keyboardInsetPx.value = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop))
  }
  const detach = () => {
    if (typeof window === 'undefined') return
    window.visualViewport?.removeEventListener('resize', measure)
    window.visualViewport?.removeEventListener('scroll', measure)
  }
  const stop = watch(
    isActive,
    (active) => {
      if (typeof window === 'undefined') return
      detach()
      keyboardInsetPx.value = 0
      if (!active) return
      window.visualViewport?.addEventListener('resize', measure)
      window.visualViewport?.addEventListener('scroll', measure)
      measure()
    },
    { immediate: true },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      detach()
    })
  }
  return { keyboardInsetPx }
}
