// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { usePanelLayoutStore } from '../stores/panelLayout.js'

/**
 * Moving an operation popover by its grip (`TODO/ui-087`, stage 1). Every popover the toolbar
 * teleports to `<body>` shares the `.ops__popover` frame, and each one carries a `PopoverGrip`
 * (`data-popover-grip`). The drag is delegated from the window, so the frames need no refs and
 * no listeners of their own: the composable finds the grip under the pointer, then the frame
 * that holds it.
 *
 * Positions are absolute viewport pixels (`popoverLeftPx`, `popoverTopPx`), never mm: a popover is
 * screen furniture, not geometry. Once a popover has been moved its inline `left`/`top` replace the
 * centring `transform`, so the drag offset and the transform cannot fight.
 */

/** The teleported popover frame. Only `OperationsToolbar.vue` renders it. */
export const POPOVER_FRAME_SELECTOR = '.ops__popover'
/** The grip's marker attribute (`PopoverGrip.vue`). */
export const POPOVER_GRIP_ATTR = 'data-popover-grip'
/** Arrow-key step, in viewport pixels. Shift steps the larger distance. */
export const POPOVER_KEY_STEP_PX = 16
export const POPOVER_KEY_STEP_SHIFT_PX = 64

/**
 * Clamp a popover's top-left corner so the whole frame stays inside the viewport. A frame wider or
 * taller than the viewport pins to the top-left corner rather than running off the far edge. Writes
 * into `position` so a pointer handler can reuse one object per gesture.
 *
 * @param {{ left: number, top: number }} position viewport px, mutated in place
 * @param {{ width: number, height: number }} frameSize viewport px
 * @param {{ width: number, height: number }} viewportSize viewport px
 * @returns {{ left: number, top: number }} the same `position`
 */
export function clampPopoverPosition(position, frameSize, viewportSize) {
  const maxLeft = Math.max(0, viewportSize.width - frameSize.width)
  const maxTop = Math.max(0, viewportSize.height - frameSize.height)
  position.left = Math.min(Math.max(position.left, 0), maxLeft)
  position.top = Math.min(Math.max(position.top, 0), maxTop)
  return position
}

/**
 * The offset an arrow key moves the grip's popover by, or `null` for a key that does not move it.
 *
 * @param {string} key a `KeyboardEvent.key` value
 * @param {boolean} shiftKey
 * @returns {{ dx: number, dy: number } | null}
 */
export function popoverKeyStep(key, shiftKey) {
  const px = shiftKey ? POPOVER_KEY_STEP_SHIFT_PX : POPOVER_KEY_STEP_PX
  if (key === 'ArrowLeft') return { dx: -px, dy: 0 }
  if (key === 'ArrowRight') return { dx: px, dy: 0 }
  if (key === 'ArrowUp') return { dx: 0, dy: -px }
  if (key === 'ArrowDown') return { dx: 0, dy: px }
  return null
}

/** @param {Element} grip @returns {HTMLElement | null} */
function frameOf(grip) {
  return /** @type {HTMLElement | null} */ (grip.closest(POPOVER_FRAME_SELECTOR))
}

/**
 * @param {HTMLElement} frame
 * @param {{ left: number, top: number }} position already clamped
 */
function apply(frame, position) {
  frame.style.left = `${position.left}px`
  frame.style.top = `${position.top}px`
  frame.style.transform = 'none'
}

/** Back to the stylesheet's centred default. @param {HTMLElement} frame */
function reset(frame) {
  frame.style.left = ''
  frame.style.top = ''
  frame.style.transform = ''
}

/**
 * Wire the grip drag for the popover that `kind` names. Call once, from the component that owns
 * the popovers' open state.
 *
 * @param {import('vue').Ref<string | null>} kind which popover is open, or `null`
 * @returns {void}
 */
