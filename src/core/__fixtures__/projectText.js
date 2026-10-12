// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The record lines of project text, without its trailing state line.
 *
 * `TODO/data-011`: an edited document's state line now carries merge metadata (stamps,
 * tombstones, the clock), which an Undo legitimately changes even though it restores every
 * record. "Restores the log byte for byte" is a claim about the record lines.
 *
 * @param {string} text
 * @returns {string}
 */
export function recordLinesOf(text) {
  const lines = text.trimEnd().split('\n')
  const last = lines.at(-1) ?? ''
  return lines.length === 0 || text === ''
    ? ''
    : (last.includes('"warpcad":"project-state"') ? lines.slice(0, -1) : lines).join('\n') + '\n'
}
