// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCurrentScope, onScopeDispose, watch } from 'vue'

/**
 * One module-level stack of the overlays that are open, oldest first (`TODO/ui-110`). Escape
 * closes the TOP one only, so with a popover and the Help sheet over it the key closes whichever
 * opened last, not whichever registered its listener first.
 *
 * One capture-phase `keydown` listener on `window`, installed while the stack is non-empty. It
 * swallows Escape only when it closes something, so an Escape with nothing open still reaches
 * whatever else listens for it (the sketch Line chain's "finish chain", the History strip's
 * "leave preview").
 *
 * @type {Array<{ close: () => void }>}
 */
const stack = []
let listening = false

/**
 * Predicates for Escape handlers that must stay AHEAD of the stack (the sketch Line chain's
 * "finish the chain", `Viewport.vue`). While any returns true the stack leaves the key alone.
 *
 * @type {Set<() => boolean>}
 */
const yields = new Set()

/**
 * Let something outside the stack keep first claim on Escape while `claims()` is true.
 *
 * @param {() => boolean} claims
 * @returns {() => void} Unregister.
 */
export function registerEscapeYield(claims) {
  yields.add(claims)
  return () => void yields.delete(claims)
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  const top = stack[stack.length - 1]
  if (!top) return
  for (const claims of yields) if (claims()) return
  event.preventDefault()
  event.stopImmediatePropagation()
  top.close()
}

function sync() {
  if (typeof window === 'undefined') return
  if (stack.length > 0 && !listening) {
    window.addEventListener('keydown', onKeydown, true)
    listening = true
  } else if (stack.length === 0 && listening) {
    window.removeEventListener('keydown', onKeydown, true)
    listening = false
  }
}

/**
 * Register an overlay on the stack while `isOpen()` is true. Position in the stack is the order
 * the overlays opened in. Call from `setup` (or inside an effect scope); it unregisters itself
 * when the scope ends.
 *
 * @param {() => boolean} isOpen
 * @param {() => void} close  Runs when Escape reaches this overlay at the top of the stack.
 * @returns {void}
 */
export function useOverlayStack(isOpen, close) {
  const entry = { close: () => close() }
  const remove = () => {
    const at = stack.indexOf(entry)
    if (at !== -1) stack.splice(at, 1)
    sync()
  }
  const stop = watch(
    isOpen,
    (open) => {
      remove()
      if (open) {
        stack.push(entry)
        sync()
      }
    },
    { immediate: true, flush: 'sync' },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      remove()
    })
  }
}

/**
 * How many overlays are open right now.
 *
 * @returns {number}
 */
export function overlayStackDepth() {
  return stack.length
}

/**
 * Empty the stack and drop the listener. For tests.
 *
 * @returns {void}
 */
export function resetOverlayStack() {
  stack.length = 0
  yields.clear()
  sync()
}
