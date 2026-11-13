// SPDX-License-Identifier: AGPL-3.0-or-later
// The widths the layout switches at (`TODO/ui-112`). A custom property cannot sit inside `@media`,
// so CSS keeps the literal and this file keeps the numbers a script needs; the comment block in
// `semantic.css` lists the same ones, and `src/styles/tokens.spec.js` checks they agree.

/** Compact phone, in CSS px: `(max-width: 480px)`. */
export const BREAKPOINT_PHONE_COMPACT = 480
/** Phone, in CSS px: `(max-width: 640px)`, the switch every sheet in the app uses. */
export const BREAKPOINT_PHONE = 640
/** Wide banner, in CSS px: `(min-width: 900px)`, where the Trace tool's sliders open by default. */
export const BREAKPOINT_WIDE_BANNER = 900
/** Wide header, in CSS px: from here the header has room for words. */
export const BREAKPOINT_WIDE_HEADER = 1100

/** The media query for the phone layout. */
export const PHONE_QUERY = `(max-width: ${BREAKPOINT_PHONE}px)`
/** The media query for the wide banner. */
export const WIDE_BANNER_QUERY = `(min-width: ${BREAKPOINT_WIDE_BANNER}px)`
