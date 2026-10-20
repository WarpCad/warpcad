---
title: Stop CI running on push to main; gate `git push` on stored unit and e2e results for the pushed code
category: build
kind: feature
priority: medium
model: sonnet
depends: []
status: done
---

> **Shipped as specified.** Deviations: Playwright 1.63 keeps CLI filters off the public config, so the e2e reporter reads `config.argv` (what Playwright itself parsed) and treats any unrecognised argument as a filter, plus requires all nine matrix projects to have run tests. The vitest reporter detects partial runs by comparing started spec files with `globTestSpecifications()`. The release gate uses the recommended option (`release.yml` calls `ci.yml`). The first push after this lands is refused until `npm run test:e2e:headless` completes once.

## Goal

Pushing to `origin/main` must not start any GitHub Actions run, because hosted minutes cost
money. The safety net that CI provided moves to the developer's machine: a **pre-push git hook**
refuses the push unless the unit suite **and** the full e2e matrix have each been run on the code
being pushed, with the results stored by `scripts/todo-progress.mjs` next to its existing green
stamp. A failing run does not block the push, but its failures must be written into a commit
message in the pushed range, so a red tree is never pushed silently.

The working pattern this serves: one developer, commits straight to `main`, many commits per
week, one `git push` roughly weekly, no pull requests yet.

Done looks like:

1. `git push origin main` starts zero workflow runs (check the Actions tab after a real push).
2. `git push` with no stored unit result, no stored e2e result, or results for different code, is
   refused with a message that names the command to run.
3. `git push` after both suites ran on the pushed code goes through, whether they passed or not,
   *provided* every failing test is named in a `Known-failures:` trailer on some commit in the
   range being pushed. A failure that is not named blocks the push.
4. A release (`release.yml`) still cannot tag a commit that failed its tests.
5. Git LFS still uploads the docs GIFs on push.

## Interaction model

n/a — no user-visible app surface. The "user" is the developer at a terminal.

- **Precondition** — a clone with hooks installed (`npm install` does it, see below).
- **Trigger** — `git push`.
- **Feedback** — the hook prints one line on success (the fingerprint and times of the results
  it accepted) or a refusal that lists what is missing (`unit`, `e2e`, or `Known-failures:`) and
  the exact command to run.

## Documentation

- **Page** — `CONTRIBUTING.md` (new "Pushing" section). Not an end-user `docs/` page, because
  this changes the contributor workflow, not the app. Also update `CLAUDE.md`'s Conventions
  (test-run bullet), `.claude/commands/test.md` (green-stamp bullet and Scope section: say what
  is now stored and that a full e2e run records itself), and the header comment of
  `.github/workflows/ci.yml`, which currently says it runs on every push.
- **Example** — (1) `npm run test:unit -- --run`; (2) `npm run test:e2e:headless`;
  (3) `node scripts/todo-progress.mjs stamp attest` and paste any trailer lines it prints into the
  commit message; (4) `git push`. Then show the refusal text you get when step 2 was skipped.
- **Media** — none (no screenshots or movies; terminal workflow).

## Affected files

- `scripts/todo-progress.mjs` — new `stamp` subcommands (below); `prune()` must stop deleting
  `_`-prefixed files (see Proposed fix 3). It currently deletes *every* file in
  `.todo-progress/` untouched for a day, `_green` included, which would erase a weekly-push
  record.
- `scripts/todo-progress-lib.mjs` (new) — `fingerprint()` and the new record/verify functions,
  extracted from the CLI so the reporters and the hook can import them. The CLI file runs
  top-level code on import, so it cannot be imported as a module today.
- `scripts/todo-progress.spec.js` (new) — unit spec for the library.
- `scripts/test-progress/vitest.mjs`, `scripts/test-progress/playwright.mjs` — call the library
  when a run finishes. These reporters are already loaded on every run (`CLAUDE.md` Conventions),
  so no new flag is needed and a run started by hand records itself.
- `.githooks/pre-push` (new) — runs the LFS hook, then `node scripts/todo-progress.mjs stamp
  verify-push`.
- `.githooks/post-commit`, `post-checkout`, `post-merge` (new) — copies of the git-lfs stubs now
  in `.git/hooks/`; they are lost the moment `core.hooksPath` is set.
- `.github/workflows/ci.yml` — drop the `push` and `pull_request` triggers; keep
  `workflow_dispatch` and add `workflow_call` so `release.yml` can reuse it. Rewrite the header
  comment and the `concurrency` expression that tests `github.event_name == 'pull_request'`.
