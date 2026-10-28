// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { GistError } from '../storage/gistBackend.js'
import {
  BROADER_THAN_NEEDED_MESSAGE,
  GIST_BUSY_MESSAGE,
  GIST_MESSAGE_CONTEXTS,
  GIST_MESSAGE_KINDS,
  MAX_GIST_DESCRIPTION_CHARS,
  gistFailureOf,
  gistMessage,
  plainGistDescription,
} from './gistMessages.js'

/**
 * `TODO/io-017` Stage 2 — what the person reads when a gist call fails. The wording is fixed
 * here, one sentence per failure kind and situation, and **never** carries server text, a token
 * or an id: `gistBackend.js`'s own messages are developer-facing and not shown.
 */

const FAKE_TOKEN = 'ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE'

describe('gistMessage', () => {
  it('a rate-limited read says GitHub is busy, in exactly the agreed words', () => {
    expect(gistMessage('rate-limited', 'open')).toBe('GitHub is busy. Try again in a few minutes.')
    expect(GIST_BUSY_MESSAGE).toBe('GitHub is busy. Try again in a few minutes.')
  })

  it.each(['not-found', 'empty', 'no-project-file', 'ambiguous'])(
    'a %s gist opened from a link is a plain "can\'t be found" message',
    (kind) => {
      expect(gistMessage(/** @type {any} */ (kind), 'open')).toMatch(/^This shared project can't be found\./)
    },
  )

  it('a project in the gist that does not load is "can\'t be opened", never a half-parsed project', () => {
    expect(gistMessage('unreadable', 'open')).toMatch(/^This shared project can't be opened\./)
    expect(gistMessage('malformed', 'open')).toMatch(/can't be opened/)
  })

  it('a link that is not a gist id says the link looks incomplete', () => {
    expect(gistMessage('invalid-link', 'open')).toMatch(/link looks incomplete/)
  })

  it('a rejected or expired token says so, and how to fix it', () => {
    for (const context of /** @type {const} */ (['connect', 'publish', 'update', 'stop'])) {
      const text = gistMessage('unauthorized', context)
      expect(text).toMatch(/rejected/)
      expect(text).toMatch(/expired/)
    }
  })

  it('a token without the Gists permission names the permission', () => {
    expect(gistMessage('forbidden', 'connect')).toMatch(/Gists/)
    expect(gistMessage('forbidden', 'publish')).toMatch(/Gists/)
  })

  it('no network and server trouble say the project is still safe in this browser when sending', () => {
    expect(gistMessage('offline', 'open')).toMatch(/^No network\./)
    expect(gistMessage('offline', 'publish')).toMatch(/still saved in this browser/)
    expect(gistMessage('server', 'update')).toMatch(/still saved in this browser/)
  })

  it('too large, and an untrusted host, each have their own sentence', () => {
    expect(gistMessage('too-large', 'open')).toMatch(/too large/)
    expect(gistMessage('too-large', 'publish')).toMatch(/too large/)
    expect(gistMessage('untrusted-host', 'open')).toMatch(/somewhere WarpCad does not read from/)
  })

  it('the interim update rule: refuse when the gist changed, and say to open it first', () => {
    expect(gistMessage('changed-remotely', 'update')).toBe(
      'This gist changed since you last published it. Open its link first, then update.',
    )
  })

  it('the classic-token warning is exactly the agreed sentence', () => {
    expect(BROADER_THAN_NEEDED_MESSAGE).toBe('This token can do more than WarpCad needs. Make a new one with only the gist box ticked.')
  })

  it('has a fixed, non-empty sentence for every kind in every situation, with nothing to fill in', () => {
    for (const kind of GIST_MESSAGE_KINDS) {
      for (const context of GIST_MESSAGE_CONTEXTS) {
        const text = gistMessage(kind, context)
        expect(text.length).toBeGreaterThan(0)
        expect(text).toMatch(/[.!?]$/)
        expect(text).not.toMatch(/\$\{|undefined|null|\[object/)
      }
    }
  })

  it('never interpolates: a hostile kind or context gets the generic sentence, not its own text', () => {
    for (const hostile of [FAKE_TOKEN, '<img src=x onerror=alert(1)>', 'constructor', '__proto__', 'toString']) {
      const text = gistMessage(/** @type {any} */ (hostile), /** @type {any} */ (hostile))
      expect(text).not.toContain(hostile)
      expect(text).toMatch(/[.!?]$/)
    }
  })
})

describe('gistFailureOf', () => {
  it('turns a GistError into its kind and the fixed wording', () => {
    const failure = gistFailureOf(new GistError('rate-limited', 'GitHub is limiting requests right now'), 'open')
    expect(failure).toEqual({ ok: false, kind: 'rate-limited', message: 'GitHub is busy. Try again in a few minutes.' })
  })

  it('anything else is "unknown", and neither its message nor a token reaches the result', () => {
    const failure = gistFailureOf(new Error(`401 for ${FAKE_TOKEN}: Bad credentials`), 'publish')
    expect(failure.ok).toBe(false)
    expect(failure.kind).toBe('unknown')
    expect(JSON.stringify(failure)).not.toContain(FAKE_TOKEN)
    expect(JSON.stringify(failure)).not.toContain('Bad credentials')
  })

  it('a GistError whose message quotes server text still shows only the fixed wording', () => {
    const failure = gistFailureOf(new GistError('server', `upstream said: ${FAKE_TOKEN}`), 'update')
    expect(failure.message).not.toContain(FAKE_TOKEN)
    expect(failure.message).toBe(gistMessage('server', 'update'))
  })
})

describe('plainGistDescription — the gist description, untrusted', () => {
  it('is a plain string: HTML and Markdown stay as literal text, never markup', () => {
    expect(plainGistDescription('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
    expect(plainGistDescription('**bold** [x](javascript:alert(1))')).toBe('**bold** [x](javascript:alert(1))')
    expect(typeof plainGistDescription('<b>x</b>')).toBe('string')
  })

  it('is one line: no controls, no bidi overrides, whitespace collapsed', () => {
    expect(plainGistDescription('Phone\nstand\r\n\tfor  Dad')).toBe('Phone stand for Dad')
    expect(plainGistDescription('abc\u202Edef\u2066')).toBe('abcdef')
    expect(plainGistDescription('\u0000\u0007 x \u009f')).toBe('x')
  })

  it('is length-capped in code points, never splitting an emoji', () => {
    const long = '📱'.repeat(MAX_GIST_DESCRIPTION_CHARS + 50)
    const capped = plainGistDescription(long)
    expect(Array.from(capped)).toHaveLength(MAX_GIST_DESCRIPTION_CHARS)
    expect(capped.endsWith('…')).toBe(true)
    expect(capped).not.toMatch(/[\uD800-\uDBFF]…$/)
  })

  it('is empty for anything that is not text', () => {
    expect(plainGistDescription(/** @type {any} */ (null))).toBe('')
    expect(plainGistDescription(/** @type {any} */ ({ toString: () => 'x' }))).toBe('')
    expect(plainGistDescription('   ')).toBe('')
  })
})
