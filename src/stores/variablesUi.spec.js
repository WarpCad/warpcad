// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useVariablesUiStore } from './variablesUi.js'

/**
 * The sheet's view on a selection change (`TODO/ui-059`, `TODO/ui-092` part 3): a new selection
 * means "show me that", so the Variables view yields to the Inspector — but the Prompts view stays,
 * so a part can be selected in the 3D view while its request's row is read. Tapping a part row in
 * the Prompts view is the one selection that returns to the Inspector, and it does so explicitly.
 */
describe('variablesUi.followSelection (TODO/ui-092)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('the Variables view yields to the Inspector', () => {
    const ui = useVariablesUiStore()
    ui.view = 'variables'
    ui.followSelection()
    expect(ui.view).toBe('inspector')
  })

  it('the Prompts view stays open', () => {
    const ui = useVariablesUiStore()
    ui.view = 'prompts'
    ui.followSelection()
    expect(ui.view).toBe('prompts')
  })

  it('the Inspector stays the Inspector', () => {
    const ui = useVariablesUiStore()
    ui.followSelection()
    expect(ui.view).toBe('inspector')
  })
})
