// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOMAIN = 'app.warpcad.com'

describe('custom domain CNAME', () => {
  it('public/CNAME exists, so every Pages deploy carries the custom domain', () => {
    expect(existsSync(join(ROOT, 'public', 'CNAME'))).toBe(true)
  })
  it('public/CNAME holds exactly the domain, with at most one trailing newline', () => {
    const text = readFileSync(join(ROOT, 'public', 'CNAME'), 'utf8')
    expect(text.replace(/\n$/, '')).toBe(DOMAIN)
  })
  it('the built dist/CNAME matches public/CNAME, when dist/ exists', () => {
    const built = join(ROOT, 'dist', 'CNAME')
    if (!existsSync(join(ROOT, 'dist'))) return
    expect(existsSync(built)).toBe(true)
    expect(readFileSync(built, 'utf8')).toBe(readFileSync(join(ROOT, 'public', 'CNAME'), 'utf8'))
  })
})
