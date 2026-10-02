// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether a keystroke landed in something that edits text itself — the one guard
 * every window-level shortcut shares (Ctrl/Cmd+Z in `HistoryControls.vue`, Delete and
 * Backspace in `useDeleteShortcut.js`, `TODO/ui-051`).
 *
 * The Inspector is full of numeric fields. A global Ctrl+Z that ate the browser's own
 * field-level undo would make typing a dimension worse to fix than to get wrong, and a
 * global Backspace that deleted the selected body would destroy it while the user was
 * only correcting a digit. One definition, so the two shortcuts cannot disagree about
 * what counts as a text field.
 *
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function isTextEntry(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
