// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calculated variables, the language (`TODO/FIND-core-078`, part 1): a small formula language
 * over variables and the measured bounds of bodies and their parts, read by a parser and walked
 * by an interpreter. Nothing here can run code.
 *
 * ## The pipeline
 *
 * Text → {@link parseFormula} (a character-code tokeniser and a recursive-descent parser, both
 * capped by {@link FORMULA_LIMITS}) → a frozen tree built only by that parser →
 * {@link checkFormula} (a static type check against the variables' kinds) →
 * {@link evaluateFormula} (one `switch` on node type). {@link printFormula} turns a tree back
 * into text, and {@link formulaToStored} / {@link formulaToDisplay} swap body names for body
 * ids and back on the tree, never on the text.
 *
 * ## What the evaluator can see
 *
 * Only what it is handed (Security item 4): a variable table, a `ReadonlyMap` of
 * {@link FormulaVariable}, and a {@link FormulaRead} callback,
 * `read(body, part, quantity) → millimetres`. This module imports nothing, holds no reference
 * to the project, kernel, storage, network, page or any global, and reads names only through
 * `Map`s it owns. A value is a number, a yes/no or a short option text — never an object — so
 * `a.b.c` is not property access: it is parsed into `{ body, part, quantity }` and passed to
 * `read`.
 *
 * ## References are read from the right
 *
 * The trailing quantity is taken first (`width`, `depth`, `height`, or `size`/`min`/`max`/
 * `center` followed by `.x`/`.y`/`.z`), then at most one part, then the body. A body is an
 * identifier, a bracketed name (`[Cube 1]`) or `#id`; a part is an identifier or a bracketed
 * name. Quantities are world-axis bounds in millimetres: `width`/`depth`/`height` are the X/Y/Z
 * extents, the same as `size.x/y/z`.
 *
 * ## Errors
 *
 * Every failure is a {@link FormulaError} with a `code` — never `0`, `NaN` or a substituted
 * literal. A non-finite number is an error at every node, not only at the end. A name quoted in
 * a message is cut to 60 characters with control and direction-override characters removed.
 *
 * Deterministic: no clock, randomness or environment. Trig takes and returns degrees.
 *
 * @module core/formula
 */

/**
 * Caps enforced in code, so a hostile formula costs a bounded amount of time.
 * `maxChainDepth` and `maxNodeVisitsPerFold` are spent by the caller across formulas; a single
 * evaluation spends `maxNodeVisitsPerFold` through {@link FormulaContext}'s `budget`.
 */
export const FORMULA_LIMITS = Object.freeze({
  maxLength: 1000,
  maxNodes: 256,
  maxDepth: 32,
  maxArgs: 16,
  maxChainDepth: 32,
  maxPartReads: 32,
  maxNodeVisitsPerFold: 1_000_000,
})

/** How many characters of a name an error message quotes. */
const QUOTED_NAME_LENGTH = 60

/** How many characters of a nested error an error message quotes. */
const QUOTED_ERROR_LENGTH = 300

/**
 * @typedef {'syntax' | 'limit' | 'type' | 'reference' | 'math' | 'budget'} FormulaErrorCode
 */

/** The one error this module throws for anything a formula's text or values can cause. */
export class FormulaError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: FormulaErrorCode, position?: number | null }} [options] `position` is the
   *   0-based character the problem starts at, when there is one.
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'FormulaError'
    /** @type {FormulaErrorCode} */
    this.code = options.code ?? 'reference'
    /** @type {number | null} */
    this.position = options.position ?? null
  }
}

/**
 * A body as a formula names it: by id (`#cube-a1-3`, the stored form) or by name (`Base`,
 * `[Cube 1]`, the form people type).
 *
 * @typedef {{ readonly kind: 'id' | 'name', readonly text: string }} FormulaBody
 */

/**
 * A quantity, resolved: which face of the bounds, on which world axis (0 = X, 1 = Y, 2 = Z).
 *
 * @typedef {{ readonly name: string, readonly face: 'size' | 'min' | 'max' | 'center', readonly axis: 0 | 1 | 2 }} FormulaQuantity
 */

/**
 * Measures one quantity of a body, or of one of its parts, in millimetres.
 *
 * Throw a {@link FormulaError} (code `reference`) for a body or part that does not exist or
 * cannot be read here. Anything other than a finite number back is a `reference` error too.
 *
 * @callback FormulaRead
 * @param {FormulaBody} body
 * @param {string | null} part The part name, or `null` for the whole body.
 * @param {FormulaQuantity} quantity
 * @returns {number}
 */

/**
 * A variable as a formula sees it. `value` is absent until the caller knows it; `error` marks
 * a variable (usually another formula) that cannot be used, and why.
 *
 * @typedef {object} FormulaVariable
 * @property {'number' | 'boolean' | 'enum'} kind
 * @property {number | boolean | string} [value]
 * @property {readonly { value: string | number }[]} [options] An `enum`'s choices.
 * @property {string} [error]
 */

/**
 * @typedef {object} FormulaContext
 * @property {ReadonlyMap<string, FormulaVariable>} [variables]
 * @property {FormulaRead} [read]
 * @property {{ visits: number }} [budget] Node visits left, shared across every evaluation in
 *   one rebuild and decremented in place. Defaults to a fresh `maxNodeVisitsPerFold`.
 */

/**
 * Turns names into ids and back. `idsNamed` and `rootOf` return lineage-root ids.
 *
 * @typedef {object} FormulaLookup
 * @property {(name: string) => readonly string[]} idsNamed Every body with this name.
 * @property {(id: string) => string | null} nameOf A root id's current name, or `null`.
 * @property {(id: string) => string | null} rootOf Any id's lineage root, or `null` if unknown.
 */

/** @typedef {'+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'} BinaryOp */
/** @typedef {{ readonly type: 'number', readonly value: number, readonly at: number }} NumberNode */
/** @typedef {{ readonly type: 'text', readonly value: string, readonly at: number }} TextNode */
/** @typedef {{ readonly type: 'variable', readonly name: string, readonly at: number }} VariableNode */
/** @typedef {{ readonly type: 'read', readonly body: FormulaBody, readonly part: string | null, readonly quantity: string, readonly at: number }} ReadNode */
/** @typedef {{ readonly type: 'call', readonly name: string, readonly args: readonly FormulaNode[], readonly at: number }} CallNode */
/** @typedef {{ readonly type: 'unary', readonly op: '-' | '+' | '!', readonly operand: FormulaNode, readonly at: number }} UnaryNode */
/** @typedef {{ readonly type: 'binary', readonly op: BinaryOp, readonly left: FormulaNode, readonly right: FormulaNode, readonly at: number }} BinaryNode */
/** @typedef {NumberNode | TextNode | VariableNode | ReadNode | CallNode | UnaryNode | BinaryNode} FormulaNode */

