---
title: Base Button and IconButton, and move every hand-styled button onto them
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112]
status: open
---

> **Decided 2026-11-10** (`ui-111`, decision 1): base components live in the existing folders. These
> go in `src/components/controls/`.

> **Progress 2026-11-14 (stays open).** Landed: `BaseButton.vue` and `IconButton.vue` (with specs and stories, and
> `focus()` exposed for template refs), `HelpButton` and `EyeToggle` as thin `IconButton` wrappers, and the dialog
> family's eleven components moved onto `BaseButton` (`ai/ConnectClaudeCode`, `KeySheet`, `StarterCopy`,
> `StepLimitSheet`, `SubscriptionRoute`; `storage/ConnectDialog`, `GistConnectDialog`, `ProjectSettingsDialog`,
> `ReplaceConfirmDialog`, `SaveAsGistDialog`; `inspector/DependentRepairDialog`). `git log` gave no reason for 80 vs
> 96, so tap buttons are `min-width: 80px`. `testing-036`'s font allow-list is tightened for those files.
> **Remaining**: the rest of the dialog family (`storage/ConflictDialog`, `DiskChangeDialog`;
> `inspector/VariableUsageDialog`; `layout/SharedAboutPopup`, `UserPartMenu`, `SaveToLibrarySheet`, `ShareSheet`,
> `ShareGistGroup`; `features/SplitSheet` are 48 px / `--radius-md` / left-aligned variants that need props first),
> `DeleteButton`, and the strips and toasts, panels, toolbars and popovers, AI and "the rest" families above.
> Scenarios 1, 4, 7 (after the toolbar family) and 10, 24 (after the rest of the dialogs) still owe a re-drive.

## Problem

There are 352 `<button>` elements in 97 components and no shared button. **68 components define
their own button rule** in their `<style>` block. The copies are the same control:

- **Dialog button, five identical copies** (`min-width: 80px`): `ai/ConnectClaudeCode.vue`
  `.connect__button`, `ai/KeySheet.vue` `.key__button`, `ai/StarterCopy.vue` `.starter__button`,
  `ai/StepLimitSheet.vue` `.limit__button`, `ai/SubscriptionRoute.vue` `.route__button`.
- **The same again with `min-width: 96px`, five copies**: `storage/ConnectDialog.vue`,
  `storage/GistConnectDialog.vue`, `storage/ProjectSettingsDialog.vue`,
  `storage/ReplaceConfirmDialog.vue`, `storage/SaveAsGistDialog.vue`. The 16 px difference between
  the AI dialogs and the storage dialogs looks like drift, not design: nothing in either file says
  why.
- **Strip button, three identical copies**: `display/MergeBanner.vue`, `display/MergeToast.vue`,
  `display/RepeatToast.vue`.
- **Compact panel button, three identical copies** (`min-height: var(--tap-compact)`):
  `sketch/ExtrudePanel.vue`, `sketch/ReferenceImagePanel.vue`, `sketch/SlicePanel.vue`.
- **Variants are re-declared per file**: `--primary` 29 times, `--danger` 10, `--quiet` 5,
  `--active` 5, `--ghost` 1.
- **The focus ring** `outline: 2px solid var(--accent)` is written 43 times, and 12 rules set
  `outline: none`.

Icon buttons (a tap-sized square holding an inline SVG) are repeated the same way in the toolbars:
`viewport/NavigationChrome.vue`, `viewport/OperationsToolbar.vue`, `viewport/SketchToolbar.vue`,
`layout/HistoryControls.vue`, `layout/LibraryRail.vue`, `timeline/TimelineRow.vue`. Three purpose-built
ones already exist and are the model: `controls/HelpButton.vue`, `inspector/EyeToggle.vue`,
`inspector/DeleteButton.vue`.

The cost: restyling "a button" means editing 68 files, and the tap-size rule
(`CLAUDE.md` Responsive Layout) is restated in each one, which is how `--tap-target` (a token that
does not exist) got into five of them.

## Affected files

