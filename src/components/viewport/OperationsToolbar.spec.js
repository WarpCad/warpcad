// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils'

// The popover is `<Teleport to="body">`d (see the component's own CSS
// comment), so it is inserted into the *real* `document.body` regardless of
// whether the host component itself is attached to the document. Without an
// explicit unmount, a test that ends with a popover still open (the
// "commit button requires both fields" case below, deliberately, since it
// never clicks Commit or Cancel) would leave that teleported node behind for
// the next test's `document.body` query to collide with. `enableAutoUnmount`
// unmounts every wrapper after each test, which is what actually tears the
// teleported content down again.
enableAutoUnmount(afterEach)

import OperationsToolbar from './OperationsToolbar.vue'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

/**
 * Fillet and Chamfer (`TODO/ui-027`) — the toolbar's first **exactly-1**-gated
 * pair, alongside the existing 2+-gated (Union/Subtract/Intersect/Group) and
 * exactly-2-gated (`ui-026`'s Snap/Align) buttons. This is the first
 * `OperationsToolbar.spec.js` in the project — no prior component-level spec
 * to extend, per the TODO's own Step 2 note that this file might not exist yet.
 *
 * These three cases are exactly `TODO/ui-027`'s own Testing section's Vitest
 * bullet: gating at 0/1/2+, the popover's commit button requiring both fields,
 * and the appended record's shape (`supersedes`, no `operands`/`consumes`). A
 * fourth covers the Proposed fix's "first user-visible kernel-error display"
 * claim at the unit level, ahead of the e2e case that exercises the same thing
 * against a real WebGL render.
 */
describe('OperationsToolbar — Fillet/Chamfer (TODO/ui-027)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let documentStore
  /** @type {ReturnType<typeof useSelectionStore>} */
  let selection

  beforeEach(() => {
    setActivePinia(createPinia())
    documentStore = useDocumentStore()
    selection = useSelectionStore()
  })

  /**
   * A 10x10x10mm cube centred at (0,0,5) — extent along every axis is 10mm,
   * so a radius under 10 is valid and a radius of 10+ is exactly the
   * `assertRadiusFits`/`requireRadius` failure case `fillet.js` throws on.
   *
   * @param {string} [id]
   */
  function placeCube(id = 'cube-1') {
    documentStore.append(
      {
        id,
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      },
      { origin: 'local' },
    )
  }

  /**
   * The popover is rendered via `<Teleport to="body">` (see the component's
   * own CSS comment on why), so it lands outside the mounted component's own
   * subtree — `wrapper.get`/`wrapper.find` only search within that subtree,
   * not the whole document. Everything popover-related is looked up through
   * `document.body` directly instead, wrapped so it still has the same
   * `trigger`/`setValue`/`attributes`/`text` API a `VueWrapper` node has.
   *
   * @returns {DOMWrapper<HTMLElement>}
   */
  function body() {
    return new DOMWrapper(document.body)
  }

  it('Fillet/Chamfer stay disabled at 0 selected and at 2+ selected, enabled at exactly 1', async () => {
    placeCube('cube-1')
    placeCube('cube-2')
    const wrapper = mount(OperationsToolbar)

    const fillet = wrapper.get('[data-testid="operation-fillet"]')
    const chamfer = wrapper.get('[data-testid="operation-chamfer"]')

    // 0 selected.
    expect(fillet.attributes('disabled')).toBeDefined()
    expect(chamfer.attributes('disabled')).toBeDefined()

    // Exactly 1 selected — enabled, unlike the 2+-gated boolean buttons.
    selection.select('cube-1')
    await wrapper.vm.$nextTick()
    expect(fillet.attributes('disabled')).toBeUndefined()
    expect(chamfer.attributes('disabled')).toBeUndefined()

    // 2 selected — disabled again, the same divergence Snap/Align's own gate has.
    selection.toggle('cube-2')
    await wrapper.vm.$nextTick()
    expect(fillet.attributes('disabled')).toBeDefined()
    expect(chamfer.attributes('disabled')).toBeDefined()
  })

  it("the popover's own commit button stays disabled until both Face and Radius are filled", async () => {
    placeCube()
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)

    await wrapper.get('[data-testid="operation-fillet"]').trigger('click')
    const popover = body().get('[data-testid="fillet-chamfer-popover"]')
    expect(popover.attributes('data-op')).toBe('modify.filletRim')

    const commit = body().get('[data-testid="fillet-chamfer-commit"]')
    // Radius has no default (per the TODO's own Interaction model) — blank at open.
    expect(commit.attributes('disabled')).toBeDefined()

    await body().get('[data-testid="fillet-chamfer-face"]').setValue('z+')
    expect(commit.attributes('disabled')).toBeDefined() // face alone isn't enough

    await body().get('[data-testid="fillet-chamfer-radius"]').setValue(3)
    expect(commit.attributes('disabled')).toBeUndefined()
  })

  it('commit appends a record with `supersedes` set to the selected id, no `operands`/`consumes`, and reselects the same body', async () => {
    placeCube('cube-1')
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')

    await wrapper.get('[data-testid="operation-fillet"]').trigger('click')
    await body().get('[data-testid="fillet-chamfer-face"]').setValue('z+')
    await body().get('[data-testid="fillet-chamfer-radius"]').setValue(3)
    await body().get('[data-testid="fillet-chamfer-commit"]').trigger('click')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const [record, transaction] = appendSpy.mock.calls[0]
    expect(record.op).toBe('modify.filletRim')
    expect(record.target).toBe('cube-1')
    expect(record.supersedes).toBe('cube-1')
    expect(record.params).toEqual({ radius: 3, orientation: 'z+' })
    expect(record).not.toHaveProperty('operands')
    expect(record).not.toHaveProperty('consumes')
    expect(transaction).toEqual({ origin: 'local' })

    // supersedes, not consumes — still one body, and it stays selected (same
    // lineage-root id, per the module doc's Snap/Align precedent).
    expect(documentStore.bodies).toHaveLength(1)
    expect(selection.ids).toEqual(['cube-1'])
    expect(body().find('[data-testid="fillet-chamfer-popover"]').exists()).toBe(false)
  })

  it('a radius the kernel rejects (>= the solid\'s own extent) surfaces visibly in the popover, not only to the console', async () => {
    placeCube('cube-1') // 10mm extent on every axis
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)

    await wrapper.get('[data-testid="operation-fillet"]').trigger('click')
    await body().get('[data-testid="fillet-chamfer-face"]').setValue('z+')
    await body().get('[data-testid="fillet-chamfer-radius"]').setValue(20) // >= 10mm extent
    await body().get('[data-testid="fillet-chamfer-commit"]').trigger('click')

    const error = body().get('[data-testid="fillet-chamfer-error"]')
    expect(error.text().length).toBeGreaterThan(0)
    // The popover stays open on failure — nothing committed, nothing closed.
    expect(body().find('[data-testid="fillet-chamfer-popover"]').exists()).toBe(true)
    expect(documentStore.bodies).toHaveLength(1)
  })
})