// ── Quantities ──────────────────────────────────────────────────────────────────────────

const AXIS_LETTERS = Object.freeze(/** @type {const} */ (['x', 'y', 'z']))
const FACES = Object.freeze(/** @type {const} */ (['size', 'min', 'max', 'center']))
const EXTENTS = Object.freeze(/** @type {const} */ (['width', 'depth', 'height']))

/** @type {Map<string, FormulaQuantity>} */
const QUANTITIES = new Map()
for (let axis = 0; axis < 3; axis += 1) {
  const typed = /** @type {0 | 1 | 2} */ (axis)
  const extent = EXTENTS.at(axis) ?? ''
  QUANTITIES.set(extent, Object.freeze({ name: extent, face: 'size', axis: typed }))
  for (const face of FACES) {
    const name = `${face}.${AXIS_LETTERS.at(axis)}`
    QUANTITIES.set(name, Object.freeze({ name, face, axis: typed }))
  }
}

/** Words that take part in a quantity; a body or part with one of these names prints in brackets. */
/** @type {ReadonlySet<string>} */
const QUANTITY_WORDS = new Set([...EXTENTS, ...FACES, ...AXIS_LETTERS])

/**
 * One quantity of a bounding box, in millimetres.
 *
 * @param {readonly [readonly number[], readonly number[]]} bounds `[[minX, minY, minZ], [maxX, maxY, maxZ]]`,
 *   the shape `measureBoundingBox` returns.
 * @param {FormulaQuantity} quantity
 * @returns {number}
 * @throws {FormulaError} For bounds that are not finite numbers.
 */
export function measureBounds(bounds, quantity) {
  const [low, high] = bounds
  const axis = quantity.axis
  const lo = low[axis]
  const hi = high[axis]
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new FormulaError(`there is no ${quantity.name} to measure here`, { code: 'reference' })
  }
  if (quantity.face === 'min') return lo
  if (quantity.face === 'max') return hi
  if (quantity.face === 'center') return (lo + hi) / 2
  return hi - lo
}

// ── Characters ──────────────────────────────────────────────────────────────────────────

/** @param {number} code @returns {boolean} */
const isDigit = (code) => code >= 48 && code <= 57
/** @param {number} code @returns {boolean} */
const isIdentStart = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
/** @param {number} code @returns {boolean} */
const isIdentPart = (code) => isIdentStart(code) || isDigit(code)
/** @param {number} code @returns {boolean} */
const isIdChar = (code) => isIdentPart(code) || code === 45
/** @param {number} code @returns {boolean} */
const isSpace = (code) => code === 32 || code === 9 || code === 10 || code === 13

/**
 * A control, invisible or direction-changing character: never allowed inside a name or option
 * text, and stripped from any name an error message quotes.
 *
 * @param {number} code
 * @returns {boolean}
 */
function isHidden(code) {
  return code < 32 || (code >= 127 && code <= 159) || code === 0x061c || code === 0x180e
    || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e)
    || (code >= 0x2060 && code <= 0x2069) || code === 0xfeff
}

/**
 * @param {string} text
 * @param {(code: number) => boolean} first
 * @param {(code: number) => boolean} rest
 * @returns {boolean}
 */
function allChars(text, first, rest) {
  if (text.length === 0 || !first(text.charCodeAt(0))) return false
  for (let index = 1; index < text.length; index += 1) if (!rest(text.charCodeAt(index))) return false
  return true
}

/** @param {string} text @returns {boolean} An identifier: `[A-Za-z_][A-Za-z0-9_]*`. */
const isIdent = (text) => allChars(text, isIdentStart, isIdentPart)
/** @param {string} text @returns {boolean} A body id a formula can write: `[A-Za-z0-9_-]+`. */
const isIdText = (text) => allChars(text, isIdChar, isIdChar)
/** @param {string} text @returns {boolean} Text that fits between `[` and `]`. */
const isBracketable = (text) => allChars(text, (code) => code !== 93 && !isHidden(code), (code) => code !== 93 && !isHidden(code))

/**
 * Text for an error message: hidden characters removed, cut to `limit` characters.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string}
 */
function shown(text, limit = QUOTED_NAME_LENGTH) {
  let out = ''
  let count = 0
  for (const char of String(text)) {
    if (isHidden(char.codePointAt(0) ?? 0)) continue
    if (count === limit) return `${out}…`
    out += char
    count += 1
  }
  return out
}

/** @param {number} code @returns {string} */
const codeName = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

// ── Tokeniser ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Token
 * @property {'number' | 'text' | 'ident' | 'bracket' | 'id' | 'op' | 'end'} kind
 * @property {string} text
 * @property {number} value Only meaningful for a `number`.
 * @property {number} at
 */

const TWO_CHAR_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||'])
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '(', ')', ',', '.', '!', '<', '>'])

/**
 * @param {string} message
 * @param {number} at
 * @returns {FormulaError}
 */
const syntax = (message, at) => new FormulaError(`${message} at character ${at + 1}`, { code: 'syntax', position: at })

/**
 * Splits a formula into tokens with one pass over its character codes — linear by
 * construction, no regular expression (Security item 7).
 *
 * @param {string} text
 * @returns {Token[]}
 */
