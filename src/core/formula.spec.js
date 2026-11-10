// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import formulaSource from './formula.js?raw'
import {
  FORMULA_FUNCTIONS,
  FORMULA_LIMITS,
  FormulaError,
  calculateFormula,
  checkFormula,
  evaluateFormula,
  formulaReferences,
  formulaToDisplay,
  formulaToStored,
  measureBounds,
  parseFormula,
  printFormula,
  rewriteFormula,
} from './formula.js'

/** @typedef {import('./formula.js').FormulaBody} FormulaBody */
/** @typedef {import('./formula.js').FormulaQuantity} FormulaQuantity */
/** @typedef {import('./formula.js').FormulaVariable} FormulaVariable */

const TOLERANCE_DIGITS = 9 // 1e-9, pure arithmetic

/**
 * Bounds as JSCAD's `measureBoundingBox` gives them: `[[minX, minY, minZ], [maxX, maxY, maxZ]]`.
 *
 * @param {[number, number, number]} min
 * @param {[number, number, number]} max
 * @returns {[[number, number, number], [number, number, number]]}
 */
function box(min, max) {
  return [min, max]
}

/**
 * A fake scene: body key (`name` or `#id`) → its bounds and named parts. Lookups go through
 * `Map`s only, as the real reader must.
 *
 * @typedef {{ bounds: [[number, number, number], [number, number, number]], parts?: Map<string, [[number, number, number], [number, number, number]]> }} FakeBody
 */

/** @type {Map<string, FakeBody>} */
const scene = new Map([
  ['group1', { bounds: box([0, 0, 0], [60, 40, 10]), parts: new Map([['part1', box([0, 0, 0], [60, 10, 10])], ['part2', box([0, 0, 0], [40, 10, 10])]]) }],
  ['azmount', { bounds: box([0, 0, 0], [30, 80, 10]) }],
  ['plate', { bounds: box([0, 0, 0], [30, 50, 2]) }],
  ['cutouts', { bounds: box([0, 0, 0], [80, 60, 5]), parts: new Map([['piholes', box([-29, -24.5, 0], [29, 24.5, 5])]]) }],
  ['cameraCase', { bounds: box([0, 0, 0], [40, 40, 27]), parts: new Map([['caseShell', box([0, 0, -13.5], [40, 40, 13.5])], ['interiorVolume', box([1, 1, -12], [39, 39, 12])]]) }],
  ['box', { bounds: box([0, 0, 0], [100, 70, 40]), parts: new Map([['top', box([0, 0, 37], [100, 70, 40])], ['pi-mb', box([5, 5, 11], [90, 61, 12.5])]]) }],
  ['BPlus', { bounds: box([0, 0, 0], [85, 56, 17.6]), parts: new Map([['mb', box([0, 0, 0], [85, 56, 1.6])], ['usb1', box([70, 2, 1.6], [87, 15, 17.6])]]) }],
  ['deskMount', { bounds: box([0, 0, 0], [50, 50, 50]), parts: new Map([['lowerBolt-head', box([0, 0, 0], [10, 10, 5.5])]]) }],
  ['lcd', { bounds: box([0, 0, 0], [164.9, 100, 7.2]) }],
  ['knob', { bounds: box([0, 0, -12.5], [10, 10, 0]) }],
  ['a', { bounds: box([-5, -2, 1], [5, 2, 4]), parts: new Map([['b', box([0, 0, 0], [3, 3, 3])], ['min', box([0, 0, 0], [1, 1, 7])], ['width', box([0, 0, 0], [1, 1, 9])]]) }],
  ['Cube 1', { bounds: box([0, 0, 0], [12, 1, 1]) }],
  ['#cube-a1-3', { bounds: box([0, 0, 0], [33, 1, 1]) }],
  ['pi', { bounds: box([0, 0, 0], [10, 10, 10]), parts: new Map([['board', box([0, 0, 0], [85, 56, 1.6])]]) }],
])

/**
 * The fake reader the spec hands the evaluator.
 *
 * @param {FormulaBody} body
 * @param {string | null} part
 * @param {FormulaQuantity} quantity
 * @returns {number}
 */
function read(body, part, quantity) {
  const key = body.kind === 'id' ? `#${body.text}` : body.text
  const entry = scene.get(key)
  if (entry === undefined) throw new FormulaError(`no body named ${body.text}`, { code: 'reference' })
  if (part === null) return measureBounds(entry.bounds, quantity)
  const bounds = entry.parts?.get(part)
  if (bounds === undefined) throw new FormulaError(`${body.text} has no part ${part}`, { code: 'reference' })
  return measureBounds(bounds, quantity)
}

