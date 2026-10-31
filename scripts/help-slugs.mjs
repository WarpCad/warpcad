// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `npm run help:slugs` — record every page slug and topic id this build publishes in
 * `docs/help-slugs.json` (`TODO/docs-028`). It only appends slugs the lockfile does not list yet.
 * It never removes one: a page that is renamed or removed needs an alias, added by hand, so a link
 * that was published keeps working.
 *
 * @module scripts/help-slugs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { TOPICS } from '../src/help/topics.js'
import { buildHelp } from './help-build.mjs'

const LOCK = resolve('docs', 'help-slugs.json')

/**
 * Add the live slugs the lockfile lacks. Pure, so it is testable without the filesystem.
 *
 * @param {{ slugs: string[], aliases: Record<string, string> }} lock
 * @param {string[]} live page slugs and topic ids
 * @returns {{ slugs: string[], aliases: Record<string, string> }} the lock with new slugs appended
 */
export function addMissingSlugs(lock, live) {
  const known = new Set(lock.slugs)
  const slugs = [...lock.slugs]
  for (const slug of live) {
    if (!known.has(slug)) {
      slugs.push(slug)
      known.add(slug)
    }
  }
  return { slugs, aliases: lock.aliases }
}

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { slugs: [], aliases: {} }
const build = buildHelp({ docsDir: resolve('docs') })
const live = [...Object.keys(build.pages), ...Object.keys(TOPICS)]
const next = addMissingSlugs({ slugs: lock.slugs ?? [], aliases: lock.aliases ?? {} }, live)
const added = next.slugs.length - (lock.slugs ?? []).length
writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`)
console.log(added === 0 ? 'docs/help-slugs.json is up to date' : `added ${added} slug(s) to docs/help-slugs.json`)
