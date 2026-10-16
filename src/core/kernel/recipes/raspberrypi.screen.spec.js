// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../document.js'
import { parseProject } from '../../project.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluateOp } from '../index.js'
import { paramOptions, registry } from '../registry.js'
import { hyperPixel4Rectangular } from './raspberrypi.hyperPixel4Rectangular.js'
import { miniPiTFT } from './raspberrypi.miniPiTFT.js'
import { piTFT22 } from './raspberrypi.piTFT22.js'
import { piTFT24 } from './raspberrypi.piTFT24.js'
import { DEFAULT_SCREEN_MODEL, SCREEN_MODELS, screen } from './raspberrypi.screen.js'
import { touchDisplay7inch } from './raspberrypi.touchDisplay7inch.js'
import { touchScreen2 } from './raspberrypi.touchScreen2.js'

/** @typedef {import('../group.js').Group} Group */

/**
 * The oracle: each screen's own, unmodified recipe. The dispatcher must hand back
 * exactly what these do — it recombines Library rows, not geometry (`TODO/core-058`).
 */
const RECIPES = Object.freeze({
  touchDisplay7inch,
  touchScreen2,
  hyperPixel4Rectangular,
  miniPiTFT,
  piTFT22,
  piTFT24,
})

/**
 * Each screen as its own pre-core-058 op builds it, measured off that code before the
 * dispatcher existed and pinned by hand. Millimetres, Z-up, in each recipe's own frame.
 * A drift here means one of the six recipes changed, which this task must never do.
 */
const PINNED = Object.freeze({
  touchDisplay7inch: {
    names: ['lens', 'backPlate', 'screenMountingPad1', 'screenMountingPad2', 'screenMountingPad3', 'screenMountingPad4', 'piMountingPad1', 'piMountingPad2', 'piMountingPad3', 'piMountingPad4'],
    bounds: [[0, 0, 0], [192.96, 110.76, 22.41]],
  },
  touchScreen2: {
    names: ['lens', 'backPlate', 'overHang', 'backPlateCover', 'screenMountingPad1', 'screenMountingPad2', 'screenMountingPad3', 'screenMountingPad4', 'piMountingPost1', 'piMountingPost2', 'piMountingPost3', 'piMountingPost4'],
    bounds: [[0, 0, 0], [143.4, 91.46, 15.2]],
  },
  hyperPixel4Rectangular: {
    names: ['mb', 'lcd', 'pad1', 'pad2', 'pad3', 'pad4'],
    bounds: [[-48.925, -29.22, -16.98], [48.925, 29.22, 7.34]],
  },
  miniPiTFT: {
    names: ['board', 'screen', 'display', 'button1', 'button2'],
    bounds: [[0, 1.016, 0], [38.1, 25.4, 5]],
  },
  piTFT22: {
    names: ['gpio', 'mb', 'lcd', 'lcdbevel', 'button1', 'button2', 'button3', 'button4'],
    bounds: [[0, 0, -8.72], [65.02, 56.39, 5.62]],
  },
  piTFT24: {
    names: ['mb', 'gpio', 'lcd', 'lcdbevel', 'buttons'],
    bounds: [[0, 0, -8.72], [65.02, 56.39, 5.67]],
  },
})

/**
 * @param {unknown} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/**
 * @param {Group} group
 * @param {number[][]} expected
 */
function expectBounds(group, expected) {
  const [min, max] = boundsOf(group)
  for (let axis = 0; axis < 3; axis += 1) {
    expect(min[axis]).toBeCloseTo(expected[0][axis], 6)
    expect(max[axis]).toBeCloseTo(expected[1][axis], 6)
  }
}