/** @type {Map<string, FormulaVariable>} */
const variables = new Map([
  ['topBottomThickness', { kind: 'number', value: 3 }],
  ['thickness', { kind: 'number', value: 10 }],
  ['nozzel', { kind: 'number', value: 0.4 }],
  ['pi', { kind: 'number', value: 2 }],
  ['yes', { kind: 'boolean', value: true }],
  ['no', { kind: 'boolean', value: false }],
  ['piModel', { kind: 'enum', value: 4, options: [{ value: 4 }, { value: 5 }] }],
  ['finish', { kind: 'enum', value: 'matte', options: [{ value: 'matte' }, { value: 'gloss' }] }],
  ['broken', { kind: 'number', error: 'a → b → a' }],
])

/**
 * @param {string} text
 * @param {{ variables?: Map<string, FormulaVariable>, read?: typeof read, budget?: { visits: number } }} [context]
 * @returns {number}
 */
function calc(text, context = {}) {
  return calculateFormula(text, { variables, read, ...context })
}

/**
 * The FormulaError `fn` throws; fails the test when it throws nothing or something else.
 *
 * @param {() => unknown} fn
 * @returns {FormulaError}
 */
function formulaErrorOf(fn) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(FormulaError)
    return /** @type {FormulaError} */ (error)
  }
  throw new Error('expected a FormulaError, nothing was thrown')
}

describe('FORMULA_LIMITS — the caps from the Security section', () => {
  it('holds the stated values, frozen', () => {
    expect(FORMULA_LIMITS).toEqual({
      maxLength: 1000,
      maxNodes: 256,
      maxDepth: 32,
      maxArgs: 16,
      maxChainDepth: 32,
      maxPartReads: 32,
      maxNodeVisitsPerFold: 1_000_000,
    })
    expect(Object.isFrozen(FORMULA_LIMITS)).toBe(true)
  })

  it('lists every function with its argument count, frozen', () => {
    expect(FORMULA_FUNCTIONS.map((entry) => entry.name)).toEqual([
      'abs', 'min', 'max', 'clamp', 'round', 'floor', 'ceil', 'roundTo', 'floorTo', 'ceilTo',
      'sqrt', 'pow', 'hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan2', 'pi', 'inch', 'if',
    ])
    expect(Object.isFrozen(FORMULA_FUNCTIONS)).toBe(true)
    for (const entry of FORMULA_FUNCTIONS) {
      expect(Object.isFrozen(entry)).toBe(true)
      expect(entry.minArgs).toBeLessThanOrEqual(entry.maxArgs)
      expect(entry.maxArgs).toBeLessThanOrEqual(FORMULA_LIMITS.maxArgs)
    }
  })
})

describe('the real JSCAD lines, against a fake scene with hand-worked values', () => {
  const cases = /** @type {const} */ ([
    ['owner’s example', 'group1.part1.width - (group1.part2.width / 2)', 60 - 40 / 2],
    ['guide-mount:444', '(azmount.depth - plate.depth) / 2', (80 - 50) / 2],
    ['scope-pi:374', 'cutouts.piholes.width + 5', 58 + 5],
    ['picam-2:381', 'cameraCase.caseShell.height / 2', 27 / 2],
    ['picam3:448', 'box.top.max.z - box.[pi-mb].max.z - topBottomThickness / 2', 40 - 12.5 - 1.5],
    ['pitablet:191', 'max(BPlus.mb.max.z, BPlus.usb1.max.z) - min(BPlus.mb.min.z, BPlus.usb1.min.z)', 17.6 - 0],
    ['headphone-stand:405', 'deskMount.[lowerBolt-head].height * 2', 11],
    ['pitablet:76', 'thickness - lcd.height', 10 - 7.2],
    ['nearest.over', 'ceilTo(2.5, 0.2)', 2.6],
    ['util.inch', 'inch(3 / 8)', 9.525],
    ['picam-touch:1056', 'abs(knob.min.z)', 12.5],
    ['picam3:129', '0.6 * 9', 5.4],
    ['scope-pi:62', 'nozzel * 3', 1.2],
    ['a hidden part is readable', 'cameraCase.interiorVolume.height', 24],
  ])

  for (const [where, text, expected] of cases) {
    it(`${where}: ${text}`, () => {
      expect(calc(text)).toBeCloseTo(expected, TOLERANCE_DIGITS)
    })
  }

  it('reads center and size per axis', () => {
    expect(calc('cutouts.piholes.center.x')).toBeCloseTo(0, TOLERANCE_DIGITS)
    expect(calc('a.center.z')).toBeCloseTo(2.5, TOLERANCE_DIGITS)
    expect(calc('a.size.y')).toBeCloseTo(4, TOLERANCE_DIGITS)
    expect(calc('a.size.x')).toBe(calc('a.width'))
    expect(calc('a.size.z')).toBe(calc('a.height'))
  })
})

