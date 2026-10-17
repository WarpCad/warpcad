// SPDX-License-Identifier: AGPL-3.0-or-later
// Guard for TODO/build-012: the docs/media GIFs (74 files, ~73 MB, Git LFS) must not be downloaded by
// every CI job and deploy, because LFS bandwidth is a hard monthly quota. No workflow checks out with
// `lfs: true`; the one job whose output contains the GIFs (the Pages build) restores them through the
// local composite action, which caches `.git/lfs/objects` keyed by the LFS pointer list.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKFLOWS = `${ROOT}.github/workflows/`
const ACTION = `${ROOT}.github/actions/lfs-media/action.yml`

/** @param {string} yml @returns {string} the YAML without comment lines and trailing comments */
const stripComments = (yml) => yml.replace(/^\s*#.*$/gm, '').replace(/\s#.*$/gm, '')

describe('workflows and Git LFS (TODO/build-012)', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))

  it('finds the workflows', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'pages.yml']))
  })

  it.each(files)('%s never checks out with lfs: true', (file) => {
    expect(stripComments(readFileSync(WORKFLOWS + file, 'utf-8'))).not.toMatch(/lfs:\s*true/)
  })

  it('pages.yml restores the media through the local composite action, after checkout', () => {
    const pages = stripComments(readFileSync(`${WORKFLOWS}pages.yml`, 'utf-8'))
    expect(pages).toMatch(/uses:\s*\.\/\.github\/actions\/lfs-media/)
    expect(pages.indexOf('actions/checkout')).toBeLessThan(pages.indexOf('./.github/actions/lfs-media'))
  })

  it('the composite action caches .git/lfs/objects by the pointer list, then pulls and checks out', () => {
    expect(existsSync(ACTION)).toBe(true)
    const action = stripComments(readFileSync(ACTION, 'utf-8'))
    expect(action).toMatch(/using:\s*composite/)
    expect(action).toMatch(/actions\/cache@v4/)
    expect(action).toMatch(/\.git\/lfs\/objects/)
    expect(action).toMatch(/git lfs ls-files -l/)
    expect(action).toMatch(/git lfs pull/)
    expect(action).toMatch(/git lfs checkout/)
  })

  it('the CI jobs that read only file presence say why they leave LFS off', () => {
    const ci = readFileSync(`${WORKFLOWS}ci.yml`, 'utf-8')
    expect(ci).toMatch(/lfs:\s*false/)
  })
})
