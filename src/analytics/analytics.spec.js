// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { initAnalytics, GTAG_SRC } from './analytics.js'

/**
 * A browser stand-in with no DOM and no network: `doc.head.append` records the script that
 * would have been fetched, `win.dataLayer` records what gtag would have queued.
 *
 * @param {Record<string, any>} [over]
 */
function browser(over = {}) {
  /** @type {{ type: string, fn: () => void }[]} */
  const listeners = []
  /** @type {any[]} */
  const scripts = []
  /** @type {Record<string, any>} */
  const win = {
    location: { protocol: 'https:', hostname: 'app.warpcad.com', origin: 'https://app.warpcad.com', pathname: '/', search: '?x=1', hash: '#/gist/abc123' },
    navigator: { webdriver: false, doNotTrack: null, globalPrivacyControl: false },
    addEventListener: (/** @type {string} */ type, /** @type {() => void} */ fn) => listeners.push({ type, fn }),
    ...over.win,
  }
  /** @type {Record<string, any>} */
  const doc = {
    readyState: 'complete',
    head: { append: (/** @type {any} */ node) => scripts.push(node) },
    createElement: (/** @type {string} */ tag) => ({ tag }),
    ...over.doc,
  }
  return { win, doc, scripts, listeners }
}

const GOOD = { id: 'G-TEST000000', prod: true }

/** The queued gtag calls as plain arrays. */
/** @param {Record<string, any>} win @returns {any[][]} */
const calls = (win) => (win.dataLayer ?? []).map((/** @type {any} */ entry) => Array.from(entry))

describe('initAnalytics', () => {
  it('is inert without a measurement id: no script, no dataLayer, no gtag', () => {
    for (const id of ['', undefined, '   ', 'UA-123456-1', 'G-', 'not an id', 'G-AB CD']) {
      const b = browser()
      expect(initAnalytics({ ...GOOD, id, win: b.win, doc: b.doc })).toBe(false)
      expect(b.scripts).toEqual([])
      expect(b.win.dataLayer).toBeUndefined()
      expect(b.win.gtag).toBeUndefined()
    }
  })

  it('is inert in a non-production build, even with an id', () => {
    const b = browser()
    expect(initAnalytics({ id: 'G-TEST000000', prod: false, win: b.win, doc: b.doc })).toBe(false)
    expect(b.scripts).toEqual([])
    expect(b.win.dataLayer).toBeUndefined()
  })

  it('is inert on localhost, loopback, *.localhost, and any non-https page (preview servers)', () => {
    for (const [protocol, hostname] of [
      ['https:', 'localhost'],
      ['https:', '127.0.0.1'],
      ['https:', '[::1]'],
      ['https:', 'warpcad.localhost'],
      ['http:', 'app.warpcad.com'],
      ['http:', '192.168.1.20'],
      ['file:', ''],
    ]) {
      const b = browser({ win: { location: { protocol, hostname, origin: `${protocol}//${hostname}`, pathname: '/', search: '', hash: '' } } })
      expect(initAnalytics({ ...GOOD, win: b.win, doc: b.doc })).toBe(false)
      expect(b.scripts).toEqual([])
    }
  })

  it('is inert in an automated browser (navigator.webdriver) and when the visitor asks not to be tracked', () => {
    for (const navigator of [
      { webdriver: true },
      { webdriver: false, doNotTrack: '1' },
      { webdriver: false, globalPrivacyControl: true },
    ]) {
      const b = browser({ win: { navigator } })
      expect(initAnalytics({ ...GOOD, win: b.win, doc: b.doc })).toBe(false)
      expect(b.scripts).toEqual([])
    }
  })

  it('in production on a real host adds exactly one gtag.js script for the id', () => {
    const b = browser()
    expect(initAnalytics({ ...GOOD, win: b.win, doc: b.doc })).toBe(true)
    expect(b.scripts).toHaveLength(1)
    expect(b.scripts[0].src).toBe(`${GTAG_SRC}?id=G-TEST000000`)
    expect(b.scripts[0].src.startsWith('https://www.googletagmanager.com/gtag/js?id=')).toBe(true)
    expect(b.scripts[0].async).toBe(true)
  })

  it('queues js, a restricted config and exactly one explicit page_view', () => {
    const b = browser()
    initAnalytics({ ...GOOD, win: b.win, doc: b.doc })
    const queued = calls(b.win)
    expect(queued.map((c) => c[0])).toEqual(['js', 'config', 'event'])
    const [, id, config] = queued[1]
    expect(id).toBe('G-TEST000000')
    expect(config.send_page_view).toBe(false)
    expect(config.allow_google_signals).toBe(false)
    expect(config.allow_ad_personalization_signals).toBe(false)
    expect(queued[2][1]).toBe('page_view')
    expect(queued.filter((c) => c[0] === 'event')).toHaveLength(1)
  })

  it('never sends the hash, the query, or anything but origin and path', () => {
    const b = browser()
    initAnalytics({ ...GOOD, win: b.win, doc: b.doc })
    const queued = calls(b.win)
    const sent = JSON.stringify(queued.map((c) => (c[0] === 'js' ? 'js' : c)))
    expect(sent).not.toContain('gist')
    expect(sent).not.toContain('abc123')
    expect(sent).not.toContain('#')
    expect(sent).not.toContain('x=1')
    expect(queued[1][2].page_location).toBe('https://app.warpcad.com/')
    expect(queued[1][2].page_path).toBe('/')
    expect(queued[2][2]).toEqual({ page_location: 'https://app.warpcad.com/', page_path: '/' })
    expect(b.scripts[0].src).not.toContain('gist')
  })

  it('keeps a deploy sub-path (the Pages project path) but still drops the hash', () => {
    const b = browser({ win: { location: { protocol: 'https:', hostname: 'u.github.io', origin: 'https://u.github.io', pathname: '/warpcad/', search: '', hash: '#/help/booleans' } } })
    initAnalytics({ ...GOOD, win: b.win, doc: b.doc })
    expect(calls(b.win)[2][2]).toEqual({ page_location: 'https://u.github.io/warpcad/', page_path: '/warpcad/' })
  })

  it('queues gtag calls as Arguments objects, the form gtag.js requires', () => {
    const b = browser()
    initAnalytics({ ...GOOD, win: b.win, doc: b.doc })
    expect(Object.prototype.toString.call(b.win.dataLayer[0])).toBe('[object Arguments]')
  })

  it('waits for the load event instead of delaying first paint', () => {
    const b = browser({ doc: { readyState: 'loading' } })
    expect(initAnalytics({ ...GOOD, win: b.win, doc: b.doc })).toBe(true)
    expect(b.scripts).toEqual([])
    expect(b.listeners.map((l) => l.type)).toEqual(['load'])
    b.listeners[0].fn()
    expect(b.scripts).toHaveLength(1)
    expect(calls(b.win).filter((c) => c[0] === 'event')).toHaveLength(1)
  })

  it('never throws into the app, even if the page refuses the script', () => {
    const b = browser({ doc: { head: { append: () => { throw new Error('blocked') } } } })
    expect(() => initAnalytics({ ...GOOD, win: b.win, doc: b.doc })).not.toThrow()
  })

  it('does not read the id from anywhere but its argument or the build define (no hard-coded id)', () => {
    const b = browser()
    expect(initAnalytics({ prod: true, win: b.win, doc: b.doc })).toBe(false)
  })
})