function tokenise(text) {
  /** @type {Token[]} */
  const tokens = []
  const length = text.length
  let index = 0
  /**
   * @param {Token['kind']} kind
   * @param {string} tokenText
   * @param {number} at
   * @param {number} [value]
   */
  const push = (kind, tokenText, at, value = 0) => { tokens.push({ kind, text: tokenText, value, at }) }
  /**
   * Scans to `close`, refusing hidden characters; returns the text between.
   *
   * @param {number} close
   * @param {string} what
   * @returns {string}
   */
  const scanTo = (close, what) => {
    const start = index
    index += 1
    while (index < length) {
      const code = text.charCodeAt(index)
      if (code === close) {
        index += 1
        return text.slice(start + 1, index - 1)
      }
      if (isHidden(code)) throw syntax(`${what} can't hold ${codeName(code)}`, index)
      index += 1
    }
    throw syntax(`${what} is not closed`, start)
  }

  while (index < length) {
    const code = text.charCodeAt(index)
    const at = index
    if (isSpace(code)) {
      index += 1
    } else if (isDigit(code) || (code === 46 && isDigit(text.charCodeAt(index + 1)))) {
      while (isDigit(text.charCodeAt(index))) index += 1
      if (text.charCodeAt(index) === 46) {
        index += 1
        while (isDigit(text.charCodeAt(index))) index += 1
      }
      const e = text.charCodeAt(index)
      if (e === 101 || e === 69) {
        let next = index + 1
        const sign = text.charCodeAt(next)
        if (sign === 43 || sign === 45) next += 1
        if (!isDigit(text.charCodeAt(next))) throw syntax('a number’s exponent needs digits', index)
        index = next
        while (isDigit(text.charCodeAt(index))) index += 1
      }
      const after = text.charCodeAt(index)
      if (isIdentPart(after) || after === 46) throw syntax('a number runs straight into something else', index)
      const literal = text.slice(at, index)
      const value = Number(literal)
      if (!Number.isFinite(value)) throw syntax(`the number ${shown(literal, 20)} is too large`, at)
      push('number', literal, at, value)
    } else if (isIdentStart(code)) {
      while (isIdentPart(text.charCodeAt(index))) index += 1
      push('ident', text.slice(at, index), at)
    } else if (code === 35) {
      index += 1
      while (isIdChar(text.charCodeAt(index))) index += 1
      if (index === at + 1) throw syntax('# needs a body id after it', at)
      push('id', text.slice(at + 1, index), at)
    } else if (code === 91) {
      const name = scanTo(93, 'a name in brackets')
      if (name.length === 0) throw syntax('empty brackets name nothing', at)
      push('bracket', name, at)
    } else if (code === 34 || code === 39) {
      push('text', scanTo(code, 'option text'), at)
    } else {
      const two = text.slice(index, index + 2)
      const one = text.charAt(index)
      if (TWO_CHAR_OPS.has(two)) {
        index += 2
        push('op', two, at)
      } else if (ONE_CHAR_OPS.has(one)) {
        index += 1
        push('op', one, at)
      } else if (one === '=') {
        throw syntax('a formula assigns nothing; use == to compare', at)
      } else if (one === '&') {
        throw syntax('use && for “and”', at)
      } else if (one === '|') {
        throw syntax('use || for “or”', at)
      } else {
        const point = text.codePointAt(index) ?? code
        const char = isHidden(point) ? '' : `“${String.fromCodePoint(point)}” `
        throw syntax(`unexpected character ${char}(${codeName(point)})`, at)
      }
    }
  }
  push('end', '', length)
  return tokens
}

// ── Parser ──────────────────────────────────────────────────────────────────────────────

const COMPARE_OPS = new Set(['==', '!=', '<', '<=', '>', '>='])
const ORDER_OPS = new Set(['<', '<=', '>', '>='])
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/'])

/**
 * Parses a formula into a frozen tree. Syntax and size only; {@link checkFormula} does types.
 *
 * @param {string} text
 * @returns {FormulaNode}
 * @throws {FormulaError} `syntax` for malformed text, `limit` past a {@link FORMULA_LIMITS} cap.
 */
