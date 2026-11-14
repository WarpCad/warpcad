// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** `TODO/ui-117`: the visually-hidden utility classes are defined once and reach the app through index.css. */
/** @param {string} name */
const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

describe('utilities.css', () => {
  it('defines .visually-hidden and its two width-limited forms', () => {
    const css = read('utilities.css')
    expect(css).toContain('.visually-hidden {')
    expect(css).toContain('.visually-hidden-phone {')
    expect(css).toContain('.visually-hidden-narrow {')
    expect(css).toMatch(/clip: rect\(0 0 0 0\)/)
  })

  it('is imported by index.css', () => {
    expect(read('index.css')).toContain("@import './utilities.css'")
  })
})
