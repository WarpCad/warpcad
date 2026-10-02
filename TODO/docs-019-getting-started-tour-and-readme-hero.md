---
title: Getting-started page and the README tour GIF (place, subtract, save, export)
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-008, docs-009, docs-010, docs-011, docs-016]
status: open
---

## Goal

A new user landing on `README.md` or `docs/README.md` should see, in under ten seconds,
what WarpCad *does*: one animated tour — place a cube and a cylinder, subtract, nudge the
result with the gizmo, export STL — and then a "Getting started in five minutes" page that
walks the same steps with the stills and clips already captured by `docs-008`…`016`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — **new** `docs/getting-started.md`; `README.md` embeds the tour GIF under the
  hero still from `docs-007`; `docs/README.md` links the page first in the navigation.
- **Example** — the page *is* the example: numbered steps, each with its still or clip and
  the units (mm) wherever a number is typed.

## Media inventory

Spec: `e2e/docs/getting-started.docs.js`.

| Name | Kind | Shows |
|---|---|---|
| `tour` | movie | The whole 5-step flow in one take, ≤ 20 s (relax `docs-006`'s 12 s budget for this one GIF only, with the exception recorded in the manifest). |
| `tour-step-1-place` … `tour-step-5-export` | stills | One frame per step for the page; may reuse a `docs-008`…`016` image by reference rather than duplicating the file. |

## Affected files

- `e2e/docs/getting-started.docs.js`, `docs/getting-started.md`, `README.md`,
  `docs/README.md`, `docs/screenshots/*`, `docs/media/tour.gif`.

## Proposed fix

The tour deliberately mirrors the shape of `TODO/ACCEPTANCE.md` scenarios 1 and 4 and 11 —
and must not be mistaken for running them (see `docs-006`). GIF size is the risk: use a
smaller width (640 px) and 10 fps for this clip, and consider also shipping an MP4/WebM
beside it (`<video>` renders in GitHub READMEs via a repo-hosted file link) if the GIF
exceeds the budget even then.

## Effort

M

## Testing

- The tour spec asserts the final state of each step (body count, hole present, a download
  event); `docs-007`'s guard confirms `README.md` and the page reference `tour.gif` and
  that the manifest entry is fresh.
- Engines: Chromium only. Viewports: laptop.
- `TODO/ACCEPTANCE.md`: scenarios 1, 4, 11 — drive by hand. Closed findings: none beyond
  those already listed by the dependencies.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