describe('precedence and associativity', () => {
  it.each(/** @type {const} */ ([
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['10-2-3', 5],
    ['2*-3', -6],
    ['-a.width/2', -5],
    ['12/3/2', 2],
    ['--3', 3],
    ['+3', 3],
  ]))('%s = %d', (text, expected) => {
    expect(calc(text)).toBeCloseTo(expected, TOLERANCE_DIGITS)
  })

  it('! binds tighter than &&, and && tighter than ||', () => {
    const tree = parseFormula('!a && b')
    expect(tree.type).toBe('binary')
    if (tree.type !== 'binary') return
    expect(tree.op).toBe('&&')
    expect(tree.left.type).toBe('unary')
    expect(printFormula(parseFormula('a || b && c'))).toBe('a || b && c')
    expect(printFormula(parseFormula('(a || b) && c'))).toBe('(a || b) && c')
    expect(calc('if(!no && yes, 1, 0)')).toBe(1)
    expect(calc('if(!yes && yes, 1, 0)')).toBe(0)
    expect(calc('if(yes || no && no, 1, 0)')).toBe(1)
    expect(calc('if((yes || no) && no, 1, 0)')).toBe(0)
  })

  it('compares numbers, and refuses a chained comparison', () => {
    expect(calc('if(1 < 2, 1, 0)')).toBe(1)
    expect(calc('if(2 <= 2, 1, 0)')).toBe(1)
    expect(calc('if(2 > 2, 1, 0)')).toBe(0)
    expect(calc('if(2 >= 3, 1, 0)')).toBe(0)
    expect(calc('if(2 != 3, 1, 0)')).toBe(1)
    expect(calc('if(2 == 2, 1, 0)')).toBe(1)
    expect(formulaErrorOf(() => parseFormula('1 < 2 < 3')).code).toBe('syntax')
  })
})

describe('references are read from the right', () => {
  /**
   * @param {string} text
   * @returns {{ body: FormulaBody, part: string | null, quantity: string }}
   */
  function refOf(text) {
    const tree = parseFormula(text)
    if (tree.type !== 'read') throw new Error(`not a read: ${tree.type}`)
    return { body: tree.body, part: tree.part, quantity: tree.quantity }
  }

  it.each(/** @type {const} */ ([
    ['a.width', { kind: 'name', text: 'a' }, null, 'width'],
    ['a.b.width', { kind: 'name', text: 'a' }, 'b', 'width'],
    ['a.min.x', { kind: 'name', text: 'a' }, null, 'min.x'],
    ['a.min.height', { kind: 'name', text: 'a' }, 'min', 'height'],
    ['a.[width].height', { kind: 'name', text: 'a' }, 'width', 'height'],
    ['[Cube 1].size.x', { kind: 'name', text: 'Cube 1' }, null, 'size.x'],
    ['#cube-a1-3.width', { kind: 'id', text: 'cube-a1-3' }, null, 'width'],
    ['a . b . max . z', { kind: 'name', text: 'a' }, 'b', 'max.z'],
  ]))('%s', (text, body, part, quantity) => {
    expect(refOf(text)).toEqual({ body, part, quantity })
  })

  it('evaluates those reads', () => {
    expect(calc('a.min.height')).toBeCloseTo(7, TOLERANCE_DIGITS)
    expect(calc('a.[width].height')).toBeCloseTo(9, TOLERANCE_DIGITS)
    expect(calc('[Cube 1].size.x')).toBeCloseTo(12, TOLERANCE_DIGITS)
    expect(calc('#cube-a1-3.width')).toBeCloseTo(33, TOLERANCE_DIGITS)
  })

  it('refuses #a-1.x: x alone is not a quantity', () => {
    const error = formulaErrorOf(() => parseFormula('#a-1.x'))
    expect(error.code).toBe('syntax')
    expect(error.message).toMatch(/quantity/)
  })

  it('refuses a body with no quantity, a quantity with no body, and too many segments', () => {
    expect(formulaErrorOf(() => parseFormula('[Cube 1]')).message).toMatch(/quantity/)
    expect(formulaErrorOf(() => parseFormula('#cube-a1-3 + 1')).message).toMatch(/quantity/)
    expect(formulaErrorOf(() => parseFormula('size.x')).message).toMatch(/body/)
    expect(formulaErrorOf(() => parseFormula('a.b.c.width')).code).toBe('syntax')
    expect(formulaErrorOf(() => parseFormula('a.#b.width')).code).toBe('syntax')
  })

  it('keeps a variable named pi, a body named pi and pi() apart in one formula', () => {
    expect(calc('pi + pi.width + pi() + pi.board.height')).toBeCloseTo(2 + 10 + Math.PI + 1.6, TOLERANCE_DIGITS)
  })
})

describe('if evaluates only the branch it takes', () => {
  /**
   * @param {number} model
   * @returns {Map<string, FormulaVariable>}
   */
  function withModel(model) {
    return new Map([...variables, ['piModel', { kind: 'enum', value: model, options: [{ value: 4 }, { value: 5 }] }]])
  }

  it('a missing part in the branch not taken is not an error', () => {
    expect(calc('if(piModel == 5, pi.fan.height, 0)', { variables: withModel(4) })).toBe(0)
  })

  it('the same part is a named error in the branch taken', () => {
    const error = formulaErrorOf(() => calc('if(piModel == 5, pi.fan.height, 0)', { variables: withModel(5) }))
    expect(error.message).toMatch(/fan/)
  })

  it('a division by zero in the branch not taken is not an error', () => {
    expect(calc('if(1 < 2, 7, 1 / 0)')).toBe(7)
  })
})