export function usePopoverDrag(kind) {
  const panel = usePanelLayoutStore()

  /** The gesture in progress, or `null`. Reused across moves: nothing allocates per pointermove. */
  /** @type {{ key: string, grip: HTMLElement, frame: HTMLElement, pointerId: number, startX: number, startY: number, originLeft: number, originTop: number, width: number, height: number } | null} */
  let drag = null
  /** Reused scratch for the clamp, one per gesture or key press. */
  const at = { left: 0, top: 0 }
  const frameSize = { width: 0, height: 0 }
  const viewportSize = { width: 0, height: 0 }

  /**
   * Clamp `candidate` against the frame's measured size and the viewport, then record and show it.
   *
   * @param {string} key
   * @param {HTMLElement} frame
   * @param {{ left: number, top: number }} candidate
   * @param {{ width: number, height: number }} size the frame's size, measured by the caller
   */
  function placeAt(key, frame, candidate, size) {
    viewportSize.width = window.innerWidth
    viewportSize.height = window.innerHeight
    clampPopoverPosition(candidate, size, viewportSize)
    panel.setPopoverPlacement(key, candidate.left, candidate.top)
    apply(frame, candidate)
  }

  /** The frame's on-screen rectangle, measured into `frameSize` and returned as its top-left. @param {HTMLElement} frame */
  function measure(frame) {
    const rect = frame.getBoundingClientRect()
    frameSize.width = rect.width
    frameSize.height = rect.height
    return { left: rect.left, top: rect.top }
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (event.button !== 0 || !kind.value) return
    const grip = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest?.(`[${POPOVER_GRIP_ATTR}]`))
    const frame = grip && frameOf(grip)
    if (!grip || !frame) return
    // Stops a text selection starting while the grip is dragged across the note above it.
    event.preventDefault()
    const origin = measure(frame)
    drag = {
      key: kind.value,
      grip,
      frame,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: origin.left,
      originTop: origin.top,
      width: frameSize.width,
      height: frameSize.height,
    }
    grip.setPointerCapture(event.pointerId)
    grip.addEventListener('pointermove', onPointerMove)
    grip.addEventListener('pointerup', endDrag)
    grip.addEventListener('pointercancel', endDrag)
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    at.left = drag.originLeft + event.clientX - drag.startX
    at.top = drag.originTop + event.clientY - drag.startY
    frameSize.width = drag.width
    frameSize.height = drag.height
    placeAt(drag.key, drag.frame, at, frameSize)
  }

  /** @param {PointerEvent} event */
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return
    const { grip } = drag
    grip.releasePointerCapture?.(event.pointerId)
    grip.removeEventListener('pointermove', onPointerMove)
    grip.removeEventListener('pointerup', endDrag)
    grip.removeEventListener('pointercancel', endDrag)
    drag = null
  }

  /** Arrow keys on a focused grip, the keyboard path to the same move. @param {KeyboardEvent} event */
  function onKeyDown(event) {
    const grip = /** @type {Element} */ (event.target).closest?.(`[${POPOVER_GRIP_ATTR}]`)
    const step = grip && popoverKeyStep(event.key, event.shiftKey)
    if (!step || !kind.value) return
    const frame = grip && frameOf(grip)
    if (!frame) return
    event.preventDefault()
    const origin = measure(frame)
    const placed = panel.popoverPlacements[kind.value]
    at.left = (placed ? placed.left : origin.left) + step.dx
    at.top = (placed ? placed.top : origin.top) + step.dy
    placeAt(kind.value, frame, at, frameSize)
  }

  /** Double-click the grip to put the popover back where the stylesheet centres it. @param {MouseEvent} event */
  function onDoubleClick(event) {
    const grip = /** @type {Element} */ (event.target).closest?.(`[${POPOVER_GRIP_ATTR}]`)
    const frame = grip && frameOf(grip)
    if (!frame || !kind.value) return
    panel.clearPopoverPlacement(kind.value)
    reset(frame)
  }

  /**
   * Re-clamp a moved popover after the window changes size, so a position saved at laptop width
   * cannot leave it off-screen at phone width.
   */
  function onResize() {
    const key = kind.value
    const placed = key && panel.popoverPlacements[key]
    const frame = placed && /** @type {HTMLElement | null} */ (document.querySelector(POPOVER_FRAME_SELECTOR))
    if (!frame) return
    measure(frame)
    at.left = placed.left
    at.top = placed.top
    placeAt(key, frame, at, frameSize)
  }

  // Reopening restores the session's position for that popover; the frame is teleported fresh, so
  // wait a tick for it to exist.
  watch(kind, async (key) => {
    if (!key) return
    await nextTick()
    const placed = panel.popoverPlacements[key]
    const frame = placed && /** @type {HTMLElement | null} */ (document.querySelector(POPOVER_FRAME_SELECTOR))
    if (!frame) return
    measure(frame)
    at.left = placed.left
    at.top = placed.top
    placeAt(key, frame, at, frameSize)
  })

  onMounted(() => {
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('resize', onResize)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('dblclick', onDoubleClick)
    window.removeEventListener('resize', onResize)
  })
}
