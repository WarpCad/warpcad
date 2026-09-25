/**
 * Part colour for composite-recipe op records (TODO/core-026): the representation, the
 * one conversion from V1's colour names into it, and its validation.
 *
 * ## Why this exists
 *
 * `.color(name)`/`.color(name, alpha)` is how nearly every real V1 project told its
 * parts apart, and the V1→V3 recipe ports dropped every one of those calls without a
 * note. A washer that V1 drew gray with a red clearance came through as two uncoloured
 * solids. This module is the place those calls land.
 *
 * ## The representation: a numeric `0xRRGGBB`, plus an optional alpha
 *
 * A record carries `color: number` (a 24-bit integer, `0x000000`-`0xffffff`) and,
 * only when it is not opaque, `colorAlpha: number` in `(0, 1]`. Numeric because that is
 * what `src/render/mesh.js` already hands `MeshStandardMaterial({ color })`, so the
 * eventual renderer reads the value as-is and never parses a name per frame. V1's
 * CSS-style names are converted once, here, at the recipe boundary, which is where a
 * recipe calls {@link v1ColorToRecord}. That is `CLAUDE.md`'s "name every conversion at
 * its boundary" rule.
 *
 * `colorAlpha` is left out at 1 rather than written as `colorAlpha: 1`, the same way a
 * record only says `hidden: true` and never `hidden: false`. An absent `color` means
 * "V1 said nothing". It does not mean a default colour: the renderer's theme palette
 * stays in charge of those bodies.
 *
 * ## Scope: kernel records only
 *
 * Nothing renders this yet. `data-005` carries it into the document model, `ui-037`
 * writes it from the Inspector, and `src/render/mesh.js` gains a per-body material then.
 * Until those land, the colour is carried on the record, on the evaluated
 * {@link import('./group.js').Group}'s `colors`, and across the worker boundary
 * (`transport.js`), so that nothing drops it again on the way.
 *
 * @module core/kernel/colors
 */

/**
 * The record fields a colour occupies, exactly as a recipe spreads them into an
 * `OpRecord`.
 *
 * @typedef {object} RecordColor
 * @property {number} color `0xRRGGBB`.
 * @property {number} [colorAlpha] In `(0, 1]`; omitted when 1.
 */

/**
 * V1's colour-name table, verbatim: `jscad-utils@3.2.0`'s `jscad-utils-color.jscad`
 * `Colors.nameArray`, with each `'#rrggbb'` string written as the same number.
 * `jscad-utils@6.0.0`'s `src/color.js`, which `jscad-raspberrypi` runs under, has the
 * identical 147 entries. `colors.spec.js` re-reads the installed V1 file on every run
 * and diffs this against it, so a typo here fails a test rather than a render.
 *
 * The whole table rather than just the six names today's recipes use. The remaining
 * `raspberrypi.*` parts (`TODO/core-033`) reach for `lightgray`, `darkorange`,
 * `deepskyblue` and more, and a partial copy of a lookup table is how one of them
 * silently becomes `undefined`.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const V1_CSS_COLOR_HEX = Object.freeze({
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgrey: 0xa9a9a9,
  darkgreen: 0x006400,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  grey: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgrey: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370d8,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xd87093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
})

/**
 * Convert V1's `.color(name)` / `.color(name, alpha)` into the record fields that carry
 * it, e.g. `{ ...v1ColorToRecord('green', 0.75) }`.
 *
 * Mirrors V1's own `Colors.color(o, name, alpha)` (`c[3] = g || 1.0`) with one
 * deliberate difference: V1 read a falsy alpha as opaque, so `.color('red', 0)` drew
 * solid red. Here that throws, because no real call site passes it and the alternative
 * is a record that says one thing and renders another.
 *
 * @param {string} name A V1/CSS colour name, e.g. `'gray'`.
 * @param {number} [alpha] V1's second argument. Omitted or `1` means opaque.
 * @returns {RecordColor}
 */
export function v1ColorToRecord(name, alpha) {
  const color = Object.hasOwn(V1_CSS_COLOR_HEX, name) ? V1_CSS_COLOR_HEX[name] : undefined
  if (color === undefined) {
    throw new Error(`unknown V1 colour name "${name}" — not in jscad-utils' own name table`)
  }
  if (alpha === undefined || alpha === 1) return { color }
  assertAlpha(alpha, `V1 colour "${name}" alpha`)
  return { color, colorAlpha: alpha }
}

/**
 * A `0xRRGGBB` colour as `[r, g, b]` in 0-1, by the same `/ 255` V1's `.color()` used,
 * so a V1 fixture's recorded colour compares with exact equality.
 *
 * @param {number} hex
 * @returns {[number, number, number]}
 */
export function hexToUnitRgb(hex) {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]
}

/**
 * @param {unknown} alpha
 * @param {string} label
 */
function assertAlpha(alpha, label) {
  if (typeof alpha !== 'number' || !(alpha > 0 && alpha <= 1)) {
    throw new Error(`${label} must be a number in (0, 1], got ${JSON.stringify(alpha)}`)
  }
}

/**
 * Check a record's `color`/`colorAlpha` pair, throwing with `label` in front so a bad
 * document line says which part it is. Both absent is valid (an uncoloured part).
 *
 * @param {unknown} color
 * @param {unknown} colorAlpha
 * @param {string} label Usually the part name.
 */
export function assertRecordColor(color, colorAlpha, label) {
  if (color === undefined) {
    if (colorAlpha !== undefined) {
      throw new Error(`${label}: colorAlpha ${JSON.stringify(colorAlpha)} given without a color to apply it to`)
    }
    return
  }
  if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error(
      `${label}: colour must be a 0xRRGGBB integer (0 to 16777215), got ${JSON.stringify(color)}`
    )
  }
  if (colorAlpha !== undefined) assertAlpha(colorAlpha, `${label}: colorAlpha`)
}