export function parseFormula(text) {
  if (typeof text !== 'string') throw new FormulaError('a formula must be text', { code: 'syntax' })
  if (text.length > FORMULA_LIMITS.maxLength) {
    throw new FormulaError(`a formula is at most ${FORMULA_LIMITS.maxLength} characters long (this one is ${text.length})`, { code: 'limit' })
  }
  const tokens = tokenise(text)
  if (tokens.length === 1) throw new FormulaError('the formula is empty', { code: 'syntax', position: 0 })

  const end = tokens.length - 1
  const finalToken = /** @type {Token} */ (tokens.at(-1))
  let index = 0
  let nodes = 0
  let reads = 0
  let depth = 0

  /** @param {number} n @returns {Token} */
  const tokenAt = (n) => (n < end ? tokens[n] : finalToken)
  const peek = () => tokenAt(index)
  /** @param {string} op @returns {boolean} */
  const isOp = (op) => peek().kind === 'op' && peek().text === op
  /** @param {Token} token @returns {string} */
  const describe = (token) => (token.kind === 'end' ? 'the end' : `“${shown(token.kind === 'id' ? `#${token.text}` : token.text)}”`)

  /**
   * @template {FormulaNode} T
   * @param {T} node
   * @returns {T}
   */
  const make = (node) => {
    nodes += 1
    if (nodes > FORMULA_LIMITS.maxNodes) {
      throw new FormulaError(`a formula has at most ${FORMULA_LIMITS.maxNodes} parts`, { code: 'limit', position: node.at })
    }
    return /** @type {T} */ (Object.freeze(node))
  }
  /** @param {number} at */
  const enter = (at) => {
    depth += 1
    if (depth > FORMULA_LIMITS.maxDepth) {
      throw new FormulaError(`a formula nests at most ${FORMULA_LIMITS.maxDepth} deep`, { code: 'limit', position: at })
    }
  }
  /** @param {string} op */
  const expectOp = (op) => {
    if (!isOp(op)) throw syntax(`expected “${op}” but found ${describe(peek())}`, peek().at)
    index += 1
  }

  /**
   * @param {() => FormulaNode} next
   * @param {Set<string>} ops
   * @returns {FormulaNode}
   */
  const leftAssociative = (next, ops) => {
    let left = next()
    while (peek().kind === 'op' && ops.has(peek().text)) {
      const token = peek()
      index += 1
      const right = next()
      left = make({ type: 'binary', op: /** @type {BinaryOp} */ (token.text), left, right, at: token.at })
    }
    return left
  }

  /** @returns {FormulaNode} */
  const parseOr = () => leftAssociative(parseAnd, new Set(['||']))
  /** @returns {FormulaNode} */
  const parseAnd = () => leftAssociative(parseCompare, new Set(['&&']))
  /** @returns {FormulaNode} */
  const parseCompare = () => {
    const left = parseSum()
    if (peek().kind !== 'op' || !COMPARE_OPS.has(peek().text)) return left
    const token = peek()
    index += 1
    const right = parseSum()
    if (peek().kind === 'op' && COMPARE_OPS.has(peek().text)) {
      throw syntax('comparisons don’t chain; join them with &&', peek().at)
    }
    return make({ type: 'binary', op: /** @type {BinaryOp} */ (token.text), left, right, at: token.at })
  }
  /** @returns {FormulaNode} */
  const parseSum = () => leftAssociative(parseProduct, new Set(['+', '-']))
  /** @returns {FormulaNode} */
  const parseProduct = () => leftAssociative(parseUnary, new Set(['*', '/']))
  /** @returns {FormulaNode} */
  const parseUnary = () => {
    const token = peek()
    if (token.kind === 'op' && (token.text === '-' || token.text === '+' || token.text === '!')) {
      index += 1
      enter(token.at)
      const operand = parseUnary()
      depth -= 1
      return make({ type: 'unary', op: /** @type {'-' | '+' | '!'} */ (token.text), operand, at: token.at })
    }
    return parsePrimary()
  }

  /** @returns {FormulaNode} */
  const parsePrimary = () => {
    const token = peek()
    if (token.kind === 'number') {
      index += 1
      return make({ type: 'number', value: token.value, at: token.at })
    }
    if (token.kind === 'text') {
      index += 1
      return make({ type: 'text', value: token.text, at: token.at })
    }
    if (token.kind === 'op' && token.text === '(') {
      index += 1
      enter(token.at)
      const inner = parseOr()
      expectOp(')')
      depth -= 1
      return inner
    }
    const next = tokenAt(index + 1)
    const dotNext = next.kind === 'op' && next.text === '.'
    if (token.kind === 'ident') {
      if (next.kind === 'op' && next.text === '(') return parseCall(token)
      if (dotNext) return parseReference()
      index += 1
      return make({ type: 'variable', name: token.text, at: token.at })
    }
    if (token.kind === 'bracket' || token.kind === 'id') {
      if (dotNext) return parseReference()
      throw syntax(`${describe(token)} needs a quantity after it, such as .width`, token.at)
    }
    if (token.kind === 'end') throw syntax('the formula ends too soon', token.at)
    throw syntax(`expected a number, a name or “(” but found ${describe(token)}`, token.at)
  }

  /**
   * @param {Token} name
   * @returns {CallNode}
   */
  const parseCall = (name) => {
    index += 2
    enter(name.at)
    /** @type {FormulaNode[]} */
    const args = []
    if (isOp(')')) {
      index += 1
    } else {
      for (;;) {
        args.push(parseOr())
        if (args.length > FORMULA_LIMITS.maxArgs) {
          throw new FormulaError(`a function takes at most ${FORMULA_LIMITS.maxArgs} arguments`, { code: 'limit', position: name.at })
        }
        if (isOp(',')) {
          index += 1
          continue
        }
        expectOp(')')
        break
      }
    }
    depth -= 1
    return make({ type: 'call', name: name.text, args: Object.freeze(args), at: name.at })
  }

  /** @returns {ReadNode} */
  const parseReference = () => {
    const first = peek()
    /** @type {Token[]} */
    const segments = [first]
    index += 1
    while (isOp('.')) {
      index += 1
      const segment = peek()
      if (segment.kind !== 'ident' && segment.kind !== 'bracket') {
        throw syntax(`expected a part or quantity after “.” but found ${describe(segment)}`, segment.at)
      }
      segments.push(segment)
      index += 1
    }
    const last = segments.at(-1) ?? first
    const before = segments.at(-2)
    /** @type {string | null} */
    let quantity = null
    let used = 0
    if (last.kind === 'ident' && QUANTITIES.has(last.text) && EXTENTS.some((word) => word === last.text)) {
      quantity = last.text
      used = 1
    } else if (last.kind === 'ident' && before?.kind === 'ident' && QUANTITIES.has(`${before.text}.${last.text}`)) {
      quantity = `${before.text}.${last.text}`
      used = 2
    }
    if (quantity === null) {
      throw syntax(`${describe(last)} is not a quantity; use width, depth, height, or size, min, max or center with .x, .y or .z`, last.at)
    }
    const names = segments.slice(0, segments.length - used)
    if (names.length === 0) throw syntax(`${quantity} needs a body before it`, first.at)
    if (names.length > 2) {
      throw syntax('a reference is body.quantity or body.part.quantity; use brackets for a name holding dots', first.at)
    }
    reads += 1
    if (reads > FORMULA_LIMITS.maxPartReads) {
      throw new FormulaError(`a formula reads at most ${FORMULA_LIMITS.maxPartReads} sizes`, { code: 'limit', position: first.at })
    }
    const bodyToken = names.at(0) ?? first
    const partToken = names.at(1)
    const body = Object.freeze({ kind: /** @type {'id' | 'name'} */ (bodyToken.kind === 'id' ? 'id' : 'name'), text: bodyToken.text })
    return make({ type: 'read', body, part: partToken === undefined ? null : partToken.text, quantity, at: first.at })
  }

  const tree = parseOr()
  if (peek().kind !== 'end') throw syntax(`unexpected ${describe(peek())}`, peek().at)
  return tree
}

// ── Functions ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} FunctionEntry
 * @property {string} name
 * @property {number} minArgs
 * @property {number} maxArgs
 * @property {((values: number[], at: number) => number) | null} apply `null` for `if`, which
 *   the evaluator handles so that only the branch taken is evaluated.
 */

/**
 * @param {string} message
 * @param {number} at
 * @returns {FormulaError}
 */
const mathError = (message, at) => new FormulaError(message, { code: 'math', position: at })

const RADIANS_PER_DEGREE = Math.PI / 180
/** @param {number} value @returns {number} */
const nearInteger = (value) => {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) <= 1e-9 * Math.max(1, Math.abs(value)) ? rounded : value
}
/** @param {number} value @returns {number} Half away from zero, so round(-2.5) is -3. */
const roundHalfAway = (value) => Math.sign(value) * Math.round(Math.abs(value))

/**
 * @param {string} name
 * @param {(value: number) => number} snap
 * @returns {(values: number[], at: number) => number}
 */
const toStep = (name, snap) => ([value, step], at) => {
  if (!(step > 0)) throw mathError(`${name}’s step must be greater than 0, got ${step}`, at)
  return snap(nearInteger(value / step)) * step
}

/**
 * @param {string} name
 * @returns {(values: number[], at: number) => number}
 */
const inverseTrig = (name) => ([value], at) => {
  if (value < -1 || value > 1) throw mathError(`${name} needs a value from -1 to 1, got ${value}`, at)
  return (name === 'asin' ? Math.asin(value) : Math.acos(value)) / RADIANS_PER_DEGREE
}

const VARIADIC = FORMULA_LIMITS.maxArgs

