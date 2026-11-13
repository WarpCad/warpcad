---
title: Bring CLAUDE.md's Project Structure in line with what src/ contains
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: done
---

> **What shipped:** items 1-3 as proposed; item 4 left to `ui-111`/`ui-116`. Correction: `ModalShell` has 14 importing components (4 `ai/`, 1 `layout/`, 9 `storage/`), not twelve; the wording work did not need that count. `analytics/` is described as page-view analytics inert without a build measurement ID.

## Problem

`CLAUDE.md` says the workflows read it "as the source of truth, so correct it when reality
diverges". Its Project Structure section has diverged in four ways:

1. **Four top-level folders are not listed**: `src/io/` (mesh import: `meshAsset.js`,
   `meshFormats/stl.js`, `meshFormats/threeMf.js`, a worker), `src/help/` (the Help loader and
   topics), `src/analytics/`, and `src/styles/` (`tokens.css`). An agent placing a new importer has
   no rule to follow, and `src/core/export.js` and `src/render/export.js` already show where that
   leads.
2. **`src/core/` is described as talking to the kernel only through `src/core/kernel/`, but it also
   depends on `src/io/` and `src/sketch/`**: `core/document.js:498-499`, `core/project.js:185-186`,
   `core/replay.js:34-35`, `core/userPart.js:55-56`, `core/timelineLabel.js:36`, and
   `core/kernel/registry.js:71-72` import from them, while `io/` imports back from `core/` (two
   files). Both sides are framework-free, so nothing is broken, but the layering the file describes
   (core at the bottom) is not the layering that exists.
3. **`src/stores/` is described as "UI state only: selection, active tool, panel layout".** In
   practice the stores are where application workflows live: `persistence.js` (1,112 lines),
   `hosted.js` (748), `library.js` (904), `splitSheet.js` (1,314), `sketchEditor.js` (1,144),
   `gist.js`, `merge.js`, `modelImport.js`. They do not mirror document state, so the rule's intent
   holds. The description does not.
4. **`src/components/storage/ModalShell.vue` is the app's shared dialog frame**, used by twelve
   components in `ai/`, `layout/` and `storage/`. `storage/` is described as "project browser,
   save/open, remote-backend connection UI". (`ui-116` moves it; this item is only the wording.)

## Affected files

- `CLAUDE.md` (Project Structure, Component Categories)

## Proposed fix

1. Add `src/io/`, `src/help/`, `src/analytics/` and `src/styles/` to Project Structure, one line
   each, stating that all but `styles/` are framework-free.
2. State the real layering in one sentence: `core/`, `sketch/` and `io/` are one framework-free
   layer that may import each other; `render/` may import them and three.js; nothing in that layer
   imports Vue, Pinia or a component.
3. Reword the `src/stores/` line: stores hold UI state and the application workflows that drive it
   (save, sync, import, sheets), never document state, and never geometry math.
4. Leave Component Categories alone here. `ui-111` carries the owner's decision on where base
   components live, and that decision edits the list.

## Effort

S.

## Testing

Docs-only. No spec. Acceptance scenarios: none. Run `npm run spdx` (the marker on `CLAUDE.md` must
survive the edit).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