- `.github/workflows/release.yml:39-50` — replace the "Require a green CI run on this commit"
  step (Proposed fix 2).
- `package.json` — `prepare` script (hook install).
- `.claude/commands/commit.md` (and the message-writing step of `fix-todo.md` / `run-todos.md`
  if they write messages themselves) — append the `Known-failures:` trailer from `stamp attest`.
- `scripts/release-workflow.spec.js`, `scripts/workflowLfs.spec.js` — assert on the workflow
  files and need updating with them.

No new gitignore entry: results live in `.todo-progress/`, already ignored.

## Proposed fix

**1. Turn CI off for push.** `ci.yml` becomes `on: { workflow_dispatch: {}, workflow_call: {} }`.
Drop `pull_request` too: there are no PRs yet, and a PR trigger would bill the first time one is
opened. Note in the header that `pull_request` should come back when PRs start. `pages.yml` and
`release.yml` already have no push trigger; confirm no other workflow, Dependabot config or
branch-protection rule starts a run on push.

**2. Release gate.** `release.yml` currently needs a green `ci.yml` run on the commit, which will
no longer exist. Recommended: `release.yml` calls `ci.yml` as a `workflow_call` job and the
release job `needs:` it, so CI costs money once per release. That is deliberate and matches how
`build-013` treats Pages. Alternative: drop the CI requirement and trust the stored local
results. Rejected as the default, because they live on one machine and a release is the one
moment worth a clean-room run. Put the choice in the task's resolution note if the user prefers
the cheaper option.

**3. Store results beside the green stamp.** Add `.todo-progress/_runs.json`, one entry per suite
(`unit`, `e2e`), each overwritten by the latest run:

```json
{ "e2e": { "fingerprint": "<sha256>", "scope": "full", "passed": 4151, "failed": 1,
           "skipped": 1136, "failures": ["file > title > project"], "at": "<ISO>" } }
```

- `fingerprint` is the existing `fingerprint()`: sha256 over every tracked-or-untracked,
  non-ignored file except `TODO/`, `chat/` and `.todo-progress/`. Reuse it unchanged, so the
  green stamp and the stored results mean the same thing by "this code". A run on a tree with
  uncommitted changes simply never matches a commit's fingerprint, so no separate dirty flag.
- The reporter takes the fingerprint at **start** and again at **end** of the run. If they
  differ, someone edited the tree mid-run and the entry is stored with `moved: true`, which
  never attests (a 25-minute e2e run makes this realistic).
- `scope` is `full` or `partial`. Unit is full when no file or name filter was passed. E2e is
  full only when no `--project`, `--grep`, `--last-failed`, `--shard` or file filter was passed
  and all nine engine/viewport projects ran. Only `full` attests, the same rule `/test` already
  applies to `stamp set`. Read the filters from what Playwright's `FullConfig` and Vitest's
  instance expose, not by parsing `process.argv`; verify what is available.
- `failures` ids are stable: `file > title` for unit, `file > title > project` for e2e.
- `prune()` skips names starting with `_`. The Claude Code progress mod polls this directory
  (its file format is the contract named in the header of `todo-progress.mjs`); `_batch` and
  `_green` already live there, so a new `_` file should be ignored by it, but check the mod
  before relying on that.

`stamp set` keeps its meaning and its callers (`/test`, `/fix-todo`). Do not change it to read
the new file; `_green` stays the "everything passed" fast path and `_runs.json` is the fuller
record.

New subcommands:

- `stamp results` — prints each suite's scope, counts and age, and whether it matches the
  current tree. For humans.
- `stamp attest` — prints the `Known-failures:` trailer lines for the current tree's stored
  failures, ready to paste into a commit message; prints nothing and exits 0 when none.
- `stamp verify-push` — the hook entry point (Proposed fix 4).

**4. The check (`stamp verify-push`).** Reads the hook's stdin for the refs being pushed
(`<local ref> <local sha> <remote ref> <remote sha>`; remote sha all zeros for a new branch).
Only pushes of `refs/heads/main` are checked; tags and ref deletions pass. For the tip being
pushed, compute the fingerprint **from that commit's tree** with `git ls-tree -r -z <tip>`,
applying the same path exclusions and hashing the same way. Blob ids from `ls-tree` equal what
`git hash-object` gives the working-tree file, so a clean working tree produces the identical
fingerprint. Using the commit rather than the disk matters: a push sends commits, not whatever
happens to be in the working directory. Then:

