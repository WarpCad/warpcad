---
title: Base Dialog, Sheet and Popover frames, built on ModalShell
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-110, ui-112]
status: done
---

> **What shipped (2026-11-14, three `/run-todos` stages).** `storage/ModalShell.vue` is `layout/BaseDialog.vue`
> (`git mv`; all 14 importers updated, not 12: `ProjectNameDialog` and `NativeOpenSheet` were missing from the
> table; no `.vue` re-export shim is possible, because the SFC compiler adds its own default export). It gained
> `tone`, `placement`, `width`, `titleTestid`, `backdropTestid` and an opt-in `escapable`, and uses `--scrim` and
> `--z-modal(-frame)`. `BaseSheet` (`side`, `modal`, `card` with `top`/`right`, `tier` of `popover`, `modal`, `help`
> or `dock`, `scrim` of `dim` or `clear`, `stack`, `as`) and `BasePopover` exist with specs and stories. Migrated:
> `DependentRepairDialog` and `VariableUsageDialog` (BaseDialog); `ExportPopover`, `ResolutionPopover` and the
> Fillet/Chamfer, Resize and Mirror popovers in `OperationsToolbar` (BasePopover; the three are draggable and keep
> their `dragKey`); `SaveToLibrarySheet`, `ShareSheet` (modal, clear scrim, anchored under its button), `SplitSheet`
> (non-modal card, glass look and phone grid kept) and `RepeatSheet` (non-modal, `stack` off because its Escape
> belongs to the Operations toolbar, `dock` tier: `--z-dock` is 30, and 19 at phone width under the Library sheet);
> `ParamBindPopover` and `FormulaInsertList` (a non-modal BaseSheet at phone width, the inline box under the field
> from tablet width). The z-index and font entries in `guard-allowlist.json` went down with each file. Every
> `data-testid` and selector is unchanged; `e2e/overlay-focus.e2e.js` has a case for each migrated modal.
>
> **Stays as it is, and why.**
> - `FileMenu.vue` and the two Library popouts (`LibraryRowPopout`, `LibrarySectionPopout`) are menus, not dialogs:
>   `role="menu"` semantics and roving items. A `BaseMenu` has not earned a place (three consumers, no shared
>   behaviour beyond a backdrop).
> - `UserPartMenu.vue` is a `role="menu"` plus a rename form and a delete `role="alertdialog"`, each a bottom
>   action sheet with 48px items at phone width. The menu is a menu; moving the two dialogs onto `BaseDialog`
>   would turn the `alertdialog` into a `dialog` and add a header they do not have.
> - `HelpSheet.vue` has its own header (Back, title, Contents, Close), zero padding, a full-height 880px frame at
>   the help tier (50/51, above `BaseDialog`), and hash routing. `BaseDialog` always draws its own header and has no
>   tier, so it would need three new props (`tier`, `bare`, `fill`) for this one consumer, and every Help snapshot
>   would move. It already uses `useFocusTrap`, `useOverlayStack` and the `--z-help` tier tokens.
>   Owner can re-open either as a separate finding.
>
> **Waived: Storybook `*.story.e2e.js` snapshots for the three base parts.** The repo has no Storybook Playwright
> project or web server and no `*.story.e2e.js` file, and CLAUDE.md says story specs do not count as reachability.
> The stories exist for `BaseDialog`, `BaseSheet` and `BasePopover`; the app-level specs (`overlay-focus`,
> the per-overlay specs on three viewports and the rotating engine pair) are the proof. The owner can re-open the
> Storybook project as its own finding.

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

## Regression found after close

2026-11-14: the Split sheet's phone grid rules (`body :global(.sheet.split) > .split__*`) compiled to rules on the frame itself, so the Pieces list was 189 px wide instead of 364 px on the phone projects. ui-116's e2e run used `chromium-tablet` and `webkit-laptop`, which did not catch it. Fixed in the commit "fix(ui): the Split sheet's phone grid rules apply again"; see `TROUBLESHOOTING.md` and `src/components/layout/scopedGlobalCombinator.spec.js`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