describe('the static type check', () => {
  /**
   * @param {string} text
   * @returns {FormulaError}
   */
  function refused(text) {
    return formulaErrorOf(() => checkFormula(parseFormula(text), variables))
  }

  it('accepts a number result and option comparisons with one of the options', () => {
    expect(checkFormula(parseFormula('if(piModel == 5, 1, 2)'), variables)).toBe('number')
    expect(checkFormula(parseFormula('if(finish != "gloss", 1, 2)'), variables)).toBe('number')
    expect(checkFormula(parseFormula("if(finish == 'matte', 1, 2)"), variables)).toBe('number')
  })

  it.each(/** @type {const} */ ([
    ['1 + (1 < 2)', /number/],
    ['yes + 1', /number/],
    ['"a" * 2', /number/],
    ['if(1, 2, 3)', /yes\/no/],
    ['if(yes, no, 3)', /number/],
    ['1 < 2', /result/],
    ['yes', /result/],
    ['!3', /yes\/no/],
    ['yes && 1', /yes\/no/],
    ['1 == yes', /compare/],
    ['piModel < 5', /choice/],
    ['finish == 3', /option/],
  ]))('refuses %s', (text, message) => {
    const error = refused(text)
    expect(error.code).toBe('type')
    expect(error.message).toMatch(message)
  })

  it('refuses piModel == 6 when 6 is not one of its options, listing them', () => {
    const error = refused('if(piModel == 6, 1, 0)')
    expect(error.message).toMatch(/6/)
    expect(error.message).toMatch(/4, 5/)
  })

  it('refuses an unknown variable and an unknown function by name', () => {
    expect(refused('nope + 1').message).toMatch(/nope/)
    expect(refused('nope + 1').code).toBe('reference')
    expect(refused('frobnicate(1)').message).toMatch(/frobnicate/)
  })

  it.each(['abs()', 'abs(1, 2)', 'pi(1)', 'min()', 'clamp(1, 2)', 'if(yes, 1)'])('refuses the wrong argument count: %s', (text) => {
    expect(refused(text).message).toMatch(/argument/)
  })

  it('refuses more than maxArgs arguments at parse', () => {
    const args = Array.from({ length: FORMULA_LIMITS.maxArgs + 1 }, (_, n) => String(n)).join(', ')
    expect(formulaErrorOf(() => parseFormula(`max(${args})`)).code).toBe('limit')
    const ok = Array.from({ length: FORMULA_LIMITS.maxArgs }, (_, n) => String(n)).join(', ')
    expect(calc(`max(${ok})`)).toBe(FORMULA_LIMITS.maxArgs - 1)
  })

  it('a variable whose formula has a problem is a named error when used', () => {
    const error = formulaErrorOf(() => calc('broken + 1'))
    expect(error.message).toMatch(/broken/)
    expect(error.message).toMatch(/a → b → a/)
  })
})

describe('the functions', () => {
  it.each(/** @type {const} */ ([
    ['abs(-2)', 2],
    ['min(3, 1, 2)', 1],
    ['max(3, 1, 2)', 3],
    ['clamp(5, 0, 3)', 3],
    ['clamp(-5, 0, 3)', 0],
    ['round(2.5)', 3],
    ['round(-2.5)', -3],
    ['floor(2.7)', 2],
    ['ceil(2.1)', 3],
    ['roundTo(7, 5)', 5],
    ['floorTo(9.9, 2.5)', 7.5],
    ['ceilTo(0.6, 0.2)', 0.6],
    ['ceilTo(0.61, 0.2)', 0.8],
    ['floorTo(0.6, 0.2)', 0.6],
    ['sqrt(16)', 4],
    ['pow(2, 10)', 1024],
    ['hypot(3, 4)', 5],
    ['sin(30)', 0.5],
    ['cos(60)', 0.5],
    ['tan(45)', 1],
    ['asin(1)', 90],
    ['acos(0)', 90],
    ['atan2(1, 1)', 45],
    ['pi()', Math.PI],
    ['inch(1)', 25.4],
  ]))('%s = %d (trig in degrees)', (text, expected) => {
    expect(calc(text)).toBeCloseTo(expected, TOLERANCE_DIGITS)
  })
})

