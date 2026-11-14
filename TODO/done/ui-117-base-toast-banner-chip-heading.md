---
title: Base Toast, Banner, Chip, SectionHeading and ListRow
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112, ui-114]
status: done
---

> **What shipped (2026-11-14, five commits, one base part each).**
> 1. **`BaseToast`, `stores/toasts.js`, `layout/ToastHost.vue`.** `show({ text, key?, tone?, testid?, lingerMs?, action?, link? })`
>    queues; `DEFAULT_LINGER_MS` is 5 s for every source (the gist toast keeps 6 s because it carries a button). Each toast runs its own
>    clock, a second toast never replaces the first, and a repeat of the same `key` replaces its own earlier toast in place (so *Link copied* twice is one
>    pill, as before, and the existing `toHaveText` specs still see one element). `danger` toasts are `role="alert"`. The host is mounted once in
>    `AppView.vue` at `--z-toast` and stacks the pills. `ShareSheet`, `SaveToLibrarySheet` (through `stores/library.js`) and the gist toast
>    (through `stores/fileMenu.js`, whose **Copy link** is the toast's `action` and whose failed copy shows a read-only `link` field) raise toasts on
>    the queue; their `data-testid`s are unchanged. The library's "Could not ..." toasts are now danger. `e2e/toast-queue.e2e.js` copies a link, then saves to
>    the library, and asserts both toasts are visible and do not overlap (Chromium, phone, tablet, laptop, a snapshot at each).
> 2. **`BaseBanner`** (`tone` of info, warn or danger; `layout` of strip, dock, box or note; `truncate`; actions and footer slots).
>    `MergeBanner`, `MergeToast`, `RepeatToast`, `NativeRestoreToast`, `UpdateToast`, `DependentsBanner` and `ViewHiddenNote` render through it.
>    **Deviation from the finding:** `UpdateToast` (and `NativeRestoreToast`) went to `BaseBanner`, not `BaseToast`. They are in-flow strips by
>    design (they must push the viewport rather than cover the navigation chrome, `build-005`), which is the banner's `dock` and `strip` layouts, not a floating pill.
>    `RepeatToast` and `NativeRestoreToast` keep their own timers (their logic, per the finding).
> 3. **`BaseChip`** (`tone`, `size` of sm, md, lg or tap, `dot` with `dotTone` and `pulse`, a `leading` slot, `dashed`, `as="button"`). Moved:
>    `AiWorkingChip`, `BridgeChip`, `WebMcpChip`, the Share sheet's gist chip and the five History row chips in `TimelineRow`. The `ai-working-chip`
>    docs picture still matches (`testing-010` stays closed). **Not moved, with reasons:** `SaveStatus` (a borderless status line, not a pill),
>    `ParamBoundChip` (a name button, a value and a menu, not one chip), `PlacementSession`'s chip (a positioned glass card around a Cancel button) and
>    `ChatPanel`'s `chat__chip` (already `BaseButton`s since `ui-114`). That is four of the nine; five of the nine named plus the History chips are on `BaseChip`.
> 4. **`SectionHeading`** at **12 px** (`--text-size-sm`): the four panel headings keep their size, and the Inspector's Color, Parts and Transform
>    titles, `ParamFields`' title and `ConditionRow`'s title grow from 11 px. **`VisuallyHidden`** is a component plus `src/styles/utilities.css`
>    (`.visually-hidden`, and `.visually-hidden-phone` at 640 px and `.visually-hidden-narrow` at 1099 px for the labels that hide only below a width);
>    seven copies of the clip rule are gone. Also fixed a `ui-114` leftover in `UserPartMenu` (a dangling `.umenu__item,` selector dimmed every menu item).
>    Twelve docs pictures regenerated.
> 5. **`ListRow`** (leading, default and trailing slots; `selected`, `hovered`, `interactive`, `truncate`, `tag`). `ObjectList` (body rows and both kinds of part
>    row), `LibraryRow`'s labelled catalogue line and `VariableRow`'s head are on it. **Not moved:** `TimelineRow` and `PromptsViewRow` (both expand
>    in place), `LibraryRow`'s My parts row and tiles (a multi-line card and a different shape), `SlicePanel` (not named).
>
> **Waived: Storybook `*.story.e2e.js` snapshots.** The repo has no Storybook Playwright project, and CLAUDE.md says story specs do not count as
> reachability. Stories exist for all six parts (`BaseToast`, `BaseBanner`, `BaseChip`, `SectionHeading`, `VisuallyHidden`, `ListRow`); the app-level specs
> and the rotating engine pair are the proof, as for `ui-116`.
>
> **Known and not this task's.** Three e2e specs fail on `main` before this task and still fail: `number-entry.e2e.js` (Split offset screenshot) and
> two `print-prep-keys.e2e.js` pieces-list screenshots ("Expected an image 364px by 105px, got 189px"). Confirmed at `f270f66` in a clean worktree on
> `chromium-laptop` and `firefox-phone`. The Split sheet's width changed in `ui-116`.
> The docs movies (`*.gif`) of the Inspector were not regenerated (`npm run docs:gifs` rewrites every GIF); `docs-media` warns that
> `select-marquee.dark.gif` is stale against its spec.

> **Decided 2026-11-10** (`ui-111`, decision 1): base components live in the existing folders. These
> go in `src/components/display/`.

## Problem

The read-only pieces of the UI are repeated the way the buttons are (`ui-114`).

**Toasts, five implementations.** Three are the same floating pill (`position: fixed; left: 50%;
transform: translateX(-50%); z-index: 60`) written separately: `layout/ShareSheet.vue:619`
(`.share-toast`), `layout/SaveToLibrarySheet.vue:244` (`.library-toast`),
`storage/SaveAsGistDialog.vue:233` (`.save-gist-toast`, a card with a link and a Copy button). Two
are strips: `display/MergeToast.vue`, `display/RepeatToast.vue`. `layout/UpdateToast.vue` is a
sixth shape. Each owns its own timer (`ShareSheet.vue:193`, `RepeatToast.vue:27`), so linger times
differ, and two toasts fired together overlap at the same position because nothing queues them.

**Banners and strips.** `display/MergeBanner.vue`, `MergeToast.vue` and `RepeatToast.vue` share an
identical text rule (`flex: 1 1 12em; font-size: 13px; line-height: 1.35`) and an identical button
rule. `inspector/DependentsBanner.vue` and `inspector/ViewHiddenNote.vue` are the same idea again.

**Chips.** Chip classes in 7 components: `ai/BridgeChip.vue`, `ai/WebMcpChip.vue`,
`ai/ChatPanel.vue`, `inspector/ParamBoundChip.vue`, `layout/ShareSheet.vue`,
`timeline/TimelineRow.vue`, `viewport/PlacementSession.vue`. `display/AiWorkingChip.vue` and
`display/SaveStatus.vue` are chips under other class names. 23 rules use `border-radius: 999px`.

**Section headings.** The uppercase small heading is defined seven times: 12px in
`inspector/Inspector.vue` (`.inspector__heading`), `layout/LibraryPanel.vue`,
`layout/LibrarySection.vue`, `layout/LibrarySectionPopout.vue`; 11px with different letter-spacing
in `inspector/ConditionRow.vue`, `Inspector.vue` (`.inspector__section-title`),
`inspector/ParamFields.vue`. Two sizes for one role, side by side in the Inspector.

**Visually hidden text**, four copies of the same clip rule: `ai/AssistantButton.vue`,
`layout/LibraryRail.vue`, `layout/ShareSheet.vue` (three class names), `storage/FileMenu.vue`.

**List rows.** A row with a label that truncates and trailing actions (eye, delete, bind) is built
separately in `inspector/ObjectList.vue`, `inspector/PromptsViewRow.vue`, `layout/LibraryRow.vue`,
`timeline/TimelineRow.vue`, `inspector/VariableRow.vue` and `sketch/SlicePanel.vue`. They share the
truncating-label rule exactly (three identical copies) and the plain-list reset (four identical
copies). They differ a lot in content, so this one is a layout shell, not a full component.

## Affected files

- `src/components/display/BaseToast.vue`, `BaseBanner.vue`, `BaseChip.vue`, `SectionHeading.vue`,
  `VisuallyHidden.vue`, `ListRow.vue` (new), each with a `.spec.js` and a story
- `src/stores/toasts.js` (new; a queue, UI state only)
- the components named above

## Proposed fix

1. `BaseToast` plus a `toasts` store: `show({ text, tone, action?, lingerMs? })` queues; one toast
   host mounted in `AppView.vue` renders them stacked, at `--z-toast`, with `role="status"` (or
   `alert` for `tone: 'danger'`). One default linger time. The three pills and `UpdateToast` move
   onto it; the gist toast's link and Copy button become the `action` slot.
2. `BaseBanner`: tone, text slot, actions slot. `MergeBanner`, `MergeToast`, `RepeatToast`,
   `DependentsBanner` and `ViewHiddenNote` render through it. They keep their own logic.
3. `BaseChip`: tone, optional leading dot, optional button behaviour. The nine chips move on.
4. `SectionHeading`: one size. Pick 11px or 12px once, in the token scale; the Inspector's two
   sizes become one.
5. `VisuallyHidden`: a component and a `.visually-hidden` utility class in `src/styles/`.
6. `ListRow`: slots `leading`, default (the truncating label), `trailing`; props `selected`,
   `hovered`, `interactive`. Move `ObjectList`, `LibraryRow` and `VariableRow` first. Leave
   `TimelineRow` and `PromptsViewRow` (both expand in place) unless the fit is clean.
7. Use `/refactor-ui`. One base part per commit.

## Effort

M–L.

## Testing

- `.spec.js` per part. For the toast store: queue order, linger and dismissal with fake timers, a
  second toast does not replace the first, `danger` gets `role="alert"`.
- Stories and `*.story.e2e.js` snapshots, both themes. Component proof only.
- App-level: `e2e/toast-queue.e2e.js` (new, at `/`): copy a share link and save to the library in
  quick succession, assert both messages are visible and neither covers the other. Phone, tablet
  and laptop with a snapshot at each. No canvas involvement: Chromium only.
- Existing specs for the migrated components pass with unchanged `data-testid`s. `testing-010`
  (the `ai-working-chip` docs screenshot drift) is open against one of these chips: settle it
  before or with the chip migration, not after.
- `npm run docs:media` after each part.
- Acceptance scenarios to re-drive: 6 (object list rows), 18 (save to library toast), 22 (merge
  banner), 29 (share toast).
- Closed findings whose reproductions re-run: `ui-049` (row hover highlight), `ui-089` (eye toggle
  in rows), `ui-096` (project-only My parts row).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
