// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `THIRD-PARTY-NOTICES.txt` (`TODO/build-011`): the licence notice of every production dependency,
// as MIT, BSD and Apache-2.0 require of anyone who distributes the library. The text is built from
// the installed packages, so it cannot drift from what `npm ci` put in `node_modules`.
//
// "Production" is the same closure `npm run licenses` checks: every `package-lock.json` entry not
// flagged `dev`. Dev dependencies are never distributed, so they get no notice.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {object} NoticePackage
 * @property {string} name
 * @property {string} version
 * @property {string} license SPDX identifier (or expression), `UNKNOWN` when the package says nothing
 * @property {string | null} licenseText the package's LICENSE/LICENCE/COPYING file, `null` when it ships none
 * @property {string | null} noticeText the package's NOTICE file (Apache-2.0 §4(d)), `null` when none
 */

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i
const NOTICE_FILE = /^notice(\.(md|txt))?$/i

/**
 * Names (relative to `node_modules/`) of the lock file's production packages.
 *
 * @param {{ packages?: Record<string, { dev?: boolean, version?: string, license?: string }> }} lock parsed `package-lock.json` (lockfile v3)
 * @returns {{ key: string, name: string, version: string, license: string }[]} sorted by name, then version
 */
export function productionEntries(lock) {
  const out = []
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.includes('node_modules/') || entry.dev === true) continue
    out.push({
      key,
      name: key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length),
      version: entry.version ?? '0.0.0',
      license: entry.license ?? 'UNKNOWN',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

/**
 * Reads the licence and NOTICE files out of one installed package directory.
 *
 * @param {string} dir
 * @returns {{ licenseText: string | null, noticeText: string | null }}
 */
export function readNoticeFiles(dir) {
  const names = existsSync(dir) ? readdirSync(dir).sort() : []
  const read = (/** @type {RegExp} */ pattern) => {
    const name = names.find((n) => pattern.test(n))
    return name === undefined ? null : readFileSync(join(dir, name), 'utf8').trim()
  }
  return { licenseText: read(LICENSE_FILE), noticeText: read(NOTICE_FILE) }
}

/**
 * The production packages of a project, with their notice files read from disk.
 *
 * @param {string} [root] project root (holds `package-lock.json` and `node_modules/`)
 * @returns {NoticePackage[]}
 */
export function collectProductionPackages(root = '.') {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  return productionEntries(lock).map(({ key, name, version, license }) => ({
    name,
    version,
    license,
    ...readNoticeFiles(join(root, key)),
  }))
}

/**
 * The first `Copyright …` line of a licence text, for the entry's heading block.
 *
 * @param {string | null} text
 * @returns {string | null}
 */
function copyrightLine(text) {
  const line = (text ?? '').split('\n').find((l) => /^\s*(copyright|\(c\)|©)/i.test(l))
  return line === undefined ? null : line.trim()
}

/**
 * Renders the notices file. Pure and deterministic: sorted, no timestamps, so two runs over the
 * same package list are byte-identical. A package that ships no licence file is still listed,
 * with its SPDX identifier and a pointer to the standard text, never skipped.
 *
 * @param {NoticePackage[]} packages
 * @returns {string}
 */
export function renderNotices(packages) {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  const rule = '='.repeat(72)
  const parts = [
    'WarpCad third-party notices',
    '',
    'WarpCad itself is free software under the AGPL-3.0-or-later (see LICENSING.md and',
    'https://github.com/WarpCad/warpcad). It is built with the libraries below, each distributed',
    'under its own licence, reproduced here as those licences require.',
    '',
    'The wood-screw pilot-hole table in the hardware library takes its dimensions from the',
    'Albany County Fasteners "Wood Screw Pilot Hole Guide" (https://www.albanycountyfasteners.com/).',
  ]
  for (const pkg of sorted) {
    parts.push('', rule, `${pkg.name} ${pkg.version}`, `Licence: ${pkg.license}`)
    const copyright = copyrightLine(pkg.licenseText)
    if (copyright !== null) parts.push(copyright)
    parts.push(rule, '')
    if (pkg.licenseText !== null) parts.push(pkg.licenseText)
    else {
      parts.push(
        `No licence file ships with this package. It is distributed under ${pkg.license}; the standard text is at`,
        `https://spdx.org/licenses/${encodeURIComponent(pkg.license)}.html`,
      )
    }
    if (pkg.noticeText !== null) parts.push('', 'NOTICE:', '', pkg.noticeText)
  }
  return parts.join('\n') + '\n'
}

/**
 * Packages that ship no licence file, so the build can say so out loud.
 *
 * @param {NoticePackage[]} packages
 * @returns {string[]} `name@version`
 */
export function packagesMissingLicenseText(packages) {
  return packages.filter((p) => p.licenseText === null).map((p) => `${p.name}@${p.version}`)
}
