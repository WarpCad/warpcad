// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ui-092`, part 3: what the Prompts view and the Inspector's **Made by… ›** link share —
 * a request's live parts, read from the document store's prompt index (never a lineage walk in
 * a component), and a writer for the hover highlight that only ever clears what it lit itself.
 *
 * @module composables/usePromptHighlight
 */

import { computed, onBeforeUnmount, onMounted } from 'vue'

import { isBodyDrawn } from '../core/visibility.js'
import { useDocumentStore } from '../stores/document.js'
import { useHoverHighlightStore } from '../stores/hoverHighlight.js'

/**
 * One live part of a request, as a Prompts view row lists it.
 *
 * @typedef {object} PromptPart
 * @property {string} bodyId
 * @property {import('../core/prompt.js').PromptRole} role
 * @property {string} name
 * @property {boolean} drawn `false` when the user hid it (`TODO/ui-089`): it lights nothing.
 */

/**
 * A request's parts, from `documentStore.promptIndex` (built once per document version).
 *
 * @returns {{
 *   partsOf: (promptId: string) => PromptPart[],
 *   drawnIdsOf: (promptIds: readonly string[]) => string[],
 * }}
 */
export function usePromptParts() {
  const documentStore = useDocumentStore()
  const bodiesById = computed(() => new Map(documentStore.bodies.map((body) => [body.id, body])))

  /** @param {string} promptId */
  function partsOf(promptId) {
    const entries = documentStore.promptIndex.byPrompt.get(promptId) ?? []
    /** @type {PromptPart[]} */
    const parts = []
    for (const { bodyId, role } of entries) {
      const body = bodiesById.value.get(bodyId)
      if (!body) continue
      parts.push({ bodyId, role, name: body.name, drawn: isBodyDrawn(body) })
    }
    return parts
  }

  /** @param {readonly string[]} promptIds */
  function drawnIdsOf(promptIds) {
    /** @type {Set<string>} */
    const ids = new Set()
    for (const promptId of promptIds) for (const part of partsOf(promptId)) if (part.drawn) ids.add(part.bodyId)
    return [...ids]
  }

  return { partsOf, drawnIdsOf }
}

/**
 * What a prompt surface wants lit: one body (a part row), several (a request), or nothing.
 *
 * @typedef {{ bodyId: string } | { bodyIds: readonly string[] } | null} PromptHighlight
 */

/** A focus this soon after a press is the press's own focus, not a keyboard user arriving. */
export const PRESS_FOCUS_MS = 800

/**
 * Write the hover highlight for one prompt surface. Only what this surface lit is ever cleared:
 * the object list and the repair dialog share the store. Clears itself on unmount.
 *
 * Also the input rules the object list uses (`TODO/ui-049`): a hover is a **real mouse** moving —
 * never a touch, and never the phantom mouse WebKit leaves at a tap point after a reflow — and a
 * focus counts only when it is not a press's own focus, so a tap lights a row only by expanding it.
 *
 * @returns {{
 *   show: (want: PromptHighlight) => void,
 *   clear: () => void,
 *   isRealMouse: (event: PointerEvent) => boolean,
 *   notePress: () => void,
 *   isKeyboardFocus: () => boolean,
 * }}
 */
export function usePromptHighlight() {
  const hover = useHoverHighlightStore()
  /** Whether this surface's set is the one lit; the store may prune it to a new value. */
  let ownsMany = false
  /** @type {string | null} The body this surface lit as the single target. */
  let ownTarget = null

  /** @param {PromptHighlight} want */
  function show(want) {
    if (want === null) {
      clear()
      return
    }
    if ('bodyId' in want) {
      dropMany()
      hover.setHover(want.bodyId)
      ownTarget = hover.target?.bodyId === want.bodyId ? want.bodyId : null
      return
    }
    dropTarget()
    if (want.bodyIds.length === 0) {
      dropMany()
      return
    }
    hover.setHoverMany(want.bodyIds)
    ownsMany = hover.many !== null
  }

  function dropMany() {
    if (ownsMany && hover.many !== null) hover.clearHoverMany()
    ownsMany = false
  }

  function dropTarget() {
    if (ownTarget !== null) hover.clearHover({ bodyId: ownTarget, partName: null })
    ownTarget = null
  }

  function clear() {
    dropMany()
    dropTarget()
  }

  /** @type {{ x: number, y: number } | null} Where the last touch or pen press was, until a mouse moves elsewhere. */
  let phantomAt = null
  /** @param {PointerEvent} event */
  function onWindowPointerDown(event) {
    if (event.pointerType !== 'mouse') phantomAt = { x: event.clientX, y: event.clientY }
  }
  onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, { capture: true, passive: true }))

  /** @param {PointerEvent} event */
  function isRealMouse(event) {
    if (event.pointerType !== 'mouse') return false
    if (phantomAt) {
      if (Math.abs(event.clientX - phantomAt.x) < 2 && Math.abs(event.clientY - phantomAt.y) < 2) return false
      phantomAt = null
    }
    return true
  }

  let pressedAt = -Infinity
  function notePress() {
    pressedAt = performance.now()
  }
  function isKeyboardFocus() {
    return performance.now() - pressedAt >= PRESS_FOCUS_MS
  }

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true })
    clear()
  })

  return { show, clear, isRealMouse, notePress, isKeyboardFocus }
}
