// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDocument } from '../core/document.js'
import { parseProject, serializeProject } from '../core/project.js'
import { createStepLimitApproval } from '../ai/stepLimitApproval.js'
import { setAiLimitDependencies, useAiLimitStore } from './aiLimit.js'
import { useDocumentStore } from './document.js'

/** @returns {import('../ai/stepLimitApproval.js').ApprovalStorage & { data: Map<string, string> }} */
function memoryStorage() {
  const data = new Map()
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) }
}

/** @param {number} limit */
function fileStating(limit) {
  const source = createDocument()
  source.append({ id: 'base', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 10], center: [0, 0, 5] } }, { origin: 'local' })
  source.setAiRecordsPerTurn(limit, { origin: 'local' })
  return parseProject(serializeProject(source))
}

describe('the AI step limit store (TODO/ai-033)', () => {
  /** @type {ReturnType<typeof memoryStorage>} */
  let storage
  beforeEach(() => {
    setActivePinia(createPinia())
    storage = memoryStorage()
    setAiLimitDependencies({ approval: createStepLimitApproval({ storage }) })
  })

  it('reads 1,000 for a new project, and the limits the transports get carry it', () => {
    const limit = useAiLimitStore()
    expect(limit.effective).toBe(1000)
    expect(limit.label).toBe('1,000')
    expect(limit.limits().recordsPerTurn).toBe(1000)
    expect(limit.limits().recordsPerCall).toBe(50)
  })

  it('save: a whole number in range is set on the project and approved in this browser', () => {
    const limit = useAiLimitStore()
    limit.open()
    expect(limit.save('3000')).toBe(true)
    expect(useDocumentStore().aiRecordsPerTurn).toBe(3000)
    expect(limit.effective).toBe(3000)
    expect(limit.isOpen).toBe(false)
    expect(storage.data.get('warpcad:ai-step-limit-approved')).toBe('3000')
  })

  it('save: accepts thousands separators and spaces as typed', () => {
    const limit = useAiLimitStore()
    expect(limit.save(' 2,000 ')).toBe(true)
    expect(limit.effective).toBe(2000)
  })

  it('save: out of range or not whole keeps the sheet open with the range, and saves nothing', () => {
    const limit = useAiLimitStore()
    limit.open()
    for (const text of ['', '0', '49', '5001', '1.5', 'abc', '-100', '1e3']) {
      expect(limit.save(text)).toBe(false)
      expect(limit.error).toBe('Enter a whole number of steps from 50 to 5,000.')
      expect(limit.isOpen).toBe(true)
    }
    expect(useDocumentStore().aiRecordsPerTurn).toBe(1000)
  })

  it('a loaded file above what this browser approved runs at the approved value until Use N', () => {
    const documentStore = useDocumentStore()
    const parsed = fileStating(3000)
    documentStore.load(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
    const limit = useAiLimitStore()
    expect(documentStore.aiRecordsPerTurn).toBe(3000)
    expect(limit.effective).toBe(1000)
    expect(limit.untrusted).toBe(true)
    limit.approve()
    expect(limit.effective).toBe(3000)
    expect(limit.untrusted).toBe(false)
  })

  it('a loaded file below the default applies at once', () => {
    const documentStore = useDocumentStore()
    const parsed = fileStating(200)
    documentStore.load(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
    const limit = useAiLimitStore()
    expect(limit.effective).toBe(200)
    expect(limit.untrusted).toBe(false)
  })

  it('a stop notice records the limit it stopped at, and saving a new limit clears it', () => {
    const limit = useAiLimitStore()
    limit.noteStop(1000)
    expect(limit.stoppedAt).toBe(1000)
    limit.openFromNotice()
    expect(limit.isOpen).toBe(true)
    limit.save('2000')
    expect(limit.stoppedAt).toBe(null)
  })
})
