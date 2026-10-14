// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Claude Code's stand-in for the live bridge's app-level spec (`e2e/ai-live-bridge.e2e.js`,
 * `TODO/ai-012`): a real `@modelcontextprotocol/client` over Streamable HTTP. It lives in `mcp/`
 * only because that is where the SDK is installed (`mcp/package.json`); the e2e spec imports it.
 * Test scaffolding — nothing in the app or the server imports it.
 *
 * @module mcp/claudeCodeStandIn
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

/**
 * @typedef {object} StandIn
 * @property {(name: string, args: Record<string, unknown>) => Promise<{ isError: boolean, text: string }>} call
 * @property {() => Promise<string[]>} toolNames
 * @property {() => Promise<void>} close
 */

/**
 * Connect to the dev server's `/mcp`, as `claude mcp add --transport http` would.
 *
 * @param {string} url e.g. `http://localhost:5183/mcp`.
 * @returns {Promise<StandIn>}
 */
export async function connectClaudeCode(url) {
  const client = new Client({ name: 'claude-code-stand-in', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url)))
  return {
    async call(name, args) {
      const response = /** @type {any} */ (await client.callTool({ name, arguments: args }))
      return {
        isError: response.isError === true,
        text: response.content.map((/** @type {any} */ block) => block.text ?? '').join('\n'),
      }
    },
    async toolNames() {
      return (await client.listTools()).tools.map((tool) => tool.name)
    },
    close: () => client.close(),
  }
}