- `src/components/controls/BaseButton.vue`, `IconButton.vue` (new), with `.spec.js` and a story each
- The 68 components with their own button rule. By family:
  - dialogs: the ten named above, plus `storage/ConflictDialog.vue`, `storage/DiskChangeDialog.vue`,
    `inspector/DependentRepairDialog.vue`, `inspector/VariableUsageDialog.vue`,
    `layout/SharedAboutPopup.vue`, `layout/UserPartMenu.vue`, `layout/SaveToLibrarySheet.vue`,
    `layout/ShareSheet.vue`, `layout/ShareGistGroup.vue`, `features/SplitSheet.vue`
  - strips and toasts: `display/MergeBanner.vue`, `MergeToast.vue`, `RepeatToast.vue`,
    `layout/UpdateToast.vue`, `inspector/DependentsBanner.vue`, `viewport/ModelImportStatus.vue`
  - panels: `sketch/ExtrudePanel.vue`, `ReferenceImagePanel.vue`, `SlicePanel.vue`,
    `SketchPanelSheet.vue`, `SketchProfileFields.vue`, `TraceTool.vue`, `ScaleTool.vue`;
    `inspector/Inspector.vue`, `ConditionRow.vue`, `RepeatSection.vue`, `VariableRow.vue`,
    `VariableAddForm.vue`, `VariableFormulaView.vue`, `ParamBindPopover.vue`,
    `FormulaInsertList.vue`, `PromptsViewRow.vue`
  - toolbars and popovers: `viewport/OperationsToolbar.vue`, `NavigationChrome.vue`,
    `SketchToolbar.vue`, `AlignGrid.vue`, `GroupMergePopover.vue`, `RepeatSheet.vue`,
    `PlacementSession.vue`; `storage/FileMenu.vue`, `ExportPopover.vue`, `ResolutionPopover.vue`
  - AI: `ai/ChatPanel.vue`, `Composer.vue`, `PromptReply.vue`, `SaveProposal.vue`,
    `AssistantButton.vue`, `ConnectButton.vue`
  - the rest: `layout/HelpSheet.vue`, `SharedView.vue`, `DescriptionHint.vue`,
    `HistoryControls.vue`, `SaveToLibraryButton.vue`; `timeline/TimelineRow.vue`,
    `TimelineStrips.vue`, `TimelinePanel.vue`; `display/SaveStatus.vue`

## Proposed fix

1. `BaseButton.vue`: props `variant` (`default | primary | danger | quiet`), `size`
   (`tap | compact`), `pressed` (sets `aria-pressed` and the active look), `disabled`; a default
   slot; passes `data-testid` and listeners through. All of its values come from tokens. It owns the
   focus ring (`--focus-ring`) and `touch-action: manipulation`.
2. `IconButton.vue`: the same variants, a square tap target, a required `label` prop (rendered as
   `aria-label` and `title`), a default slot for the SVG, `currentColor` for the icon.
   `HelpButton`, `EyeToggle` and `DeleteButton` become thin wrappers over it.
3. Migrate one family per commit in the order above, using `/refactor-ui` for the mechanics. Each
   commit deletes the component's own button rule. Keep every `data-testid` unchanged.
4. Look before calling a difference drift. Known deliberate differences to keep as props, not
   delete: the toolbar buttons' selected state, the Library rail's launcher glyph, and the
   Assistant button's working animation. The 80px/96px `min-width` split gets one value unless a
   reason turns up in `git log`.
5. Tighten `testing-036`'s allow-list as each family lands.

## Effort

L (the base parts are an hour; the 68 migrations are the work). Split by family if a session runs
out; each family is independently shippable.

## Testing

- `BaseButton.spec.js`, `IconButton.spec.js`: each variant and size renders its class; `disabled`
  blocks the click; `pressed` sets `aria-pressed`; `IconButton` without `label` warns.
- Stories for both, and `*.story.e2e.js` snapshots of every variant in both themes. Those prove the
  component only; they do not count as reachability.
- App-level: no new spec. This step claims no behaviour change, so the existing `*.e2e.js` suite at
  `/` is the proof, and it must pass without edits to selectors. Expect **small snapshot diffs** only
  where the 80/96 px widths are unified; list each one in the commit. Layout specs run at all three
  viewports with a snapshot at each; Chromium, Firefox and WebKit, because button metrics and focus
  rings differ by engine.
- `npm run docs:media` after each family; commit regenerated pictures with the family.
- Acceptance scenarios to re-drive after the toolbar family: 1, 4, 7 (tap targets with touch only).
  After the dialog family: 10 and 24.
- Closed findings whose reproductions re-run: `ui-085` (Library sheet scrolls sideways in Safari),
  `ui-087` (popovers hide the targets).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
