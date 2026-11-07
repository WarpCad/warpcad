---
title: Drive the VERIFY.md pre-push hook, dev-only spec and build-output checks locally
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`build-014` and `build-016` left their pre-push gate checks in `TODO/VERIFY.md` because they need "a real
git remote". A bare repository in the scratchpad is a real git remote, so an agent can run them without
touching `origin`. The same holds for the dev-only e2e run `build-015` asked for, the read-through of the
built third-party notices, and the flake watch `testing-003` asked for over later full runs, which now
exist in the stored results.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `build-014` #1 | Scratch bare remote (`git init --bare` in the scratchpad), clone, hook installed: push with no stored result (refused), partial e2e (refused), full and green (allowed), full with failures and no `Known-failures:` trailer (refused), with the trailer (allowed) |
| `build-014` #2 | Change a `docs/media/*.gif` in the clone and push: the LFS object reaches the scratch remote (buffered stdin reached `git lfs pre-push`) |
| `build-016` #5 | Repeat the `build-014` #1 walk against the current `.githooks/pre-push` (the CLA backstop edit) |
| `build-015` #1 | Run once with `E2E_DEV=1`: `ai-scripted`, `webmcp`, `live-mcp-header-entry`, `ai-mcp-agent-pairing`, `mcp-connected-assistant`, `docs/ai-chat`, `docs/ai-live-bridge`, `docs/ai-live-mcp-header`. Note the known `docs/ai-live-bridge` "mcp-connected still" failure separately |
| `build-011` #1 | `npm run build`, then read `dist/THIRD-PARTY-NOTICES.txt`: every entry has a licence text, and the Albany County Fasteners paragraph reads right |
| `testing-003` #1 | Across the stored full e2e runs since 2026-10-10 (`scripts/test-progress/` results and `node scripts/todo-progress.mjs`), count reds on `print-prep.e2e.js` "the hand recipe" and `inspector-hidden-parts.e2e.js` "toggling Show hidden parts…". A third red on either reopens `testing-003` with the project named |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)

## Proposed fix

1. Everything happens in a scratchpad clone pointed at a scratchpad bare remote. **Never push to
   `origin`**, and never change the working repository's hooks or config.
2. For the stored-result cases, write fake result stamps the way the hook reads them (see
   `CONTRIBUTING.md` "Pushing" and `scripts/todo-progress.mjs stamp`) rather than running the full suites
   five times.
3. Run the dev-only specs with the progress reporters loaded (never a bare `--reporter=`, per
   `.claude/commands/test.md`).
4. Record each push's exit code and message, the spec results and the notice findings in Notes. A gate
   that lets a bad push through is a high-priority finding.

## Effort

M (the dev-only e2e run is the long part).

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: as the dev-only specs' own projects define.
- Acceptance scenarios: 24 and 25's scripted plumbing through the dev-only specs; no hand drive.
- Closed-finding regression: `testing-003`'s two races are row 6.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
