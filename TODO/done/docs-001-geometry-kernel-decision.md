---
title: Formalize geometry kernel decision as JSCAD V3
category: docs
kind: feature
priority: high
model: sonnet
milestone: M0
depends: []
status: done
---

> Shipped as proposed, plus two small consistency edits beyond the stated Affected
> files: `CLAUDE.md`'s Browser Support paragraph and Working Files bullet both
> referenced the geometry kernel as still-open/TBD in prose, which became
> self-contradicting once the Stack table row flipped — fixed both for internal
> consistency. `TODO/ROADMAP.md` doesn't exist yet (confirmed against `CLAUDE.md`'s own
> kickoff note), so Step 8's roadmap-row/Completion-Log update isn't possible yet;
> revisit when the roadmap is created at kickoff. `TODO/ACCEPTANCE.md` confirmed empty
> (no scenarios written yet), so Step 6's acceptance-scenario drive is a no-op, per the
> TODO's own Testing section.

## Goal

Write `docs/decisions/geometry-kernel.md`, formalizing `Initial design.md` §2's
comparison (`@jscad/modeling` vs. `manifold-3d` vs. `OpenCascade.js` vs.
`three-csg`/`three-bvh-csg` forks) as the committed Library-decision document per
`CLAUDE.md`'s Library-decisions rubric. Flip `CLAUDE.md`'s Stack table "Geometry
kernel" row from **Open** to **Committed — `@jscad/modeling` (JSCAD V3)**.

Done when: `docs/decisions/geometry-kernel.md` exists with all four rubric elements
(options compared on features/size/health, rejection table, manifold-3d experience
factored in explicitly, and the explicit note that this decision is a project-shape
call — direct continuity with three existing V1 libraries — not a pure
technical-superiority call), and `CLAUDE.md`'s Stack table cell is updated to match.

## Interaction model

n/a — no user-visible surface. This is a decision record and a `CLAUDE.md` table edit.

## Documentation

n/a beyond the deliverable itself — `docs/decisions/geometry-kernel.md` *is* the
documentation this task produces. No separate end-user `docs/` page, since a kernel
choice has no user-facing control.

## Affected files

- `docs/decisions/geometry-kernel.md` (new)
- `CLAUDE.md` (Stack table row edit)

## Proposed fix

Transcribe `Initial design.md` §2 (options table, rejection table, the manifold-3d
"factored in explicitly, not skipped" paragraph) into `docs/decisions/geometry-kernel.md`,
formatted per the Library-decisions rubric. Include §2's flagged-not-resolved open
sub-decision (`jscad-object-api` vs. hand-porting `Group`) as a named open item inside
the doc, not silently dropped — resolving it is core-001's job, not this task's, but
this doc should say so explicitly. Update `CLAUDE.md`'s Stack table row to read
"Committed — `@jscad/modeling` (JSCAD V3), see `docs/decisions/geometry-kernel.md`".

## Effort

S (< 1hr)

## Testing

No code or UI surface — no `.spec.js`/`.e2e.js` needed. Acceptance scenarios: none
(`TODO/ACCEPTANCE.md` doesn't exist yet, and this change touches no running-app
surface). No prior closed findings exist in this project yet.
