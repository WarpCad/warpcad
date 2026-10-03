// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDocsMedia, findClaimedStills, findImageRefs } from '../scripts/docs-media-check.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const toPosix = (p) => p.split('\\').join('/')

/** @param {string} dir @param {(name: string) => boolean} keep @returns {string[]} repo-relative paths */
function walk(dir, keep) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full, keep)
    return keep(entry) ? [toPosix(relative(root, full))] : []
  })
}

test('docs media: no dead links, no orphans, every picture regenerable', () => {
  const pages = ['README.md', ...walk(join(root, 'docs'), (n) => n.endsWith('.md'))]
  const refs = pages.flatMap((file) =>
    findImageRefs(readFileSync(join(root, file), 'utf-8')).map((r) => ({
      file,
      alt: r.alt,
      line: r.line,
      target: posix.normalize(posix.join(dirname(file), r.target)),
    })),
  )

  const files = [
    ...walk(join(root, 'docs/screenshots'), (n) => /\.(png|gif)$/.test(n)),
    ...walk(join(root, 'docs/media'), (n) => /\.(gif|png|webm|mp4)$/.test(n)),
    // Curated, not spec-generated (npm run docs:montage): still checked for dead links and orphans.
    ...walk(join(root, 'docs/images'), (n) => /\.jpe?g$/.test(n)),
  ]

  const specs = walk(join(root, 'e2e/docs'), (n) => n.endsWith('.docs.js'))
  const claimedStills = new Set(specs.flatMap((s) => [...findClaimedStills(readFileSync(join(root, s), 'utf-8'))]))

  const manifestPath = join(root, 'docs/media/manifest.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : {}
  const hashes = Object.fromEntries(
    Object.values(manifest).map((m) => [
      m.spec,
      existsSync(join(root, m.spec)) ? createHash('sha256').update(readFileSync(join(root, m.spec))).digest('hex') : undefined,
    ]),
  )

  const { errors, warnings } = checkDocsMedia({ refs, files, claimedStills, manifest, hashes, ci: !!process.env.CI })
  for (const w of warnings) console.warn(`docs-media warning: ${w}`)
  expect(errors, errors.join('\n')).toEqual([])
})

test('docs media: the README and the getting-started page both embed the tour GIF', () => {
  for (const page of ['README.md', 'docs/getting-started.md']) {
    const targets = findImageRefs(readFileSync(join(root, page), 'utf-8')).map((r) => posix.normalize(posix.join(dirname(page), r.target)))
    expect(targets, `${page} must embed docs/media/tour.gif (TODO/docs-019)`).toContain('docs/media/tour.gif')
  }
})
