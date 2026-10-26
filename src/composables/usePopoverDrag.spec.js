// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  POPOVER_KEY_STEP_PX,
  POPOVER_KEY_STEP_SHIFT_PX,
  clampPopoverPosition,
  popoverKeyStep,
} from './usePopoverDrag.js'

const VIEWPORT = { width: 1440, height: 900 }
const FRAME = { width: 352, height: 520 }

describe('clampPopoverPosition', () => {
  it('leaves a position that already fits untouched', () => {
    const position = clampPopoverPosition({ left: 200, top: 64 }, FRAME, VIEWPORT)
    expect(position.left).toBeCloseTo(200, 6)
    expect(position.top).toBeCloseTo(64, 6)
  })

  it('clamps at the left, top, right and bottom edges', () => {
    const left = clampPopoverPosition({ left: -40, top: 64 }, FRAME, VIEWPORT)
    expect(left.left).toBeCloseTo(0, 6)

    const top = clampPopoverPosition({ left: 200, top: -12 }, FRAME, VIEWPORT)
    expect(top.top).toBeCloseTo(0, 6)

    // The far edge: the frame's own right and bottom must stay inside the viewport.
    const right = clampPopoverPosition({ left: 1200, top: 64 }, FRAME, VIEWPORT)
    expect(right.left).toBeCloseTo(1440 - 352, 6)

    const bottom = clampPopoverPosition({ left: 200, top: 800 }, FRAME, VIEWPORT)
    expect(bottom.top).toBeCloseTo(900 - 520, 6)
  })

  it('pins a zero-size frame to the viewport bounds it is given', () => {
    const position = clampPopoverPosition({ left: 1500, top: 950 }, { width: 0, height: 0 }, VIEWPORT)
    expect(position.left).toBeCloseTo(1440, 6)
    expect(position.top).toBeCloseTo(900, 6)
  })

  it('pins a frame larger than the viewport to the top-left corner, not a negative offset', () => {
    const position = clampPopoverPosition({ left: 300, top: 300 }, { width: 2000, height: 1200 }, VIEWPORT)
    expect(position.left).toBeCloseTo(0, 6)
    expect(position.top).toBeCloseTo(0, 6)
  })

  it('re-clamps a position saved at a wider viewport when the viewport narrows', () => {
    // A popover dragged to the right edge at laptop width (1440) is re-clamped at phone width (390).
    const phone = { width: 390, height: 844 }
    const frame = { width: 342, height: 520 }
    const position = clampPopoverPosition({ left: 1100, top: 64 }, frame, phone)
    expect(position.left).toBeCloseTo(390 - 342, 6)
    expect(position.top).toBeCloseTo(64, 6)
  })

  it('writes into the object it is given, so a pointer handler can reuse one', () => {
    const position = { left: -5, top: -5 }
    const returned = clampPopoverPosition(position, FRAME, VIEWPORT)
    expect(returned).toBe(position)
    expect(position.left).toBeCloseTo(0, 6)
    expect(position.top).toBeCloseTo(0, 6)
  })
})

describe('popoverKeyStep', () => {
  it('moves by the normal step for each arrow key', () => {
    expect(popoverKeyStep('ArrowLeft', false)).toEqual({ dx: -POPOVER_KEY_STEP_PX, dy: 0 })
    expect(popoverKeyStep('ArrowRight', false)).toEqual({ dx: POPOVER_KEY_STEP_PX, dy: 0 })
    expect(popoverKeyStep('ArrowUp', false)).toEqual({ dx: 0, dy: -POPOVER_KEY_STEP_PX })
    expect(popoverKeyStep('ArrowDown', false)).toEqual({ dx: 0, dy: POPOVER_KEY_STEP_PX })
  })

  it('moves by the larger step with Shift held', () => {
    expect(popoverKeyStep('ArrowLeft', true)).toEqual({ dx: -POPOVER_KEY_STEP_SHIFT_PX, dy: 0 })
    expect(popoverKeyStep('ArrowDown', true)).toEqual({ dx: 0, dy: POPOVER_KEY_STEP_SHIFT_PX })
  })

  it('returns null for keys that do not move the popover', () => {
    expect(popoverKeyStep('Escape', false)).toBeNull()
    expect(popoverKeyStep('a', false)).toBeNull()
    expect(popoverKeyStep('Enter', true)).toBeNull()
  })

  it('keeps the documented step sizes: 16 px, and 64 px with Shift', () => {
    expect(POPOVER_KEY_STEP_PX).toBe(16)
    expect(POPOVER_KEY_STEP_SHIFT_PX).toBe(64)
  })
})
