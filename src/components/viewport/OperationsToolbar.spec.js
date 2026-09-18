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

/**
 * Angled Bisect (`TODO/ui-036`) — `core-021` shipped `modify.bisect`'s
 * `angleDeg`/`rotateAxis`/`rotateOffsetMm` params at the kernel level with no
 * control that could reach them; this task adds the three fields to the
 * existing Bisect popover (`ui-028`). No prior `OperationsToolbar.spec.js`
 * coverage exists for Bisect at all (only `e2e/resize-bisect-operation.e2e.js`
 * exercises it) — these two cases are the unit-level regression guard the
 * TODO's own Testing section asks for: the new fields thread through to the
 * right param names, and — the one this task calls out explicitly as a
 * regression risk — a falsy Angle must produce a record identical in *shape*
 * to the pre-existing straight-only commit, not silently grow an `angleDeg: 0`
 * key onto every ordinary Bisect from now on.
 */
describe('OperationsToolbar — angled Bisect (TODO/ui-036)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let documentStore
  /** @type {ReturnType<typeof useSelectionStore>} */
  let selection

  beforeEach(() => {
    setActivePinia(createPinia())
    documentStore = useDocumentStore()
    selection = useSelectionStore()
  })

  /** @param {string} [id] */
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

  /** @returns {DOMWrapper<HTMLElement>} */
  function body() {
    return new DOMWrapper(document.body)
  }

  it('a falsy Angle commits a record shaped exactly like the pre-existing straight-only Bisect (no angleDeg/rotateAxis/rotateOffsetMm keys at all)', async () => {
    placeCube('cube-1')
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')

    await wrapper.get('[data-testid="operation-bisect"]').trigger('click')
    // Angle field defaults to 0 (falsy) on open — left untouched here.
    await body().get('[data-testid="resize-bisect-offset"]').setValue(3)
    await body().get('[data-testid="resize-commit"]').trigger('click')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const [record] = appendSpy.mock.calls[0]
    expect(record.op).toBe('modify.bisect')
    // The regression guard this task's own Testing section names: identical
    // shape to the pre-ui-036 commit, not just "angleDeg happens to be 0".
    expect(record.params).toEqual({ axis: 'x', offsetMm: 3 })
    expect(record.params).not.toHaveProperty('angleDeg')
    expect(record.params).not.toHaveProperty('rotateAxis')
    expect(record.params).not.toHaveProperty('rotateOffsetMm')
  })

  it('a real Angle and Rotate-axis commit into params.angleDeg/rotateAxis, with Rotate-offset omitted when left at its own (unset) default', async () => {
    placeCube('cube-1')
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')

    await wrapper.get('[data-testid="operation-bisect"]').trigger('click')
    await body().get('[data-testid="resize-bisect-axis"]').setValue('x')
    await body().get('[data-testid="resize-bisect-offset"]').setValue(0)
    await body().get('[data-testid="resize-bisect-angle"]').setValue(30)
    // Rotate-axis dropdown for cut axis 'x' defaults to the kernel's own
    // per-axis table ('y') — confirm the default rather than re-picking it,
    // proving the dropdown really does default itself rather than starting
    // blank/invalid.
    expect(
      /** @type {HTMLSelectElement} */ (
        body().get('[data-testid="resize-bisect-rotate-axis"]').element
      ).value,
    ).toBe('y')
    // Rotate-offset left untouched — per this task's own "no default,
    // mirrors the straight offset field's own convention" rule, an unset
    // Rotate-offset must not silently become a `0` in the record.
    await body().get('[data-testid="resize-commit"]').trigger('click')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const [record] = appendSpy.mock.calls[0]
    expect(record.params?.axis).toBe('x')
    expect(record.params?.offsetMm).toBe(0)
    expect(record.params?.angleDeg).toBe(30)
    expect(record.params?.rotateAxis).toBe('y')
    // Omitted, not defaulted to 0/null — the kernel's own doc comment defaults
    // an omitted rotateOffsetMm to the third axis's centre, not to zero.
    expect(record.params).not.toHaveProperty('rotateOffsetMm')
  })

  it('a typed Rotate-offset commits into params.rotateOffsetMm, including a literal 0 (which is not the same as leaving it blank)', async () => {
    placeCube('cube-1')
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')

    await wrapper.get('[data-testid="operation-bisect"]').trigger('click')
    await body().get('[data-testid="resize-bisect-offset"]').setValue(5)
    await body().get('[data-testid="resize-bisect-angle"]').setValue(-15)
    await body().get('[data-testid="resize-bisect-rotate-axis"]').setValue('z')
    await body().get('[data-testid="resize-bisect-rotate-offset"]').setValue(0)
    await body().get('[data-testid="resize-commit"]').trigger('click')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const [record] = appendSpy.mock.calls[0]
    expect(record.params).toEqual({
      axis: 'x',
      offsetMm: 5,
      angleDeg: -15,
      rotateAxis: 'z',
      rotateOffsetMm: 0,
    })
  })

  it('the Rotate-axis dropdown only offers the two axes perpendicular to the cut axis, re-defaulting when the cut axis changes', async () => {
    placeCube('cube-1')
    selection.select('cube-1')
    const wrapper = mount(OperationsToolbar)

    await wrapper.get('[data-testid="operation-bisect"]').trigger('click')
    const rotateAxisSelect = body().get('[data-testid="resize-bisect-rotate-axis"]')
    const selectEl = /** @type {HTMLSelectElement} */ (rotateAxisSelect.element)
    const optionsFor = () =>
      rotateAxisSelect
        .findAll('option')
        .map((option) => /** @type {HTMLOptionElement} */ (option.element).value)

    // Cut axis 'x' (the popover's own default on open) -> perpendicular pair
    // is y/z, defaulting to the kernel's own table entry for x ('y').
    expect(optionsFor().sort()).toEqual(['y', 'z'])
    expect(selectEl.value).toBe('y')

    // Switching the cut axis to 'z' changes the perpendicular pair to x/y and
    // re-defaults Rotate-axis to the kernel's own table entry for z ('x') —
    // not left stranded on the old axis's default.
    await body().get('[data-testid="resize-bisect-axis"]').setValue('z')
    expect(optionsFor().sort()).toEqual(['x', 'y'])
    expect(selectEl.value).toBe('x')
  })
})

