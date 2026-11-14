---
title: Base Dialog, Sheet and Popover frames, built on ModalShell
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-110, ui-112]
status: open
---

> **Decided 2026-11-10** (`ui-111`, decision 1): base components live in the existing folders. These
> go in `src/components/layout/` for overlay frames.

## Problem

`src/components/storage/ModalShell.vue` is a good shared dialog frame: teleported, backdrop, title,
optional help button, a phone bottom-sheet mode. Twelve components use it. About ten other overlays
re-implement the same frame by hand, and it sits in `storage/`, which is the wrong category for
something `ai/` and `layout/` depend on.

**On `ModalShell` (12):** `ai/ConnectClaudeCode`, `KeySheet`, `StepLimitSheet`, `SubscriptionRoute`;
`layout/SharedAboutPopup`; `storage/ConflictDialog`, `ConnectDialog`, `DiskChangeDialog`,
`GistConnectDialog`, `ProjectSettingsDialog`, `ReplaceConfirmDialog`, `SaveAsGistDialog`.

**Hand-rolled, each with its own teleport, backdrop, frame, shadow and z-index:**

| Component | Kind | z-index | How it differs |
|---|---|---|---|
| `inspector/DependentRepairDialog.vue` | modal dialog | 60 | own `rgb(0 0 0 / 35%)` shadow, own `matchMedia` |
| `inspector/VariableUsageDialog.vue` | modal dialog | 60 | same shadow, own Escape listener |
| `layout/UserPartMenu.vue` | menu + dialog | 40/41 | two backdrops (clear and dimmed) |
| `layout/HelpSheet.vue` | full sheet | 50/51 | own hash routing; `aria-modal` |
| `layout/SaveToLibrarySheet.vue` | bottom sheet | 42 | safe-area padding, own toast |
| `layout/ShareSheet.vue` | sheet + backdrop | 30/31 | own toast at 60 |
| `features/SplitSheet.vue` | docked sheet | 31 | non-modal: the viewport stays live behind it |
| `viewport/RepeatSheet.vue` | docked sheet | 19/30 | non-modal, own outside-click |
| `storage/ExportPopover.vue` | popover | 30/31 | anchored to the File button |
| `storage/ResolutionPopover.vue` | popover | 30/31 | same shape as Export |
| `storage/FileMenu.vue` | menu | 30/31 | menu semantics |
| `viewport/OperationsToolbar.vue` `.ops__popover` | popover ×3 | 30/31 | draggable (`usePopoverDrag`) |
| `inspector/ParamBindPopover.vue`, `FormulaInsertList.vue` | popover | 40, 45 | anchored to a field |
| `layout/LibraryRowPopout.vue`, `LibrarySectionPopout.vue` | popout | 15 | anchored to the rail |

Eleven separate `*__backdrop` rules. `role="dialog"` appears in 20 files, `aria-modal` in 5. The
phone keyboard lift exists in `ModalShell` and `ChatPanel` only (`ui-110`).

Some of these differences are deliberate and must survive: the Split and Repeat sheets are
**non-modal** by design (the user works in the viewport while they are open); the operation popovers
are draggable so they do not hide their targets (`ui-087`); `ModalShell` is top-anchored on phones
so the keyboard cannot cover it, while a few sheets are bottom-anchored on purpose (`io-017`).

## Affected files

- `src/components/storage/ModalShell.vue` → `src/components/layout/BaseDialog.vue` (moved with
  `git mv`; a re-export stays at the old path until the twelve imports are updated in the same
  commit)
- `src/components/layout/BaseSheet.vue`, `BasePopover.vue` (new), with `.spec.js` and stories
- the components in the table

## Proposed fix

1. `BaseDialog.vue`: `ModalShell` as it is, plus `ui-110`'s `useFocusTrap`, `useOverlayStack` and
   `useKeyboardInset`, a `tone` prop for confirm dialogs, and the `--z-modal`, `--scrim` and
   `--shadow-overlay` tokens from `ui-112`. Always modal.
2. `BaseSheet.vue`: props `side` (`bottom | right`), `modal` (default `false`), `title`,
   `helpTopic`. Non-modal sheets get no backdrop and no focus trap, and do join the overlay stack
   for Escape. Safe-area padding and the keyboard lift are built in, so `ui-110`'s keyboard
   hypothesis is fixed here for every sheet at once.
3. `BasePopover.vue`: props `anchor` (an element or a rect), `placement`, `draggable` (wires
   `usePopoverDrag` and renders `PopoverGrip`), `modal`. Uses `useOutsideClick`.
4. Migrate in this order, one component per commit, with `/refactor-ui`: the two hand-rolled modal
   dialogs (`DependentRepairDialog`, `VariableUsageDialog`); then the popovers (`Export`,
   `Resolution`, `ParamBind`, the three in `OperationsToolbar`); then the sheets (`SaveToLibrary`,
   `Share`, `Repeat`, `Split`); `HelpSheet` and `UserPartMenu` last, since they differ most.
   `FileMenu` and the Library popouts are menus, not dialogs: leave them unless a `BaseMenu` earns
   its place, and say so in the retirement text.
