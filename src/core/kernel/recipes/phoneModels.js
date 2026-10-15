// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The handset and case tables behind `kit.phone` (`TODO/core-057`). Pure data — no
 * imports — so a spec can assert that every row carries a source, a retrieval date and a
 * `verified | estimate` status, and so the numbers can be read without reading a recipe.
 *
 * ## What "verified" means here
 *
 * - A handset's **outer size** is `verified` when the manufacturer's own spec page
 *   publishes it (Apple's compare page, retrieved 2026-10-15). It is `estimate` when it
 *   came from a third-party database, or from a manufacturer page that could not be read
 *   on the retrieval date.
 * - A **plateau** (camera island) size, position and height is **always** `estimate`: no
 *   manufacturer publishes one. They are the author's reading of product photography and
 *   must be calipered before a printed pocket is trusted. The same warning the recipe's
 *   module comment has always carried.
 * - A **case** margin is `estimate` except Rugged, which is the one manufacturer-published
 *   case size found (OtterBox Defender Pro for iPhone 17 Pro).
 *
 * Axes: X is the handset's width, Y its height (length), Z its depth; the plateau sits on
 * the back and protrudes toward -Z at the +Y end, exactly as the phone lies screen-up.
 *
 * @module core/kernel/recipes/phoneModels
 */

const APPLE_SOURCE = 'apple.com/iphone/compare (outer size, mm)'
const ESTIMATE_PLATEAU = 'estimate: no manufacturer publishes a plateau size; read from product photos'
const RETRIEVED = '2026-10-15'

/**
 * One raised feature on the back of a handset.
 *
 * @typedef {object} PhonePlateau
 * @property {string} name Part name — `plateau` for the principal one, then `plateau2`, or
 *   what it is where the table knows (`cameraBar`, `lensRing`).
 * @property {number} widthMm X extent.
 * @property {number} lengthMm Y extent.
 * @property {number} heightMm How far it protrudes below the back.
 * @property {number} cornerRadiusMm
 * @property {number} xMm Centre's X offset from the handset's centre line (negative = -X).
 * @property {number} fromTopMm Gap between the +Y edge of the handset and the +Y edge of the plateau.
 * @property {'verified' | 'estimate'} status
 * @property {string} source
 */

/**
 * @typedef {object} PhoneModel
 * @property {string} id Stable key, written to a record's `model` param.
 * @property {string} label Human name for the dropdown and the group name.
 * @property {number} heightMm Y.
 * @property {number} widthMm X.
 * @property {number} depthMm Z, **excluding** the plateau.
 * @property {number} cornerRadiusMm Back corner radius (estimate).
 * @property {'verified' | 'estimate'} status Status of the outer size.
 * @property {string} source Where the outer size came from.
 * @property {string} retrieved ISO date the source was read.
 * @property {readonly PhonePlateau[]} plateaus
 */

/**
 * @param {string} name
 * @param {number} widthMm
 * @param {number} lengthMm
 * @param {number} heightMm
 * @param {number} cornerRadiusMm
 * @param {number} xMm
 * @param {number} fromTopMm
 * @returns {PhonePlateau}
 */
function plateau(name, widthMm, lengthMm, heightMm, cornerRadiusMm, xMm, fromTopMm) {
  return Object.freeze({
    name,
    widthMm,
    lengthMm,
    heightMm,
    cornerRadiusMm,
    xMm,
    fromTopMm,
    status: /** @type {const} */ ('estimate'),
    source: ESTIMATE_PLATEAU,
  })
}

/**
 * @param {string} id
 * @param {string} label
 * @param {[number, number, number]} size `[height Y, width X, depth Z]`
 * @param {number} cornerRadiusMm
 * @param {PhonePlateau} principal
 * @param {{ status?: 'verified' | 'estimate', source?: string }} [origin]
 * @returns {PhoneModel}
 */
function apple(id, label, size, cornerRadiusMm, principal, origin = {}) {
  return Object.freeze({
    id,
    label,
    heightMm: size[0],
    widthMm: size[1],
    depthMm: size[2],
    cornerRadiusMm,
    status: origin.status ?? 'verified',
    source: origin.source ?? APPLE_SOURCE,
    retrieved: RETRIEVED,
    plateaus: Object.freeze([principal]),
  })
}

/**
 * Android rows: Samsung's and Google's own spec pages could not be read on the retrieval
 * date (the fetch returned a truncated page), so every figure is third-party and an
 * `estimate`. The Galaxy S25 / S25+ and the Pixel 10 were not found and are left out
 * rather than guessed.
 *
 * @param {string} id
 * @param {string} label
 * @param {[number, number, number]} size
 * @param {number} cornerRadiusMm
 * @param {PhonePlateau} principal
 * @param {string} source
 * @returns {PhoneModel}
 */
function android(id, label, size, cornerRadiusMm, principal, source) {
  return apple(id, label, size, cornerRadiusMm, principal, { status: 'estimate', source })
}

/**
 * The handsets, in dropdown order: the current iPhone line-up, then the SE, then Android.
 *
 * @type {readonly PhoneModel[]}
 */
export const PHONE_MODELS = Object.freeze([
  apple('iphone-17-pro', 'iPhone 17 Pro', [150.0, 71.9, 8.75], 9.45, plateau('plateau', 71.9, 44, 4, 10, 0, 0)),
  apple('iphone-17-pro-max', 'iPhone 17 Pro Max', [163.4, 78.0, 8.75], 10, plateau('plateau', 78.0, 47, 4, 10, 0, 0)),
  apple('iphone-17', 'iPhone 17', [149.6, 71.5, 7.95], 9.5, plateau('plateau', 71.5, 24, 2.5, 8, 0, 0)),
  apple('iphone-air', 'iPhone Air', [156.2, 74.7, 5.64], 9.5, plateau('plateau', 74.7, 24, 5.2, 8, 0, 0)),
  apple('iphone-16-pro', 'iPhone 16 Pro', [149.6, 71.5, 8.25], 9.5, plateau('plateau', 37, 37, 3.5, 9, -14.25, 3)),
  apple('iphone-16-pro-max', 'iPhone 16 Pro Max', [163.0, 77.6, 8.25], 10, plateau('plateau', 37, 37, 3.5, 9, -17.3, 3)),
  apple('iphone-16', 'iPhone 16', [147.6, 71.6, 7.8], 9.5, plateau('plateau', 22, 38, 1.5, 8, -21.8, 3)),
  apple('iphone-16-plus', 'iPhone 16 Plus', [160.9, 77.8, 7.8], 10, plateau('plateau', 22, 38, 1.5, 8, -24.9, 3)),
  apple('iphone-16e', 'iPhone 16e', [146.7, 71.5, 7.8], 9.5, plateau('plateau', 14, 14, 1.5, 5, -25.75, 3)),
  apple('iphone-se-3', 'iPhone SE (3rd gen)', [138.4, 67.3, 7.3], 8, plateau('plateau', 12, 12, 1.5, 4, -24.65, 3)),
  android(
    'galaxy-s25-ultra',
    'Galaxy S25 Ultra',
    [162.8, 77.6, 8.2],
    8,
    plateau('plateau', 20, 55, 1.5, 6, -24.8, 4),
    'gsmarena.com (third party); samsung.com page read but truncated, confirms only 8.2 mm depth'
  ),
  android(
    'pixel-10-pro',
    'Pixel 10 Pro',
    [152.8, 72.0, 8.6],
    9,
    plateau('plateau', 72.0, 28, 3, 8, 0, 30),
    'third-party comparison sites (one lists 8.5 mm depth); store.google.com page not readable'
  ),
  android(
    'pixel-10-pro-xl',
    'Pixel 10 Pro XL',
    [162.8, 76.6, 8.5],
    9,
    plateau('plateau', 76.6, 28, 3, 8, 0, 32),
    'one third-party source; store.google.com page not readable'
  ),
])

/**
 * @typedef {object} PhoneCase
 * @property {string} label
 * @property {number} addWidthMm Total added to X (both sides).
 * @property {number} addLengthMm Total added to Y.
 * @property {number} addDepthMm Added to Z, front to back.
 * @property {'verified' | 'estimate'} status
 * @property {string} source
 * @property {string} retrieved
 */

/**
 * @param {string} label
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {'verified' | 'estimate'} status
 * @param {string} source
 * @returns {PhoneCase}
 */
function caseOf(label, x, y, z, status, source) {
  return Object.freeze({
    label,
    addWidthMm: x,
    addLengthMm: y,
    addDepthMm: z,
    status,
    source,
    retrieved: RETRIEVED,
  })
}

/**
 * Case presets, keyed by the id written to a record's `case` param.
 *
 * @type {Readonly<Record<string, PhoneCase>>}
 */
export const PHONE_CASES = Object.freeze({
  none: caseOf('None', 0, 0, 0, 'verified', 'the bare handset'),
  slim: caseOf('Slim', 3, 3, 1.5, 'estimate', 'estimate: ~1.5 mm per side; typical thin silicone or clear case'),
  protective: caseOf('Protective', 6, 6, 3, 'estimate', 'estimate: ~3 mm per side; typical dual-layer case'),
  rugged: caseOf(
    'Rugged',
    12.75,
    11.75,
    7.98,
    'verified',
    "OtterBox Defender Pro for iPhone 17 Pro, OtterBox's listing: 161.75 x 84.65 x 16.73 mm over 150.0 x 71.9 x 8.75"
  ),
  techweave: caseOf(
    'TechWeave',
    5.1,
    7,
    0.25,
    'estimate',
    'estimate: the original default (77 x 157 x 9 mm over an iPhone 17 Pro), kept at the user\'s request'
  ),
  custom: caseOf('Custom', 0, 0, 0, 'estimate', 'the three enlarge fields only: your own caliper readings'),
})

/** The model a new Library placement starts on, and the one a record with no `model` means. */
export const DEFAULT_PHONE_MODEL = 'iphone-17-pro'

/** The case a new Library placement starts on. */
export const DEFAULT_PHONE_CASE = 'slim'

/**
 * The case a record that names a model but no case behaves as, and the one the pre-core-057
 * Library implied: the original TechWeave estimate.
 */
export const LEGACY_PHONE_CASE = 'techweave'

/**
 * TechWeave's fixed numbers on the iPhone 17 Pro it was measured for — exactly the geometry
 * the first `kit.phone` shipped: corner radius 12, plateau 74 x 46 x 4 mm, radius 10, flush
 * with the +Y edge.
 */
export const TECHWEAVE_IPHONE_17_PRO = Object.freeze({
  cornerRadiusMm: 12,
  plateau: Object.freeze({ widthMm: 74, lengthMm: 46, heightMm: 4, cornerRadiusMm: 10, xMm: 0, fromTopMm: 0 }),
})

/**
 * @param {string} id
 * @param {readonly PhoneModel[]} [models]
 * @returns {PhoneModel | undefined}
 */
export function phoneModelById(id, models = PHONE_MODELS) {
  return models.find((row) => row.id === id)
}
