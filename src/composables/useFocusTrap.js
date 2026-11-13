// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCurrentScope, nextTick, onScopeDispose, unref, watch } from 'vue'

const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [contenteditable=""], [contenteditable="true"], [tabindex]'

/**
 * Whether an element can take focus from the keyboard right now: not disabled, not
 * `tabindex="-1"`, not `hidden`, not under a `display: none` or `visibility: hidden` ancestor.
 * Walks ancestors instead of measuring layout, so it behaves the same under jsdom.
 *
 * @param {HTMLElement} element
 * @param {Element} root
 * @returns {boolean}
 */
function isTabbable(element, root) {
  if (/** @type {HTMLButtonElement} */ (element).disabled) return false
  const tabindex = element.getAttribute('tabindex')
  if (tabindex !== null && Number(tabindex) < 0) return false
  if (element.closest('[inert]')) return false
  for (let node = /** @type {Element | null} */ (element); node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false
    const style = getComputedStyle(node)
    if (style.display === 'none') return false
    if (node === element && (style.visibility === 'hidden' || style.visibility === 'collapse')) return false
    if (node === root) break
  }
  return true
}

/**
 * The elements inside `root` that Tab can reach, in DOM order.
 *
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
export function focusableWithin(root) {
  return /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(FOCUSABLE))).filter((el) => isTabbable(el, root))
}

/**
 * Open traps, oldest first. Only the last acts, so a modal opened over a modal owns Tab.
 *
 * @type {Array<{ root: () => Element | null }>}
 */
const traps = []

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  const top = traps[traps.length - 1]
  const root = top?.root()
  if (!root) return
  const items = focusableWithin(root)
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  // Move focus ourselves on every Tab, not only at the ends: Safari and Firefox on macOS do not
  // Tab to buttons by default, so "native until the last element" would leave from the last
  // field instead of wrapping.
  const active = document.activeElement
  const at = active ? items.findIndex((item) => item === active || item.contains(active)) : -1
  const step = event.shiftKey ? -1 : 1
  const next = at === -1 ? (event.shiftKey ? items.length - 1 : 0) : (at + step + items.length) % items.length
  event.preventDefault()
  items[next].focus()
}

/**
 * Keep keyboard focus inside a MODAL overlay (`TODO/ui-110`). Use it only on overlays that
 * declare `aria-modal`: a popover that is not modal must not trap.
 *
 * On open it remembers `document.activeElement`, then focuses the element marked
 * `data-autofocus`, else the first focusable one, unless the component already put focus inside.
 * Tab and Shift+Tab step through the focusable elements, wrap at both ends and pull a stray focus back in. On close it restores focus
 * to the opener, or to `<body>` when the opener is gone.
 *
 * @param {import('vue').Ref<Element | null> | (() => Element | null)} rootRef
 * @param {() => boolean} isOpen
 * @returns {void}
 */
export function useFocusTrap(rootRef, isOpen) {
  const entry = { root: () => (typeof rootRef === 'function' ? rootRef() : unref(rootRef)) }
  /** @type {Element | null} */
  let opener = null
  let active = false

  const attach = () => {
    traps.push(entry)
    if (traps.length === 1) document.addEventListener('keydown', onKeydown, true)
  }
  const detach = () => {
    const at = traps.indexOf(entry)
    if (at !== -1) traps.splice(at, 1)
    if (traps.length === 0) document.removeEventListener('keydown', onKeydown, true)
  }

  const stop = watch(
    isOpen,
    async (open) => {
      if (typeof document === 'undefined') return
      if (open && !active) {
        active = true
        opener = document.activeElement
        attach()
        await nextTick()
        const root = entry.root()
        if (!active || !root || root.contains(document.activeElement)) return
        const target = /** @type {HTMLElement | null} */ (root.querySelector('[data-autofocus]')) ?? focusableWithin(root)[0]
        target?.focus()
      } else if (!open && active) {
        active = false
        detach()
        const from = opener
        opener = null
        await nextTick()
        const here = document.activeElement
        const root = entry.root()
        // Someone moved focus somewhere deliberate while closing: leave it.
        if (here && here !== document.body && !(root && root.contains(here))) return
        if (from instanceof HTMLElement && from.isConnected) from.focus()
        else if (here instanceof HTMLElement && here !== document.body) here.blur()
      }
    },
    { immediate: true, flush: 'sync' },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      if (active) {
        active = false
        detach()
      }
    })
  }
}
