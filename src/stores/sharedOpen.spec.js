// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useFileMenuStore } from './fileMenu.js'
import { useSharedOpenStore } from './sharedOpen.js'

/** `TODO/ui-109`: the Shared view and the gist link reach the File menu's open flow without importing it. */
describe('sharedOpen hand-off', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const request = () => ({ name: 'Bracket', copyText: 'x', theirText: 'y', projectId: null, leave: () => {} })

  it('holds a request until the File menu store exists, then the menu takes it', () => {
    const sharedOpen = useSharedOpenStore()
    sharedOpen.ask(request())
    expect(sharedOpen.request).not.toBeNull()
    useFileMenuStore()
    expect(sharedOpen.request).toBeNull()
  })

  it('hands a request made while the File menu store exists straight to its open flow', () => {
    useFileMenuStore()
    const sharedOpen = useSharedOpenStore()
    sharedOpen.ask(request())
    expect(sharedOpen.request).toBeNull()
  })
})
