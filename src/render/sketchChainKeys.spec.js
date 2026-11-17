// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createSketchChainKeys } from './sketchChainKeys.js'

/**
 * @param {Partial<KeyboardEvent> & { key: string }} init
 * @returns {KeyboardEvent}
 */
function key(init) {
  const event = {
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    ...init,
  }
  event.preventDefault = vi.fn(() => {
    event.defaultPrevented = true
  })
  return /** @type {KeyboardEvent} */ (/** @type {unknown} */ (event))
}

function setup(editor = {}, { sketching = true, textEntry = false } = {}) {
  const sketchEditor = {
    tool: 'line',
    imageTool: 'none',
    chainLive: true,
    escapeChain: vi.fn(() => 'finished'),
    finishChain: vi.fn(),
    undoPoint: vi.fn(),
    cancelScale: vi.fn(),
    finishTrace: vi.fn(),
    ...editor,
  }
  const redraw = vi.fn()
  const handler = createSketchChainKeys({ isSketching: () => sketching, sketchEditor, isTextEntry: () => textEntry, redraw })
  return { handler, sketchEditor, redraw }
}

describe('createSketchChainKeys', () => {
  it('Esc finishes or cancels the chain and redraws when handled', () => {
    const { handler, sketchEditor, redraw } = setup()
    const event = key({ key: 'Escape' })
    handler(event)
    expect(sketchEditor.escapeChain).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(redraw).toHaveBeenCalledTimes(1)
  })

  it('leaves Esc alone when there is nothing to finish', () => {
    const { handler, redraw } = setup({ escapeChain: vi.fn(() => 'none') })
    const event = key({ key: 'Escape' })
    handler(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(redraw).not.toHaveBeenCalled()
  })

  it('ignores a repeated Esc', () => {
    const { handler, sketchEditor } = setup()
    handler(key({ key: 'Escape', repeat: true }))
    expect(sketchEditor.escapeChain).not.toHaveBeenCalled()
  })

  it('Enter finishes only with a live chain', () => {
    const live = setup()
    live.handler(key({ key: 'Enter' }))
    expect(live.sketchEditor.finishChain).toHaveBeenCalledTimes(1)
    const idle = setup({ chainLive: false })
    const event = key({ key: 'Enter' })
    idle.handler(event)
    expect(idle.sketchEditor.finishChain).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('Backspace removes the last point, but Shift+Backspace and an idle chain do not', () => {
    const live = setup()
    live.handler(key({ key: 'Backspace' }))
    expect(live.sketchEditor.undoPoint).toHaveBeenCalledTimes(1)
    live.handler(key({ key: 'Backspace', shiftKey: true }))
    expect(live.sketchEditor.undoPoint).toHaveBeenCalledTimes(1)
    const idle = setup({ chainLive: false })
    idle.handler(key({ key: 'Backspace' }))
    expect(idle.sketchEditor.undoPoint).not.toHaveBeenCalled()
  })

  it('does nothing in a text field, with a modifier, with another tool, or outside the editor', () => {
    const cases = [
      setup({}, { textEntry: true }),
      setup(),
      setup({ tool: 'select' }),
      setup({}, { sketching: false }),
    ]
    cases[0].handler(key({ key: 'Escape' }))
    cases[1].handler(key({ key: 'Escape', ctrlKey: true }))
    cases[2].handler(key({ key: 'Escape' }))
    cases[3].handler(key({ key: 'Escape' }))
    for (const { sketchEditor } of cases) expect(sketchEditor.escapeChain).not.toHaveBeenCalled()
  })

  it('Esc stands down an armed Set scale or Auto-trace whatever the tool', () => {
    const scale = setup({ imageTool: 'scale', tool: 'select' })
    scale.handler(key({ key: 'Escape' }))
    expect(scale.sketchEditor.cancelScale).toHaveBeenCalledTimes(1)
    const trace = setup({ imageTool: 'trace', tool: 'select' })
    trace.handler(key({ key: 'Escape' }))
    expect(trace.sketchEditor.finishTrace).toHaveBeenCalledTimes(1)
  })
})
