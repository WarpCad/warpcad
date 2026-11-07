---
title: Answer the VERIFY.md deploy and CI checks from the live site and the GitHub run history
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

Several `TODO/VERIFY.md` rows were written before the site was deployed and before CI had run, so they
read "after deploy…" or "on the first run after the push…". Those runs have happened since (Release ran on
2026-11-06, Pages runs exist from 2026-10-18). `gh` is signed in on this Mac, and `curl` and Playwright can
read `app.warpcad.com`, so the answers are now read-only lookups. The rows that need the owner's GA,
Sentry or billing accounts stay in the queue.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to read |
|---|---|
| `docs-029` #2 | `curl -I` `https://app.warpcad.com/llms.txt`, `/llms-full.txt` and `/help/agent-prompting.html`: 200 and a readable content type |
| `build-022` #10 | Re-confirm the scheduled Pages run and that every page in the live `help/index.json` is linked from `https://warpcad.com/`; **reword the row** to drop `help-index.snapshot.json`, as its Note says |
| `build-007` #5 | Load `https://app.warpcad.com/` in Playwright and collect console messages: no CSP error naming a Google host |
| `build-007` #6 | Open `…/#/help/getting-started` and read the GA `collect` request: its `dl` has no `#` part. This sends one real page view to the owner's GA property; say so in Notes |
| `build-013` #1 | From `gh run list`: a merge to `main` ran CI and started no Pages run |
| `build-013` #2 | From the Release runs (`v1.12.0` and earlier): one tag, one GitHub release with notes, the `pages` job ran as a `workflow_call` under `GITHUB_TOKEN`, and the bot pushed to `main` |
| `build-014` #3 | After the first real push to `origin` with the pre-push gate, no unexpected new Actions run started (match push times from `git reflog` against `gh run list`) |
| `build-012` #1, #2 | Open the first Pages run after the LFS change and a later one (`gh run view --log`): the first shows a cache miss and the downloaded bytes, the later one "Cache restored" and 0 B. Write both byte counts into the table in `docs/decisions/hosting.md` "Git LFS bandwidth" |
| `build-016` #3 | From the Dependabot PRs' `cla` and `dco` runs (several exist, 2026-11-06) and an owner PR: both checks exempt them |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, and the reworded `build-022` #10)
- `docs/decisions/hosting.md` ("Git LFS bandwidth" table)

## Proposed fix

1. Use only read-only commands: `curl -I`, `gh run list`, `gh run view --log`, `gh pr checks`,
   `gh release view`. Do not re-run, cancel or dispatch any workflow, and do not push.
2. Record run ids, timestamps and the exact log lines in Notes, so the evidence can be re-checked.
3. For `build-007` #5 and #6, drive the deployed app once, headless Chromium, laptop viewport.
4. Any failure (a 404, a CSP error, a Pages run that started on merge) becomes its own finding.

## Effort

S.

## Testing

- `npm run spdx` passes; `docs/decisions/hosting.md` is the only file edited apart from `TODO/VERIFY.md`.
- Engines: Chromium (one deployed-site load).
- Acceptance scenarios: none re-driven.
- Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (decision record table only).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
