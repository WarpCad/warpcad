---
title: Base form fields, with one unit-aware NumberField in place of two number-entry patterns
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112]
status: open
---

> **Decided 2026-11-10** (`ui-111`, decision 1): base components live in the existing folders. These
> go in `src/components/controls/`.

## Problem

**Two different number fields.** The app enters dimensions in two incompatible ways:

- **Pattern A, tolerant text**: `<input type="text" inputmode="decimal">` committed on blur or Enter
  through `parseNumeric` (`src/composables/numericEntry.js`), which accepts `"12.5 mm"`, `"45°"` and
  a comma decimal, and restores the old value on anything else. Used in 11 components:
  `inspector/Inspector.vue`, `ParamFields.vue`, `SketchBodyFields.vue`, `VariableAddForm.vue`,
  `VariableRow.vue`; `sketch/SketchProfileFields.vue`, `ReferenceImagePanel.vue`, `ScaleTool.vue`,
  `SlicePanel.vue`, `CurveSheet.vue`, `ExtrudePanel.vue`. Each hand-writes the same focus, blur,
  Enter and invalid handling around it (`ParamFields.vue:430-442` is the fullest copy).
- **Pattern B, native number**: `<input type="number">`, 18 of them bound with `v-model.number`.
  30 inputs in 6 components:
  `features/SplitSheet.vue` (12), `viewport/OperationsToolbar.vue` (11, the fillet, resize and mirror
  popovers), `storage/ProjectSettingsDialog.vue` (3), `timeline/TimelineRow.vue` (2),
  `viewport/AlignPopover.vue` (1), `viewport/SketchToolbar.vue` (1).

The difference a user meets: in the Inspector, typing `12,5` or `12.5 mm` works; in the Fillet
popover or the Split sheet the browser rejects the same text, and `v-model.number` leaves an empty
string in the bound ref while the field is mid-edit. So the same dimension typed the same way
behaves differently depending on which panel it is in. Whether a comma-decimal locale's keyboard
can type into the `type="number"` fields at all differs by browser; the E2E spec below settles it
per engine.

**Repeated field styling.** Identical rule bodies, found by comparing every `<style>` block:

- the field label (`display: flex; flex-direction: column; gap: 4px; font-size: 12px;
  color: var(--text-2)`), **ten copies**: `ai/KeySheet.vue`, `features/SplitSheet.vue`,
  `inspector/VariableAddForm.vue`, `layout/SaveToLibrarySheet.vue`, `layout/ShareSheet.vue`,
  `layout/UserPartMenu.vue`, `storage/ConnectDialog.vue`, `storage/GistConnectDialog.vue`,
  `storage/ProjectSettingsDialog.vue`, `storage/SaveAsGistDialog.vue`; and a smaller variant
  (11px, 3px gap) three times in `viewport/AlignPopover.vue`, `GroupMergePopover.vue` and
  `OperationsToolbar.vue`;
- the text input (16px, `min-height: var(--tap)`, `--surface-0`), **seven copies**: `ai/KeySheet.vue`,
  `ai/ConnectClaudeCode.vue`, `features/SplitSheet.vue`, `layout/ShareSheet.vue`,
  `storage/ConnectDialog.vue`, `storage/GistConnectDialog.vue`, `storage/SaveAsGistDialog.vue`;
- twenty differently named `__input` rules in all;
- the visually hidden file input, three copies: `ai/Composer.vue`, `sketch/ReferenceImagePanel.vue`,
  `storage/FileMenu.vue`.

**Segmented choices** (`aria-pressed` groups, `radiogroup`, `tablist`) are hand-built in 17
components, among them `InspectorViewTabs.vue`, `TimelineToggle.vue`, `NavigationChrome.vue`,
`ExportPopover.vue`, `ResolutionPopover.vue`, `SplitSheet.vue`, `CurveSheet.vue`, `ExtrudePanel.vue`.

## Affected files

- `src/components/controls/FieldLabel.vue`, `TextInput.vue`, `NumberField.vue`, `SelectInput.vue`,
  `SegmentedToggle.vue`, `FileInput.vue` (new), each with a `.spec.js` and a story
- `src/composables/numericEntry.js` (stays the one parser; gains the display half)
- the components named above

## Proposed fix

1. `NumberField.vue`, the important one. Pattern A's behaviour for every numeric field:
   `type="text"`, `inputmode="decimal"`, props `modelValue` (a number), `unit` (`'mm' | 'deg' | ''`),
   `min`, `max`, `step`, `integer`, `invalid`, `readonly`. It displays the value with its unit,
   selects all on focus, commits **once** on blur or Enter through `parseNumeric`, restores on
   unparseable text, and emits `update:modelValue` with a finite number only. Arrow up and down step
   by `step` (Shift ×10), which replaces the one thing `type="number"` gave for free. The unit is in
   the prop name and the label, per `CLAUDE.md` ("a raw number never crosses a module edge without
   its space obvious").
2. `FieldLabel`, `TextInput`, `SelectInput`, `FileInput`: the repeated rules, once, from tokens.
   `TextInput` keeps 16px text, which is what stops iOS zooming on focus; say so in a comment so a
   restyle does not shrink it.
3. `SegmentedToggle.vue`: options in, value out; renders `role="radiogroup"` with roving tabindex.
4. Migrate Pattern B first (the user-visible defect): `SplitSheet`, the three `OperationsToolbar`
   popovers, `ProjectSettingsDialog`, `TimelineRow`, `AlignPopover`, `SketchToolbar`. Then Pattern
   A's 11 components, which is a markup swap with no behaviour change. Use `/refactor-ui`.
5. Where a Pattern B field relied on live updates (the Split sheet previews the cut as the offset
   changes), keep that with an explicit `live` prop that also emits while typing, valid values only.
   Check each of the 30 inputs for this before migrating it.

## Effort

M–L.

## Testing

- `NumberField.spec.js`, with explicit numeric cases: `"12.5"`, `"12,5"`, `"12.5 mm"`, `"45°"`,
  `"-"`, `""`, `"abc"`, `"1e3"`, `"Infinity"`; clamping at `min` and `max`; `integer` refuses a
  fraction; Enter and blur commit once each; Escape restores; arrow keys step. Values compared with
  `toBeCloseTo`.
- `e2e/number-entry.e2e.js` (new, navigates to `/`): place a cube, open Fillet, type `2,5`, press
  Enter, assert the fillet is 2.5 mm; type `3 mm`, assert 3; type `abc`, assert the field restores
  and no step is appended to History. The same three in the Split sheet's offset and in the
  Inspector's width, so the test states the fields now agree. Phone, tablet and laptop with a
  snapshot at each (the fields reflow in the phone sheets). All three engines: text entry and
  `inputmode` differ by engine, and the result goes through the kernel.
- Docs: `docs/selection-and-inspector.md` gets one sentence, "Any size field accepts a comma or a
  point, with or without `mm`", with the Fillet example. No new picture.
- Acceptance scenarios to re-drive: 2 (hardware property edit), 12 (edit a step mid-history), 21
  (variables bound to fields).
- Closed findings whose reproductions re-run: `ui-052` (the Parameters split that created
  `numericEntry.js`), `ui-059` (bound params show the variable's value), `ui-086` (Align popover).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
