import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useTimelineCommands } from '../composables/useTimelineCommands.js'
import { useDocumentStore } from './document.js'
import { useObjectListStore } from './objectList.js'
import { useSelectionStore } from './selection.js'
import { useSketchEditorStore } from './sketchEditor.js'
import { useTimelineStore } from './timeline.js'

/**
 * The Objects list's state (`TODO/ui-041`).
 *
 * The properties this file pins are the ones that make the list an honest *selection
 * route* and not a second, parallel one: it selects through the ordinary selection store
 * (so the count gate every operation reads is fed by it unchanged), it never touches the
 * History panel's row selection (`data-002` §13), and it can never select a body the
 * scene does not contain.
 */
describe('object list store (TODO/ui-041, moved into the Inspector by ui-049)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A 40 mm shell, a bolt standing entirely inside it, and an unrelated sphere. */
  function seedEnclosed() {
    const doc = useDocumentStore()
    doc.append({
      id: 'shell',
      op: 'primitive.cuboid',
      name: 'Shell 1',
      params: { size: [40, 40, 40], center: [0, 0, 20] },
    })
    doc.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    doc.append({
      id: 'bolt-1t',
      op: 'transform.translate',
      name: 'Bolt 1',
      target: 'bolt-1',
      consumes: ['bolt-1'],
      params: { vector: [0, 0, 8] },
    })
    doc.append({ id: 'sphere', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [80, 0, 10] } })
    return doc
  }

  it('has no open/close state of its own any more — it is not a panel (ui-049)', () => {
    const objects = useObjectListStore()
    expect('open' in objects).toBe(false)
    expect('setOpen' in objects).toBe(false)
    expect('toggle' in objects).toBe(false)
  })

  it('the Inspector section: collapsed by default at 1 selected, expanded at 2+, each remembered', () => {
    const objects = useObjectListStore()
    expect(objects.isSectionOpen(1)).toBe(false)
    expect(objects.isSectionOpen(2)).toBe(true)
    expect(objects.isSectionOpen(5)).toBe(true)
    objects.toggleSection(1)
    expect(objects.isSectionOpen(1)).toBe(true)
    expect(objects.isSectionOpen(2)).toBe(true)
    objects.toggleSection(3)
    expect(objects.isSectionOpen(2)).toBe(false)
    expect(objects.isSectionOpen(1)).toBe(true)
    objects.setSectionOpen(1, false)
    expect(objects.isSectionOpen(1)).toBe(false)
  })

  it('a check keeps the list open for the next operand; a plain row tap hands the focus to the body (ui-049)', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    // "The list must not vanish on the first tap": ticking a check at 0 selected is building
    // a multi-selection, so the section it lands in at 1 selected stays open.
    objects.choose('shell', true)
    expect(objects.isSectionOpen(1)).toBe(true)
    // A plain tap names one body: its detail is the focus, the list folds away.
    objects.choose('bolt-1t')
    expect(objects.isSectionOpen(1)).toBe(false)
    objects.choosePart('bolt-1t', 'tap', true)
    expect(objects.isSectionOpen(1)).toBe(true)
    objects.choosePart('bolt-1t', 'tap')
    expect(objects.isSectionOpen(1)).toBe(false)
  })

  it('the check\'s "stay open" lasts only for the check sequence: a viewport selection falls back to the preference', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell', true)
    expect(objects.isSectionOpen(1)).toBe(true)
    // A later selection made anywhere else (a viewport click) is about a body's detail.
    selection.select('sphere')
    expect(objects.isSectionOpen(1)).toBe(false)
    // An explicit header choice is the remembered preference, and survives other routes.
    objects.setSectionOpen(1, true)
    selection.select('shell')
    expect(objects.isSectionOpen(1)).toBe(true)
  })

  it('a refused choose leaves the section state alone', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    objects.setSectionOpen(1, true)
    expect(objects.choose('nope')).toBe(false)
    expect(objects.isSectionOpen(1)).toBe(true)
  })

  it('lists one row per body, named and sized, with nothing selected', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1', 'Sphere 1'])
    expect(objects.rows[0].size).toBe('40 × 40 × 40 mm')
    expect(objects.rows.every((row) => !row.selected && row.order === 0 && row.role === 'none')).toBe(true)
  })

  it('updates live as bodies are added, undone and redone — nothing calls refresh', () => {
    const doc = seedEnclosed()
    const objects = useObjectListStore()
    expect(objects.rows).toHaveLength(3)
    doc.append({ id: 'cone', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 20, height: 30 } })
    expect(objects.rows).toHaveLength(4)
    doc.undo()
    expect(objects.rows).toHaveLength(3)
    doc.redo()
    expect(objects.rows.map((row) => row.name)).toContain('Cone 1')
  })

  it('selects the body a row names — a fully enclosed one, which no click can reach', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    expect(objects.choose('bolt-1t')).toBe(true)
    // The ordinary selection contract: the same store a raycast click writes.
    expect(selection.ids).toEqual(['bolt-1t'])
    expect(selection.onlyId).toBe('bolt-1t')
    expect(objects.rows.find((row) => row.id === 'bolt-1t')).toMatchObject({ selected: true, order: 1, role: 'base' })
  })

  it('reaches "2 selected" purely from the list, in click order — base first', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    objects.choose('bolt-1t', true)
    // This is the count every operation's gate reads (`ui-014`).
    expect(selection.count).toBe(2)
    expect(selection.ids).toEqual(['shell', 'bolt-1t'])
    expect(objects.rows.map((row) => row.role)).toEqual(['base', 'secondary', 'none'])
    expect(objects.rows.map((row) => row.order)).toEqual([1, 2, 0])
  })

  it('an additive choose on a selected row takes it back out', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    objects.choose('sphere', true)
    objects.choose('sphere', true)
    expect(selection.ids).toEqual(['shell'])
  })

  it('a plain choose replaces the selection, and drops a pick depth: a row names a body', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    selection.select('bolt-1t')
    selection.drillInto('tap')
    expect(selection.subPart).toEqual({ bodyId: 'bolt-1t', partName: 'tap' })
    objects.choose('bolt-1t')
    expect(selection.subPart).toBeNull()
    objects.choose('shell')
    expect(selection.ids).toEqual(['shell'])
  })

  it('an additive choose leaves a pick depth alone — ui-040 sub-part operands still compose', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    // ui-040's own dance: bolt drilled, shift it out, add the shell, add the bolt back.
    selection.select('bolt-1t')
    selection.drillInto('tap')
    objects.choose('bolt-1t', true)
    objects.choose('shell', true)
    objects.choose('bolt-1t', true)
    expect(selection.ids).toEqual(['shell', 'bolt-1t'])
    expect(selection.subPart).toEqual({ bodyId: 'bolt-1t', partName: 'tap' })
  })

  it('ignores an id the scene does not contain, rather than selecting a ghost', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    expect(objects.choose('nope')).toBe(false)
    expect(objects.choose('nope', true)).toBe(false)
    expect(selection.ids).toEqual([])
  })

  it('a History row selection and a body selection never trigger each other (§13)', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    const timeline = useTimelineStore()

    // Choosing a body does not select a row...
    objects.choose('shell')
    expect(timeline.selectedId).toBe('')

    // ...and selecting the *last* row (not a preview) does not select a body.
    selection.clear()
    timeline.selectRow('sphere')
    expect(selection.ids).toEqual([])
    expect(timeline.selectedId).toBe('sphere')
    // Choosing a body afterwards leaves the row selection alone.
    objects.choose('bolt-1t')
    expect(timeline.selectedId).toBe('sphere')
  })

  it('omits a body whose step is rolled back, and a body whose step is suppressed', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const commands = useTimelineCommands()
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1', 'Sphere 1'])

    commands.setSuppressed('sphere', true)
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1', 'Bolt 1'])
    expect(objects.choose('sphere')).toBe(false)
    commands.setSuppressed('sphere', false)
    expect(objects.rows).toHaveLength(3)

    // Roll back to just after the shell: the bolt's two steps and the sphere are inactive.
    commands.rollBackTo('shell')
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1'])
    expect(objects.choose('bolt-1t')).toBe(false)
  })

  it('disables itself, with a printed reason, while History previews a past state', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    const timeline = useTimelineStore()
    expect(objects.disabledReason).toBe('')

    // Preview step 1 (just the shell). The list must show the *previewed* scene.
    timeline.selectRow('shell')
    expect(timeline.previewing).toBe(true)
    expect(objects.disabledReason).toMatch(/Previewing history/)
    expect(objects.rows.map((row) => row.name)).toEqual(['Shell 1'])

    // A body that exists only in the live document is not selectable from a preview...
    expect(objects.choose('sphere')).toBe(false)
    // ...and neither is one that is in it: the viewport is read-only.
    expect(objects.choose('shell')).toBe(false)
    expect(selection.ids).toEqual([])

    timeline.endPreview()
    expect(objects.disabledReason).toBe('')
    expect(objects.rows).toHaveLength(3)
  })

  it('disables itself while a sketch is being edited: a solid is not selectable there, by any route', () => {
    seedEnclosed()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    useSketchEditorStore().active = true
    expect(objects.disabledReason).toMatch(/Editing a sketch/)
    expect(objects.choose('shell')).toBe(false)
    expect(selection.ids).toEqual([])
    useSketchEditorStore().active = false
    expect(objects.choose('shell')).toBe(true)
  })
})


