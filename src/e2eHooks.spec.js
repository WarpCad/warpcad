// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { loadE2eModule } from './e2eHooks.js'

describe('loadE2eModule (TODO/build-015)', () => {
  it('resolves a /src path to the module the app itself imports', async () => {
    const viaHook = await loadE2eModule('/src/core/naming.js')
    const direct = await import('./core/naming.js')
    expect(viaHook).toBe(direct)
  })

  it('rejects a path outside the globbed folders, naming the file to extend', async () => {
    await expect(loadE2eModule('/src/views/AppView.vue')).rejects.toThrow(/src\/e2eHooks\.js/)
  })
})