/**
 * Sub-part-addressed operands for Snap/Align (`TODO/ui-035`).
 *
 * `core-013` registered `group.snap`/`group.align` as `rawOperands` entries that
 * accept a `{ id, pieces }` operand, and `index.js`'s fold honours it — but
 * `ui-026`'s popover only ever built whole-object operands out of
 * `selection.ids`, so the capability was reachable from the command layer and
 * not by hand (`core-016`'s own retirement note and its `TODO/VERIFY.md` row).
 *
 * The record's *operand* shape is the thing this task changes, and it is not
 * visible anywhere in the DOM — `e2e/snap-align-operation.e2e.js` can only see
 * the arithmetic the shape produces. So the shape itself is asserted here,
 * against `documentStore.append`, exactly as `ui-027`'s own record-shape case
 * above does; the e2e file proves the same change from the other side, by the
 * millimetres the app actually moves a body.
 *
 * The **asymmetric** case (one operand drilled in, the other whole) is the
 * design call this task's own Proposed fix flagged as having no precedent on
 * this toolbar, so both directions get their own case rather than one standing
 * in for the other.
 */
describe('OperationsToolbar — sub-part-addressed Snap/Align operands (TODO/ui-035)', () => {
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
   * @param {string} id
   * @param {string} name
   * @param {[number, number, number]} center
   */
  function placeCuboid(id, name, center) {
    documentStore.append(
      { id, op: 'primitive.cuboid', name, params: { size: [10, 10, 10], center } },
      { origin: 'local' },
    )
  }

  /**
   * Two cuboids combined into one Group whose parts are named "Cube 1"/"Cube 2"
   * — `ui-015`'s own shipped record shape, and the fixture `ui-016`'s pick-depth
   * tests already drill into — plus a separate cuboid to act as the second
   * operand. The two group members sit far apart on X so the group's own centre
   * (x=50) is nowhere near either member's (x=0 and x=100): that gap is what
   * makes "did the commit address the sub-part or the whole group?" a question
   * arithmetic can answer.
   *
   * @returns {void}
   */
  function placeGroupAndCuboid() {
    placeCuboid('cube-1', 'Cube 1', [0, 0, 5])
    placeCuboid('cube-2', 'Cube 2', [100, 0, 5])
    documentStore.append(
      {
        id: 'group-1',
        op: 'group.assemble',
        name: 'Group 1',
        target: 'cube-1',
        operands: ['cube-2'],
        consumes: ['cube-1', 'cube-2'],
        params: { names: ['Cube 1', 'Cube 2'] },
      },
      { origin: 'local' },
    )
    placeCuboid('cyl-1', 'Cylinder 1', [0, 200, 5])
  }

  /** @returns {DOMWrapper<HTMLElement>} */
  function body() {
    return new DOMWrapper(document.body)
  }

  /**
   * One body summary, or a loud failure — the summaries are what carries the
   * measured centre this file's arithmetic case compares against, so a silent
   * `undefined` there would read as a geometry bug rather than a missing body.
   *
   * @param {string} id Lineage-root id.
   * @returns {import('../../stores/document.js').BodySummary}
   */
  function bodyById(id) {
    const found = documentStore.bodies.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no body "${id}" in the document`)
    return found
  }

  /**
   * Open Align, check one axis, commit.
   *
   * @param {import('@vue/test-utils').VueWrapper} wrapper
   * @param {'x' | 'y' | 'z'} axis
   */
  async function commitAlign(wrapper, axis = 'x') {
    await wrapper.get('[data-testid="operation-align"]').trigger('click')
    await body().get(`[data-testid="snap-align-axis-${axis}"]`).setValue(true)
    await body().get('[data-testid="snap-align-commit"]').trigger('click')
  }

  it('a drilled-in moving operand commits as { id, pieces }, while the whole-body reference stays a bare id', async () => {
    placeGroupAndCuboid()
    // The reachable hand path, verbatim: click the group (whole), click a member
    // mesh (drill in), Shift-click the second body.
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cyl-1')
    expect(selection.ids).toEqual(['group-1', 'cyl-1'])
    expect(selection.subPart).toEqual({ bodyId: 'group-1', partName: 'Cube 1' })

    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')
    await commitAlign(wrapper, 'x')

    expect(appendSpy).toHaveBeenCalledTimes(1)
    const [record] = appendSpy.mock.calls[0]
    expect(record.op).toBe('group.align')
    // The whole point of the task: the moving operand names the part.
    expect(record.target).toEqual({ id: 'group-1', pieces: 'Cube 1' })
    // Asymmetric on purpose (this task's own Proposed fix): the reference was
    // never drilled into, so it addresses the whole body, not a mirrored part.
    expect(record.operands).toEqual(['cyl-1'])
    // `supersedes` is a *record id*, never an operand reference — a `{ id, pieces }`
    // here would break `document.js`'s lineage bookkeeping outright.
    expect(record.supersedes).toBe('group-1')
  })

  it('a drilled-in reference operand commits as { id, pieces } too, with the moving operand left whole', async () => {
    placeGroupAndCuboid()
    // Reachable without reaching past the store's API: a drilled-in body that is
    // Shift-clicked off and back on lands at the *end* of the selection, which
    // makes it the reference rather than the moving operand. `toggle` is the one
    // selection path that deliberately does not prune the pick depth.
    selection.select('group-1')
    selection.drillInto('Cube 2')
    selection.toggle('cyl-1')
    selection.toggle('group-1')
    selection.toggle('group-1')
    expect(selection.ids).toEqual(['cyl-1', 'group-1'])
    expect(selection.subPart).toEqual({ bodyId: 'group-1', partName: 'Cube 2' })

    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')
    await commitAlign(wrapper, 'x')

    const [record] = appendSpy.mock.calls[0]
    expect(record.target).toBe('cyl-1')
    expect(record.operands).toEqual([{ id: 'group-1', pieces: 'Cube 2' }])
    expect(record.supersedes).toBe('cyl-1')
  })

  it('addresses the sub-part on the operand’s *terminal* id, not its lineage root', async () => {
    placeGroupAndCuboid()
    // Move the group first, so its terminal id is no longer its root id — the
    // trap this file's own module doc calls out for whole-object operands, and
    // one a `{ id, pieces }` operand can fall into exactly the same way.
    documentStore.append(
      {
        id: 'group-1-moved',
        op: 'transform.translate',
        target: 'group-1',
        supersedes: 'group-1',
        params: { vector: [0, 0, 30], rotation: [0, 0, 0] },
      },
      { origin: 'local' },
    )
    expect(documentStore.raw.currentIdOf('group-1')).toBe('group-1-moved')

    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cyl-1')

    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')
    await commitAlign(wrapper, 'x')

    const [record] = appendSpy.mock.calls[0]
    expect(record.target).toEqual({ id: 'group-1-moved', pieces: 'Cube 1' })
    expect(record.supersedes).toBe('group-1-moved')
  })

  it('leaves ui-026’s whole-object operands exactly as they were when nothing is drilled in', async () => {
    placeGroupAndCuboid()
    selection.select('group-1')
    selection.toggle('cyl-1')
    expect(selection.subPart).toBeNull()

    const wrapper = mount(OperationsToolbar)
    const appendSpy = vi.spyOn(documentStore, 'append')
    await commitAlign(wrapper, 'x')

    const [record] = appendSpy.mock.calls[0]
    // Bare ids, not `{ id, pieces: undefined }` — the shape `ui-026` shipped.
    expect(record.target).toBe('group-1')
    expect(record.operands).toEqual(['cyl-1'])
  })

  it('names both operands in the popover, with the drilled-in one shown by part', async () => {
    placeGroupAndCuboid()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cyl-1')

    const wrapper = mount(OperationsToolbar)
    await wrapper.get('[data-testid="operation-snap"]').trigger('click')

    // The new feedback this task's Interaction model asks for: a sub-part-
    // addressed snap looks identical on screen to a whole-object one, so the
    // depth being addressed has to be legible *before* the commit.
    const operands = body().get('[data-testid="snap-align-operands"]')
    expect(operands.attributes('data-subpart')).toBe('true')
    expect(body().get('[data-testid="snap-align-operand-moving"]').text()).toBe('Group 1 › Cube 1')
    expect(body().get('[data-testid="snap-align-operand-reference"]').text()).toBe('Cylinder 1')
    // And the stale disclaimer `core-016` filed a finding against is gone.
    expect(operands.text()).not.toContain("isn't available yet")
  })

  it('shows plain body names, and no sub-part marker, when neither operand is drilled in', async () => {
    placeGroupAndCuboid()
    selection.select('group-1')
    selection.toggle('cyl-1')

    const wrapper = mount(OperationsToolbar)
    await wrapper.get('[data-testid="operation-align"]').trigger('click')

    const operands = body().get('[data-testid="snap-align-operands"]')
    expect(operands.attributes('data-subpart')).toBe('false')
    expect(body().get('[data-testid="snap-align-operand-moving"]').text()).toBe('Group 1')
    expect(body().get('[data-testid="snap-align-operand-reference"]').text()).toBe('Cylinder 1')
  })

  it('a sub-part the kernel rejects surfaces in the popover instead of throwing past the click', async () => {
    placeGroupAndCuboid()
    selection.select('group-1')
    // A part name that is not in the group — reachable when a pick depth
    // outlives the group it named (a re-group, a replaced body). Before this
    // task no Snap/Align commit could produce an operand the kernel rejects at
    // all, so this error path is new ground for this pair of buttons.
    selection.drillInto('No Such Part')
    selection.toggle('cyl-1')

    const wrapper = mount(OperationsToolbar)
    await commitAlign(wrapper, 'x')

    const error = body().get('[data-testid="snap-align-error"]')
    expect(error.text().length).toBeGreaterThan(0)
    // Popover stays open, nothing committed, both bodies untouched.
    expect(body().find('[data-testid="snap-align-popover"]').exists()).toBe(true)
    expect(documentStore.bodies).toHaveLength(2)
  })

  it('moves the whole group by the sub-part’s own arithmetic, not the group’s bounding box', async () => {
    placeGroupAndCuboid()
    const groupBefore = bodyById('group-1')
    const reference = bodyById('cyl-1')
    // The group spans x=-5..105, so its centre is x=50 while "Cube 1"'s own is
    // x=0 — a 50 mm gap between the two possible answers.
    expect(groupBefore.center[0]).toBeCloseTo(50, 6)

    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cyl-1')

    const wrapper = mount(OperationsToolbar)
    await commitAlign(wrapper, 'x')

    const groupAfter = bodyById('group-1')
    // `calcCenterWith` against **Cube 1**'s centre (x=0), not the group's (x=50):
    // the whole group slides by `reference.x - 0`, so its own centre lands 50 mm
    // past the reference rather than on it. Whole-object addressing would have
    // put the group's centre exactly on the reference instead.
    const delta = reference.center[0] - 0
    expect(groupAfter.center[0]).toBeCloseTo(50 + delta, 6)
    // Still a group, with both parts — `group.snap`/`group.align` return the
    // moved group, not a flattened solid (`core-013`'s own §2).
    expect(documentStore.bodies).toHaveLength(2)
  })
})
