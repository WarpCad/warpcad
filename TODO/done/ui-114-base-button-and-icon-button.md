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

> **Progress 2026-11-14 (stays open).** Stage 1: `BaseButton.vue` and `IconButton.vue` (with specs and stories, and
> `focus()` exposed for template refs), `HelpButton` and `EyeToggle` as thin `IconButton` wrappers, and eleven dialogs
> (`ai/ConnectClaudeCode`, `KeySheet`, `StarterCopy`, `StepLimitSheet`, `SubscriptionRoute`; `storage/ConnectDialog`,
> `GistConnectDialog`, `ProjectSettingsDialog`, `ReplaceConfirmDialog`, `SaveAsGistDialog`;
> `inspector/DependentRepairDialog`). `git log` gave no reason for 80 vs 96, so tap buttons are `min-width: 80px`.
> Stage 2 (six commits, each on all nine engine-viewport projects for its own specs): `BaseButton` gains `size="large"`
> (48 px, `--radius-md`), `align="start"`, `fill`, `narrow` (a `--tap` minimum instead of 80 px), `variant="link"` and
> `"link-danger"`, and `compact` takes the dense panels' 12 px type. Moved: the nine 48 px dialogs (`storage/ConflictDialog`,
> `DiskChangeDialog`; `inspector/VariableUsageDialog`; `layout/SharedAboutPopup`, `UserPartMenu`'s rename and delete
> dialogs, `SaveToLibrarySheet`, `ShareSheet`, `ShareGistGroup`; `features/SplitSheet`); `inspector/DeleteButton`; the
> strips and toasts (`display/MergeBanner`, `MergeToast`, `RepeatToast`; `layout/UpdateToast`; `inspector/DependentsBanner`;
> `viewport/ModelImportStatus`); the panels `sketch/ReferenceImagePanel`, `SlicePanel`, `TraceTool`, `ScaleTool` and
> `inspector/ConditionRow`, `RepeatSection`, `VariableRow`, `VariableAddForm`, `VariableFormulaView`, `PromptsViewRow`;
> and AI `ChatPanel`, `Composer`, `SaveProposal`, `PromptReply`, `ConnectButton`.
> **Progress 2026-11-14, stage 3 (stays open).** `IconButton` gains `bordered` (the toolbar look: `--border-strong` outline on
> `--surface-2`, accent on hover and press, accent fill when `pressed`) with a spec and two stories. Moved: the popovers
> (`viewport/GroupMergePopover`, `RepeatSheet` incl. its minimise `IconButton`, `PlacementSession`, `AlignGrid`;
> `storage/ResolutionPopover`, `ExportPopover`); the toolbars' own buttons (`NavigationChrome`: steps, zoom, reset, expand and
> gear are `IconButton`, the drag-mode and preset toggles are `BaseButton` with `variant="primary"` as the selected state;
> `SketchToolbar`: tools and Delete are `IconButton`, the text buttons `BaseButton`; `OperationsToolbar`'s fillet, resize and
> mirror Cancel and commit buttons); and "the rest" (`layout/SharedView`, `DescriptionHint`, `SaveToLibraryButton`,
> `HistoryControls`; `timeline/TimelineStrips`, `TimelinePanel`'s close). Sizing (a toolbar's compact tier, the strips'
> measured 28 px, a pill radius) stays as a layout-only rule on the instance, never a colour or border.
> **Looked at and left, with reasons**: `OperationsToolbar`'s `.ops__btn` row (a glyph plus a label that shows or hides by
> tier, a launcher caret and a count badge: `IconButton` is square and has no visible-label mode; a labelled variant is the
> next step if the owner wants it moved); `storage/FileMenu` (`role="menuitem"` rows with stacked reason text and a File
> trigger with a pending spinner: a menu, not buttons), and `layout/UserPartMenu`'s rows for the same reason. **Left for a
> decision** (segmented controls, tabs and the close cross may legitimately stay their own components; the allow-list entries
> stay until they do): `sketch/ExtrudePanel`, `SketchProfileFields`, `SketchPanelSheet`, `inspector/Inspector.vue`,
> `ParamBindPopover`, `FormulaInsertList`. **Not yet looked at**: `layout/HelpSheet`, `timeline/TimelineRow`,
> `layout/LibraryRail` (launcher glyph stays a prop), `ai/AssistantButton` (working animation stays a prop),
> `display/SaveStatus`. Acceptance 1, 4 and 7 re-driven by their own specs with trusted touch (see `TODO/ACCEPTANCE.md`); the `ui-085` repro (`e2e/library-sheet-overflow.e2e.js`) and `ui-087` repro (`e2e/snap-align-operation.e2e.js`) pass on chromium phone and tablet. Commits `4648d49`, `2cb9fdf`, `b81c62d`.

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
