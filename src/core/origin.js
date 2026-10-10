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
 * in-app assistant), `mcp` (the MCP server, `mcp/server.js`), `remote` and `programmatic`.
 */
export const KNOWN_ORIGINS = Object.freeze(['local', 'ai', 'mcp', 'remote', 'programmatic'])

/**
 * @param {string} origin As the entry carries it.
 * @returns {string} `by you`, `via <origin>` for a known origin, otherwise `via another program`.
 */
export function originChipText(origin) {
  if (origin === 'local') return 'by you'
  return KNOWN_ORIGINS.includes(origin) ? `via ${origin}` : 'via another program'
}
