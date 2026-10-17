---
title: Cut Git LFS bandwidth: cache the docs-media objects instead of downloading them in every CI job and deploy
category: build
kind: finding
priority: high
model: sonnet
milestone: M18 — Launch: publish, app.warpcad.com, Sentry and GA
depends: []
status: open
---

## Problem

`docs/media` holds 74 GIFs in Git LFS, 72.7 MB in all (`.gitattributes`; measured on
2026-10-17 with `git lfs ls-files -s`). Four checkouts fetch them on every push to `main`:

- `.github/workflows/ci.yml:23`, the `test` job (`lfs: true`)
- `.github/workflows/ci.yml:58`, the `smoke` job, which runs as two matrix legs
- `.github/workflows/pages.yml:33`, the Pages build (`lfs: true`)

That is four downloads, about 290 MB, per push to `main`. If the free GitHub LFS bandwidth is
1 GiB a month (**the owner must confirm the current figure**), the quota covers only a few
pushes before LFS downloads fail, and CI and the Pages deploy fail with them. This is not a
licensing matter. It would break the first publish, so the user put it before the push
(2026-10-17).

## Affected files

- `.github/workflows/ci.yml` (the `test` and `smoke` jobs)
- `.github/workflows/pages.yml` (the `build` job)
- `docs/decisions/hosting.md` (record the LFS cache and the quota figure)

## Proposed fix

1. **Owner step first:** read the free LFS storage and bandwidth limits on GitHub's current
   billing and LFS pages, and record the figures and the date in `docs/decisions/hosting.md`.
2. Cache the LFS objects instead of re-downloading them. Check out with `lfs: false`, restore
   a cache of `.git/lfs/objects` keyed by a hash of the LFS pointer list
   (`git lfs ls-files -l | cut -d' ' -f1 | sort | sha256sum`), then run `git lfs pull` and
   `git lfs checkout`. A cache hit downloads nothing; a miss downloads once and saves the cache.
   Use the same step in all three workflows, written once as a local composite action under
   `.github/actions/` if the YAML repeats.
3. Check which jobs need the GIF contents at all. The unit and `guards` stage reads file
   presence and size (`e2e/docs-media.spec.js`) and may only need the pointer files; the
   smoke jobs may not touch `docs/media`. Where the pointers are enough, leave LFS off for
   that job and say why in a comment. Where the content matters (the Pages build bundles the
   media into Help), keep the cache.
4. Do not move the media out of LFS and do not rewrite history. That is a larger decision.

## Effort

M (a few hours). It cannot be verified on a laptop: the workflows run only on GitHub, so the
check is the first two CI runs after the push (see Testing).

## Testing

- Local: `npm run typecheck` and a YAML lint (`npx --yes yaml-lint .github/workflows/*.yml`)
  pass; that is all that can run before the push.
- **First two runs after the push** (owner or agent reading the Actions log): the first run
  downloads and saves the cache; the second run's LFS step shows no download. Record both
  byte counts in `docs/decisions/hosting.md`.
- The `guards` project (`e2e/docs-media.spec.js`) still passes when the job uses pointer
  files only, if step 3 turns LFS off for it. If it fails on pointer files, keep LFS for
  that job.
- Acceptance scenarios: none (no app change). Smoke: scenario 1 on the production build after
  the first deploy.
- Engines: unchanged; the smoke projects (`smoke-chromium-laptop`, `smoke-webkit-tablet`) stay
  as they are.

## Documentation

Not applicable. This is a CI change with no user-visible control. The record goes in
`docs/decisions/hosting.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