/** @type {readonly FunctionEntry[]} */
const FUNCTION_LIST = [
  { name: 'abs', minArgs: 1, maxArgs: 1, apply: ([value]) => Math.abs(value) },
  { name: 'min', minArgs: 1, maxArgs: VARIADIC, apply: (values) => Math.min(...values) },
  { name: 'max', minArgs: 1, maxArgs: VARIADIC, apply: (values) => Math.max(...values) },
  {
    name: 'clamp', minArgs: 3, maxArgs: 3, apply: ([value, low, high], at) => {
      if (low > high) throw mathError(`clamp’s low end (${low}) is above its high end (${high})`, at)
      return Math.min(Math.max(value, low), high)
    },
  },
  { name: 'round', minArgs: 1, maxArgs: 1, apply: ([value]) => roundHalfAway(value) },
  { name: 'floor', minArgs: 1, maxArgs: 1, apply: ([value]) => Math.floor(value) },
  { name: 'ceil', minArgs: 1, maxArgs: 1, apply: ([value]) => Math.ceil(value) },
  { name: 'roundTo', minArgs: 2, maxArgs: 2, apply: toStep('roundTo', roundHalfAway) },
  { name: 'floorTo', minArgs: 2, maxArgs: 2, apply: toStep('floorTo', Math.floor) },
  { name: 'ceilTo', minArgs: 2, maxArgs: 2, apply: toStep('ceilTo', Math.ceil) },
  {
    name: 'sqrt', minArgs: 1, maxArgs: 1, apply: ([value], at) => {
      if (value < 0) throw mathError(`sqrt of a negative number (${value})`, at)
      return Math.sqrt(value)
    },
  },
  { name: 'pow', minArgs: 2, maxArgs: 2, apply: ([base, exponent]) => Math.pow(base, exponent) },
  { name: 'hypot', minArgs: 1, maxArgs: VARIADIC, apply: (values) => Math.hypot(...values) },
  { name: 'sin', minArgs: 1, maxArgs: 1, apply: ([degrees]) => Math.sin(degrees * RADIANS_PER_DEGREE) },
  { name: 'cos', minArgs: 1, maxArgs: 1, apply: ([degrees]) => Math.cos(degrees * RADIANS_PER_DEGREE) },
  {
    name: 'tan', minArgs: 1, maxArgs: 1, apply: ([degrees], at) => {
      if ((((degrees % 180) + 180) % 180) === 90) throw mathError(`tan(${degrees}) is infinite`, at)
      return Math.tan(degrees * RADIANS_PER_DEGREE)
    },
  },
  { name: 'asin', minArgs: 1, maxArgs: 1, apply: inverseTrig('asin') },
  { name: 'acos', minArgs: 1, maxArgs: 1, apply: inverseTrig('acos') },
  {
    name: 'atan2', minArgs: 2, maxArgs: 2, apply: ([y, x], at) => {
      if (y === 0 && x === 0) throw mathError('atan2(0, 0) has no direction', at)
      return Math.atan2(y, x) / RADIANS_PER_DEGREE
    },
  },
  { name: 'pi', minArgs: 0, maxArgs: 0, apply: () => Math.PI },
  { name: 'inch', minArgs: 1, maxArgs: 1, apply: ([inches]) => inches * 25.4 },
  { name: 'if', minArgs: 3, maxArgs: 3, apply: null },
]

/** @type {Map<string, FunctionEntry>} Module-private, so nothing can add to it. */
const FUNCTIONS = new Map(FUNCTION_LIST.map((entry) => [entry.name, Object.freeze(entry)]))

/** Every built-in function and how many arguments it takes, for menus and tool descriptions. */
export const FORMULA_FUNCTIONS = Object.freeze(FUNCTION_LIST.map(({ name, minArgs, maxArgs }) => Object.freeze({ name, minArgs, maxArgs })))

/**
 * @param {FunctionEntry} entry
 * @returns {string}
 */
function arityText(entry) {
  if (entry.minArgs === entry.maxArgs) return `${entry.minArgs} argument${entry.minArgs === 1 ? '' : 's'}`
  return `at least ${entry.minArgs} argument${entry.minArgs === 1 ? '' : 's'}`
}

/**
 * @param {string} name
 * @param {number} count
 * @param {number} at
 * @returns {FunctionEntry}
 */
function functionFor(name, count, at) {
  const entry = FUNCTIONS.get(name)
  if (entry === undefined) throw new FormulaError(`there is no function named ${shown(name)}`, { code: 'reference', position: at })
  if (count < entry.minArgs || count > entry.maxArgs) {
    throw new FormulaError(`${name} takes ${arityText(entry)}, got ${count}`, { code: 'type', position: at })
  }
  return entry
}

// ── Static type check ───────────────────────────────────────────────────────────────────

/**
 * @typedef {{ kind: 'number' } | { kind: 'boolean' } | { kind: 'text' } | { kind: 'option', name: string, values: readonly (string | number)[] }} FormulaType
 */

const NUMBER_TYPE = Object.freeze(/** @type {FormulaType} */ ({ kind: 'number' }))
const BOOLEAN_TYPE = Object.freeze(/** @type {FormulaType} */ ({ kind: 'boolean' }))
const TEXT_TYPE = Object.freeze(/** @type {FormulaType} */ ({ kind: 'text' }))
/** @type {ReadonlyMap<string, FormulaVariable>} */
const NO_VARIABLES = new Map()

/** @param {FormulaType} type @returns {string} */
function typeText(type) {
  if (type.kind === 'number') return 'a number'
  if (type.kind === 'boolean') return 'yes/no'
  if (type.kind === 'text') return 'text'
  return `a choice (${shown(type.name)})`
}

/** @param {string | number} value @returns {string} */
const optionText = (value) => (typeof value === 'string' ? JSON.stringify(shown(value)) : String(value))

/**
 * @param {string} message
 * @param {number} at
 * @returns {FormulaError}
 */
const typeError = (message, at) => new FormulaError(message, { code: 'type', position: at })

/**
 * Checks a parsed formula's types against the variables' kinds: arithmetic and ordering take
 * numbers, `&&`/`||`/`!` take yes/no, `if` takes a yes/no and two numbers, a choice compares
 * only with `==`/`!=` and only with one of its options, and the result must be a number.
 *
 * @param {FormulaNode} tree
 * @param {ReadonlyMap<string, FormulaVariable>} [variables]
 * @returns {'number'}
 * @throws {FormulaError} `type` for a mismatch, `reference` for an unknown variable or function.
 */
export function checkFormula(tree, variables = NO_VARIABLES) {
  const type = typeOf(tree, variables)
  if (type.kind !== 'number') throw typeError(`a formula’s result must be a number; this one gives ${typeText(type)}`, tree.at)
  return 'number'
}

/**
 * @param {FormulaNode} node
 * @param {ReadonlyMap<string, FormulaVariable>} variables
 * @returns {FormulaType}
 */
