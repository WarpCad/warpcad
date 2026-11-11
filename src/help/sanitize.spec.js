// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — imports the Node-side help build (node:fs); `src/` is typed for the browser.
import { describe, expect, it } from 'vitest'

import { buildHelp } from '../../scripts/help-build.mjs'
import { sanitizeHelpHtml } from './sanitize.js'

/**
 * `TODO/ui-119`: the Help fragment is rendered with `v-html`, and in the native app it comes over
 * the network. The sanitiser keeps everything our own build emits and nothing else.
 */

const WEB_IMG = '/help/img/'
const NATIVE_IMG = 'https://app.warpcad.com/help/img/'

/** The same markup, parsed and serialised by the browser: the "unchanged" a round trip is held to. */
function normalised(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html')
  return doc.body.innerHTML
}

/** The loader's picture rewrite (`src/help/loader.js`), so a built page reads as the sheet sees it. */
const pointPictures = (html, base) => html.replace(/(<(?:img|source)[^>]*?\s(?:src|srcset)=")img\//g, `$1${base}`)

/** A fresh element tree to query the output with. */
function dom(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('sanitizeHelpHtml: every built page round-trips unchanged', () => {
  const help = buildHelp({ docsDir: 'docs' })
  const pages = Object.values(help.pages)

  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(10)
  })

  for (const base of [WEB_IMG, NATIVE_IMG]) {
    it.each(pages.map((page) => [page.slug, page.html]))(`%s (pictures under ${base})`, (_slug, html) => {
      const page = pointPictures(html, base)
      expect(sanitizeHelpHtml(page, { imgBase: base })).toBe(normalised(page))
    })
  }
})

describe('sanitizeHelpHtml: hostile markup is stripped', () => {
  const clean = (html, imgBase = NATIVE_IMG) => sanitizeHelpHtml(html, { imgBase })

  it('drops <script> with its text', () => {
    const out = clean('<p>a</p><script>alert(1)</script><p>b</p>')
    expect(out).toBe('<p>a</p><p>b</p>')
  })

  it('drops an event handler from an otherwise allowed <img>', () => {
    const out = dom(clean(`<img src="${NATIVE_IMG}a.png" alt="a" onerror="alert(1)">`))
    const img = out.querySelector('img')
    expect(img).not.toBeNull()
    expect(img.hasAttribute('onerror')).toBe(false)
    expect(img.getAttribute('src')).toBe(`${NATIVE_IMG}a.png`)
  })

  it('drops the classic <img src=x onerror> entirely: neither the handler nor the off-origin picture survives', () => {
    const out = dom(clean('<p>x<img src=x onerror="alert(1)"></p>'))
    expect(out.querySelector('[onerror]')).toBeNull()
    expect(out.querySelector('img')).toBeNull()
    expect(out.innerHTML).toBe('<p>x</p>')
  })

  it('drops a javascript: href, keeping the link text', () => {
    const out = dom(clean('<p><a href="javascript:alert(1)">click</a></p>'))
    expect(out.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(out.textContent).toBe('click')
  })

  it('drops <meta http-equiv=refresh>, <base>, <iframe>, <form> and <style>, with their children', () => {
    const out = clean(
      '<meta http-equiv="refresh" content="0;url=https://evil.example/"><base href="https://evil.example/">' +
        '<iframe src="https://evil.example/"><p>frame</p></iframe>' +
        '<form action="https://evil.example/"><p>Paste your API key</p><input name="key"></form>' +
        '<style>.app-header{display:none}</style><p>kept</p>',
    )
    expect(out).toBe('<p>kept</p>')
  })

  it('drops <object> and <link>', () => {
    expect(clean('<object data="x.swf"><p>o</p></object><link rel="stylesheet" href="https://evil.example/x.css"><p>k</p>')).toBe('<p>k</p>')
  })

  it('drops an <img> on another host', () => {
    expect(dom(clean('<p><img src="https://evil.example/help/img/a.png" alt="a"></p>')).querySelector('img')).toBeNull()
    // A look-alike host that merely starts with the help origin's name.
    expect(dom(clean('<p><img src="https://app.warpcad.com.evil.example/help/img/a.png" alt="a"></p>')).querySelector('img')).toBeNull()
  })

  it('drops a data: SVG image', () => {
    const svg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='
    expect(dom(clean(`<p><img src="${svg}" alt="a"></p>`)).querySelector('img')).toBeNull()
  })

  it('drops a <source srcset> that points anywhere but the help pictures', () => {
    const out = dom(clean(`<picture><source srcset="https://evil.example/a.png" media="(prefers-color-scheme: dark)"><img src="${NATIVE_IMG}a.png" alt="a"></picture>`))
    expect(out.querySelector('source')).toBeNull()
    expect(out.querySelector('img')).not.toBeNull()
  })

  it('refuses a picture path that climbs out of the help folder', () => {
    expect(dom(clean(`<img src="${NATIVE_IMG}../../evil.png" alt="a">`)).querySelector('img')).toBeNull()
  })

  it('forces rel="noopener noreferrer" on an https link, and drops a plain http one', () => {
    const out = dom(clean('<a href="https://example.com/" target="_blank">a</a><a href="http://example.com/">b</a>'))
    const [https, http] = out.querySelectorAll('a')
    expect(https.getAttribute('href')).toBe('https://example.com/')
    expect(https.getAttribute('rel')).toBe('noopener noreferrer')
    expect(http.hasAttribute('href')).toBe(false)
  })

  it('keeps an in-app help link, and drops any other relative or fragment href', () => {
    const out = dom(clean('<a href="#/help/booleans" data-help-page="booleans" data-help-anchor="union">a</a><a href="#/gist/123">b</a><a href="/x">c</a>'))
    const [help, gist, rel] = out.querySelectorAll('a')
    expect(help.getAttribute('href')).toBe('#/help/booleans')
    expect(help.getAttribute('data-help-page')).toBe('booleans')
    expect(help.getAttribute('data-help-anchor')).toBe('union')
    expect(gist.hasAttribute('href')).toBe(false)
    expect(rel.hasAttribute('href')).toBe(false)
  })

  it('drops style attributes and unknown attributes, and unwraps unknown tags keeping their text', () => {
    const out = clean('<p style="position:fixed" title="t" data-x="1">a<button type="submit">b</button></p>')
    expect(out).toBe('<p>ab</p>')
  })

  it('drops a target other than _blank', () => {
    expect(dom(clean('<a href="https://example.com/" target="_top">a</a>')).querySelector('a').hasAttribute('target')).toBe(false)
  })

  it('drops comments and returns an empty string for empty input', () => {
    expect(clean('<!-- x --><p>a</p>')).toBe('<p>a</p>')
    expect(clean('')).toBe('')
  })
})
