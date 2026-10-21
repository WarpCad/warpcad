// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Panel layout between laptop and phone width (`TODO/ui-079`) — **UI state only**.
 *
 * As a window narrows, the Library column and the Operations toolbar each give up space in
 * small, separate steps instead of both jumping at the 640px phone breakpoint. Every tier and
 * every track width comes from **one** measured number, the width of `.app__body` (`W`), plus
 * whether the chat panel is open. The viewport pane width the Operations tier keys on is
 * *computed* from the target tracks, never measured, so an animating grid track can never feed
 * back into a tier decision: a window parked exactly on a breakpoint is stable with no
 * hysteresis.
 *
 * The numbers below are `TODO/ui-079` stage 1's measurement, in Chromium, Firefox and WebKit
 * at 1440×900 (the widest engine wins; Firefox renders labels widest, as `ui-015` found). The
 * same table is recorded above `.app__body` in `src/views/AppView.vue`; keep the two in step.
 *
 * | Measured (px)                                   | Chromium | WebKit | Firefox |
 * |-------------------------------------------------|----------|--------|---------|
 * | Operations row, labelled, one line (14 buttons) | 1040     | 1064   | 1072    |
 * | Operations row, icon-only 44px squares, gap 4   | 668      | 668    | 668     |
 * | `.ops` width for the labelled row in ≤ 2 lines  | 541      | 554    | 559     |
 * | `.ops` width for the icon row in ≤ 3 lines      | 250      | 250    | 250     |
 * | Orientation gizmo footprint (top-right, 12 in)  | 130×177  | 130×178| 130×179 |
 *
 * `TODO/ui-084` stage 1 added the viewport chrome, measured the same way (the compact forms are
 * the existing ≤ 480px rules, measured at a 390px and a 470px page):
 *
 * | Measured (px)                                   | Chromium | WebKit | Firefox |
 * |-------------------------------------------------|----------|--------|---------|
 * | Navigation pad, full (bottom-left, 12 in)       | 205×188  | 209×188| 209×188 |
 * | Navigation pad, compact (8 in)                  | 190×164  | 194×164| 194×164 |
 * | Orientation gizmo, compact (8 in)               | 106×138  | 106×138| 106×138 |
 *
 * `.ops` is capped at `pane − 24 − 184` (`ui-015`'s gizmo-avoiding cap, so it can never reach
 * the gizmo whatever the tier). Hence the two Operations thresholds on the pane `P`:
 * labels while `P ≥ 559 + 208 + 5` (two lines, plus 5px for system-font variance), and icons
 * while `P ≥ 250 + 208` (three lines); below that, groups.
 *
 * @module stores/panelLayout
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** At or below this `.app__body` width the phone layout (bottom sheets) applies, unchanged. */
export const PHONE_MAX_WIDTH_PX = 640

/** From this width up an open chat panel is a grid column rather than a sheet (`ai-006`). */
export const CHAT_COLUMN_MIN_WIDTH_PX = 1100

/** The chat column's own track width. */
export const CHAT_COLUMN_WIDTH_PX = 340

/** The viewport pane never falls below this anywhere above phone width. */
export const PANE_MIN_WIDTH_PX = 340

/**
 * Library breakpoints, in `E` (the width Library, pane and Inspector share). A breakpoint is
 * the smallest `E` of the wider tier.
 */
export const LIBRARY_LABELS_MIN_E_PX = 1024
export const LIBRARY_ICONS_MIN_E_PX = 790

/** Library track widths. The labelled column eases 200 → 240 from its breakpoint to E = 1440. */
export const LIBRARY_LABELS_MIN_PX = 200
export const LIBRARY_LABELS_MAX_PX = 240
export const LIBRARY_LABELS_FULL_E_PX = 1440
export const LIBRARY_ICONS_PX = 72
export const LIBRARY_POPOUT_PX = 64

/** The Inspector track eases 220 → 280 between these `E` values; one form above phone. */
export const INSPECTOR_MIN_PX = 220
export const INSPECTOR_MAX_PX = 280
export const INSPECTOR_MIN_E_PX = 780
export const INSPECTOR_FULL_E_PX = 1280

/** The Operations tiers, keyed on the computed pane width (see the module doc for the sums). */
export const OPS_LABELS_MIN_PANE_PX = 772
export const OPS_ICONS_MIN_PANE_PX = 458

/**
 * The viewport chrome's tier (`TODO/ui-084`), keyed on the computed pane like the Operations tier.
 * From this pane width up the navigation pad and the orientation gizmo are full size; below it they
 * take their compact form. It is the smallest pane where the full 184px gizmo reserve still leaves
 * the 14-button icon toolbar on two lines: `.ops` inner width `P − 24 − 184 − 2·6 − 2·1` must hold
 * `7 × 44 + 6 × 4 = 332`, so `P ≥ 554`, which is E = 855 with no chat.
 */
export const CHROME_FULL_MIN_PANE_PX = 554

/**
 * The width the Operations toolbar leaves for the orientation gizmo at the top right, per chrome
 * tier (`.ops`'s `max-width: calc(100% − 24px − var(--gizmo-reserve))`). Full: the 130px gizmo,
 * its 12px inset and `ui-015`'s 42px margin. Compact: the 106px gizmo and its 8px inset, plus a
 * 36px margin, which still leaves the toolbar 48px clear of the gizmo and keeps the tablet
 * reference's icon toolbar on two lines instead of three (P = 523.2 at 820).
 */
export const GIZMO_RESERVE_FULL_PX = 184
export const GIZMO_RESERVE_COMPACT_PX = 150