function typeOf(node, variables) {
  switch (node.type) {
    case 'number':
    case 'read':
      return NUMBER_TYPE
    case 'text':
      return TEXT_TYPE
    case 'variable': {
      const entry = variables.get(node.name)
      if (entry === undefined) throw new FormulaError(`there is no variable named ${shown(node.name)}`, { code: 'reference', position: node.at })
      if (entry.kind === 'number') return NUMBER_TYPE
      if (entry.kind === 'boolean') return BOOLEAN_TYPE
      if (entry.kind === 'enum') return { kind: 'option', name: node.name, values: (entry.options ?? []).map((option) => option.value) }
      throw typeError(`${shown(node.name)} is not a kind of variable a formula can read`, node.at)
    }
    case 'unary': {
      const operand = typeOf(node.operand, variables)
      if (node.op === '!') {
        if (operand.kind !== 'boolean') throw typeError(`! needs yes/no, not ${typeText(operand)}`, node.at)
        return BOOLEAN_TYPE
      }
      if (operand.kind !== 'number') throw typeError(`${node.op} needs a number, not ${typeText(operand)}`, node.at)
      return NUMBER_TYPE
    }
    case 'binary':
      return binaryType(node, typeOf(node.left, variables), typeOf(node.right, variables))
    case 'call': {
      const entry = functionFor(node.name, node.args.length, node.at)
      const types = node.args.map((arg) => typeOf(arg, variables))
      types.forEach((type, n) => {
        const wanted = entry.name === 'if' && n === 0 ? 'boolean' : 'number'
        if (type.kind !== wanted) {
          const what = wanted === 'boolean' ? 'a yes/no condition first' : 'numbers'
          throw typeError(`${node.name} needs ${what}, got ${typeText(type)}`, node.at)
        }
      })
      return NUMBER_TYPE
    }
    default:
      throw typeError('this is not a formula', 0)
  }
}

/**
 * @param {BinaryNode} node
 * @param {FormulaType} left
 * @param {FormulaType} right
 * @returns {FormulaType}
 */
function binaryType(node, left, right) {
  const { op } = node
  if (op === '&&' || op === '||') {
    if (left.kind !== 'boolean' || right.kind !== 'boolean') {
      throw typeError(`${op} needs yes/no on both sides, got ${typeText(left)} and ${typeText(right)}`, node.at)
    }
    return BOOLEAN_TYPE
  }
  if (op === '==' || op === '!=') return equalityType(node, left, right)
  for (const side of [left, right]) {
    if (side.kind === 'option' && ORDER_OPS.has(op)) {
      throw typeError(`${shown(side.name)} is a choice; compare it with == or !=`, node.at)
    }
  }
  if (left.kind !== 'number' || right.kind !== 'number') {
    throw typeError(`${op} needs numbers on both sides, got ${typeText(left)} and ${typeText(right)}`, node.at)
  }
  return ARITHMETIC_OPS.has(op) ? NUMBER_TYPE : BOOLEAN_TYPE
}

/**
 * @param {BinaryNode} node
 * @param {FormulaType} left
 * @param {FormulaType} right
 * @returns {FormulaType}
 */
function equalityType(node, left, right) {
  if (left.kind !== 'option' && right.kind !== 'option') {
    if (left.kind === right.kind) return BOOLEAN_TYPE
    throw typeError(`can’t compare ${typeText(left)} with ${typeText(right)}`, node.at)
  }
  if (left.kind === 'option' && right.kind === 'option') return BOOLEAN_TYPE
  const choice = left.kind === 'option' ? left : right
  const other = left.kind === 'option' ? right : left
  const otherNode = left.kind === 'option' ? node.right : node.left
  if (choice.kind !== 'option') return BOOLEAN_TYPE
  const listed = choice.values.map(optionText).join(', ')
  if (otherNode.type === 'number' || otherNode.type === 'text') {
    const literal = otherNode.value
    if (!choice.values.some((value) => value === literal)) {
      throw typeError(`${optionText(literal)} is not one of ${shown(choice.name)}’s options (${listed})`, otherNode.at)
    }
    return BOOLEAN_TYPE
  }
  const wanted = other.kind === 'number' ? 'number' : other.kind === 'text' ? 'string' : null
  if (wanted !== null && choice.values.some((value) => typeof value === wanted)) return BOOLEAN_TYPE
  throw typeError(`${shown(choice.name)} is a choice; compare it with one of its options (${listed})`, node.at)
}

// ── Interpreter ─────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a parsed (and checked) formula. Visits each node at most once, takes only the
 * branch an `if` chooses, and short-circuits `&&`/`||`.
 *
 * @param {FormulaNode} tree From {@link parseFormula}.
 * @param {FormulaContext} [context]
 * @returns {number} Finite; `-0` comes back as `0`.
 * @throws {FormulaError}
 */
