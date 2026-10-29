// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Plain MCP client stand-in for the live bridge's app-level spec (`e2e/ai-mcp-agent-pairing.e2e.js`,
 * `TODO/ai-023`): a real `@modelcontextprotocol/client` over Streamable HTTP. It lives in `mcp/`
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
 * @property {(name: string, args?: Record<string, string>) => Promise<any>} getPrompt
 * @property {() => Promise<void>} close
 */

/**
 * Connect to the dev server's `/mcp`, as `claude mcp add --transport http` would.
 *
 * @param {string} url e.g. `http://localhost:5183/mcp`.
 * @returns {Promise<StandIn>}
 */
export async function connectMcpClient(url) {
  const client = new Client({ name: 'mcp-client-stand-in', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url))
  await client.connect(transport)
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
    async getPrompt(name, args) {
      return client.getPrompt({ name, ...(args ? { arguments: args } : {}) })
    },
    async close() {
      // DELETE first, so the host drops this session at once; a bare close() leaves it counted.
      await transport.terminateSession().catch(() => {})
      await client.close()
    },
  }
}
