// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { GA_SOURCES, addAnalyticsSources, measurementId } from './analytics-build.mjs'

const html = `<meta content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com https://api.github.com; img-src 'self' blob: data:; font-src 'self'">`

describe('measurementId', () => {
  it('reads GA_MEASUREMENT_ID, then VITE_GA_MEASUREMENT_ID, and trims', () => {
    expect(measurementId({ GA_MEASUREMENT_ID: ' G-ABCDE12345 ' })).toBe('G-ABCDE12345')
    expect(measurementId({ VITE_GA_MEASUREMENT_ID: 'G-ABCDE12345' })).toBe('G-ABCDE12345')
    expect(measurementId({ GA_MEASUREMENT_ID: 'G-AAAAAA1111', VITE_GA_MEASUREMENT_ID: 'G-BBBBBB2222' })).toBe('G-AAAAAA1111')
  })
  it('is empty for unset, blank, malformed, non-GA4 or injection-shaped ids', () => {
    for (const bad of [undefined, '', '  ', 'UA-1-1', 'G-', 'g-abcde12345', 'G-AB"><script>', 'G-AB CD', 'G-' + 'A'.repeat(40)])
      expect(measurementId({ GA_MEASUREMENT_ID: bad })).toBe('')
    expect(measurementId({})).toBe('')
  })
})

describe('addAnalyticsSources', () => {
  it('is a byte-for-byte no-op without an id', () => {
    expect(addAnalyticsSources(html, '')).toBe(html)
  })
  it('adds exactly the Google hosts to script-src, connect-src and img-src, and touches nothing else', () => {
    const out = addAnalyticsSources(html, 'G-TEST000000')
    expect(out).toContain("script-src 'self' https://www.googletagmanager.com;")
    expect(out).toContain('connect-src \'self\' https://api.anthropic.com https://api.github.com https://*.google-analytics.com https://*.analytics.google.com;')
    expect(out).toContain("img-src 'self' blob: data: https://*.google-analytics.com;")
    expect(out).toContain("style-src 'self' 'unsafe-inline';")
    expect(out).not.toMatch(/https:(?!\/\/)/)
    const stripped = [...GA_SOURCES.script, ...GA_SOURCES.connect, ...GA_SOURCES.img].reduce((s, h) => s.replace(` ${h}`, ''), out)
    expect(stripped).toBe(html)
  })
  it('throws when a directive to extend is missing', () => {
    expect(() => addAnalyticsSources('<html></html>', 'G-TEST000000')).toThrow(/script-src/)
  })
})
