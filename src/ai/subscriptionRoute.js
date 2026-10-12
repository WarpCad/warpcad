// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place the subscription route's command is written down (`TODO/ai-013`,
 * `docs/decisions/ai-partner.md` decision 10). It is the command `docs/mcp.md` documents:
 * Claude Code, billed to the user's own Claude subscription, drives WarpCad through the MCP
 * server. WarpCad never sees a subscription credential.
 *
 * @module ai/subscriptionRoute
 */

/**
 * What the dialog shows and Copy puts on the clipboard. It names no path the page could not know:
 * `scripts/mcp-add.mjs` resolves `mcp/server.js` from where it lives and the project file from the
 * folder it is run in, then runs `claude mcp add` itself (`TODO/ai-016`). The previous constant was
 * a raw `claude mcp add` with two placeholder paths, which registered a server that exited at once.
 */
export const MCP_ADD_COMMAND = 'npm run mcp:add -- my-part.ndjson'
