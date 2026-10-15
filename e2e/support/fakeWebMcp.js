// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A fake WebMCP API for Playwright (`TODO/ai-021`, Decision 13), shared by `e2e/webmcp.e2e.js` and
 * `e2e/docs/webmcp-chip.docs.js`. The real `document.modelContext` is Chromium-behind-a-flag only
 * and cannot be switched on in a Playwright-launched browser, so this stands in for it, shaped as
 * the WebML CG draft and Chrome's Imperative API page describe it: `registerTool(tool, { signal })`,
 * aborting the signal unregisters, a live name cannot be registered twice, and an agent's call gets
 * back the JSON of what `execute` returned. It works the same in Chromium, Firefox and WebKit.
 */

/**
 * Install the fake API before any app script runs. `window.__webmcp` is the agent's side:
 * the registered tools, a log, and `call(name, input)` (what `executeTool` resolves to, parsed).
 *
 * @param {import('@playwright/test').Page} page
 */
export async function installFakeWebMcp(page) {
  await page.addInitScript(() => {
    /** @type {Map<string, any>} */
    const tools = new Map()
    /** @type {string[]} */
    const log = []
    const modelContext = {
      /** @param {any} tool @param {{ signal?: AbortSignal }} [options] */
      registerTool(tool, options = {}) {
        if (tools.has(tool.name)) return Promise.reject(new DOMException(`Duplicate tool name: ${tool.name}`, 'InvalidStateError'))
        if (options.signal?.aborted) return Promise.resolve()
        tools.set(tool.name, tool)
        log.push(`+${tool.name}`)
        options.signal?.addEventListener('abort', () => {
          if (tools.get(tool.name) !== tool) return
          tools.delete(tool.name)
          log.push(`-${tool.name}`)
        })
        return Promise.resolve()
      },
    }
    Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get: () => modelContext })
    /** @type {any} */
    const agentSide = window
    agentSide.__webmcp = {
      tools,
      log,
      names: () => [...tools.keys()].sort(),
      annotations: (/** @type {string} */ name) => tools.get(name)?.annotations ?? null,
      /** @param {string} name @param {unknown} input */
      async call(name, input) {
        const tool = tools.get(name)
        if (!tool) throw new Error(`no tool ${name} is registered`)
        return JSON.parse(JSON.stringify(await tool.execute(input, {})))
      },
    }
  })
}

/** @param {import('@playwright/test').Page} page */
export const registeredNames = (page) => page.evaluate(() => /** @type {any} */ (window).__webmcp.names())

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {unknown} input
 * @returns {Promise<any>}
 */
export const agentCall = (page, name, input) => page.evaluate(({ name, input }) => /** @type {any} */ (window).__webmcp.call(name, input), { name, input })

