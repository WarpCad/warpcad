// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one "when you are done" paragraph (`TODO/io-040`) every agent path is told: the in-app
 * Assistant's system prompt (`src/ai/prompt.js`), the MCP guide `warpcad://guide` (composed in
 * `prompt.js`, served by `src/ai/mcpPrompts.js`) and the browser-agent setup text
 * (`STARTER_BROWSER_AGENT`, shown by `BrowserAgentSetup.vue`). Written once here so the three
 * cannot drift.
 *
 * It leaves the project ready for a **person** to publish as a gist: name, description, the files
 * a person would print with, then `get_publish_readiness` and its gaps fixed, then the reply. It
 * never lets an agent publish or ask for a GitHub token — no tool can do either, and the text says
 * so, so a model does not go looking.
 *
 * The one difference between paths is the reply: an MCP or WebMCP agent calls `record_response`;
 * the in-app Assistant has no such tool, because the app saves its final message itself
 * (`TODO/ai-032`).
 *
 * A plain constant per path, framework-free, with nothing from a document in it (decision 7).
 *
 * @module ai/finishing
 */

/** The heading the prompt and the guide put over {@link finishingParagraph}. */
export const FINISHING_HEADING = '# When you are done'

/**
 * The finishing steps, as one paragraph.
 *
 * @param {{ recordResponse: boolean }} options `true` for MCP and WebMCP agents, which save their
 *   reply with `record_response`; `false` for the in-app Assistant, whose reply the app saves.
 * @returns {string}
 */
export function finishingParagraph({ recordResponse }) {
  return [
    'When the part is finished, leave the project ready for the person to publish as a gist:',
    'call set_project_name with a short name a person would recognise,',
    'set_description with what the part is and what it is for,',
    'and stage_gist_files with the files a person would print with (an STL of the finished bodies, and a note only if print settings or assembly need saying).',
    'Then call get_publish_readiness and fix every gap it lists.',
    recordResponse ? 'Last, call record_response with your final message.' : 'Then write your final message.',
    'Never ask the user for a GitHub token and never try to publish: the person reviews it and taps Publish.',
  ].join(' ')
}

/**
 * {@link finishingParagraph} under {@link FINISHING_HEADING}: a section of the prompt or the guide.
 *
 * @param {{ recordResponse: boolean }} options
 * @returns {string}
 */
export function finishingSection(options) {
  return `${FINISHING_HEADING}\n${finishingParagraph(options)}`
}