export function evaluateFormula(tree, context = {}) {
  const variables = context.variables ?? NO_VARIABLES
  const read = context.read ?? null
  const budget = context.budget ?? { visits: FORMULA_LIMITS.maxNodeVisitsPerFold }

  /**
   * @param {number | boolean | string} value
   * @param {number} at
   * @returns {number}
   */
  const asNumber = (value, at) => {
    if (typeof value !== 'number') throw typeError(`expected a number, got ${typeof value === 'boolean' ? 'yes/no' : 'text'}`, at)
    return value
  }
  /**
   * @param {number | boolean | string} value
   * @param {number} at
   * @returns {boolean}
   */
  const asBoolean = (value, at) => {
    if (typeof value !== 'boolean') throw typeError('expected yes/no', at)
    return value
  }
  /**
   * @param {number} value
   * @param {number} at
   * @returns {number}
   */
  const finite = (value, at) => {
    if (Number.isNaN(value)) throw mathError(`this has no real value (at character ${at + 1})`, at)
    if (!Number.isFinite(value)) throw mathError(`the result is too large (at character ${at + 1})`, at)
    return value
  }

  /**
   * @param {FormulaNode} node
   * @returns {number | boolean | string}
   */
  const valueOf = (node) => {
    if (!(budget.visits > 0)) {
      throw new FormulaError('formulas have used up this rebuild’s calculation budget', { code: 'budget', position: node.at })
    }
    budget.visits -= 1
    switch (node.type) {
      case 'number':
      case 'text':
        return node.value
      case 'variable':
        return variableValue(node)
      case 'read':
        return readValue(node)
      case 'unary': {
        const operand = valueOf(node.operand)
        if (node.op === '!') return !asBoolean(operand, node.at)
        const value = asNumber(operand, node.at)
        return node.op === '-' ? -value : value
      }
      case 'binary':
        return binaryValue(node)
      case 'call':
        return callValue(node)
      default:
        throw typeError('this is not a formula', 0)
    }
  }

  /**
   * @param {VariableNode} node
   * @returns {number | boolean | string}
   */
  const variableValue = (node) => {
    const entry = variables.get(node.name)
    const name = shown(node.name)
    if (entry === undefined) throw new FormulaError(`there is no variable named ${name}`, { code: 'reference', position: node.at })
    if (typeof entry.error === 'string') {
      throw new FormulaError(`${name}’s formula can’t be used: ${shown(entry.error, QUOTED_ERROR_LENGTH)}`, { code: 'reference', position: node.at })
    }
    const { value } = entry
    if (value === undefined) throw new FormulaError(`${name} has no value yet`, { code: 'reference', position: node.at })
    if (typeof value === 'number') return finite(value, node.at)
    if (typeof value === 'boolean' || typeof value === 'string') return value
    throw new FormulaError(`${name} holds no value a formula can read`, { code: 'reference', position: node.at })
  }

  /**
   * @param {ReadNode} node
   * @returns {number}
   */
  const readValue = (node) => {
    const what = `${node.body.kind === 'id' ? '#' : ''}${shown(node.body.text)}${node.part === null ? '' : `.${shown(node.part)}`}.${node.quantity}`
    if (read === null) throw new FormulaError(`${what} can’t be read here: nothing measures parts`, { code: 'reference', position: node.at })
    const quantity = QUANTITIES.get(node.quantity)
    if (quantity === undefined) throw new FormulaError(`${shown(node.quantity)} is not a quantity`, { code: 'reference', position: node.at })
    const value = read(node.body, node.part, quantity)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new FormulaError(`reading ${what} gave no number`, { code: 'reference', position: node.at })
    }
    return value
  }

  /**
   * @param {BinaryNode} node
   * @returns {number | boolean}
   */
  const binaryValue = (node) => {
    const { op, at } = node
    if (op === '&&') return asBoolean(valueOf(node.left), at) && asBoolean(valueOf(node.right), at)
    if (op === '||') return asBoolean(valueOf(node.left), at) || asBoolean(valueOf(node.right), at)
    const left = valueOf(node.left)
    const right = valueOf(node.right)
    if (op === '==') return left === right
    if (op === '!=') return left !== right
    const a = asNumber(left, at)
    const b = asNumber(right, at)
    switch (op) {
      case '+': return finite(a + b, at)
      case '-': return finite(a - b, at)
      case '*': return finite(a * b, at)
      case '/':
        if (b === 0) throw mathError(`division by zero (at character ${at + 1})`, at)
        return finite(a / b, at)
      case '<': return a < b
      case '<=': return a <= b
      case '>': return a > b
      default: return a >= b
    }
  }

  /**
   * @param {CallNode} node
   * @returns {number}
   */
  const callValue = (node) => {
    const entry = functionFor(node.name, node.args.length, node.at)
    if (entry.apply === null) {
      const [condition, whenYes, whenNo] = node.args
      return asNumber(valueOf(asBoolean(valueOf(condition), node.at) ? whenYes : whenNo), node.at)
    }
    const values = node.args.map((arg) => asNumber(valueOf(arg), node.at))
    return finite(entry.apply(values, node.at), node.at)
  }

  const result = asNumber(valueOf(tree), tree.at)
  return result === 0 ? 0 : result
}

/**
 * Parses, checks and evaluates in one call.
 *
 * @param {string} text
 * @param {FormulaContext} [context]
 * @returns {number}
 * @throws {FormulaError}
 */
export function calculateFormula(text, context = {}) {
  const tree = parseFormula(text)
  checkFormula(tree, context.variables)
  return evaluateFormula(tree, context)
}

// ── Printer ─────────────────────────────────────────────────────────────────────────────

const PRECEDENCE = new Map([
  ['||', 1], ['&&', 2],
  ['==', 3], ['!=', 3], ['<', 3], ['<=', 3], ['>', 3], ['>=', 3],
  ['+', 4], ['-', 4], ['*', 5], ['/', 5],
])
const UNARY_PRECEDENCE = 6
const COMPARE_PRECEDENCE = 3

/** @param {FormulaNode} node @returns {number} */
function precedenceOf(node) {
  if (node.type === 'binary') return PRECEDENCE.get(node.op) ?? 0
  if (node.type === 'unary') return UNARY_PRECEDENCE
  if (node.type === 'number' && (node.value < 0 || Object.is(node.value, -0))) return UNARY_PRECEDENCE
  return UNARY_PRECEDENCE + 1
}

/**
 * A body or part name as a formula writes it: bare when it is an identifier that is not a
 * quantity word, otherwise in brackets.
 *
 * @param {string} name
 * @returns {string}
 */
function nameText(name) {
  if (isIdent(name) && !QUANTITY_WORDS.has(name)) return name
  if (!isBracketable(name)) throw new FormulaError(`the name ${shown(name)} can’t be written in a formula`, { code: 'syntax' })
  return `[${name}]`
}

/** @param {FormulaBody} body @returns {string} */
const bodyText = (body) => (body.kind === 'id' ? `#${body.text}` : nameText(body.text))

/**
 * @param {number} value
 * @returns {string}
 */
function numberText(value) {
  if (Object.is(value, -0)) return '-0'
  return value < 0 ? `-${String(-value)}` : String(value)
}

/**
 * Prints a tree back to formula text: canonical spacing, the fewest parentheses that keep the
 * same tree, double quotes unless the text holds one. `printFormula(parseFormula(x))` is
 * stable under a second round trip.
 *
 * @param {FormulaNode} tree
 * @returns {string}
 */
export function printFormula(tree) {
  /**
   * @param {FormulaNode} node
   * @param {boolean} wrap
   * @returns {string}
   */
  const child = (node, wrap) => (wrap ? `(${print(node)})` : print(node))
  /**
   * @param {FormulaNode} node
   * @returns {string}
   */
  const print = (node) => {
    switch (node.type) {
      case 'number':
        return numberText(node.value)
      case 'text':
        return node.value.includes('"') ? `'${node.value}'` : `"${node.value}"`
      case 'variable':
        return node.name
      case 'read':
        return `${bodyText(node.body)}${node.part === null ? '' : `.${nameText(node.part)}`}.${node.quantity}`
      case 'call':
        return `${node.name}(${node.args.map(print).join(', ')})`
      case 'unary':
        return `${node.op}${child(node.operand, precedenceOf(node.operand) < UNARY_PRECEDENCE)}`
      case 'binary': {
        const own = PRECEDENCE.get(node.op) ?? 0
        const left = precedenceOf(node.left)
        const wrapLeft = left < own || (own === COMPARE_PRECEDENCE && left === COMPARE_PRECEDENCE)
        return `${child(node.left, wrapLeft)} ${node.op} ${child(node.right, precedenceOf(node.right) <= own)}`
      }
      default:
        throw typeError('this is not a formula', 0)
    }
  }
  return print(tree)
}

