// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the History's origin chip says (`§19` point 2; `TODO/ai-009`).
 *
 * A record's origin is read from the project file's state line (`src/core/project.js`), and a
 * project file is untrusted input: it can declare any string as an origin. The chip therefore
 * names only the origins this build itself writes, and shows one fixed phrase for anything
 * else — so a file cannot put its own words on a chip that is meant to say *who* made a step
 * (`via you (verified)`), or fill the row with ten thousand characters. Vue's text
 * interpolation already makes markup inert; this is about the words, not the markup.
 *
 * The record keeps whatever origin the file declared — it round-trips unchanged — only the
 * label is constrained.
 *
 * @module core/origin
 */

/**
 * Every origin this build writes: `local` (the user, the only one on the undo stack), `ai` (the
 * in-app assistant), `mcp` (the MCP server, `mcp/server.js`), `remote`, `programmatic`,
 * `merge` (`TODO/data-010`: the transaction a `mergeFrom` runs as — never on either undo stack),
 * and `webmcp` (`TODO/ai-021`: an in-browser agent calling the tools the open tab registers).
 */
export const KNOWN_ORIGINS = Object.freeze(['local', 'ai', 'mcp', 'remote', 'programmatic', 'merge', 'webmcp'])

/**
 * @param {string} origin As the entry carries it.
 * @returns {string} `by you`, `via <origin>` for a known origin, otherwise `via another program`.
 */
export function originChipText(origin) {
  if (origin === 'local') return 'by you'
  return KNOWN_ORIGINS.includes(origin) ? `via ${origin}` : 'via another program'
}

/**
 * Who a conflict reason says made the row a flagged step lost to (`TODO/data-010`'s
 * `conflicts with step N (<label>, …)`; `TODO/data-013`).
 *
 * A `local` row is named by step and label only — **never "by you"**. `local` means a person
 * made the row by hand, on *some* copy of the project: after a merge it may be a step made on
 * another device, or by whoever sent the file, and a replica id cannot tell this device from
 * another once the page reloads. The reason is part of the merged log every replica folds,
 * so it must read the same on every copy and after a reload; a phrase that depended on who is
 * looking ("by you" here, "on another copy" there) would not. Any other origin keeps its
 * {@link originChipText} (`via ai`, `via mcp`, `via another program`), which is the same on
 * every copy.
 *
 * @param {string} origin As the winning entry carries it.
 * @returns {string} `''` for `local`, otherwise `, ` plus the chip text.
 */
export function conflictAttribution(origin) {
  return origin === 'local' ? '' : `, ${originChipText(origin)}`
}
