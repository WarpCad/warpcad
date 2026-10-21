// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CHAT_COLUMN_MIN_WIDTH_PX,
  CHAT_COLUMN_WIDTH_PX,
  CHROME_FULL_MIN_PANE_PX,
  GIZMO_RESERVE_COMPACT_PX,
  GIZMO_RESERVE_FULL_PX,
  PANE_MIN_WIDTH_PX,
  PHONE_MAX_WIDTH_PX,
  panelLayoutFor,
  usePanelLayoutStore,
} from './panelLayout.js'

/**
 * `TODO/ui-079`: the tiered Library and Operations panels. Every tier and track width comes from
 * one pure function of the `.app__body` width (`W`) and whether the chat panel is open, so these
 * tests are the single place the breakpoint table's invariants are enforced.
 */

/** Shrinking order: a panel's tiers from least to most compact (phone is its own flag). */
const LIBRARY_RANK = { labels: 0, icons: 1, popout: 2 }
const OPS_RANK = { labels: 0, icons: 1, groups: 2 }
const CHROME_RANK = { full: 0, compact: 1 }

/** The reference viewports (`CLAUDE.md` Responsive Layout) no breakpoint may sit near. */
const REFERENCE_WIDTHS_PX = [820, 1440]

/**
 * The expected table. `E = W` without chat; with chat, `E = W − 340` only from `W ≥ 1100`
 * (below that the chat is a bottom sheet over the viewport, not a grid column). The last column is
 * the viewport chrome's tier (`TODO/ui-084`): compact from E = 854 down (P < 554).
 *
 * @type {[number, 'labels' | 'icons' | 'popout', 'labels' | 'icons' | 'groups', 'full' | 'compact'][]}
 */
const NO_CHAT_TABLE = [
  [641, 'popout', 'groups', 'compact'],
  [700, 'popout', 'groups', 'compact'],
  [733, 'popout', 'groups', 'compact'],
  [734, 'popout', 'groups', 'compact'],
  [741, 'popout', 'groups', 'compact'],
  [742, 'popout', 'icons', 'compact'],
  [779, 'popout', 'icons', 'compact'],
  [780, 'popout', 'icons', 'compact'],
  [789, 'popout', 'icons', 'compact'],
  [790, 'icons', 'icons', 'compact'],
  [820, 'icons', 'icons', 'compact'],
  [854, 'icons', 'icons', 'compact'],
  [855, 'icons', 'icons', 'full'],
  [900, 'icons', 'icons', 'full'],
  [1023, 'icons', 'icons', 'full'],
  [1024, 'labels', 'icons', 'full'],
  [1100, 'labels', 'icons', 'full'],
  [1200, 'labels', 'icons', 'full'],
  [1259, 'labels', 'icons', 'full'],
  [1260, 'labels', 'icons', 'full'],
  [1275, 'labels', 'icons', 'full'],
  [1276, 'labels', 'labels', 'full'],
  [1280, 'labels', 'labels', 'full'],
  [1440, 'labels', 'labels', 'full'],
]

