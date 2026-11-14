// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { compileStyle, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

/**
 * Guard for `TODO/ui-116`'s Split regression. In a scoped style, Vue drops everything but the
 * `:global(...)` part of `body :global(.sheet.split) > .split__pieces`, so the rule became
 * `.sheet.split { grid-column: 1 / -1 }` and the phone sheet's pieces list shrank to one grid column
 * (189 px instead of 364 px). A combinator around `:global(...)` is therefore never allowed.
 */

/** @param {string} dir @returns {string[]} every .vue file under dir */
function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? vueFiles(path) : name.endsWith('.vue') ? [path] : []
  })
}

describe('scoped styles that use :global()', () => {
  it('compile a child rule under a global frame to a child rule, not to the frame', () => {
    const { code } = compileStyle({
      source: '.split > .split__pieces { grid-column: 1 / -1 }',
      filename: 'a.vue',
      id: 'data-v-x',
      scoped: true,
    })
    expect(code).toContain('.split > .split__pieces[data-v-x]')
  })

  it('never put a combinator or a descendant after :global(...)', () => {
    const offenders = []
    for (const file of vueFiles('src')) {
      const { descriptor } = parse(readFileSync(file, 'utf8'))
      for (const style of descriptor.styles.filter((s) => s.scoped)) {
        for (const line of style.content.split('\n')) {
          if (/:global\([^)]*\)\s*(>|\+|~|[.#\w[:])/.test(line)) offenders.push(`${file}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