describe('raspberrypi.screen — one Library row for six screens (TODO/core-058)', () => {
  it('lists the six screens, in the order the panel has always shown them', () => {
    expect([...SCREEN_MODELS]).toEqual([
      'touchDisplay7inch',
      'touchScreen2',
      'hyperPixel4Rectangular',
      'miniPiTFT',
      'piTFT22',
      'piTFT24',
    ])
    expect(Object.isFrozen(SCREEN_MODELS)).toBe(true)
    expect(SCREEN_MODELS).toContain(DEFAULT_SCREEN_MODEL)
  })

  it.each(Object.keys(RECIPES))('dispatches %s to that screen’s own recipe, byte-identical', (model) => {
    const direct = RECIPES[/** @type {keyof typeof RECIPES} */ (model)]({})
    expect(JSON.stringify(screen({ model }))).toBe(JSON.stringify(direct))
  })

  it('builds the 7-inch Touch Display when a record carries no model', () => {
    expect(DEFAULT_SCREEN_MODEL).toBe('touchDisplay7inch')
    expect(JSON.stringify(screen({}))).toBe(JSON.stringify(touchDisplay7inch({})))
  })

  it('rejects an unknown model rather than guessing, worded the way bplus words it', () => {
    expect(() => screen({ model: 'hyperPixel4Square' })).toThrow(
      'raspberrypi.screen: unknown model "hyperPixel4Square", expected one of ' +
        'touchDisplay7inch | touchScreen2 | hyperPixel4Rectangular | miniPiTFT | piTFT22 | piTFT24'
    )
    expect(() => screen({ model: 4 })).toThrow(/unknown model 4/)
  })

  it.each(Object.keys(PINNED))('builds %s with the parts and bounds its own op always had', (model) => {
    const pinned = PINNED[/** @type {keyof typeof PINNED} */ (model)]
    const group = asGroup(evaluateOp('raspberrypi.screen', { model }))
    expect(group.names).toEqual(pinned.names)
    expectBounds(group, pinned.bounds)
  })

  it('offers a Screen model choice with the six labels the panel shows, before the drag and in the Inspector', () => {
    const ui = registry['raspberrypi.screen'].ui
    expect(ui?.label).toBe('Raspberry Pi Screen')
    expect(ui?.defaults).toEqual({ model: 'touchDisplay7inch' })
    expect(ui?.choice?.param).toBe('model')
    expect(ui?.choice?.label).toBe('Screen model')
    expect(ui?.choice?.options.map((option) => option.value)).toEqual([...SCREEN_MODELS])
    expect(ui?.choice?.options.map((option) => option.label)).toEqual([
      '7-inch Touch Display',
      'Touchscreen 2',
      'HyperPixel 4',
      'Mini PiTFT',
      'PiTFT 2.2',
      'PiTFT 2.4',
    ])
    // The Inspector reads the very same option objects, so the two can never disagree.
    const inspector = paramOptions('raspberrypi.screen', { model: 'touchScreen2' })
    expect(Object.keys(inspector)).toEqual(['model'])
    expect(inspector.model).toMatchObject({ kind: 'enum', label: 'Screen model' })
    expect(/** @type {import('../registry.js').EnumParamSchema} */ (inspector.model).options).toBe(
      ui?.choice?.options
    )
  })

  it('names a dropped screen after the model chosen, not after the row', () => {
    const nameFor = registry['raspberrypi.screen'].ui?.nameFor
    expect(nameFor?.({ model: 'touchScreen2' })).toBe('Touchscreen 2')
    expect(nameFor?.({ model: 'miniPiTFT' })).toBe('Mini PiTFT')
    expect(nameFor?.({})).toBe('7-inch Touch Display')
  })

  it('declares no part aliases — six unrelated products share no connector', () => {
    // BPLUS_PART_ALIASES exists because Pi revisions rename the same connector. Nothing
    // here is the same part under two names, so a model change that orphans a Snap/Align
    // is left to ui-052's repair dialog to suggest nothing for, on purpose.
    expect(registry['raspberrypi.screen']).toMatchObject({ kind: 'composite', operandCount: 0 })
  })
})

describe('pre-core-058 screen records still replay (TODO/core-058)', () => {
  // A project saved before the row collapse carries `{ op: 'raspberrypi.touchScreen2',
  // params: {} }` and no model. Those six ops keep their registry entries — only their
  // Library rows went — so each still evaluates to exactly what it always did.
  it.each(Object.keys(PINNED))('raspberrypi.%s with no params builds unchanged', (model) => {
    const op = `raspberrypi.${model}`
    expect(registry[op], op).toMatchObject({ kind: 'composite', operandCount: 0 })
    expect(registry[op].ui, `${op} is replay-only now, not a Library row`).toBeUndefined()
    const pinned = PINNED[/** @type {keyof typeof PINNED} */ (model)]
    const group = asGroup(evaluateOp(op, {}))
    expect(group.names).toEqual(pinned.names)
    expectBounds(group, pinned.bounds)
  })

  it('loads a saved project of all six old records through the real loader', () => {
    const text = Object.keys(PINNED)
      .map((model) => JSON.stringify({ id: model, op: `raspberrypi.${model}`, name: `${model} 1`, params: {} }))
      .join('\n')
    const parsed = parseProject(text)
    const document = createDocument()
    document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    for (const [model, pinned] of Object.entries(PINNED)) {
      const body = document.bodies().find((candidate) => candidate.id === model)
      expect(body, model).toBeDefined()
      expectBounds(asGroup(body?.geometry), pinned.bounds)
    }
  })
})
