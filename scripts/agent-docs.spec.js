// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { LIMITS, WEBMCP_WITHHELD, createToolRegistry } from '../src/ai/tools/index.js'
import { checkInput } from '../src/ai/tools/schema.js'
import {
  DESCRIPTION_LIMIT,
  EXAMPLES,
  renderGuide,
  renderLimits,
  renderLlmsFull,
  renderToolReference,
  spliceGenerated,
} from './agent-docs.mjs'

/**
 * `TODO/docs-029`: the tool reference in `docs/agent-prompting.md` is generated from the registry,
 * so a new tool or a changed param cannot leave the page wrong. Plain Node, no DOM.
 */

const ROOT = join(import.meta.dirname, '..')
const registry = createToolRegistry()

/** @param {string} name @param {Record<string, any>} [more] */
const fixtureTool = (name, more = {}) => ({
  name,
  description: 'A fixture tool.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  transports: ['ai', 'mcp'],
  run: () => ({}),
  ...more,
})
/** @param {any[]} tools */
const fixtureRegistry = (tools) => ({
  tools,
  toolsFor: (/** @type {string} */ transport) =>
    tools.filter((tool) => (transport === 'webmcp' ? !WEBMCP_WITHHELD.includes(tool.name) && tool.transports.includes('mcp') : tool.transports.includes(transport))),
})

/** The `###` tool headings in a reference, in order. */
const headingsOf = (/** @type {string} */ text) => [...text.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1])

describe('renderToolReference lists exactly the registry', () => {
  const text = renderToolReference(registry)

  it('has every WebMCP tool once, in the registry’s order', () => {
    const expected = registry.toolsFor('webmcp').map((tool) => tool.name)
    expect(expected.length).toBeGreaterThan(15)
    expect(headingsOf(text)).toEqual(expected)
  })

  it('shows each tool’s description and its input schema', () => {
    for (const tool of registry.toolsFor('webmcp')) {
      const start = text.indexOf(`### \`${tool.name}\``)
      expect(start, tool.name).toBeGreaterThan(-1)
      for (const property of Object.keys(tool.inputSchema.properties ?? {})) {
        expect(text.slice(start, start + 60_000), `${tool.name}.${property}`).toContain(`\`${property}\``)
      }
    }
  })

  it('marks the tools WebMCP withholds, and gives them no tool heading', () => {
    expect(WEBMCP_WITHHELD).toContain('capture_view')
    expect(headingsOf(text)).not.toContain('capture_view')
    expect(text).toMatch(/`capture_view`[^\n]*withheld/i)
  })

  it('names the paging arguments WebMCP adds to a list tool', () => {
    const start = text.indexOf('### `describe_scene`')
    expect(text.slice(start, start + 4000)).toContain('`offset`')
  })

  it('carries one example call per tool, and every example is valid input', () => {
    for (const tool of registry.toolsFor('webmcp')) {
      const example = EXAMPLES[tool.name]
      expect(example, `an example for ${tool.name}`).toBeDefined()
      const errors = tool.validate ? tool.validate(example) : checkInput(tool.inputSchema, example)
      expect(errors, `${tool.name} example: ${errors.join('; ')}`).toEqual([])
    }
    for (const name of Object.keys(EXAMPLES)) expect(registry.tools.map((tool) => tool.name), `EXAMPLES.${name}`).toContain(name)
  })
})