describe('panelLayoutFor — the width table (TODO/ui-079)', () => {
  it.each(NO_CHAT_TABLE)('W=%i without chat: Library %s, Operations %s, chrome %s', (width, library, ops, chrome) => {
    const layout = panelLayoutFor({ bodyWidthPx: width, chatColumn: false })
    expect(layout.phone).toBe(false)
    expect(layout.libraryTier).toBe(library)
    expect(layout.opsTier).toBe(ops)
    expect(layout.chromeTier).toBe(chrome)
  })

  it.each(NO_CHAT_TABLE)('W=%i with chat: the chat is a column only from 1100px', (width) => {
    const withChat = panelLayoutFor({ bodyWidthPx: width, chatColumn: true })
    const effective = width >= CHAT_COLUMN_MIN_WIDTH_PX ? width - CHAT_COLUMN_WIDTH_PX : width
    const expected = panelLayoutFor({ bodyWidthPx: effective, chatColumn: false })
    expect(withChat.libraryTier).toBe(expected.libraryTier)
    expect(withChat.opsTier).toBe(expected.opsTier)
    expect(withChat.chromeTier).toBe(expected.chromeTier)
    expect(withChat.gizmoReservePx).toBe(expected.gizmoReservePx)
    expect(withChat.libraryWidthPx).toBeCloseTo(expected.libraryWidthPx, 2)
    expect(withChat.inspectorWidthPx).toBeCloseTo(expected.inspectorWidthPx, 2)
    expect(withChat.paneWidthPx).toBeCloseTo(expected.paneWidthPx, 2)
  })

  it('the rail tracks: 72px in the icons tier, 64px in the pop-out tier', () => {
    expect(panelLayoutFor({ bodyWidthPx: 820, chatColumn: false }).libraryWidthPx).toBeCloseTo(72, 2)
    expect(panelLayoutFor({ bodyWidthPx: 700, chatColumn: false }).libraryWidthPx).toBeCloseTo(64, 2)
  })

  it('the labelled Library eases from 200px (at its icons breakpoint) to 240px at E ≥ 1440', () => {
    expect(panelLayoutFor({ bodyWidthPx: 1024, chatColumn: false }).libraryWidthPx).toBeCloseTo(200, 2)
    expect(panelLayoutFor({ bodyWidthPx: 1440, chatColumn: false }).libraryWidthPx).toBeCloseTo(240, 2)
    expect(panelLayoutFor({ bodyWidthPx: 1800, chatColumn: false }).libraryWidthPx).toBeCloseTo(240, 2)
  })

  it('the Inspector eases from 220px to 280px (280 at E ≥ 1280)', () => {
    expect(panelLayoutFor({ bodyWidthPx: 700, chatColumn: false }).inspectorWidthPx).toBeCloseTo(220, 2)
    expect(panelLayoutFor({ bodyWidthPx: 1280, chatColumn: false }).inspectorWidthPx).toBeCloseTo(280, 2)
    expect(panelLayoutFor({ bodyWidthPx: 1600, chatColumn: false }).inspectorWidthPx).toBeCloseTo(280, 2)
  })

  it('the laptop reference with the chat open (E = 1100): Library labels at ~207px, Operations icons', () => {
    const layout = panelLayoutFor({ bodyWidthPx: 1440, chatColumn: true })
    expect(layout.libraryTier).toBe('labels')
    expect(layout.libraryWidthPx).toBeGreaterThan(205)
    expect(layout.libraryWidthPx).toBeLessThan(210)
    expect(layout.opsTier).toBe('icons')
  })

  it('the tablet reference (820) is Library icons / Operations icons, with a pane over 500px', () => {
    const layout = panelLayoutFor({ bodyWidthPx: 820, chatColumn: false })
    expect(layout.libraryTier).toBe('icons')
    expect(layout.opsTier).toBe('icons')
    expect(layout.paneWidthPx).toBeGreaterThan(500)
  })

  it('phone (≤ 640): the sheet and the phone icon toolbar, no side tracks', () => {
    const layout = panelLayoutFor({ bodyWidthPx: 390, chatColumn: true })
    expect(layout.phone).toBe(true)
    expect(layout.libraryTier).toBe('sheet')
    expect(layout.opsTier).toBe('icons')
    // The phone keeps its own ≤ 480px media-query compaction and the 184px reserve, unchanged.
    expect(layout.chromeTier).toBe('full')
    expect(layout.gizmoReservePx).toBe(GIZMO_RESERVE_FULL_PX)
    expect(layout.libraryWidthPx).toBe(0)
    expect(layout.inspectorWidthPx).toBe(0)
    expect(layout.paneWidthPx).toBe(390)
  })

  it('the tablet reference (820) is compact chrome; E = 900 and the laptop keep the full chrome (TODO/ui-084)', () => {
    expect(panelLayoutFor({ bodyWidthPx: 820, chatColumn: false }).chromeTier).toBe('compact')
    expect(panelLayoutFor({ bodyWidthPx: 900, chatColumn: false }).chromeTier).toBe('full')
    expect(panelLayoutFor({ bodyWidthPx: 1440, chatColumn: false }).chromeTier).toBe('full')
    expect(panelLayoutFor({ bodyWidthPx: 1440, chatColumn: true }).chromeTier).toBe('full')
  })

  it('the gizmo reserve follows the chrome tier: 184px full, 150px compact (TODO/ui-084)', () => {
    expect(GIZMO_RESERVE_FULL_PX).toBe(184)
    expect(GIZMO_RESERVE_COMPACT_PX).toBe(150)
    expect(panelLayoutFor({ bodyWidthPx: 1100, chatColumn: false }).gizmoReservePx).toBe(184)
    expect(panelLayoutFor({ bodyWidthPx: 820, chatColumn: false }).gizmoReservePx).toBe(150)
  })

  /**
   * Where the threshold comes from (`TODO/ui-084` stage 1). The icon toolbar is 14 buttons of 44px
   * with 4px gaps (668px on one line in every engine) inside `.ops`'s 6px padding and 1px border,
   * and `.ops` is capped at `P − 24 − reserve`. Two lines need 7 buttons per line.
   */
  it('compacts the chrome exactly where the full reserve would push the icon toolbar onto a third line', () => {
    const twoLineInnerPx = 7 * 44 + 6 * 4
    const linesAt = (/** @type {number} */ paneWidthPx, /** @type {number} */ reservePx) => {
      const inner = paneWidthPx - 24 - reservePx - 2 * 6 - 2 * 1
      return inner >= twoLineInnerPx ? 2 : 3
    }
    expect(linesAt(CHROME_FULL_MIN_PANE_PX, GIZMO_RESERVE_FULL_PX)).toBe(2)
    expect(linesAt(CHROME_FULL_MIN_PANE_PX - 1, GIZMO_RESERVE_FULL_PX)).toBe(3)
    // …and the compact reserve keeps the tablet reference's toolbar on two lines.
    const tablet = panelLayoutFor({ bodyWidthPx: 820, chatColumn: false })
    expect(linesAt(tablet.paneWidthPx, tablet.gizmoReservePx)).toBe(2)
  })

  it('is pure: the same input gives an equal answer, and it never reads the window', () => {
    const spy = vi.spyOn(window, 'innerWidth', 'get')
    const a = panelLayoutFor({ bodyWidthPx: 913, chatColumn: false })
    const b = panelLayoutFor({ bodyWidthPx: 913, chatColumn: false })
    expect(a).toEqual(b)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('panelLayoutFor — the breakpoint invariants, swept 1px at a time (TODO/ui-079)', () => {
  /** @type {{ e: number, layout: ReturnType<typeof panelLayoutFor> }[]} */
  const sweep = []
  for (let e = 641; e <= 1600; e += 1) sweep.push({ e, layout: panelLayoutFor({ bodyWidthPx: e, chatColumn: false }) })

  /** Every E at which a tier changes, walking *down* from 1600, and which panel changed. */
  const breakpoints = /** @type {{ e: number, panel: 'library' | 'ops' | 'chrome', from: string, to: string }[]} */ ([])
  for (let i = sweep.length - 1; i > 0; i -= 1) {
    const wider = sweep[i].layout
    const narrower = sweep[i - 1].layout
    // The breakpoint is named by the smallest E of the wider tier, as the table does.
    if (wider.libraryTier !== narrower.libraryTier) {
      breakpoints.push({ e: sweep[i].e, panel: 'library', from: wider.libraryTier, to: narrower.libraryTier })
    }
    if (wider.opsTier !== narrower.opsTier) {
      breakpoints.push({ e: sweep[i].e, panel: 'ops', from: wider.opsTier, to: narrower.opsTier })
    }
    if (wider.chromeTier !== narrower.chromeTier) {
      breakpoints.push({ e: sweep[i].e, panel: 'chrome', from: wider.chromeTier, to: narrower.chromeTier })
    }
  }

  it('changes tiers in the agreed order: Operations icons, Library icons, chrome compact, Library pop-out, Operations groups', () => {
    expect(breakpoints.map(({ panel, to }) => `${panel}:${to}`)).toEqual([
      'ops:icons',
      'library:icons',
      'chrome:compact',
      'library:popout',
      'ops:groups',
    ])
  })

  it('compacts the chrome at E = 855 and nowhere else (TODO/ui-084)', () => {
    expect(breakpoints.filter(({ panel }) => panel === 'chrome').map(({ e }) => e)).toEqual([855])
  })

  it('never changes both panels at the same E', () => {
    const at = breakpoints.map(({ e }) => e)
    expect(new Set(at).size).toBe(at.length)
  })

  it('is monotonic: narrowing never moves a panel back to a less compact tier', () => {
    for (let i = sweep.length - 1; i > 0; i -= 1) {
      const wider = sweep[i].layout
      const narrower = sweep[i - 1].layout
      expect(LIBRARY_RANK[/** @type {'labels'} */ (narrower.libraryTier)]).toBeGreaterThanOrEqual(
        LIBRARY_RANK[/** @type {'labels'} */ (wider.libraryTier)],
      )
      expect(OPS_RANK[narrower.opsTier]).toBeGreaterThanOrEqual(OPS_RANK[wider.opsTier])
      expect(CHROME_RANK[narrower.chromeTier]).toBeGreaterThanOrEqual(CHROME_RANK[wider.chromeTier])
    }
  })

  it('keeps adjacent breakpoints at least 40px apart', () => {
    for (let i = 1; i < breakpoints.length; i += 1) {
      expect(breakpoints[i - 1].e - breakpoints[i].e).toBeGreaterThanOrEqual(40)
    }
  })

  it('keeps every breakpoint more than 24px from the 820 and 1440 reference widths', () => {
    for (const { e } of breakpoints) {
      for (const reference of REFERENCE_WIDTHS_PX) expect(Math.abs(e - reference)).toBeGreaterThan(24)
    }
  })

  it('is continuous inside a tier: L and I move at most 1px per 1px of E (tolerance 0.01px)', () => {
    for (let i = 1; i < sweep.length; i += 1) {
      const a = sweep[i - 1].layout
      const b = sweep[i].layout
      if (a.libraryTier === b.libraryTier) {
        expect(Math.max(Math.abs(b.libraryWidthPx - a.libraryWidthPx), 1)).toBeCloseTo(1, 2)
      }
      // The Inspector has one form above phone, so it is one tier across the whole sweep.
      expect(Math.max(Math.abs(b.inspectorWidthPx - a.inspectorWidthPx), 1)).toBeCloseTo(1, 2)
    }
  })

  it('computes the pane as E − L − I and never lets it fall below 340px', () => {
    for (const { e, layout } of sweep) {
      expect(layout.paneWidthPx).toBeCloseTo(e - layout.libraryWidthPx - layout.inspectorWidthPx, 2)
      expect(layout.paneWidthPx).toBeGreaterThanOrEqual(PANE_MIN_WIDTH_PX)
    }
    expect(PANE_MIN_WIDTH_PX).toBe(340)
  })

  it('the chrome tier keys on the computed pane alone: compact exactly while P < CHROME_FULL_MIN_PANE_PX', () => {
    for (const { layout } of sweep) {
      expect(layout.chromeTier).toBe(layout.paneWidthPx < CHROME_FULL_MIN_PANE_PX ? 'compact' : 'full')
      expect(layout.gizmoReservePx).toBe(layout.chromeTier === 'compact' ? GIZMO_RESERVE_COMPACT_PX : GIZMO_RESERVE_FULL_PX)
    }
  })

  it('holds the pane floor with the chat column open too', () => {
    for (let w = 641; w <= 2000; w += 1) {
      expect(panelLayoutFor({ bodyWidthPx: w, chatColumn: true }).paneWidthPx).toBeGreaterThanOrEqual(PANE_MIN_WIDTH_PX)
    }
  })

  it('is phone exactly for W ≤ 640, with or without the chat', () => {
    for (let w = 300; w <= 1600; w += 1) {
      expect(panelLayoutFor({ bodyWidthPx: w, chatColumn: false }).phone).toBe(w <= PHONE_MAX_WIDTH_PX)
      expect(panelLayoutFor({ bodyWidthPx: w, chatColumn: true }).phone).toBe(w <= PHONE_MAX_WIDTH_PX)
    }
  })
})

describe('usePanelLayoutStore (TODO/ui-079)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.restoreAllMocks())

  it('seeds the body width synchronously from window.innerWidth, so the first frame is already right', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(820)
    const store = usePanelLayoutStore()
    expect(store.bodyWidthPx).toBe(820)
    expect(store.layout.libraryTier).toBe('icons')
    expect(store.openPopout).toBe(null)
  })

  it('setBodyWidth writes the one number and the layout follows', () => {
    const store = usePanelLayoutStore()
    store.setBodyWidth(700)
    expect(store.layout.opsTier).toBe('groups')
    store.setBodyWidth(1440)
    expect(store.layout.opsTier).toBe('labels')
  })

  it('ignores a zero or non-finite width (a detached or hidden body), keeping the last good one', () => {
    const store = usePanelLayoutStore()
    store.setBodyWidth(900)
    store.setBodyWidth(0)
    store.setBodyWidth(Number.NaN)
    expect(store.bodyWidthPx).toBe(900)
  })

  it('the chat column moves E by 340 only from 1100px', () => {
    const store = usePanelLayoutStore()
    store.setBodyWidth(1440)
    store.setChatColumn(true)
    expect(store.layout.opsTier).toBe('icons')
    store.setChatColumn(false)
    expect(store.layout.opsTier).toBe('labels')
  })
})
