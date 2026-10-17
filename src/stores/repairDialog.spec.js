// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRepairDialogStore } from './repairDialog.js'

/**
 * `TODO/core-061`: one repeat body can break at several members, each with its own fix, so the
 * dialog keys its choices by a breakage's `fixKeyOf` (`<record>#<member>`), not by the record id.
 * Keying by record id left Apply refused with "no fix chosen" for a repeat's broken member.
 */
describe('repairDialog store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is complete once every breakage has the fix it is keyed by, including a repeat member', () => {
    const dialog = useRepairDialogStore()
    const breakages = /** @type {any[]} */ ([
      { dependentRecordId: 'snap-1', dependentBodyId: 'a', relationship: 'Snap', missingPieces: ['x'], newParts: [], suggestions: {}, offered: ['leave'] },
      { dependentRecordId: 'rep-1', key: 'rep-1#hole4', member: 'hole4', dependentBodyId: 'rep-1', relationship: 'Repeat → hole4', missingPieces: ['hole4'], newParts: [], suggestions: {}, offered: ['leave'] },
    ])
    dialog.show({ edit: /** @type {any} */ ({ rootId: 'cam-1', record: null }), breakages })
    expect(Object.keys(dialog.fixes).sort()).toEqual(['rep-1#hole4', 'snap-1'])
    expect(dialog.complete).toBe(true)
    dialog.setFix('rep-1#hole4', { kind: 'removeTarget' })
    expect(dialog.fixes['rep-1#hole4']).toEqual({ kind: 'removeTarget' })
    expect(dialog.complete).toBe(true)
  })
})
