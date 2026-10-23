// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Operations toolbar's groups (`TODO/ui-082`): what the toolbar collapses into when the
 * viewport pane falls into the groups tier (`opsTier === 'groups'`, `stores/panelLayout.js`).
 *
 * **Hand-written, not derived from the operation registry.** CLAUDE.md's creation-vs-operation
 * rule exists because a menu built by iterating the registry offered every feature type as if they
 * were interchangeable; a group is a user-facing arrangement of the toolbar's own buttons, so it is
 * stated here once as data. Members are the toolbar's own member keys (each button's label,
 * lower-cased), never registry ops. To library is in no group: it is one button, and a group of one
 * would add a tap for nothing.
 *
 * {@link groupStates} is the one place a launcher's state is worked out from its members' gates,
 * which the toolbar computes exactly as it does for the flat row — this never re-derives a gate.
 *
 * @module core/operationGroups
 */

/**
 * @typedef {object} OperationGroup
 * @property {string} id Stable id, used in test ids and the `openPopout` slot (`ops-group:<id>`).
 * @property {string} label The group's name, read in the launcher's title and the pop-out heading.
 * @property {string} glyph The launcher's icon.
 * @property {ReadonlyArray<string>} members Member keys, lead member first: the lead's reason is the
 *   disabled launcher's title, so the lead is the member whose precondition best stands for the group.
 */

/**
 * @typedef {object} MemberState
 * @property {boolean} enabled Whether the member can run with the current selection.
 * @property {string} reason The member's own title: its reason when disabled, its hint otherwise.
 */

/**
 * @typedef {object} GroupState
 * @property {string} id
 * @property {string} label
 * @property {string} glyph
 * @property {Array<MemberState & { key: string }>} members In the group's order.
 * @property {number} enabledCount How many members can run: the launcher's count badge.
 * @property {boolean} disabled True when no member can run.
 * @property {string} reason The launcher's title: the lead member's reason when disabled, else how
 *   many of its members are available.
 */

/** @type {ReadonlyArray<OperationGroup>} */
export const OPERATION_GROUPS = Object.freeze([
  Object.freeze({ id: 'combine', label: 'Combine', glyph: '∪', members: Object.freeze(['union', 'subtract', 'intersect', 'group']) }),
  Object.freeze({ id: 'arrange', label: 'Arrange', glyph: '⇔', members: Object.freeze(['align', 'repeat', 'mirror']) }),
  Object.freeze({
    id: 'shape',
    label: 'Shape',
    glyph: '◠',
    members: Object.freeze(['fillet', 'chamfer', 'enlarge', 'fit', 'bisect', 'split']),
  }),
])

/**
 * Each group's launcher state from its members' current gates. Pure: no store, no DOM.
 *
 * @param {ReadonlyArray<OperationGroup>} groups
 * @param {Readonly<Record<string, MemberState>>} members Every member key the groups name.
 * @returns {GroupState[]}
 * @throws {Error} When a group names a member with no state, so a renamed button cannot silently
 *   leave a member permanently disabled.
 */
export function groupStates(groups, members) {
  return groups.map((group) => {
    const states = group.members.map((key) => {
      const state = members[key]
      if (!state) throw new Error(`operation group "${group.id}" has no state for member "${key}"`)
      return { key, enabled: state.enabled, reason: state.reason }
    })
    const enabledCount = states.filter((state) => state.enabled).length
    const disabled = enabledCount === 0
    return {
      id: group.id,
      label: group.label,
      glyph: group.glyph,
      members: states,
      enabledCount,
      disabled,
      reason: disabled ? (states[0]?.reason ?? '') : `${group.label} — ${enabledCount} of ${states.length} available`,
    }
  })
}
