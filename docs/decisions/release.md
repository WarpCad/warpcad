# Release tooling: release-it

**Status:** accepted 2026-10-18 (`TODO/build-013`). Pages no longer deploys on every merge to
`main`; a manually started **Release** workflow bumps the version, writes the changelog and GitHub
release notes, pushes the `vX.Y.Z` tag, then deploys Pages from that tag.

## What the app needs

- A deliberate act: one chosen commit, one version, one tag, one set of notes, one deployment.
- Notes derived from history. Recent commits use Conventional Commits (`feat(ai): …`); 29 of 453
  subjects don't (`chat:`, `todo:`, `wip:`) and are dropped from the notes, which is the right outcome
  for them.
- Runs under `GITHUB_TOKEN` with no personal access token. A tag or release made with that token
  triggers no other workflow, so Pages is chained with `workflow_call`, not a `release:` trigger.
- No npm publish (the package is `private`). No new licence outside the allow-list.

## Options compared

Figures from the GitHub and npm APIs on 2026-10-18.

| Option | Version / licence | Stars | Open issues | Last push | Contributors | Fit |
|---|---|---|---|---|---|---|
| **release-it** + `@release-it/conventional-changelog` | 21.1.1 / MIT; plugin 12.0.2 / MIT | 9.1k | 9 | 2026-10-07 | 30+ | Bump, changelog, tag, push and GitHub release in one config file; `--ci`; `--dry-run`; works without publishing to npm. The maintainer has used it before and found it reliable |
| semantic-release | 25.0.9 / MIT | 24.1k | 407 | 2026-10-16 | 30+ | Fully automatic on every push: the opposite of a deliberate, manually started release. Its plugin chain is built around npm publishing |
| changesets | 3.0.3 / MIT | 12.5k | 276 | 2026-10-16 | 30+ | Per-PR changeset files; built for multi-package monorepos and npm publishing. Adds a step to every PR for a single private app |
| Hand-rolled script (`npm version` + `gh release create`) | none | n/a | n/a | n/a | us | No dependency, but we would own changelog generation, tag and rollback handling |

## Decision

**release-it**, with `@release-it/conventional-changelog` (preset `conventionalcommits`). It is the
smallest tool that does the whole job on a manual trigger. Both are devDependencies, so they are
outside the production licence check; `yaml` (ISC) joins them for the workflow guard spec.

## Rejection table

| Option | Why it lost |
|---|---|
| semantic-release | Releases on every push by design; we want a human to decide. Largest open-issue count of the four, and npm-publish-shaped plugins we don't use |
| changesets | A per-PR file workflow for monorepos; more ceremony than one private app needs |
| Hand-rolled script | Reimplements changelog generation and release creation for no saving; revisit only if release-it stops being maintained |

## How it fits together

- `release.yml` (`workflow_dispatch`, `bump` input): checks out `main` and runs no
  tests: they run locally and `.githooks/pre-push` refuses a push of `main` without a stored full run,
  so no Actions minutes are spent on them (`ci.yml` stays as a manual `workflow_dispatch`). It runs `release-it --ci --increment <bump>`, then calls
  `pages.yml` with the new tag. The release job has `contents: write` and nothing else.
- `pages.yml` accepts `workflow_call` and `workflow_dispatch`, each with a `ref`; it builds that ref.
  It has no `workflow_run` trigger, so a merge deploys nothing.
- The ref is always the head of `main`: release-it commits the version bump onto `main`, so it cannot
  release an older commit. (`TODO/build-013` sketched an optional `ref` input; it was dropped for
  this reason. Rebuilding an old release is `pages.yml`'s own `ref` input.)
- `.release-it.json` sets `npm.publish: false`, `git.requireBranch: main` and
  `git.requireCleanWorkingDir: true`; `scripts/release-workflow.spec.js` fails if any of these, or
  the workflow shape above, drifts.

## Sentry key stays the commit SHA

Sentry unminifies an error only when the app's `VITE_SENTRY_RELEASE` equals the `SENTRY_RELEASE` the
source maps were uploaded under. Both are still the commit SHA, now read with `git rev-parse HEAD`
after checkout. In a called workflow `github.sha` is the *caller's* commit, which is one before
release-it's bump commit that the tag points at, so using it would make every error miss its maps.
Moving the key to the tag name is a separate decision.

## Licence check and the version bump

The `licenses` scripts used `--excludePackages "warpcad@0.0.0"` to skip the app itself. A version
bump would have made that pattern stale and failed CI on the release commit, so both scripts now use
`--excludePrivatePackages` (the app and `mcp/` are `private`).

## Revisit when

- release-it loses its maintainer (last push is 2026-10-07 at the time of writing; re-check before a
  major upgrade).
- Branch protection on `main` blocks the bot's push and a PAT is the only way round.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
