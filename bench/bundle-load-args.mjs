// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Command-line parsing for `bench/bundle-load.mjs`, split out so a unit spec can import it
 * (the bench itself runs `main()` on import). `TODO/perf-005` added `--url`.
 *
 * @module bench/bundle-load-args
 */

import { resolve } from 'node:path'

/**
 * @typedef {object} BundleLoadConfig
 * @property {number} runs recorded rounds per engine and profile
 * @property {number} warmup unrecorded rounds first
 * @property {string[]} engines
 * @property {string[]} profiles
 * @property {string | undefined} json path to write every sample to
 * @property {boolean} check `--check` mode (local builds only)
 * @property {{ name: string, dist: string }[]} builds local builds to serve; empty in `--url` mode
 * @property {string | null} url deployed origin to measure instead of a local build, with a trailing slash
 */

/**
 * Parses the bench's arguments.
 *
 * With `--url <origin>` the bench measures that one deployed build instead of serving local
 * `dist/` directories: no `--build`, no `--check` (both need files on disk), and Chromium only
 * (throttling is applied through the Chrome DevTools Protocol, which Firefox and WebKit lack).
 *
 * @param {string[]} args `process.argv.slice(2)`
 * @returns {BundleLoadConfig}
 * @throws {Error} on a malformed or conflicting combination
 */
export function parseArgs(args) {
  /** @param {string} flag @param {string} [fallback] */
  const option = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index === -1 ? fallback : args[index + 1]
  }
  /** @param {string} flag @returns {string[]} every value of a repeatable flag */
  const options = (flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []))

  const urlIndex = args.indexOf('--url')
  /** @type {string | null} */
  let url = null
  if (urlIndex !== -1) {
    const raw = args[urlIndex + 1]
    if (!raw || raw.startsWith('--')) throw new Error('--url needs an origin, e.g. --url https://app.warpcad.com/')
    /** @type {URL} */
    let parsed
    try {
      parsed = new URL(raw)
    } catch {
      throw new Error(`--url: ${raw} is not a valid URL`)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`--url must be http or https, got ${parsed.protocol}`)
    parsed.search = ''
    parsed.hash = ''
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/'
    url = parsed.href
    if (options('--build').length > 0) throw new Error('--url and --build cannot be combined: --url measures a deployed build, --build serves local ones')
    if (args.includes('--check')) throw new Error('--check needs a local build directory and cannot be combined with --url')
  }

  const engines = (option('--engines', url ? 'chromium' : 'chromium,firefox,webkit') ?? '').split(',')
  if (url && engines.some((engine) => engine !== 'chromium')) throw new Error('--url runs on Chromium only: network and CPU throttling go through the DevTools Protocol')

  const buildSpecs = options('--build')
  const builds = url
    ? []
    : (buildSpecs.length > 0 ? buildSpecs : ['baseline=dist']).map((spec) => {
        const [name, dir] = spec.split('=')
        return { name, dist: resolve(dir) }
      })

  return {
    runs: Number(option('--runs', '7')),
    warmup: Number(option('--warmup', '1')),
    engines,
    profiles: (option('--profiles', 'none,slow4g,slow4g-cpu4') ?? '').split(','),
    json: option('--json'),
    check: args.includes('--check'),
    builds,
    url,
  }
}
