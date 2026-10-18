// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { webMcpChipLabel, webMcpDiagnostic, webMcpFailureText, webMcpReasonOf } from './status.js'

/**
 * `TODO/ai-024`: "on" must never again mean "on, with nothing registered". These pin the words
 * the **Browser agents** chip shows for each state, and the side-effect-free diagnostic an agent
 * (or a person in DevTools) can read off the page.
 */

/** @param {Partial<import('./status.js').WebMcpStatus>} [patch] @returns {import('./status.js').WebMcpStatus} */
const status = (patch = {}) => ({ api: 'document', enabled: true, visible: true, registered: 27, failed: [], ...patch })

describe('webMcpReasonOf: why the tools are, or are not, registered', () => {
  it('is unavailable with no API, whatever else is true', () => {
    expect(webMcpReasonOf(status({ api: 'none', registered: 0 }))).toBe('unavailable')
  })

  it('is off when the switch is off, even while hidden', () => {
    expect(webMcpReasonOf(status({ enabled: false, visible: false, registered: 0 }))).toBe('off')
  })

  it('is hidden when on but the tab is in the background', () => {
    expect(webMcpReasonOf(status({ visible: false, registered: 0 }))).toBe('hidden')
  })

  it('is registering while on and visible with nothing settled yet', () => {
    expect(webMcpReasonOf(status({ registered: 0 }))).toBe('registering')
  })

  it('is failed when every registration was refused, partial when some were', () => {
    expect(webMcpReasonOf(status({ registered: 0, failed: [{ name: 'create', message: 'Duplicate tool name: create' }] }))).toBe('failed')
    expect(webMcpReasonOf(status({ registered: 26, failed: [{ name: 'create', message: 'x' }] }))).toBe('partial')
  })

  it('is registered when every tool is offered', () => {
    expect(webMcpReasonOf(status())).toBe('registered')
  })
})

describe('webMcpChipLabel: the chip says how many tools, or why none', () => {
  it('on, with the count', () => {
    expect(webMcpChipLabel(status())).toBe('Browser agents · on — 27 tools')
    expect(webMcpChipLabel(status({ registered: 1 }))).toBe('Browser agents · on — 1 tool')
  })

  it('off', () => {
    expect(webMcpChipLabel(status({ enabled: false, registered: 0 }))).toBe('Browser agents · off')
  })

  it('on, but the tab is hidden', () => {
    expect(webMcpChipLabel(status({ visible: false, registered: 0 }))).toBe('Browser agents · on, but the tab is hidden')
  })

  it('on, registering', () => {
    expect(webMcpChipLabel(status({ registered: 0 }))).toBe('Browser agents · on — registering…')
  })

  it('registration failed, and a partial count that names the refusals', () => {
    expect(webMcpChipLabel(status({ registered: 0, failed: [{ name: 'create', message: 'x' }] }))).toBe('Browser agents · on — registration failed')
    expect(webMcpChipLabel(status({ registered: 25, failed: [{ name: 'create', message: 'x' }, { name: 'operate', message: 'x' }] }))).toBe(
      'Browser agents · on — 25 tools, 2 refused',
    )
  })

  it('never says a bare "on"', () => {
    for (const patch of [{}, { visible: false, registered: 0 }, { registered: 0 }, { registered: 0, failed: [{ name: 'a', message: 'b' }] }]) {
      expect(webMcpChipLabel(status(patch))).not.toBe('Browser agents · on')
    }
  })

  it('is empty with no API (there is no chip)', () => {
    expect(webMcpChipLabel(status({ api: 'none' }))).toBe('')
  })
})

describe('webMcpDiagnostic: one line an agent can read', () => {
  it('names the entry point, the switch, visibility, the count and the refusals', () => {
    expect(webMcpDiagnostic(status())).toBe('api=document; enabled=on; visible=yes; registered=27; failed=[]')
    expect(webMcpDiagnostic(status({ api: 'navigator', visible: false, registered: 0 }))).toBe('api=navigator; enabled=on; visible=no; registered=0; failed=[]')
    expect(webMcpDiagnostic(status({ enabled: false, registered: 0 }))).toBe('api=document; enabled=off; visible=yes; registered=0; failed=[]')
    expect(webMcpDiagnostic(status({ registered: 25, failed: [{ name: 'create', message: 'x' }, { name: 'operate', message: 'y' }] }))).toBe(
      'api=document; enabled=on; visible=yes; registered=25; failed=[create,operate]',
    )
  })

  it('says api=none, enabled=off where the browser has no WebMCP', () => {
    expect(webMcpDiagnostic(status({ api: 'none', enabled: true, registered: 0 }))).toBe('api=none; enabled=off; visible=yes; registered=0; failed=[]')
  })
})

describe('webMcpFailureText: the line under the header when registration was refused', () => {
  it('is empty with no refusals', () => {
    expect(webMcpFailureText(status())).toBe('')
  })

  it('names the tools another page holds when only some were refused', () => {
    expect(webMcpFailureText(status({ registered: 26, failed: [{ name: 'create', message: 'Duplicate tool name: create' }] }))).toBe(
      'Another tab or page already offers create; this tab could not register it.',
    )
    expect(webMcpFailureText(status({ registered: 25, failed: [{ name: 'create', message: 'a' }, { name: 'operate', message: 'b' }] }))).toBe(
      'Another tab or page already offers create, operate; this tab could not register them.',
    )
  })

  it('says every tool was refused, with the browser’s first reason, when none registered', () => {
    const text = webMcpFailureText(status({ registered: 0, failed: [{ name: 'create', message: 'Duplicate tool name: create' }, { name: 'operate', message: 'y' }] }))
    expect(text).toMatch(/^The browser refused all 2 of WarpCad’s tools/)
    expect(text).toContain('Duplicate tool name: create')
    expect(text).toMatch(/another WarpCad tab/i)
  })

  it('is empty while off or hidden (nothing is being offered, so nothing was refused)', () => {
    expect(webMcpFailureText(status({ enabled: false, registered: 0, failed: [{ name: 'create', message: 'x' }] }))).toBe('')
    expect(webMcpFailureText(status({ visible: false, registered: 0, failed: [{ name: 'create', message: 'x' }] }))).toBe('')
  })
})
