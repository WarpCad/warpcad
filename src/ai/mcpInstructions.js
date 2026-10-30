// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The working method both MCP servers put in `InitializeResult.instructions` (`TODO/ai-027`).
 *
 * Server instructions are the one channel every MCP client reads unasked: Claude Code puts them
 * in the model's system prompt. The in-app Assistant gets the long `SYSTEM_PROMPT`; an MCP agent
 * gets this short list, taken from it. Framework-free and a plain constant (no document text is
 * ever interpolated), so `ai-026`'s page can hand the live text to the native host too.
 */

/**
 * Claude Code cuts `InitializeResult.instructions` and each tool description at this many
 * characters, with no warning in the model's context: a longer text arrives as a prefix that
 * looks complete. The limit is not in Anthropic's docs; it comes from Claude Code issue reports
 * (39106, 81268, 87650, mirrored at claudeissues.com), checked 2026-10-28. A later release
 * reportedly adds `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` to change it; the default is what
 * users have, so we design to it.
 */
export const CLIENT_INSTRUCTIONS_CAP = 2048

/**
 * Both servers' line for the two prompt tools (`TODO/ai-031`, `TODO/ai-032`): the request first,
 * the reply last. Squeezed to fit {@link CLIENT_INSTRUCTIONS_CAP} with five characters to spare
 * on the live server — the full wording (deviation, workaround, refused call, failed check) is in
 * `record_response`'s own description, the guide and the `build` prompt.
 */
export const RECORD_PROMPT_LINE =
  'Call `record_prompt` first with the user’s request, as received, before any write; `record_response` last, with your final message and every problem you met.'

/**
 * `TODO/ai-032`: the full sentence, where there is room for it (the guide, the MCP prompts).
 * Backticks are the caller's to add or not.
 */
export const RECORD_RESPONSE_SENTENCE =
  'When you finish, call record_response with your final message — including every problem you met: a deviation from the request, a workaround, a refused call, a failed check and how you resolved it.'

/** The last shared line: what the instructions cannot carry is the resource both servers serve. */
export const GUIDE_POINTER =
  'Before your first write, read the resource warpcad://guide: the working method, a worked example and the printing defaults.'

/**
 * The shared rules, most valuable first, because a cut loses the tail.
 *
 * @param {boolean} live The live server also has `capture_view`; the file server cannot render.
 * @returns {string[]}
 */
export function sharedInstructionLines(live) {
  return [
    'Units are millimetres and degrees, Z up; the grid is the plane Z = 0.',
    'list_ops {detail:"summary"} lists ops, {ops:[…]} gives params. Then describe_scene. Never guess an id: take it from describe_scene or a write.',
    'create places one body; operate changes existing bodies by id; apply_records does several steps atomically, a later step naming an earlier body "@1".',
    'positionMm: x and y centre the footprint, z is the underside. Place bodies relative to each other, never all at the origin.',
    'boolean.subtract keeps its first operand. A boolean or group consumes its operands: use the new id it returns.',
    'Every write returns the scene: read it, do not assume. An error names the step and reason: fix the call, do not repeat it.',
    `Before you say a part is done, check it: measure, check_printability, check_clearance${live ? ', capture_view' : ''}.`,
    'Printing defaults: 0.4 mm nozzle, 1.2 mm minimum wall, 0.2 / 0.4 mm clearance, 220 × 220 × 250 mm bed.',
    'If a size that decides the result is missing with no default, ask once, with zero writes.',
    GUIDE_POINTER,
  ]
}
