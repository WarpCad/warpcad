// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  LEGACY_PROJECT_EXTENSIONS,
  PROJECT_EXTENSION,
  PROJECT_EXTENSIONS,
  PROJECT_MIME,
  isProjectFileName,
  projectExtensionOf,
  stripProjectExtension,
} from './projectFile.js'

/**
 * `TODO/io-035`: a project is saved as `name.warpcad` (NDJSON inside) and `.ndjson` keeps opening.
 * Every path that names a project file reads the extension from here, so Save and Open cannot
 * drift apart.
 */
describe('project file extension', () => {
  it('saves as .warpcad and still reads .ndjson', () => {
    expect(PROJECT_EXTENSION).toBe('.warpcad')
    expect(LEGACY_PROJECT_EXTENSIONS).toEqual(['.ndjson'])
    expect(PROJECT_EXTENSIONS).toEqual(['.warpcad', '.ndjson'])
  })

  it('keeps the NDJSON MIME type for downloads and the picker', () => {
    expect(PROJECT_MIME).toBe('application/x-ndjson')
  })
})

describe('isProjectFileName', () => {
  it.each([
    ['a.warpcad', true],
    ['a.ndjson', true],
    ['A.WARPCAD', true],
    ['Bracket.NDJSON', true],
    ['phone stand.warpcad', true],
    ['.warpcad', false],
    ['.ndjson', false],
    ['a.warpcad.txt', false],
    ['a.json', false],
    ['a.txt', false],
    ['warpcad', false],
    ['', false],
  ])('%j → %s', (name, expected) => {
    expect(isProjectFileName(name)).toBe(expected)
  })

  it('is false for anything that is not a string', () => {
    expect(isProjectFileName(/** @type {any} */ (undefined))).toBe(false)
    expect(isProjectFileName(/** @type {any} */ (null))).toBe(false)
  })
})

describe('projectExtensionOf', () => {
  it('names the extension in its canonical spelling, or null', () => {
    expect(projectExtensionOf('a.warpcad')).toBe('.warpcad')
    expect(projectExtensionOf('A.WarpCad')).toBe('.warpcad')
    expect(projectExtensionOf('a.ndjson')).toBe('.ndjson')
    expect(projectExtensionOf('a.json')).toBeNull()
    expect(projectExtensionOf('.warpcad')).toBeNull()
    expect(projectExtensionOf('')).toBeNull()
  })
})

describe('stripProjectExtension', () => {
  it.each([
    ['bracket.warpcad', 'bracket'],
    ['bracket.ndjson', 'bracket'],
    ['Bracket.WARPCAD', 'Bracket'],
    ['bracket.ndjson.warpcad', 'bracket.ndjson'],
    ['bracket.json', 'bracket.json'],
    ['bracket', 'bracket'],
    ['.warpcad', '.warpcad'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(stripProjectExtension(name)).toBe(expected)
  })
})
