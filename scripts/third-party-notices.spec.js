// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  collectProductionPackages,
  packagesMissingLicenseText,
  productionEntries,
  readNoticeFiles,
  renderNotices,
} from './third-party-notices.mjs'

/** @type {import('./third-party-notices.mjs').NoticePackage[]} */
const FIXTURE = [
  { name: 'zeta', version: '2.0.0', license: 'MIT', licenseText: 'MIT License\n\nCopyright (c) 2020 Zeta Authors\n\nPermission is hereby granted', noticeText: null },
  { name: 'alpha', version: '1.0.0', license: 'Apache-2.0', licenseText: 'Apache License Version 2.0', noticeText: 'Alpha\nCopyright 2019 Alpha Inc.' },
  { name: 'bare', version: '0.1.0', license: 'ISC', licenseText: null, noticeText: null },
]

describe('renderNotices', () => {
  const text = renderNotices(FIXTURE)

  it('names each package with its version, licence id and licence text', () => {
    for (const p of FIXTURE) {
      expect(text).toContain(`${p.name} ${p.version}`)
      expect(text).toContain(`Licence: ${p.license}`)
      if (p.licenseText) expect(text).toContain(p.licenseText)
    }
    expect(text).toContain('Copyright (c) 2020 Zeta Authors')
  })

  it("carries an Apache-2.0 package's NOTICE", () => {
    expect(text).toContain('NOTICE:')
    expect(text).toContain('Copyright 2019 Alpha Inc.')
  })

  it('reports a package with no licence file instead of skipping it', () => {
    expect(text).toContain('bare 0.1.0')
    expect(text).toContain('No licence file ships with this package')
    expect(text).toContain('https://spdx.org/licenses/ISC.html')
    expect(packagesMissingLicenseText(FIXTURE)).toEqual(['bare@0.1.0'])
  })

  it('is sorted and byte-identical across runs, whatever the input order', () => {
    expect(renderNotices([...FIXTURE].reverse())).toBe(text)
    expect(renderNotices(FIXTURE)).toBe(text)
    expect(text.indexOf('alpha 1.0.0')).toBeLessThan(text.indexOf('zeta 2.0.0'))
  })

  it('names the Albany County Fasteners chart the wood-screw table follows (core-065)', () => {
    expect(text).toContain('Albany County Fasteners')
  })
})

describe('productionEntries', () => {
  it('drops dev-only packages and the root, and nests by node_modules path', () => {
    const lock = {
      packages: {
        '': { version: '0.0.0' },
        'node_modules/a': { version: '1.0.0', license: 'MIT' },
        'node_modules/dev-only': { version: '1.0.0', license: 'MIT', dev: true },
        'node_modules/a/node_modules/b': { version: '2.0.0' },
      },
    }
    expect(productionEntries(lock).map((e) => `${e.name}@${e.version}:${e.license}`)).toEqual(['a@1.0.0:MIT', 'b@2.0.0:UNKNOWN'])
  })
})

describe('readNoticeFiles', () => {
  it('finds LICENSE, LICENCE.md and COPYING variants plus NOTICE', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'))
    writeFileSync(join(dir, 'LICENSE.md'), '  the licence  \n')
    writeFileSync(join(dir, 'NOTICE'), 'the notice')
    writeFileSync(join(dir, 'README.md'), 'not a licence')
    expect(readNoticeFiles(dir)).toEqual({ licenseText: 'the licence', noticeText: 'the notice' })
    const empty = join(dir, 'empty')
    mkdirSync(empty)
    expect(readNoticeFiles(empty)).toEqual({ licenseText: null, noticeText: null })
  })
})

describe('this repository', () => {
  it('has a notice entry, with licence text, for every production dependency that reaches the bundle', () => {
    const packages = collectProductionPackages('.')
    const text = renderNotices(packages)
    for (const direct of ['three', 'vue', 'pinia', 'idb', '@jscad/modeling', '@sentry/vue']) {
      expect(packages.some((p) => p.name === direct), direct).toBe(true)
    }
    for (const p of packages) expect(text, p.name).toContain(`${p.name} ${p.version}`)
    // Dev tooling is never distributed.
    expect(packages.some((p) => p.name === 'vitest' || p.name === '@playwright/test')).toBe(false)
  })
})
