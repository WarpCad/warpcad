// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO/build-016 Part 5: the CLA backstop in the pre-push hook. git is mocked at the boundary.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BOT_EMAILS, checkPush, commitsToCheck, OWNER_EMAILS, readSigners } from './check-contributors.mjs'

const OWNER = OWNER_EMAILS[0]
const LOCAL = 'a'.repeat(40)
const REMOTE = 'b'.repeat(40)
const ZERO = '0'.repeat(40)
const SIGNER = 'Someone.Else@Example.org'

/** A fake `git log` that answers with the given `<sha> <email>` lines and records its arguments. */
function fakeGit(lines = []) {
  const calls = []
  const git = (args) => {
    calls.push(args)
    return lines.map((l) => `${l}\n`).join('')
  }
  return { git, calls }
}

const push = (local, remote) => `refs/heads/main ${local} refs/heads/main ${remote}\n`

const dirs = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('checkPush', () => {
  it('passes a push of the owner’s own commits', () => {
    const { git } = fakeGit([`${'c'.repeat(40)} ${OWNER}`])
    expect(checkPush(push(LOCAL, REMOTE), { git })).toEqual({ ok: true, problems: [] })
  })

  it('passes an allow-listed bot commit', () => {
    const { git } = fakeGit([`${'c'.repeat(40)} ${BOT_EMAILS[0]}`])
    expect(checkPush(push(LOCAL, REMOTE), { git }).ok).toBe(true)
  })

  it('refuses an unknown author and names the commit and the email', () => {
    const sha = 'd'.repeat(40)
    const { git } = fakeGit([`${sha} stranger@example.com`])
    const result = checkPush(push(LOCAL, REMOTE), { git })
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual([
      `${sha.slice(0, 9)} is by stranger@example.com, who has not signed the CLA (CLA.md)`,
    ])
  })

  it('passes an author listed in the signatures file', () => {
    const { git } = fakeGit([`${'c'.repeat(40)} ${SIGNER.toLowerCase()}`])
    const signers = new Set([SIGNER.toLowerCase()])
    expect(checkPush(push(LOCAL, REMOTE), { git, signers }).ok).toBe(true)
  })

  it('matches the owner’s address case-insensitively', () => {
    const { git } = fakeGit([`${'c'.repeat(40)} ${OWNER.toUpperCase()}`])
    expect(checkPush(push(LOCAL, REMOTE), { git }).ok).toBe(true)
  })

  it('refuses the owner’s +tag form of the address: that is a different string, decided not to match', () => {
    const tagged = OWNER.replace('+johnwebbcole', '+johnwebbcole+work')
    const { git } = fakeGit([`${'c'.repeat(40)} ${tagged}`])
    expect(checkPush(push(LOCAL, REMOTE), { git }).ok).toBe(false)
  })

  it('treats an empty push (no ref lines) as passing without calling git', () => {
    const { git, calls } = fakeGit()
    expect(checkPush('', { git })).toEqual({ ok: true, problems: [] })
    expect(calls).toHaveLength(0)
  })

  it('skips a branch deletion, whose local SHA is all zeros', () => {
    const { git, calls } = fakeGit()
    expect(checkPush(push(ZERO, REMOTE), { git }).ok).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('checks only the commits not on any remote for a new branch (all-zero remote SHA)', () => {
    const { git, calls } = fakeGit([`${'c'.repeat(40)} ${OWNER}`])
    checkPush(push(LOCAL, ZERO), { git })
    expect(calls[0]).toEqual(['log', '--format=%H %ae', LOCAL, '--not', '--remotes'])
  })

  it('checks the remote..local range for an update to an existing branch', () => {
    const { git, calls } = fakeGit()
    checkPush(push(LOCAL, REMOTE), { git })
    expect(calls[0]).toEqual(['log', '--format=%H %ae', `${REMOTE}..${LOCAL}`])
  })
})

describe('commitsToCheck', () => {
  it('parses one sha and one author email per line', () => {
    const { git } = fakeGit(['1'.repeat(40) + ' x@example.com', '2'.repeat(40) + ' y@example.com'])
    expect(commitsToCheck(LOCAL, REMOTE, git)).toEqual([
      { sha: '1'.repeat(40), email: 'x@example.com' },
      { sha: '2'.repeat(40), email: 'y@example.com' },
    ])
  })
})

describe('readSigners', () => {
  function signaturesFile(content) {
    const dir = mkdtempSync(join(tmpdir(), 'cla-'))
    dirs.push(dir)
    const file = join(dir, 'cla-signatures.json')
    writeFileSync(file, content)
    return file
  }

  it('reads the signer emails, lower-cased', () => {
    const file = signaturesFile(JSON.stringify({ signatures: [{ name: 'S', email: SIGNER }] }))
    expect([...readSigners(file)]).toEqual([SIGNER.toLowerCase()])
  })

  it('treats a missing file as owner-only (no signers)', () => {
    expect(readSigners(join(tmpdir(), 'no-such-cla-file.json')).size).toBe(0)
  })

  it('treats an unreadable file as owner-only rather than failing the push', () => {
    expect(readSigners(signaturesFile('{ not json')).size).toBe(0)
  })
})
