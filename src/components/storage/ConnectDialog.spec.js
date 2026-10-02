// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { HostedError } from '../../storage/hostedBackend.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { setHostedDependencies, useHostedStore } from '../../stores/hosted.js'
import { setPersistenceDependencies } from '../../stores/persistence.js'
import ConnectDialog from './ConnectDialog.vue'

/**
 * `TODO/ui-033` — the Connect dialog is the one place a credential is typed. The rules this
 * pins are the task's carried-forward flag 3: the token is entered once, is never shown back,
 * never lands in Pinia state, and a failure is the store's own typed, non-echoing message.
 */

const TOKEN = 'github_pat_UNIT_SENTINEL_not_a_real_token'
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

describe('ConnectDialog', () => {
  let client
  let stored

  beforeEach(() => {
    setActivePinia(createPinia())
    stored = new Map()
    client = {
      apiOrigin: 'https://api.github.com',
      async read() {
        if (client.fail) throw client.fail
        return { exists: false, sha: null, text: null }
      },
      async write() {
        return { sha: 'sha-1' }
      },
      fail: null,
    }
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files: {
        capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
        async save() { return { ok: true, mode: 'fallback', name: 'a.ndjson' } },
        async open() { return { ok: false, cancelled: true } },
        adopt() {},
        forgetHandle() {},
      },
    })
    setHostedDependencies({
      client,
      credentials: {
        async read() { return null },
        async write(key, record) { stored.set(key, record) },
        async clear(key) { stored.delete(key) },
        close() {},
      },
    })
  })

  async function open() {
    const wrapper = mount(ConnectDialog, { attachTo: document.body })
    useFileMenuStore().openConnect()
    await nextTick()
    return wrapper
  }

  async function fill({ token = TOKEN, repo = 'octo/parts', path } = {}) {
    const tokenInput = q('hosted-token')
    tokenInput.value = token
    tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    const repoInput = q('hosted-repo')
    repoInput.value = repo
    repoInput.dispatchEvent(new Event('input', { bubbles: true }))
    if (path !== undefined) {
      const pathInput = q('hosted-path')
      pathInput.value = path
      pathInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await nextTick()
  }

  it('the token field is a password field that resists autofill, autocorrect and capitalisation', async () => {
    await open()
    const token = q('hosted-token')
    expect(token.getAttribute('type')).toBe('password')
    expect(token.getAttribute('autocomplete')).toBe('off')
    expect(token.getAttribute('autocapitalize')).toBe('none')
    expect(token.getAttribute('autocorrect')).toBe('off')
    expect(token.getAttribute('spellcheck')).toBe('false')
    expect(q('hosted-path').value).toBe('warpcad-project.ndjson')
  })

  it('Connect is disabled until there is a token and a repository', async () => {
    await open()
    expect(q('hosted-connect-submit').disabled).toBe(true)
    await fill({ token: TOKEN, repo: '' })
    expect(q('hosted-connect-submit').disabled).toBe(true)
    await fill()
    expect(q('hosted-connect-submit').disabled).toBe(false)
  })

  it('a rejected token keeps the form open with the store\'s own reason and stores nothing', async () => {
    await open()
    client.fail = new HostedError('unauthorized', 'GitHub rejected this token')
    await fill()
    q('hosted-connect-submit').click()
    await vi.waitFor(() => expect(q('hosted-connect-error')?.textContent).toContain('GitHub rejected this token'))
    expect(q('hosted-connect-dialog')).not.toBeNull()
    expect(stored.size).toBe(0)
    expect(useHostedStore().connected).toBe(false)
    // The failure message never echoes what was typed.
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  it('a malformed repository is refused before any request, naming the field', async () => {
    await open()
    let reads = 0
    client.read = async () => {
      reads += 1
      return { exists: false, sha: null, text: null }
    }
    await fill({ repo: 'not-a-repo-name' })
    q('hosted-connect-submit').click()
    await vi.waitFor(() => expect(q('hosted-connect-error')).not.toBeNull())
    expect(reads).toBe(0)
  })

  it('success shows "Token saved in this browser", and the token is never shown, stored in state, or left in the DOM', async () => {
    await open()
    await fill()
    q('hosted-connect-submit').click()
    await vi.waitFor(() => expect(q('hosted-connect-saved')).not.toBeNull())
    expect(q('hosted-connect-saved').textContent).toContain('Token saved in this browser')
    expect(q('hosted-connect-saved').textContent).toContain('octo/parts')
    expect(q('hosted-token')).toBeNull() // the field is gone, not merely emptied
    expect(document.body.innerHTML).not.toContain(TOKEN)
    // Not in `$state`, nor in any getter a devtools panel could serialise.
    const hosted = useHostedStore()
    const readable = `${JSON.stringify(hosted.$state)}|${Object.keys(hosted).map((k) => { try { return JSON.stringify(hosted[k]) } catch { return '' } }).join('|')}`
    expect(readable).not.toContain(TOKEN)
    // It went to the credential boundary once, and nowhere else.
    expect([...stored.values()]).toHaveLength(1)
  })

  it('Replace token returns to the form with the token empty and the repository kept', async () => {
    await open()
    await fill()
    q('hosted-connect-submit').click()
    await vi.waitFor(() => expect(q('hosted-connect-saved')).not.toBeNull())
    q('hosted-connect-replace').click()
    await nextTick()
    expect(q('hosted-token').value).toBe('')
    expect(q('hosted-repo').value).toBe('octo/parts')
  })

  it('Cancel closes without connecting and discards what was typed', async () => {
    await open()
    await fill()
    q('hosted-connect-cancel').click()
    await nextTick()
    expect(q('hosted-connect-dialog')).toBeNull()
    expect(useHostedStore().connected).toBe(false)
    expect(document.body.innerHTML).not.toContain(TOKEN)
    // Reopening starts blank.
    useFileMenuStore().openConnect()
    await nextTick()
    expect(q('hosted-token').value).toBe('')
  })
})