describe('degenerate input: every failure is a named error, never 0 or NaN', () => {
  it.each(/** @type {const} */ ([
    ['1 / 0', /zero/, 'math'],
    ['1 / (2 - 2)', /zero/, 'math'],
    ['sqrt(-1)', /negative/, 'math'],
    ['asin(2)', /-1 to 1/, 'math'],
    ['acos(-1.5)', /-1 to 1/, 'math'],
    ['1e400', /large/, 'syntax'],
    ['ceilTo(1, 0)', /step/, 'math'],
    ['roundTo(1, -1)', /step/, 'math'],
    ['1e300 * 1e300 / 1e300', /large/, 'math'],
    ['pow(-8, 1 / 3)', /real/, 'math'],
    ['atan2(0, 0)', /direction/, 'math'],
    ['clamp(1, 3, 2)', /low/, 'math'],
  ]))('%s', (text, message, code) => {
    const error = formulaErrorOf(() => calc(text))
    expect(error.message).toMatch(message)
    expect(error.code).toBe(code)
  })

  it('-0 comes back as 0', () => {
    expect(Object.is(calc('-0'), 0)).toBe(true)
    expect(Object.is(calc('0 * -1'), 0)).toBe(true)
  })

  it('an empty, whitespace-only or non-string formula is a named error', () => {
    expect(formulaErrorOf(() => parseFormula('')).message).toMatch(/empty/)
    expect(formulaErrorOf(() => parseFormula(' \t\n ')).message).toMatch(/empty/)
    for (const value of [42, null, undefined, {}, ['1'], true]) {
      expect(formulaErrorOf(() => parseFormula(/** @type {any} */ (value))).message).toMatch(/text/)
    }
  })

  it('a syntax error says at which character', () => {
    const error = formulaErrorOf(() => parseFormula('1 + * 2'))
    expect(error.code).toBe('syntax')
    expect(error.position).toBe(4)
    expect(error.message).toMatch(/character 5/)
  })

  it('a read with no reader is a named error, not a crash', () => {
    expect(formulaErrorOf(() => calculateFormula('a.width', { variables })).message).toMatch(/read/)
  })

  it('a reader that returns something other than a finite number is a named error', () => {
    expect(formulaErrorOf(() => calculateFormula('a.width', { read: () => Number.NaN })).code).toBe('reference')
    expect(formulaErrorOf(() => calculateFormula('a.width', { read: () => /** @type {any} */ ('5') })).code).toBe('reference')
  })
})

describe('the caps', () => {
  it('refuses a formula over maxLength', () => {
    expect(formulaErrorOf(() => parseFormula('1'.padEnd(FORMULA_LIMITS.maxLength + 1, ' '))).code).toBe('limit')
  })

  it('refuses more than maxNodes nodes', () => {
    const ok = Array.from({ length: 128 }, () => '1').join('+') // 255 nodes
    expect(calc(ok)).toBe(128)
    const over = Array.from({ length: 129 }, () => '1').join('+') // 257 nodes
    expect(formulaErrorOf(() => parseFormula(over)).code).toBe('limit')
  })

  it('refuses nesting deeper than maxDepth, for ( and for -', () => {
    const depth = FORMULA_LIMITS.maxDepth
    expect(calc(`${'('.repeat(depth - 1)}1${')'.repeat(depth - 1)}`)).toBe(1)
    expect(formulaErrorOf(() => parseFormula(`${'('.repeat(999)}1`)).code).toBe('limit')
    expect(formulaErrorOf(() => parseFormula(`${'-'.repeat(999)}1`)).code).toBe('limit')
  })

  it('refuses more than maxPartReads reads', () => {
    const ok = Array.from({ length: FORMULA_LIMITS.maxPartReads }, () => 'a.width').join('+')
    expect(calc(ok)).toBeCloseTo(10 * FORMULA_LIMITS.maxPartReads, TOLERANCE_DIGITS)
    const over = `${ok}+a.width`
    expect(formulaErrorOf(() => parseFormula(over)).code).toBe('limit')
  })

  it('stops when a shared per-fold budget of node visits runs out', () => {
    const budget = { visits: 5 }
    expect(formulaErrorOf(() => calc('1 + 2 + 3 + 4 + 5', { budget })).code).toBe('budget')
    const enough = { visits: 9 }
    expect(calc('1 + 2 + 3 + 4 + 5', { budget: enough })).toBe(15)
    expect(enough.visits).toBe(0)
  })
})

describe('the printer', () => {
  it.each(/** @type {const} */ ([
    ['group1.part1.width - (group1.part2.width / 2)', 'group1.part1.width - group1.part2.width / 2'],
    ['(azmount.depth-plate.depth)/2', '(azmount.depth - plate.depth) / 2'],
    ['10 - (2 - 3)', '10 - (2 - 3)'],
    ['(10 - 2) - 3', '10 - 2 - 3'],
    ['2*-3', '2 * -3'],
    ['-(1 + 2)', '-(1 + 2)'],
    ['--3', '--3'],
    ['!(yes && no)', '!(yes && no)'],
    ['(1 < 2) == (2 < 3)', '(1 < 2) == (2 < 3)'],
    ['box.[pi-mb].max.z', 'box.[pi-mb].max.z'],
    ['a.[width].height', 'a.[width].height'],
    ['[Cube 1].size.x', '[Cube 1].size.x'],
    ['[plain].width', 'plain.width'],
    ['#cube-a1-3.width', '#cube-a1-3.width'],
    ['max( 1 ,2 )', 'max(1, 2)'],
    ["if(finish == 'matte', 1, 2)", 'if(finish == "matte", 1, 2)'],
    ['if(finish == \'say "hi"\', 1, 2)', 'if(finish == \'say "hi"\', 1, 2)'],
    ['1.50', '1.5'],
    ['1e21', '1e+21'],
    ['.5', '0.5'],
  ]))('%s → %s, and stable', (text, printed) => {
    const once = printFormula(parseFormula(text))
    expect(once).toBe(printed)
    expect(printFormula(parseFormula(once))).toBe(once)
  })
})