// ── Tree rewrites ───────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} FormulaRewrite
 * @property {(name: string) => string | number | undefined} [variable] A new variable name, a
 *   number to put in its place, or `undefined` to keep it.
 * @property {(body: FormulaBody) => FormulaBody | undefined} [body] A new body, or `undefined`.
 */

/**
 * Rebuilds a tree with variables or bodies replaced — renames, keep-values deletes and the
 * name ↔ id swap all go through this, never through the text.
 *
 * @param {FormulaNode} tree
 * @param {FormulaRewrite} rewrite
 * @returns {FormulaNode} A new frozen tree; the input is untouched.
 * @throws {FormulaError} For a replacement a formula cannot hold.
 */
export function rewriteFormula(tree, rewrite) {
  /**
   * @param {FormulaNode} node
   * @returns {FormulaNode}
   */
  const walk = (node) => {
    switch (node.type) {
      case 'variable': {
        const replacement = rewrite.variable?.(node.name)
        if (replacement === undefined) return node
        if (typeof replacement === 'number') {
          if (!Number.isFinite(replacement)) throw mathError(`${shown(node.name)} can’t be replaced by ${replacement}`, node.at)
          return Object.freeze({ type: 'number', value: replacement, at: node.at })
        }
        if (!isIdent(replacement)) throw syntax(`${shown(replacement)} is not a variable name`, node.at)
        return Object.freeze({ ...node, name: replacement })
      }
      case 'read': {
        const replacement = rewrite.body?.(node.body)
        if (replacement === undefined) return node
        const ok = replacement.kind === 'id' ? isIdText(replacement.text) : isBracketable(replacement.text)
        if (!ok) throw new FormulaError(`${shown(replacement.text)} can’t be referenced in a formula`, { code: 'reference', position: node.at })
        return Object.freeze({ ...node, body: Object.freeze({ kind: replacement.kind, text: replacement.text }) })
      }
      case 'unary':
        return Object.freeze({ ...node, operand: walk(node.operand) })
      case 'binary':
        return Object.freeze({ ...node, left: walk(node.left), right: walk(node.right) })
      case 'call':
        return Object.freeze({ ...node, args: Object.freeze(node.args.map(walk)) })
      default:
        return node
    }
  }
  return walk(tree)
}

/**
 * The variables and part reads a formula names, each once, in the order written — both
 * branches of an `if` included.
 *
 * @param {FormulaNode} tree
 * @returns {{ variables: string[], reads: { body: FormulaBody, part: string | null, quantity: string }[] }}
 */
export function formulaReferences(tree) {
  /** @type {Set<string>} */
  const variableNames = new Set()
  /** @type {Map<string, { body: FormulaBody, part: string | null, quantity: string }>} */
  const reads = new Map()
  /** @param {FormulaNode} node */
  const walk = (node) => {
    if (node.type === 'variable') variableNames.add(node.name)
    else if (node.type === 'read') {
      const key = JSON.stringify([node.body.kind, node.body.text, node.part, node.quantity])
      if (!reads.has(key)) reads.set(key, { body: node.body, part: node.part, quantity: node.quantity })
    } else if (node.type === 'unary') walk(node.operand)
    else if (node.type === 'binary') {
      walk(node.left)
      walk(node.right)
    } else if (node.type === 'call') node.args.forEach(walk)
  }
  walk(tree)
  return { variables: [...variableNames], reads: [...reads.values()] }
}

// ── Names ↔ ids ─────────────────────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @param {string} label How the body was named, for the message.
 * @param {number} at
 * @returns {string}
 */
function writableId(id, label, at) {
  if (!isIdText(id)) {
    throw new FormulaError(`${shown(label)} (${shown(id)}) can't be referenced: its id holds characters a formula can't write`, { code: 'reference', position: at })
  }
  return id
}

/**
 * The stored form of a formula a person or agent typed: every body named by its lineage-root
 * id (`#cube-a1-3`), variables by name, parts as text. A name two bodies share is refused,
 * listing them.
 *
 * @param {string} text
 * @param {FormulaLookup} lookup
 * @returns {string}
 * @throws {FormulaError}
 */
export function formulaToStored(text, lookup) {
  const tree = parseFormula(text)
  const stored = rewriteFormula(tree, {
    body: (body) => {
      if (body.kind === 'id') {
        const root = lookup.rootOf(body.text)
        if (root === null) throw new FormulaError(`there is no body #${shown(body.text)}`, { code: 'reference' })
        return { kind: 'id', text: writableId(root, `#${body.text}`, 0) }
      }
      const ids = lookup.idsNamed(body.text)
      const name = shown(body.text)
      if (ids.length === 0) throw new FormulaError(`there is no body named ${name}`, { code: 'reference' })
      const first = ids.at(0) ?? ''
      if (ids.length > 1) {
        const count = ids.length === 2 ? 'Two' : String(ids.length)
        throw new FormulaError(`${count} bodies are named ${name} (${ids.map((id) => shown(id)).join(', ')}): use #${shown(first)} to choose one.`, { code: 'reference' })
      }
      return { kind: 'id', text: writableId(first, body.text, 0) }
    },
  })
  return printFormula(stored)
}

/**
 * The form of a stored formula to show a person: each `#id` replaced by the body's current
 * name, in brackets where needed. A body that no longer exists, whose name another body also
 * has, or whose name cannot be written in brackets stays `#id`, so the text shown always
 * stores back to the same ids.
 *
 * @param {string} stored
 * @param {FormulaLookup} lookup
 * @returns {string}
 * @throws {FormulaError} For stored text that does not parse.
 */
export function formulaToDisplay(stored, lookup) {
  const tree = parseFormula(stored)
  const shownTree = rewriteFormula(tree, {
    body: (body) => {
      if (body.kind !== 'id') return undefined
      const name = lookup.nameOf(body.text)
      if (name === null || !isBracketable(name) || lookup.idsNamed(name).length !== 1) return undefined
      return { kind: 'name', text: name }
    },
  })
  return printFormula(shownTree)
}
