// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO/build-016 Part 5: the local backstop for the CLA. The PR check (`.github/workflows/cla.yml`)
// never sees a collaborator's direct push or the owner merging by hand, so the pre-push hook calls
// this. It reads the refs git gives a pre-push hook on stdin, lists the commits each push would
// add, and refuses one whose author is neither the owner, an allow-listed bot, nor a signer in
// `.github/cla-signatures.json`. It runs only `git log`: no network, no checkout of anything.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The owner's commit identity (GitHub noreply form). Matched case-insensitively, exactly. */
export const OWNER_EMAILS = ['230922+johnwebbcole@users.noreply.github.com']

/**
 * Bots that change lockfiles and workflow pins, not authored code (`.github/dependabot.yml`,
 * `.github/workflows/`). Anything else, including a collaborator with write access, signs.
 */
export const BOT_EMAILS = [
  '49699333+dependabot[bot]@users.noreply.github.com',
  '41898282+github-actions[bot]@users.noreply.github.com',
]

export const SIGNATURES_FILE = '.github/cla-signatures.json'
const ZERO_SHA = '0'.repeat(40)

/**
 * The signers listed in `.github/cla-signatures.json`, lower-cased. A missing or unreadable file
 * means owner-only, so this returns no emails rather than failing the push.
 * @param {string} [file] path relative to the working directory
 * @returns {Set<string>}
 */
export function readSigners(file = SIGNATURES_FILE) {
  if (!existsSync(file)) return new Set()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const list = Array.isArray(parsed.signatures) ? parsed.signatures : []
    return new Set(list.map((s) => String(s.email ?? '').toLowerCase()).filter(Boolean))
  } catch {
    return new Set()
  }
}

/**
 * The commits a push would add for one ref update, with each author's email.
 * A new branch (all-zero remote SHA) lists the commits not already on any remote-tracking ref.
 * @param {string} localSha
 * @param {string} remoteSha
 * @param {(args: string[]) => string} git runs git and returns its stdout
 * @returns {{ sha: string, email: string }[]}
 */
export function commitsToCheck(localSha, remoteSha, git) {
  const range =
    remoteSha === ZERO_SHA ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`]
  const out = git(['log', '--format=%H %ae', ...range])
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, email] = line.split(' ')
      return { sha, email }
    })
}

/**
 * Checks every commit a push would add.
 * @param {string} refsText the pre-push stdin: `<local ref> <local sha> <remote ref> <remote sha>` lines
 * @param {{ git: (args: string[]) => string, signers?: Set<string> }} deps the git boundary and signers
 * @returns {{ ok: boolean, problems: string[] }} problems name each unknown author and commit
 */
export function checkPush(refsText, { git, signers = new Set() }) {
  const allowed = new Set([...OWNER_EMAILS, ...BOT_EMAILS].map((e) => e.toLowerCase()))
  const problems = []
  for (const line of refsText.split('\n')) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/)
    if (!localSha || localSha === ZERO_SHA) continue // a branch or tag deletion adds no commits
    for (const { sha, email } of commitsToCheck(localSha, remoteSha ?? ZERO_SHA, git)) {
      const key = email.toLowerCase()
      if (allowed.has(key) || signers.has(key)) continue
      problems.push(`${sha.slice(0, 9)} is by ${email}, who has not signed the CLA (CLA.md)`)
    }
  }
  return { ok: problems.length === 0, problems }
}

// Run as the pre-push hook: `printf '%s\n' "$refs" | node scripts/check-contributors.mjs`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const refsText = readFileSync(0, 'utf8')
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' })
  const { ok, problems } = checkPush(refsText, { git, signers: readSigners() })
  if (!ok) {
    process.stderr.write(
      `push refused: ${problems.length} commit(s) by an author who has not signed the CLA:\n` +
        problems.map((p) => `  ${p}\n`).join('') +
        'Ask the author to sign (CLA.md, CONTRIBUTING.md step 2), or push with --no-verify if you are the owner.\n',
    )
    process.exit(1)
  }
}