describe('renderToolReference follows the registry, degenerate cases included', () => {
  it('changes when a fixture tool is added', () => {
    const base = fixtureRegistry([fixtureTool('alpha')])
    const more = fixtureRegistry([fixtureTool('alpha'), fixtureTool('beta')])
    expect(headingsOf(renderToolReference(base))).toEqual(['alpha'])
    expect(headingsOf(renderToolReference(more))).toEqual(['alpha', 'beta'])
    expect(renderToolReference(more)).not.toBe(renderToolReference(base))
  })

  it('says so when a tool takes no parameters', () => {
    expect(renderToolReference(fixtureRegistry([fixtureTool('alpha')]))).toMatch(/takes no parameters/i)
  })

  it('shows a nested schema whole when it is small', () => {
    const nested = fixtureTool('nest', {
      inputSchema: {
        type: 'object',
        properties: { outer: { type: 'object', properties: { inner: { type: 'array', items: { type: 'number' } } } } },
        required: ['outer'],
        additionalProperties: false,
      },
    })
    const text = renderToolReference(fixtureRegistry([nested]))
    expect(text).toContain('"inner"')
    expect(text).toMatch(/`outer`[^\n]*\| yes \|/)
  })

  it('shows a schema too large to read as a table of its top-level parameters, and says so', () => {
    const big = fixtureTool('big', {
      inputSchema: {
        type: 'object',
        properties: { huge: { type: 'string', description: 'x'.repeat(5000) } },
        required: [],
        additionalProperties: false,
      },
    })
    const text = renderToolReference(fixtureRegistry([big]))
    expect(text).not.toContain('x'.repeat(DESCRIPTION_LIMIT + 1))
    expect(text).toMatch(/too large to print/i)
    expect(text).toContain('`huge`')
  })

  it('escapes Markdown characters in a description, so the page does not reformat itself', () => {
    const odd = fixtureTool('odd', { description: 'Uses *stars*, `ticks`, a | pipe, <b>tags</b> and [links](x).' })
    const text = renderToolReference(fixtureRegistry([odd]))
    expect(text).toContain('\\*stars\\*')
    expect(text).toContain('\\`ticks\\`')
    expect(text).toContain('\\|')
    expect(text).toContain('\\<b\\>')
    expect(text).toContain('\\[links\\]')
  })

  it('keeps a fence intact when a schema contains backticks', () => {
    const ticks = fixtureTool('ticks', {
      inputSchema: { type: 'object', properties: { a: { type: 'string', description: 'use ``` fences' } }, required: [], additionalProperties: false },
    })
    const text = renderToolReference(fixtureRegistry([ticks]))
    const fences = text.split('\n').filter((line) => /^`{3,}/.test(line))
    expect(fences.length % 2).toBe(0)
    expect(fences[0].length).toBeGreaterThan(3)
  })
})

describe('renderLimits reads LIMITS', () => {
  it('prints every cap with its current value', () => {
    const text = renderLimits()
    for (const [key, value] of Object.entries(LIMITS)) expect(text, key).toMatch(new RegExp(`\\\`${key}\\\`[^\\n]*${value.toLocaleString('en-US')}`))
  })
})

describe('spliceGenerated keeps hand-written prose', () => {
  const page = 'before\n<!-- agent-docs:tools:begin -->\nold\n<!-- agent-docs:tools:end -->\nafter\n'

  it('replaces only what is between the markers', () => {
    const next = spliceGenerated(page, 'tools', 'new')
    expect(next).toContain('before\n')
    expect(next).toContain('\nafter\n')
    expect(next).toContain('\nnew\n')
    expect(next).not.toContain('old')
  })

  it('is idempotent', () => {
    const once = spliceGenerated(page, 'tools', 'new')
    expect(spliceGenerated(once, 'tools', 'new')).toBe(once)
  })

  it('refuses a page with no such markers rather than guessing where to write', () => {
    expect(() => spliceGenerated('no markers', 'tools', 'x')).toThrow(/agent-docs:tools/)
  })
})

describe('the committed guide and the public files are up to date', () => {
  /** @param {string} path */
  const read = (path) => readFileSync(join(ROOT, path), 'utf8')

  it('docs/agent-prompting.md matches what the registry and the worked example generate (npm run docs:agent)', () => {
    expect(read('docs/agent-prompting.md')).toBe(renderGuide(read('docs/agent-prompting.md')))
  })

  it('is titled "Prompting an agent to design a part"', () => {
    expect(read('docs/agent-prompting.md')).toMatch(/^# Prompting an agent to design a part$/m)
  })

  it('public/llms-full.txt is the guide as one Markdown file (npm run docs:agent)', () => {
    expect(read('public/llms-full.txt')).toBe(renderLlmsFull(read('docs/agent-prompting.md')))
  })

  it('llms-full.txt has no HTML and no image embeds', () => {
    const full = read('public/llms-full.txt')
    expect(full).not.toMatch(/(?<!\\)<[a-z!\/][^>]*>/i)
    expect(full).not.toMatch(/!\[/)
  })

  it('every link in public/llms.txt resolves to a published help page', () => {
    const text = read('public/llms.txt')
    const links = [...text.matchAll(/\]\((https:\/\/app\.warpcad\.com\/[^)\s]+)\)/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThanOrEqual(5)
    for (const link of links) {
      const help = /^https:\/\/app\.warpcad\.com\/help\/([\w-]+)\.html$/.exec(link)
      const file = /^https:\/\/app\.warpcad\.com\/(llms-full\.txt)$/.exec(link)
      expect(help ?? file, link).not.toBeNull()
      if (help) expect(() => read(`docs/${help[1]}.md`), link).not.toThrow()
      if (file) expect(() => read(`public/${file[1]}`), link).not.toThrow()
    }
    for (const slug of ['agent-prompting', 'webmcp', 'mcp', 'variables', 'booleans']) expect(text).toContain(`/help/${slug}.html`)
  })

  it('the slug is in the lockfile', () => {
    expect(JSON.parse(read('docs/help-slugs.json')).slugs).toContain('agent-prompting')
  })
})