describe('names in the text, ids in the file', () => {
  /** @type {Map<string, string>} root id → name */
  const names = new Map([
    ['cube-a1-3', 'Base'],
    ['cube-a1-4', 'Cube 1'],
    ['screw-a1-2', 'Screw'],
    ['screw-a1-5', 'Screw'],
    ['cube-a1-7', 'odd]name'],
    ['cube-a1-8', 'width'],
  ])
  const lookup = {
    /** @param {string} name */
    idsNamed: (name) => [...names].filter(([, candidate]) => candidate === name).map(([id]) => id),
    /** @param {string} id */
    nameOf: (id) => names.get(id) ?? null,
    /** @param {string} id */
    rootOf: (id) => (id === 'cube-a1-3-b2' ? 'cube-a1-3' : names.has(id) ? id : null),
  }

  it('stores body ids and shows current names, both ways', () => {
    const stored = formulaToStored('Base.width - ([Cube 1].width / 2)', lookup)
    expect(stored).toBe('#cube-a1-3.width - #cube-a1-4.width / 2')
    expect(formulaToDisplay(stored, lookup)).toBe('Base.width - [Cube 1].width / 2')
    expect(formulaToStored(formulaToDisplay(stored, lookup), lookup)).toBe(stored)
  })

  it('keeps variables by name and parts as text', () => {
    expect(formulaToStored('Base.[pi-mb].height + thickness', lookup)).toBe('#cube-a1-3.[pi-mb].height + thickness')
  })

  it('brackets a name that is a quantity word, so it reads clearly', () => {
    expect(formulaToDisplay('#cube-a1-8.height', lookup)).toBe('[width].height')
    expect(formulaToStored('[width].height', lookup)).toBe('#cube-a1-8.height')
  })

  it('normalises a non-root id to its lineage root', () => {
    expect(formulaToStored('#cube-a1-3-b2.width', lookup)).toBe('#cube-a1-3.width')
  })

  it('refuses a name two bodies share, listing them', () => {
    // Deliberate rewording (TODO/FIND-ui-106): without a description the ids stand alone.
    const error = formulaErrorOf(() => formulaToStored('Screw.width', lookup))
    expect(error.message).toBe('Two bodies are named Screw (screw-a1-2, screw-a1-5): use #screw-a1-2 to choose one.')
  })

  it('a live clash shows each body with the group it was built from', () => {
    const described = {
      ...lookup,
      describe: (/** @type {string} */ id) => (id === 'screw-a1-2' ? 'Group of Bolt, Nut' : id === 'screw-a1-5' ? 'Merge of Base' : null),
    }
    const error = formulaErrorOf(() => formulaToStored('Screw.width', described))
    expect(error.message).toBe('Two bodies are named Screw (screw-a1-2 in Group of Bolt, Nut; screw-a1-5 in Merge of Base): use #screw-a1-2 to choose one.')
    expect(error.message).not.toContain('\n')
  })

  it('names a live body even though consumed ancestors share its name (TODO/ui-106)', () => {
    // Real lookups return the live body only; the formula layer sees a single id.
    const chain = { ...lookup, idsNamed: (/** @type {string} */ name) => (name === 'feather' ? ['group-2'] : []), rootOf: (/** @type {string} */ id) => id }
    expect(formulaToStored('[feather].width', chain)).toBe('#group-2.width')
  })

  it('a two-live-bodies clash suggests a live id and describes each', () => {
    const clash = { ...lookup, describe: undefined }
    const error = formulaErrorOf(() => formulaToStored('Screw.width', clash))
    expect(error.message).toContain('use #screw-a1-2 to choose one')
  })

  it('a consumed cutter with a unique name still resolves', () => {
    const cutter = { ...lookup, idsNamed: (/** @type {string} */ name) => (name === 'Cutter' ? ['cutter-1'] : []), rootOf: (/** @type {string} */ id) => id }
    expect(formulaToStored('Cutter.width', cutter)).toBe('#cutter-1.width')
  })

  it('a deleted body is not matched', () => {
    const none = { ...lookup, idsNamed: () => [] }
    expect(formulaErrorOf(() => formulaToStored('Gone.width', none)).message).toMatch(/no body named Gone/)
  })

  it('shows #id for a deleted body, a shared name and a name holding ]', () => {
    expect(formulaToDisplay('#gone-1.width + 1', lookup)).toBe('#gone-1.width + 1')
    expect(formulaToDisplay('#screw-a1-5.width', lookup)).toBe('#screw-a1-5.width')
    expect(formulaToDisplay('#cube-a1-7.width', lookup)).toBe('#cube-a1-7.width')
  })

  it('refuses an unknown name and an unknown id by name', () => {
    expect(formulaErrorOf(() => formulaToStored('Nope.width', lookup)).message).toMatch(/Nope/)
    expect(formulaErrorOf(() => formulaToStored('#nope-9.width', lookup)).message).toMatch(/nope-9/)
  })

  it('refuses a body whose id cannot be written as #id', () => {
    const odd = { ...lookup, idsNamed: () => ['bad id!'], rootOf: () => 'bad id!' }
    expect(formulaErrorOf(() => formulaToStored('Base.width', odd)).message).toMatch(/can't be referenced/)
  })
})

describe('formulaReferences and rewriteFormula', () => {
  it('lists the variables and reads a formula uses, once each', () => {
    const refs = formulaReferences(parseFormula('wall + wall * 2 + box.top.max.z + if(yes, Base.width, wall)'))
    expect(refs.variables).toEqual(['wall', 'yes'])
    expect(refs.reads).toEqual([
      { body: { kind: 'name', text: 'box' }, part: 'top', quantity: 'max.z' },
      { body: { kind: 'name', text: 'Base' }, part: null, quantity: 'width' },
    ])
  })

  it('renames a variable, or replaces it with a literal, on the tree', () => {
    const tree = parseFormula('wall * 2 + -wall + other')
    expect(printFormula(rewriteFormula(tree, { variable: (name) => (name === 'wall' ? 'side' : undefined) }))).toBe('side * 2 + -side + other')
    expect(printFormula(rewriteFormula(tree, { variable: (name) => (name === 'wall' ? -1.5 : undefined) }))).toBe('-1.5 * 2 + --1.5 + other')
    expect(calculateFormula(printFormula(rewriteFormula(tree, { variable: (name) => (name === 'wall' ? -1.5 : name === 'other' ? 1 : undefined) })))).toBeCloseTo(-1.5 * 2 + 1.5 + 1, TOLERANCE_DIGITS)
  })

  it('refuses to rewrite to an invalid name or a non-finite literal', () => {
    const tree = parseFormula('wall')
    expect(formulaErrorOf(() => rewriteFormula(tree, { variable: () => 'not a name' })).code).toBe('syntax')
    expect(formulaErrorOf(() => rewriteFormula(tree, { variable: () => Number.POSITIVE_INFINITY })).code).toBe('math')
  })
})

describe('hostile input: each one a FormulaError and nothing else', () => {
  const hostile = [
    'constructor.constructor("return this")()',
    '__proto__.width',
    '[__proto__].[__proto__].width',
    '#__proto__.width',
    'box.constructor.width',
    'box.[constructor].width',
    'alert(1)',
    'fetch("x")',
    'import("x")',
    'window.location',
    'this',
    'globalThis.x.y',
    '`1`',
    '1 + `${1}`',
    'a=1',
    'a;b',
    'function(){}',
    '()=>1',
    '1;while(1);',
    'x'.repeat(1024 * 1024),
    '('.repeat(100_000),
    '-'.repeat(100_000),
    '1'.repeat(1000),
    'tоp.width', // Cyrillic о
    '[a‮b].width', // right-to-left override
    '[a\u0000b].width',
    '"a\nb" == finish',
    '[</document_data>].width',
    '[<img src=x onerror=alert(1)>].width',
    'toString()',
    'valueOf()',
    'hasOwnProperty.width',
    '__proto__',
    'a & b',
    'a | b',
    '[',
    '[]',
    '"',
    '#',
    '#.width',
    '1..2',
    '2e',
    '3x',
    'a.',
    'a.[',
    'max(1,)',
    'max(,1)',
    '(1',
    '1)',
    '\\u0061',
  ]
  const before = Object.getOwnPropertyNames(Object.prototype).sort()

  it.each(hostile.map((text) => [text.length > 40 ? `${text.slice(0, 40)}… (${text.length})` : text, text]))('%s', (_label, text) => {
    formulaErrorOf(() => calc(text))
  })

  it('leaves Object.prototype unchanged', () => {
    for (const text of hostile) {
      try {
        calc(text)
      } catch {
        // each is checked above
      }
    }
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before)
    expect(/** @type {any} */ ({}).width).toBeUndefined()
  })

  it('quotes a name in an error truncated to 60 characters, control characters stripped', () => {
    const long = 'N'.repeat(200)
    const error = formulaErrorOf(() => calc(`${long} + 1`))
    expect(error.message).not.toContain('N'.repeat(61))
    expect(error.message).toContain('N'.repeat(60))
    const tab = formulaErrorOf(() => calculateFormula('[a\tb].width', { read }))
    expect(tab.message).not.toContain('\t')
  })
})