const LIBRARY_SLOPE = (LIBRARY_LABELS_MAX_PX - LIBRARY_LABELS_MIN_PX) / (LIBRARY_LABELS_FULL_E_PX - LIBRARY_LABELS_MIN_E_PX)
const INSPECTOR_SLOPE = (INSPECTOR_MAX_PX - INSPECTOR_MIN_PX) / (INSPECTOR_FULL_E_PX - INSPECTOR_MIN_E_PX)

/**
 * @typedef {'labels' | 'icons' | 'popout' | 'sheet'} LibraryTier
 * @typedef {'labels' | 'icons' | 'groups'} OpsTier
 * @typedef {'full' | 'compact'} ChromeTier
 * @typedef {{
 *   phone: boolean,
 *   libraryTier: LibraryTier,
 *   libraryWidthPx: number,
 *   inspectorWidthPx: number,
 *   paneWidthPx: number,
 *   opsTier: OpsTier,
 *   chromeTier: ChromeTier,
 *   gizmoReservePx: number,
 * }} PanelLayout
 */

/**
 * The tiers and target track widths for one `.app__body` width. Pure: no DOM, no window, and
 * no allocation beyond the one result object (the observer calls it once per frame while a
 * window edge is dragged).
 *
 * @param {{ bodyWidthPx: number, chatColumn: boolean }} input `bodyWidthPx` is `W`, in CSS px;
 *   `chatColumn` is whether the chat panel is open (it only becomes a column from 1100px).
 * @returns {PanelLayout}
 */
export function panelLayoutFor({ bodyWidthPx, chatColumn }) {
  if (bodyWidthPx <= PHONE_MAX_WIDTH_PX) {
    return {
      phone: true,
      libraryTier: 'sheet',
      libraryWidthPx: 0,
      inspectorWidthPx: 0,
      paneWidthPx: bodyWidthPx,
      opsTier: 'icons',
      // The phone keeps its own compaction (`@media (max-width: 480px)` in `NavigationChrome.vue`
      // and `OrientationGizmo.vue`) and the full reserve, exactly as before `TODO/ui-084`.
      chromeTier: 'full',
      gizmoReservePx: GIZMO_RESERVE_FULL_PX,
    }
  }
  const sharedPx = chatColumn && bodyWidthPx >= CHAT_COLUMN_MIN_WIDTH_PX ? bodyWidthPx - CHAT_COLUMN_WIDTH_PX : bodyWidthPx

  const inspectorWidthPx = Math.min(
    INSPECTOR_MAX_PX,
    Math.max(INSPECTOR_MIN_PX, INSPECTOR_MIN_PX + (sharedPx - INSPECTOR_MIN_E_PX) * INSPECTOR_SLOPE),
  )

  /** @type {LibraryTier} */
  let libraryTier
  let libraryWidthPx
  if (sharedPx >= LIBRARY_LABELS_MIN_E_PX) {
    libraryTier = 'labels'
    libraryWidthPx = Math.min(LIBRARY_LABELS_MAX_PX, LIBRARY_LABELS_MIN_PX + (sharedPx - LIBRARY_LABELS_MIN_E_PX) * LIBRARY_SLOPE)
  } else if (sharedPx >= LIBRARY_ICONS_MIN_E_PX) {
    libraryTier = 'icons'
    libraryWidthPx = LIBRARY_ICONS_PX
  } else {
    libraryTier = 'popout'
    libraryWidthPx = LIBRARY_POPOUT_PX
  }

  const paneWidthPx = sharedPx - libraryWidthPx - inspectorWidthPx
  /** @type {OpsTier} */
  const opsTier =
    paneWidthPx >= OPS_LABELS_MIN_PANE_PX ? 'labels' : paneWidthPx >= OPS_ICONS_MIN_PANE_PX ? 'icons' : 'groups'
  /** @type {ChromeTier} */
  const chromeTier = paneWidthPx >= CHROME_FULL_MIN_PANE_PX ? 'full' : 'compact'
  const gizmoReservePx = chromeTier === 'full' ? GIZMO_RESERVE_FULL_PX : GIZMO_RESERVE_COMPACT_PX

  return { phone: false, libraryTier, libraryWidthPx, inspectorWidthPx, paneWidthPx, opsTier, chromeTier, gizmoReservePx }
}

/**
 * The layout store: the one measured number, whether the chat is open, and which pop-out (of
 * either panel) is open — only one at a time across both (`ui-079` stages 5–6 use it).
 */
export const usePanelLayoutStore = defineStore('panelLayout', () => {
  /** `.app__body` width in CSS px. Seeded synchronously so the first frame is the right tier. */
  const bodyWidthPx = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
  /** Whether the chat panel is open (`panelLayoutFor` decides whether that is a column). */
  const chatColumn = ref(false)
  /** @type {import('vue').Ref<string | null>} */
  const openPopout = ref(null)

  const layout = computed(() => panelLayoutFor({ bodyWidthPx: bodyWidthPx.value, chatColumn: chatColumn.value }))

  /**
   * The `ResizeObserver`'s one write. A zero or non-finite width (a detached or hidden body)
   * is ignored rather than read as "phone".
   *
   * @param {number} widthPx
   */
  function setBodyWidth(widthPx) {
    if (!Number.isFinite(widthPx) || widthPx <= 0) return
    bodyWidthPx.value = widthPx
  }

  /** @param {boolean} open */
  function setChatColumn(open) {
    chatColumn.value = open
  }

  return { bodyWidthPx, chatColumn, openPopout, layout, setBodyWidth, setChatColumn }
})