5. Every migration replaces a literal z-index with a `--z-*` token, which is what collapses the 26
   distinct values in `ui-111`.

## Effort

L. Each migration is S–M and independently shippable.

## Testing

- `.spec.js` for each base part: a modal traps focus and dims; a non-modal sheet does neither;
  Escape closes the top overlay only; the popover closes on outside click and not on a click on its
  anchor; `draggable` renders the grip.
- Stories and `*.story.e2e.js` snapshots for each, both themes. Component proof only.
- App-level: the existing `*.e2e.js` specs for each migrated overlay must pass with unchanged
  selectors. Add to `e2e/overlay-focus.e2e.js` (from `ui-110`) one case per migrated modal.
  **All three viewports with a snapshot at each**: every one of these reflows between phone, tablet
  and laptop. **All three engines** for the sheets (safe-area, `dvh` and `visualViewport` differ in
  WebKit); the popovers too, since they sit over the canvas.
- `npm run docs:media` after each migration; most of these overlays appear in a docs picture.
- Acceptance scenarios to re-drive: 10 and 11 (File menu, Export), 17 (Split sheet), 21 (bind
  popover), 24 (Key sheet), 29 (Share sheet); 7 once, with a sheet open, on a touch project.
- Closed findings whose reproductions re-run: `ui-070` (Inspector tab covers the Library sheet),
  `ui-085` (Library sheet scrolls sideways in Safari), `ui-086` and `ui-087` (Align popover and
  popovers hiding targets), `io-017` (the gist dialog's bottom sheet), `testing-008` (Split sheet).

## Progress (2026-11-14, `/run-todos` agent, stage 2) — OPEN, partly shipped

**Shipped (stage 1, five commits; stage 2, three):**

- **Stage 1.** `storage/ModalShell.vue` is `layout/BaseDialog.vue` (`git mv`; all 14 importers updated, not 12: `ProjectNameDialog` and `NativeOpenSheet` were missing from the table). A `.vue` re-export shim at the old path is not possible (the SFC compiler adds its own default export; `vue-tsc` rejects it), so there is none. `BaseDialog` gained `tone`, `placement`, `width`, `titleTestid`, `backdropTestid` and an opt-in `escapable` (Escape through `useOverlayStack`); it uses `--scrim`, `--z-modal(-frame)`. `BaseSheet` and `BasePopover` exist with specs and stories.
- `DependentRepairDialog` and `VariableUsageDialog` are on `BaseDialog` (at phone width the repair dialog is a bottom sheet as tall as its rows); `ExportPopover` and `ResolutionPopover` are on `BasePopover` (modal, `bottom-end` of the File button); `SaveToLibrarySheet` is a non-modal card `BaseSheet`. `e2e/overlay-focus.e2e.js` has a case for each dialog.
- **Stage 2.** `ParamBindPopover` and `FormulaInsertList` are a non-modal `BaseSheet` at phone width and stay the inline box under their field from tablet width (`composables/useMediaQuery.js` picks the frame; the stylesheet cannot swap a component). The Fillet/Chamfer, Resize and Mirror popovers in `OperationsToolbar` are modal, draggable `BasePopover` frames, each with a `dragKey`; the toolbar's own backdrop, drag wiring and `.ops__popover` rule now serve only the Align and Group popovers, and its Escape order is unchanged. A `BasePopover` root is a Teleport, so the toolbar's scoped CSS cannot reach it: the frames are placed by an unscoped `body .popover.ops__popover` block. The docs pictures the ui-114 button changes had moved were regenerated in their own commit.

**Remaining (the table rows still hand-rolled):**

- Sheets: `ShareSheet.vue` (anchored under its button on desktop through `--layout-share-top/right`; its backdrop is clear, so `BaseSheet` needs a `scrim` choice), `SplitSheet.vue` and `RepeatSheet.vue` (non-modal; Repeat's Escape belongs to the Operations toolbar, so `BaseSheet` needs an opt-out of the overlay stack, and its phone tier is 19 under the Library, which `tier` does not name yet).
- `HelpSheet.vue` and `UserPartMenu.vue`, last.
- `FileMenu.vue` and the two Library popouts stay menus: they are not dialogs, and a `BaseMenu` has not earned a place. Say so in the retirement text.
- Stories' `*.story.e2e.js` snapshots for the three base parts, both themes. **There is no Storybook Playwright project or web server in `playwright.config.js` yet** (no `*.story.e2e.js` file exists in the repo), so this needs a `storybook` project, a `storybook build` + static serve `webServer` entry and the three specs; budget it as its own step.
- `guard-allowlist.json` z-index and colour entries for the remaining files go down with each migration.
- Acceptance 17, 29 and 11, and the closed-finding reproductions for the Share, Split and Repeat sheets, re-run when those migrate.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
