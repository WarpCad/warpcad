#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `npm run mcp:add -- <project-file>` (`TODO/ai-016`): register WarpCad's MCP server with Claude
 * Code, using paths this script works out rather than ones a person has to edit.
 *
 * The command it replaces — `claude mcp add warpcad -- node ~/src/WarpCad/mcp/server.js
 * ~/parts/bracket.ndjson` — only worked if the person correctly rewrote two paths a static page
 * cannot know. Pasted as shown it registered a server that exits at once, which Claude Code
 * reports as `CONNECTION_CLOSED`. This resolves `mcp/server.js` from its own location and the
 * project file against the folder `npm run` was invoked from, creates the file if it is missing
 * (the server would anyway on its first write; doing it here lets a typo'd folder fail now), and
 * says exactly what it registered.
 *
 * Registered at **user** scope: Claude Code's default scope is per-folder, and the docs promise
 * "start Claude Code in any folder".
 *
 * `npm run mcp:add -- --dev` (`TODO/ai-012`, Decision 11) registers the **live bridge** instead:
 * the HTTP form, pointing at the Vite dev server's `/mcp` (`mcp/liveBridge.js`), so Claude Code
 * edits the project open in a WarpCad tab under `npm run dev`. It takes no project file — live
 * mode never touches one — and it replaces a closed-file registration under the same name, as a
 * closed-file registration replaces it: one server, one mode, no silent fallback between them.
 *
 * `npm run mcp:add -- --preview` registers the same live bridge on the preview server (port 4173),
 * for a build made with `VITE_LIVE_BRIDGE=1` (Decision 11, amended 2026-11-06). Either live mode
 * replaces the other under the same name.
 *
 * @module scripts/mcp-add
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MCP_SERVER_NAME } from '../src/ai/mcpPrompts.js'
import { createDocument } from '../src/core/document.js'
import { serializeProject } from '../src/core/project.js'
import { ProjectFileError, loadProjectText } from '../mcp/projectFile.js'

const USAGE = 'usage: npm run mcp:add -- <project-file.ndjson>   or   npm run mcp:add -- --dev   or   npm run mcp:add -- --preview'
/** The Vite dev server's live-bridge endpoint (`vite.config.js`: port 5183, strict). */
const DEV_URL = 'http://127.0.0.1:5183/mcp'
/** The preview server's live endpoint (`vite.config.js`: port 4173, strict; `mcp/livePreview.js`). */
const PREVIEW_URL = 'http://127.0.0.1:4173/mcp'
const NAME = MCP_SERVER_NAME
const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.js')

/** @param {string} message @returns {never} */
function fail(message) {
  process.stderr.write(`mcp:add: ${message}\n`)
  process.exit(1)
}

/**
 * @param {string[]} args
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function claude(args) {
  const result = spawnSync('claude', args, { encoding: 'utf8' })
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
    fail(
      'the `claude` command was not found on your PATH. Install Claude Code (https://claude.com/claude-code), ' +
        'open a new terminal so it is on PATH, and run this again.'
    )
  }
  return result
}

/**
 * Drop any earlier registration under {@link NAME}, at either scope. Failure just means there was
 * nothing registered there.
 */
function removeExisting() {
  for (const scope of ['user', 'local']) claude(['mcp', 'remove', NAME, '--scope', scope])
}

/**
 * `--dev` and `--preview`: register the live bridge's HTTP endpoint.
 *
 * @param {string} url
 * @param {'dev' | 'preview'} mode
 */
function registerLive(url, mode) {
  if (!existsSync(resolve(dirname(SERVER), 'node_modules', '@modelcontextprotocol'))) {
    fail('the MCP server\'s dependencies are not installed. Run `npm run mcp:install` first (the dev server and the preview host load them too).')
  }
  removeExisting()
  const added = claude(['mcp', 'add', '--scope', 'user', '--transport', 'http', NAME, url])
  if (added.status !== 0) {
    fail(`\`claude mcp add\` failed${added.stderr ? `: ${added.stderr.trim()}` : ` (exit ${added.status})`}`)
  }
  process.stdout.write(
    [
      `Registered the "${NAME}" MCP server with Claude Code (user scope) in live mode:`,
      `  endpoint ${url}`,
      '',
      ...(mode === 'dev'
        ? ['Live mode on the dev host: run `npm run dev` in this folder and open WarpCad on the same', 'computer as your MCP client.']
        : ['Live mode on the preview host: run `VITE_LIVE_BRIDGE=1 npm run build` then `npm run preview` in this', 'folder, and open WarpCad on the same computer as your MCP client.']),
      'In WarpCad open Assistant → Live MCP access and enable a lease.',
      'Access is off by default; any local MCP client that reaches the loopback endpoint may call',
      'while the lease is enabled. Turn it off when you are done.',
      '',
      `To go back to editing a closed project file: npm run mcp:add -- <project-file.ndjson>`,
      '',
    ].join('\n')
  )
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--dev')) {
    if (args.length !== 1) {
      process.stderr.write(`mcp:add: --dev takes no project file: live mode edits the project open in WarpCad, never a file.\n${USAGE}\n`)
      process.exit(2)
    }
    registerLive(DEV_URL, 'dev')
    return
  }
  if (args.includes('--preview')) {
    if (args.length !== 1) {
      process.stderr.write(`mcp:add: --preview takes no project file: live mode edits the project open in WarpCad, never a file.\n${USAGE}\n`)
      process.exit(2)
    }
    registerLive(PREVIEW_URL, 'preview')
    return
  }
  if (args.length !== 1 || args[0].startsWith('-')) {
    process.stderr.write(`${USAGE}\n`)
    process.exit(args[0] === '--help' || args[0] === '-h' ? 0 : 2)
  }

  // `npm run` changes into the package root; INIT_CWD is where the person actually was.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), args[0])

  if (!existsSync(resolve(dirname(SERVER), 'node_modules', '@modelcontextprotocol'))) {
    fail('the MCP server\'s dependencies are not installed. Run `npm run mcp:install` first.')
  }

  const folder = dirname(file)
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    fail(`the folder ${folder} does not exist, so ${basename(file)} cannot be created there.`)
  }

  let created = false
  if (existsSync(file)) {
    if (!statSync(file).isFile()) fail(`${file} is not a file.`)
    try {
      loadProjectText(readFileSync(file, 'utf8'), basename(file))
    } catch (error) {
      fail(error instanceof ProjectFileError ? error.message : `${basename(file)} could not be read as a WarpCad project.`)
    }
  } else {
    try {
      writeFileSync(file, serializeProject(createDocument()), { flag: 'wx' })
      created = true
    } catch (error) {
      fail(`could not create ${file} (${/** @type {NodeJS.ErrnoException} */ (error).code ?? 'write failed'}).`)
    }
  }

  // A stale entry (the old placeholder, a previous file, or the live bridge) must not survive.
  removeExisting()

  const added = claude(['mcp', 'add', '--scope', 'user', NAME, '--', 'node', SERVER, file])
  if (added.status !== 0) {
    fail(`\`claude mcp add\` failed${added.stderr ? `: ${added.stderr.trim()}` : ` (exit ${added.status})`}`)
  }

  process.stdout.write(
    [
      `Registered the "${NAME}" MCP server with Claude Code (user scope):`,
      `  server  ${SERVER}`,
      `  project ${file}${created ? ' (created, empty)' : ''}`,
      '',
      'Start Claude Code in any folder and type /mcp: warpcad should say connected.',
      '',
    ].join('\n')
  )
}

main()
