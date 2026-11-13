// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCurrentScope, onScopeDispose, unref, watch } from 'vue'

/**
 * Run `close` on a press outside `rootRef`, while `isOpen()` is true (`TODO/ui-110`). One
 * capture-phase `pointerdown` listener on `document`, attached only while open. It only observes:
 * the press is never prevented or stopped, so a tap on the viewport still selects and a tap on
 * another launcher still opens it.
 *
 * `ignore` lists elements (or getters for them, or refs) that count as inside, typically the
 * control that opened the overlay, so its own press does not close and re-open it.
 *
 * @param {import('vue').Ref<Element | null> | (() => Element | null)} rootRef
 * @param {() => boolean} isOpen
 * @param {(event: Event) => void} close
 * @param {{ ignore?: Array<Element | null | (() => Element | null) | import('vue').Ref<Element | null>> }} [options]
 * @returns {void}
 */
export function useOutsideClick(rootRef, isOpen, close, options = {}) {
  /** @param {Event} event */
  const onPointerDown = (event) => {
    const target = /** @type {Node | null} */ (event.target)
    if (!target) return
    const root = typeof rootRef === 'function' ? rootRef() : unref(rootRef)
    if (root?.contains(target)) return
    for (const item of options.ignore ?? []) {
      const element = typeof item === 'function' ? item() : unref(item)
      if (element?.contains(target)) return
    }
    close(event)
  }
  let attached = false
  const detach = () => {
    if (!attached) return
    attached = false
    document.removeEventListener('pointerdown', onPointerDown, true)
  }
  const stop = watch(
    isOpen,
    (open) => {
      detach()
      if (open && typeof document !== 'undefined') {
        document.addEventListener('pointerdown', onPointerDown, true)
        attached = true
      }
    },
    { immediate: true, flush: 'sync' },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      detach()
    })
  }
}
