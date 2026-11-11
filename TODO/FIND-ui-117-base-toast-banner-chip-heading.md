---
title: Base Toast, Banner, Chip, SectionHeading and ListRow
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112, ui-114]
status: open
---

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