/**
 * Expandable part rows (`TODO/ui-042`).
 *
 * The Objects list selects whole bodies (`ui-041`), which is enough to pick an enclosed
 * bolt but not one *piece* of an enclosed composite — a Pi's `ethernet` jack — because
 * drilling into a part was a second viewport click, and an enclosed body cannot be clicked
 * once. These specs pin the rows' tree, the expansion state, and — the part that is easy
 * to get wrong — the **operand order** that comes out of the two gestures.
 */
describe('object list store — part rows (TODO/ui-042)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * A 100 x 70 x 40 shell with a Raspberry Pi B+ standing entirely inside it (Pi bounds
   * x -2.5..87, y -2..56, z -1.5..17.16; shell x -8..92, y -8..62, z -10..30), plus a
   * bare sphere well clear of both.
   */
  function seedEnclosedPi() {
    const doc = useDocumentStore()
    doc.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
    doc.append({ id: 'ball', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [200, 0, 10] } })
    return doc
  }

  it('only a composite row is expandable; a bare solid has no parts to show', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const [shell, pi, ball] = objects.rows
    expect([shell.expandable, pi.expandable, ball.expandable]).toEqual([false, true, false])
    expect(shell.parts).toEqual([])
    expect(ball.parts).toEqual([])
    expect(pi.parts.map((part) => part.name)).toContain('ethernet')
  })

  it('lists the visible parts first, then the hidden ones, each flagged', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const pi = objects.rows[1]
    const firstHidden = pi.parts.findIndex((part) => part.hidden)
    expect(firstHidden).toBeGreaterThan(0)
    // Nothing visible after the first hidden one.
    expect(pi.parts.slice(firstHidden).every((part) => part.hidden)).toBe(true)
    expect(pi.parts.slice(0, firstHidden).every((part) => !part.hidden)).toBe(true)
    expect(pi.parts.find((part) => part.name === 'usb1-body')).toMatchObject({ hidden: true })
    expect(pi.parts.find((part) => part.name === 'ethernet')).toMatchObject({ hidden: false })
  })

  it('every row starts collapsed; toggling expands and collapses it, and the row reports it', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    expect(objects.rows[1].expanded).toBe(false)
    objects.toggleExpanded('pi')
    expect(objects.rows[1].expanded).toBe(true)
    expect(objects.isExpanded('pi')).toBe(true)
    objects.toggleExpanded('pi')
    expect(objects.rows[1].expanded).toBe(false)
  })

  it('refuses to expand a body with no parts — there is nothing to show', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    objects.toggleExpanded('shell')
    expect(objects.rows[0].expanded).toBe(false)
    expect(objects.isExpanded('shell')).toBe(false)
  })

  it('expansion is UI-only: it neither selects anything nor touches the document', () => {
    const doc = seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    const version = doc.version
    objects.toggleExpanded('pi')
    expect(selection.ids).toEqual([])
    expect(selection.subPart).toBeNull()
    expect(doc.version).toBe(version)
  })

  it('a body that leaves the scene forgets its expansion; a body renamed or moved keeps it', () => {
    const doc = seedEnclosedPi()
    const objects = useObjectListStore()
    objects.toggleExpanded('pi')

    // Moving the Pi supersedes its record but keeps its lineage-root id — still expanded.
    doc.append({ id: 'pi-move', op: 'transform.translate', target: 'pi', supersedes: 'pi', params: { vector: [1, 0, 0] } })
    const piRow = () => objects.rows.find((row) => row.id === 'pi')
    expect(piRow()?.expanded).toBe(true)

    // Undo the move: still expanded. Undo the sphere's creation and then the Pi's: gone,
    // and redoing it does NOT resurrect a stale expansion.
    doc.undo()
    expect(piRow()?.expanded).toBe(true)
    doc.undo() // sphere
    doc.undo() // pi
    expect(objects.rows.map((row) => row.id)).toEqual(['shell'])
    doc.redo() // pi
    expect(piRow()).toBeDefined()
    expect(piRow()?.expanded).toBe(false)
  })

  it('a rolled-back body drops out of the list, and comes back collapsed', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const commands = useTimelineCommands()
    objects.toggleExpanded('pi')
    commands.rollBackTo('shell')
    expect(objects.rows.map((row) => row.id)).toEqual(['shell'])
    commands.rollForward()
    const piRow = objects.rows.find((row) => row.id === 'pi')
    expect(piRow).toBeDefined()
    expect(piRow?.expanded).toBe(false)
  })

  it('choosePart (plain) selects the body and its part — the shell already selected is REPLACED, like a plain row tap', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    expect(objects.choosePart('pi', 'ethernet')).toBe(true)
    expect(selection.ids).toEqual(['pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(selection.count).toBe(1)
    const row = objects.rows[1]
    expect(row.selected).toBe(true)
    expect(row.drilledPart).toBe('ethernet')
    expect(row.parts.find((part) => part.name === 'ethernet')).toMatchObject({ selected: true })
    expect(row.parts.filter((part) => part.selected)).toHaveLength(1)
  })

  it('THE ORDER TRAP: shell first, then the Pi part\'s check — the shell is the boolean base, the part the operand', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell') // tap the shell's row
    objects.choosePart('pi', 'ethernet', true) // tap ethernet's check
    // ids[0] is Subtract's base (`ui-014`/`ui-040`): the shell. The Pi is subtracted from it.
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(selection.count).toBe(2)
    expect(objects.rows.map((row) => row.role)).toEqual(['base', 'secondary', 'none'])
    expect(objects.rows[1].parts.find((part) => part.name === 'ethernet')).toMatchObject({ selected: true, order: 2, role: 'secondary' })
  })

  it('the wrong order is expressible but visible: part first, shell second makes the Pi the base', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choosePart('pi', 'ethernet')
    objects.choose('shell', true)
    expect(selection.ids).toEqual(['pi', 'shell'])
    // The list says so on the rows: the Pi's check is 1 (base), the shell's 2.
    expect(objects.rows[1]).toMatchObject({ order: 1, role: 'base', drilledPart: 'ethernet' })
    expect(objects.rows[0]).toMatchObject({ order: 2, role: 'secondary' })
  })

  it('a second plain tap on the same part leaves it drilled — the list and a repeat viewport click agree', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choosePart('pi', 'ethernet')
    objects.choosePart('pi', 'ethernet')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })

  it('a plain tap on a sibling re-targets; the parent row\'s plain tap steps back up to the whole body', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choosePart('pi', 'ethernet')
    objects.choosePart('pi', 'hdmi')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hdmi' })
    expect(objects.rows[1].parts.filter((part) => part.selected).map((part) => part.name)).toEqual(['hdmi'])
    objects.choose('pi')
    expect(selection.subPart).toBeNull()
    expect(selection.ids).toEqual(['pi'])
    expect(objects.rows[1].drilledPart).toBeNull()
  })

  it('an additive tap on the addressed part un-addresses it; the body stays selected, in place', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choose('shell')
    objects.choosePart('pi', 'ethernet', true)
    objects.choosePart('pi', 'ethernet', true)
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toBeNull()
  })

  it('the parent row\'s check adds and removes the WHOLE body and leaves a depth alone (ui-040 dance)', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    objects.choosePart('pi', 'ethernet')
    objects.choose('pi', true) // check: out
    objects.choose('shell', true)
    objects.choose('pi', true) // check: back in, at the end
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })

  it('a depth left on a body that is no longer selected does not light up its child row', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    objects.choosePart('pi', 'ethernet')
    objects.choose('pi', true) // out of the selection, depth inert
    expect(objects.rows[1].selected).toBe(false)
    expect(objects.rows[1].drilledPart).toBeNull()
    expect(objects.rows[1].parts.some((part) => part.selected)).toBe(false)
  })

  it('refuses a part the body does not have, an unknown body, and a bare solid', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    expect(objects.choosePart('pi', 'no-such-part')).toBe(false)
    expect(objects.choosePart('nope', 'ethernet')).toBe(false)
    expect(objects.choosePart('shell', 'ethernet')).toBe(false)
    expect(selection.ids).toEqual([])
    expect(selection.subPart).toBeNull()
  })

  it('a hidden part can be addressed too — it is exactly what a boolean wants', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    expect(objects.choosePart('pi', 'usb1-body')).toBe(true)
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'usb1-body' })
  })

  it('part rows follow the same disabled rules as body rows; expanding is read-only and stays live', () => {
    seedEnclosedPi()
    const objects = useObjectListStore()
    const selection = useSelectionStore()
    useSketchEditorStore().active = true
    expect(objects.choosePart('pi', 'ethernet')).toBe(false)
    expect(selection.ids).toEqual([])
    // Reading the part names is not a selection, so it stays available.
    objects.toggleExpanded('pi')
    expect(objects.rows[1].expanded).toBe(true)
    useSketchEditorStore().active = false

    const timeline = useTimelineStore()
    timeline.selectRow('shell')
    expect(timeline.previewing).toBe(true)
    expect(objects.choosePart('pi', 'ethernet')).toBe(false)
    timeline.endPreview()
    expect(objects.choosePart('pi', 'ethernet')).toBe(true)
  })
})
