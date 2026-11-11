---
title: One set of overlay behaviours — focus trap and restore, Escape, outside click, keyboard inset
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

## Problem

The app has about twenty dialogs, sheets and popovers (`role="dialog"` or `alertdialog` in 20
files). What each one does when it opens is written per component, and the copies disagree.

**Focus.** No component traps focus: a search for a Tab-key handler across all 124 `.vue` files
finds none, and nothing sets `inert` on the page behind. `ModalShell.vue:84` declares
`aria-modal="true"`, as do four hand-rolled dialogs, so a screen reader is told the rest of the page
is unavailable while Tab walks straight out of the dialog into the toolbar behind the backdrop.
About 24 components call `.focus()` on open, each in its own way. None restores focus to the control
that opened it in a shared way.

**Escape.** Three mechanisms:

- `useEscapeToClose` (`src/composables/useEscapeToClose.js`), used by 8 components: `ChatPanel`,
  `ConnectClaudeCode`, `KeySheet`, `SubscriptionRoute`, `LibraryRail`, `ShareSheet`,
  `SharedAboutPopup`, `OperationsToolbar`.
- Their own `window` or `document` `keydown` listener, in 16 components, among them `SplitSheet`,
  `DependentRepairDialog`, `VariableUsageDialog`, `HelpSheet`, `SaveToLibrarySheet`, `UserPartMenu`,
  `ConflictDialog`, `DiskChangeDialog`, `FileMenu`.
- An inline `key === 'Escape'` check in `AiHeaderEntry`, `NameField`, `FileMenu` and `Viewport`.

With two overlays open (a popover and the Help sheet over it), which one closes on Escape depends
on listener registration order.

**Outside click.** Four hand-written capture listeners: `RepeatSheet.vue:57`,
`OperationsToolbar.vue:1683`, `LibraryRail.vue:214`, `AiHeaderEntry.vue:74`. The other overlays use
a backdrop element, with eleven separate `*__backdrop` rules.

**On-screen keyboard.** `ModalShell.vue:44-70` and `ChatPanel.vue:158-165` each measure
`visualViewport` with the same three lines and lift themselves above the keyboard. No other
bottom-anchored surface does: `SaveToLibrarySheet`, `ShareSheet`, `SplitSheet` (eleven number
fields), `RepeatSheet`, `UserPartMenu` and the phone Inspector sheet all hold fields. iOS Safari and
WKWebView do not resize the layout viewport for the keyboard, so a field in those sheets can sit
behind it. That last part is a hypothesis until driven on iOS (see Testing).

## Affected files

- `src/composables/useEscapeToClose.js` (grows into the stack below)
- `src/components/storage/ModalShell.vue:44-70, 78-90`
- `src/components/ai/ChatPanel.vue:158-165`
- The 16 components with their own `keydown` listener and the 4 with their own outside-click
  listener, listed above
- `src/composables/useOverlayStack.js`, `useFocusTrap.js`, `useOutsideClick.js`,
  `useKeyboardInset.js` (new), each with a `.spec.js`

## Proposed fix

Behaviour only. No markup or styling changes: `ui-116` builds the base Dialog, Sheet and Popover on
top of these.

1. `useOverlayStack`: a module-level stack of open overlays. Escape closes the top one only.
   Replaces `useEscapeToClose` (keep the export as a thin wrapper until `ui-116` lands).
2. `useFocusTrap(rootRef, isOpen)`: on open, remember `document.activeElement` and focus the first
   focusable element or the one marked `data-autofocus`; keep Tab and Shift+Tab inside; on close,
   restore focus. Used only by overlays that declare `aria-modal`. A popover that is not modal must
   not trap.
3. `useOutsideClick(rootRef, isOpen, close, { ignore })`: one capture-phase `pointerdown` listener,
   attached only while open.
4. `useKeyboardInset(isActive)`: the `visualViewport` measure, returning a ref in CSS pixels. Named
   with its unit per `CLAUDE.md` (`keyboardInsetPx`).
5. Migrate the listed components one family at a time (modal dialogs, then sheets, then popovers).
   Where a component's difference is deliberate, keep it and say why in the commit. Known
   deliberate ones: the History strip's Escape leaves preview only when nothing else is open; the
   sketch Line chain's Escape finishes the chain (`Viewport.vue:3644`) and must stay ahead of the
   stack.

## Effort

M (a few hours for the composables; the migration is mechanical).

## Testing

- Unit: a `.spec.js` per composable. Stack order with two and three overlays; trap wraps at both
  ends and skips disabled and hidden elements; focus restored to the opener, and to `<body>` when
  the opener is gone; outside click ignores the opener; keyboard inset is 0 without
  `visualViewport`.
- E2E, at `/`: add `e2e/overlay-focus.e2e.js`. It opens the Key sheet, presses Tab ten times and asserts focus never leaves the dialog; opens a popover and the
  Help sheet together and asserts one Escape closes only Help; asserts focus returns to the opener.
  Phone, tablet and laptop projects with a snapshot at each. No WebGL involved: Chromium only.
- **Hypothesis to confirm on a device** (keyboard covering fields in bottom sheets): on an iPhone in
  Safari, and in the iOS simulator's WKWebView, open Split, Save to library and the phone Inspector,
  focus the lowest field, and check it stays visible. `testing-027` already drives iOS keyboard
  rows. Add these three to its list.
- Acceptance scenarios to re-drive: 7 (touch navigation, with a sheet open), 10 (save through the
  File menu), 24 (Assistant sheet).
- Closed findings whose reproductions re-run: `ai-004` (Escape closes the Key sheet), `ui-070`
  (Inspector tab over the Library sheet), `ui-087` (popovers hide the targets).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
