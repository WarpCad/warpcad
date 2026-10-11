// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place the subscription route's command is written down (`TODO/ai-013`,
 * `docs/decisions/ai-partner.md` decision 10). It is the same command `docs/mcp.md` documents:
 * Claude Code, billed to the user's own Claude subscription, drives WarpCad through the MCP
 * server. WarpCad never sees a subscription credential.
 *
 * @module ai/subscriptionRoute
 */

/** What the dialog shows and Copy puts on the clipboard. The two paths are the user's to edit. */
export const MCP_ADD_COMMAND = 'claude mcp add warpcad -- node ~/src/WarpCad/mcp/server.js ~/parts/bracket.ndjson'