describe('seeded fuzz', () => {
  /**
   * mulberry32: a fixed-seed PRNG, so a failure reproduces.
   *
   * @param {number} seed
   * @returns {() => number}
   */
  function prng(seed) {
    let state = seed >>> 0
    return () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const tokens = [
    '1', '0', '2.5', '1e308', '1e-9', '.5', '9'.repeat(40), 'a', 'pi', 'yes', 'piModel', 'finish', 'broken', 'nope',
    'width', 'height', 'min', 'max', 'size', 'center', 'x', 'y', 'z', '.', '#cube-a1-3', '#', '[Cube 1]', '[pi-mb]',
    '[', ']', '(', ')', ',', '+', '-', '*', '/', '!', '==', '!=', '<', '<=', '>', '>=', '&&', '||', '=', '&', '|',
    '"matte"', '"', "'", '`', ';', '{', '}', '__proto__', 'constructor', 'if', 'abs', 'sqrt', 'asin', 'ceilTo', 'pow',
    'hypot', 'atan2', ' ', '\t', '‮', 'о', '\\',
  ]

  it('100,000 strings: never a throw other than FormulaError, within a stated ceiling', () => {
    const random = prng(0xc0de078)
    const started = performance.now()
    /** @type {string[]} */
    const escaped = []
    let numbers = 0
    for (let n = 0; n < 100_000; n += 1) {
      const count = 1 + Math.floor(random() * 16)
      let text = ''
      for (let k = 0; k < count; k += 1) text += tokens[Math.floor(random() * tokens.length)]
      try {
        const value = calc(text)
        if (typeof value !== 'number' || !Number.isFinite(value)) escaped.push(`${JSON.stringify(text)} gave ${value}`)
        else numbers += 1
      } catch (error) {
        if (!(error instanceof FormulaError)) escaped.push(`${JSON.stringify(text)} threw ${String(error)}`)
      }
    }
    const elapsed = performance.now() - started
    expect(escaped.slice(0, 5)).toEqual([])
    expect(numbers).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(15_000)
  })
})

describe('evaluateFormula on a parsed tree', () => {
  it('evaluates a tree again with new values, without re-parsing', () => {
    const tree = parseFormula('thickness * 2')
    expect(evaluateFormula(tree, { variables: new Map([['thickness', { kind: 'number', value: 3 }]]) })).toBe(6)
    expect(evaluateFormula(tree, { variables: new Map([['thickness', { kind: 'number', value: 4 }]]) })).toBe(8)
  })

  it('the parsed tree is frozen', () => {
    const tree = parseFormula('1 + a.width')
    expect(Object.isFrozen(tree)).toBe(true)
    if (tree.type === 'binary') expect(Object.isFrozen(tree.right)).toBe(true)
  })
})

describe('guard: formula.js has no capability to remove (Security 1-4, 7)', () => {
  it('imports nothing (the allow-list is empty)', () => {
    expect(formulaSource).not.toMatch(/^\s*import\b/m)
    expect(formulaSource).not.toMatch(/\brequire\s*\(/)
    expect(formulaSource).not.toMatch(/\bexport\s+(\*|\{[^}]*\})\s+from\b/)
  })

  it.each([
    /\beval\b/, /\bFunction\b/, /\bimport\s*\(/, /\bglobalThis\b/, /\bwindow\b/, /\bdocument\b/, /\bself\b/,
    /\bfetch\b/, /\bReflect\b/, /\bprototype\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bnew\s+RegExp\b/,
    /\bMath\s*\[/, /\bDate\b/, /\bMath\.random\b/, /\blocale/i,
  ])('does not contain %s', (pattern) => {
    expect(formulaSource).not.toMatch(pattern)
  })

  it('has no computed member access except by a numeric index it computes itself', () => {
    const code = formulaSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const allowed = new Set(['', 'index', 'axis', 'side', 'n'])
    /** @type {string[]} */
    const found = []
    for (const match of code.matchAll(/[\w$)\]]\s*\[([^\]]*)\]/g)) {
      const before = code.slice(Math.max(0, (match.index ?? 0) - 7), match.index ?? 0)
      if (/\b(return|of|in|const|let|case|typeof)\s*$/.test(`${before}${match[0].charAt(0)}`)) continue
      if (!allowed.has(match[1].trim())) found.push(match[0])
    }
    expect(found).toEqual([])
  })

  it('uses no regular expression in the tokeniser', () => {
    const start = formulaSource.indexOf('function tokenise(')
    const end = formulaSource.indexOf('\n}\n', start)
    expect(start).toBeGreaterThan(-1)
    const body = formulaSource.slice(start, end)
    expect(body).not.toMatch(/\/[^/*\s][^/\n]*\/[gimsuy]*\.(test|exec)\(|\.match\(|\.replace\(|\.split\(|RegExp/)
  })
})
