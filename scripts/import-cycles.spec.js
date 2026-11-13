// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `TODO/ui-109`: no import cycle under `src/`. A cycle works only while every use of an import sits
 * inside a function called after load; a top-level use fails with a `ReferenceError` that depends on
 * which module a bundler evaluates first, and each module of the cycle is untestable without the
 * others. This walks the static imports (tests, stories and dynamic `import()` excluded) and fails
 * on any strongly connected component of more than one module.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]} Absolute paths of the non-test `.js` and `.vue` files under `dir`.
 */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(js|vue)$/.test(name) && !/\.(spec|e2e|stories?)\.js$/.test(name) && !/\.stories\.js$/.test(name)) out.push(path)
  }
  return out
}

/**
 * @param {string} from Absolute path of the importing file.
 * @param {string} specifier
 * @returns {string | null} The absolute path it resolves to, or `null` for a package or a miss.
 */
function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(from), specifier)
  for (const candidate of [base, `${base}.js`, `${base}.vue`, join(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * @param {string} text
 * @returns {string[]} The module specifiers of the top-level static `import` / `export … from`.
 */
function staticSpecifiers(text) {
  const found = []
  for (const match of text.matchAll(/^(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/gm)) found.push(match[1])
  for (const match of text.matchAll(/^import\s*['"]([^'"]+)['"]/gm)) found.push(match[1])
  return found
}

/**
 * Tarjan's strongly connected components.
 *
 * @param {Map<string, string[]>} graph
 * @returns {string[][]} Every component of more than one node.
 */
export function cyclesOf(graph) {
  let counter = 0
  const index = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const cycles = []
  /** @param {string} node */
  function visit(node) {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node), low.get(next)))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)))
      }
    }
    if (low.get(node) === index.get(node)) {
      const component = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) cycles.push(component)
    }
  }
  for (const node of graph.keys()) if (!index.has(node)) visit(node)
  return cycles
}

describe('import graph under src/', () => {
  it('detects a cycle in a small graph', () => {
    const graph = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['a']]])
    expect(cyclesOf(graph).map((c) => c.sort())).toEqual([['a', 'b', 'c']])
  })

  it('has no import cycle', () => {
    const graph = importGraph()
    const found = cyclesOf(graph).map((cycle) => cycle.map((file) => relative(SRC, file)).sort())
    expect(found).toEqual([])
  })

  it('has no store importing a composable', () => {
    const offenders = []
    for (const [file, targets] of importGraph()) {
      if (!relative(SRC, file).startsWith('stores/')) continue
      for (const target of targets) if (relative(SRC, target).startsWith('composables/')) offenders.push(`${relative(SRC, file)} -> ${relative(SRC, target)}`)
    }
    expect(offenders).toEqual([])
  })
})

/** @returns {Map<string, string[]>} Each source file under `src/` and the files it statically imports. */
function importGraph() {
  const graph = new Map()
  for (const file of sourceFiles(SRC)) {
    const targets = staticSpecifiers(readFileSync(file, 'utf8'))
      .map((specifier) => resolveImport(file, specifier))
      .filter((target) => target !== null)
    graph.set(file, targets)
  }
  return graph
}