- `unit` or `e2e` entry missing, `scope !== 'full'`, `moved`, or fingerprint mismatch: refuse,
  naming the suite and the command to run.
- both match: gather `failures`. If none, allow. If some, run `git log <remote sha>..<tip>`
  and require every failure id to appear in a `Known-failures:` trailer in that range; list the
  ones that do not, and refuse.

The check does **not** run the tests. A nine-project e2e matrix runs about 25 minutes (1461 s in
the latest `test-report-for-coding-agents/all-failures.md`), far too long for a hook, and the
requirement is "has run", not "run it for me".

Known cost, to state in `CONTRIBUTING.md` rather than engineer around: the fingerprint covers
everything except `TODO/` and `chat/`, so a commit that edits `docs/`, `CLAUDE.md` or any other
`*.md` after the last test run invalidates the stored results and forces a full re-run. That is
the correct answer for `docs/`, since `e2e/docs-media.spec.js` reads it. If it proves
annoying, a `--paths` narrowing on `verify-push` is the follow-up, as its own task.

**5. Install the hooks, keep LFS.** Hooks move to a versioned `.githooks/` directory and
`package.json` gets `"prepare": "git config core.hooksPath .githooks"` (skip quietly outside a
git checkout, since `npm ci` in other contexts runs it too). `core.hooksPath` replaces
`.git/hooks` entirely, so `.githooks/` must carry all four git-lfs hooks, and `pre-push` must
buffer stdin once and feed it to both `git lfs pre-push "$@"` and the check. Run LFS first.
`git push --no-verify` remains the documented escape hatch; say so in `CONTRIBUTING.md` and do
not try to block it.

**6. Commit workflow.** `/commit` appends the trailer from `stamp attest` when the stored
results match the tree being committed and have failures. It does not run the tests.

## Effort

M (a few hours). The hook plumbing is small; the care is in the library extraction, full-versus-
partial detection, the mid-run `moved` check, and not breaking LFS.

## Testing

Unit (`scripts/todo-progress.spec.js`), with `git` and the filesystem injected so no real
repository or network is touched:

- `fingerprint()` from the working tree and from a commit tree agree on a clean checkout (use a
  throwaway repo in the scratchpad); an untracked file, a change under `src/` or in
  `package-lock.json` changes it; a change under `TODO/` or `chat/` does not.
- `verify-push` refuses on: missing entry, partial scope, `moved`, mismatched fingerprint; each
  message names the right suite and command.
- Matching entries, zero failures: allows.
- Matching entries with failures: refuses with no trailer, refuses when the trailer lists only
  some, allows when it lists all; the trailer may sit in any commit of the range, not only the tip.
- New-branch push (remote sha all zeros), tag push, ref deletion: handled without a crash.
- `prune()` leaves `_runs.json` and `_green` in place after a simulated two-day-old mtime, and
  still removes an old step file.
- Reporter specs: a filtered Playwright or Vitest run stores `scope: 'partial'`; a tree edit
  between start and end stores `moved: true`; `stamp set` behaviour is unchanged.
- `scripts/release-workflow.spec.js` and `scripts/workflowLfs.spec.js` updated for the new
  `ci.yml` triggers and release gate; add an assertion that `ci.yml` has no `push` or
  `pull_request` key, so the cost leak cannot return silently.

No real `*.e2e.js` is needed: this adds no app control. Playwright is only the thing observed.

Manual, to log in `TODO/VERIFY.md` because it needs a real git remote:
1. Create a scratch bare remote (`git init --bare` in the scratchpad) and push to it with the
   hook active. Walk the matrix: no result (refused), partial e2e (refused), full and green
   (allowed), full with failures and no trailer (refused), with trailer (allowed).
2. Confirm the LFS objects for a changed `docs/media/*.gif` arrive at that remote, proving the
   buffered stdin reached `git lfs pre-push`.
3. After the first real push to `origin`, confirm the Actions tab shows no new run.

`TODO/ACCEPTANCE.md` scenarios this could break: none, no app code changes.
Chromium only: nothing here touches WebGL, WASM, canvas, touch or persistence.

Closed findings re-run: `build-013` (release gate: run `scripts/release-workflow.spec.js` and
read the resulting job graph; dispatch against a scratch commit if the user agrees to the
cost) and `build-012` (LFS in CI and Pages: the docs GIFs must still be pointer files in CI and
still upload on push).

Note for the implementer: the first push after this lands is refused until
`npm run test:e2e:headless` has completed once, because no result exists yet.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
