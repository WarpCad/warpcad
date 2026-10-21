---
title: Dual-licence for the iOS App Store: CLA, licence text, and repo settings that enforce them
category: build
kind: feature
priority: high
model: sonnet
depends: [build-003]
status: open
---

## Goal

Make it safe to ship WarpCad on the Apple App Store while the public repository stays
AGPL-3.0-or-later, and make the repository itself refuse contributions that would break that.

Why it is needed (`docs/decisions/native-mobile-shell.md`, Decision 8): the App Store's terms add
restrictions the AGPL forbids a *distributor* from adding (VLC was removed in 2011 over exactly
this). A copyright holder is not bound by their own licence, so the owner can ship an App Store
build under separate terms, **but only for code the owner owns or has been licensed to
relicense**. Today that is everything: `git shortlog` shows one author (John Cole, 466 commits)
and no outside contribution has been merged. The DCO in `CONTRIBUTING.md` certifies the right to
submit a change under the project licence; it grants the owner no right to relicense it. So the
first accepted outside pull request would put code in the app that cannot go on the App Store
without that contributor's consent. This task closes that gap **before** the first one arrives,
because consent is cheap to collect up front and hard to collect afterwards.

Done means: all six parts below are merged, and a pull request from an account that has not
signed the CLA shows a failing required check that blocks the merge button.

This is general engineering guidance, not legal advice. Part 6 is a human gate.

## Interaction model

n/a — no user-visible control in the app. The only surfaces are GitHub (the PR check) and the
Markdown files below.

## Documentation

n/a for end-user docs (no app control changes). The developer-facing pages are the deliverable:
`CONTRIBUTING.md`, `LICENSING.md`, `docs/decisions/app-store-licensing.md`. Concrete usage
example, which goes into `CONTRIBUTING.md`: "open a PR; the CLA bot comments; reply with
`I have read the CLA Document and I hereby sign the CLA`; the check turns green; sign your commits
with `git commit -s`".

## Problem

Not applicable (feature). The risk being removed is described in Goal.

## Affected files

- `CLA.md`                                    (new: the contributor licence agreement, CC BY-SA 4.0 like other prose)
- `CONTRIBUTING.md`                           (step 2 gains the CLA; explains dual licensing and why)
- `LICENSING.md`                              (new "Distribution under other terms" section; table row for docs in the app)
- `docs/decisions/app-store-licensing.md`     (new: options compared, rejection table, the decision, the lawyer-review note)
- `.github/workflows/cla.yml`                 (new: the CLA check on pull requests)
- `.github/workflows/dco.yml`                 (new: the sign-off check; see Part 4)
- `.github/CODEOWNERS`                        (new)
- `.github/pull_request_template.md`          (checklist gains the CLA line)
- `.github/dependabot.yml`                    (comment only: bots exempt, why)
- `scripts/check-contributors.mjs` and `scripts/check-contributors.spec.js`   (new: local backstop, Part 5)
- `.githooks/pre-push`                        (calls the backstop)
- `.github/cla-signatures.json`               (new: signatures, written by the bot; see Part 3)
- `README.md`                                 (one sentence pointing at the dual-licensing note)
- `scripts/licenses` / `package.json` `licenses` script (only if Part 2 changes the allow-list; the owner decides)

No file under `src/` changes, and **no SPDX marker is altered** (`CLAUDE.md`: never remove or
change one). Dual licensing is a grant by the owner, not a change to the public licence the
markers state.

## Proposed fix

### Part 1 — Decide the mechanism (write `docs/decisions/app-store-licensing.md` first)

Compare, per the Library decisions process, and record the choice and a rejection table:

| Option | Notes to verify and record |
|---|---|
| **CLA granting the owner a relicensing right** (recommended) | Contributor keeps copyright, grants the owner a perpetual, irrevocable, worldwide licence including the right to sublicense under other terms. Model: Apache ICLA, or the lighter Harmony/Fedora-style templates. Established, understood by app stores' lawyers. |
| AGPL §7 "additional permission" naming App Store distribution | Needs no signature, because every contributor licenses under the text. Harder to word correctly, less common, and the exception text becomes part of every file's effective licence. |
| DCO only, owner distributes the AGPL build as-is | Leaves the VLC conflict standing. Rejected unless the owner decides to ignore it. |
| Copyright assignment | Strongest, most off-putting to contributors, and not legally portable everywhere. |
| Stay Android/sideload-only | Out of scope: the owner has an iPhone and no Android hardware. |

Record the owner's decision and the date, **and the date the CLA took effect** (every commit before
it is the owner's own; `git shortlog -sne` on that date is the evidence — paste it in).
Note that AI-assisted commits carry a `Co-Authored-By` trailer and are submitted by the owner, who
holds and signs off on them; say so explicitly, and say what the owner has concluded about
whether model output carries any third-party claim (this is a point for the Part 6 review, not
something this task decides).

### Part 2 — Audit what the iOS bundle contains

Dual licensing only covers code the owner can license. Anything else bundled must be
independently App-Store-safe. Produce a table in the decision record:

- **npm production dependencies:** `npm run licenses` already allow-lists MIT, ISC, BSD, Apache-2.0,
  0BSD, BlueOak, MIT-0, CC0, MPL-2.0 and CC-BY-4.0. Confirm each *shipped* package, and flag
  **MPL-2.0** (file-level copyleft: usually workable on iOS because source files stay available,
  but it is a licence term the owner should accept knowingly) and **CC-BY-4.0** (attribution).
  List the actual packages carrying those two licences.
- **Native dependencies are invisible to `license-checker`.** Capacitor core and every plugin the
  shell spike adds (file picker, Keychain, share sheet) bring Swift/Objective-C and CocoaPods or
  SwiftPM packages. Add a second audit step for them and record the licences; reject any GPL/LGPL/
  AGPL pod outright.
- **Assets:** fonts, the sample/library parts, example projects under `examples/`, imported mesh
  fixtures, icons, and the Help GIFs and screenshots under `docs/media/` and `docs/screenshots/`.
  State each one's licence and source. Anything the owner did not create and cannot show a
  permissive licence for stays out of the bundle.
- **The prose licence.** `docs/` and the Help content are CC BY-SA 4.0, which forbids applying
  effective technological measures that restrict recipients, and Apple's encryption of the app
  binary is one. Choose, and record: (a) the owner relicenses their own docs for the app copy
  (possible only because they own them; contributors to docs sign the same CLA), or (b) the app
  loads Help from the web and ships none of it. Either way the public repo's CC BY-SA marks are
  unchanged. Settle the 89 MB-of-GIFs size question at the same time (the record's Decision 7).

### Part 3 — The CLA and the contribution text

1. Write `CLA.md` from a recognised template. It must: say the contributor owns or may license
   the contribution, grant the owner the relicensing right above, state that the contributor
   retains their copyright, cover employers (a signer's employer may own their work), and say
   the public repository will keep distributing the contribution under AGPL-3.0-or-later
   (code) or CC BY-SA 4.0 (prose) regardless. Carry the SPDX marker at the end.
2. Add the CLA to `CONTRIBUTING.md` step 2 and keep the DCO beside it. Explain in two sentences why
   a CLA is needed, so it does not read as a surprise.
3. Add a "Distribution under other terms" section to `LICENSING.md`: the public licence is
   unchanged; the owner also distributes a separate build (the App Store app) under their own
   terms; that is possible because the owner holds, or is licensed by CLA to relicense, all the
   copyright; the app still offers the AGPL source link (§13).
4. Verify the app itself still offers a source link in-app (AGPL §13 applies to the public
   build). If it does not, file a separate `ui-` finding rather than adding UI here.
5. Wire the signing bot. Use `contributor-assistant/github-action` (CLA Assistant Lite): it runs
   on `pull_request_target` and `issue_comment`, never checks out the PR's code, stores signatures
   in `.github/cla-signatures.json` on a dedicated branch or in the repo, and fails the check
   until signed. Re-run the health check on that action the day this lands (stars, open/closed
   issue ratio, last release, maintainers) and record it, as `CLAUDE.md` requires for any new
   dependency. Pin the action to a commit SHA, not a tag.
6. Allow-list the owner and `dependabot[bot]` / `github-actions[bot]` in the bot's config, with a
   comment saying why: bots change lockfiles and workflow pins, not authored code. Anything else
   (including a collaborator with write access) signs.

### Part 4 — Repository settings that enforce it

Some of these are GitHub settings the owner has to apply in the web UI or with `gh api`; the task
documents each and verifies it, and does **not** change repository settings unprompted. Put the
exact settings in `docs/decisions/app-store-licensing.md` as a checklist.

- **Rulesets or branch protection on `main`:** require a pull request, require the `cla` and `dco`
  status checks, block force-pushes and deletions, dismiss stale approvals. Choose whether the
  owner may bypass (they will need to for direct pushes of their own work; the pre-push gate from
  `build-014` still applies).
- **Important interaction with `build-014`:** CI no longer runs on push or pull request
  (`ci.yml` is `workflow_dispatch` + `workflow_call`). The CLA and DCO checks are therefore
  **new, separate workflows** that run on `pull_request_target`/`pull_request`, so they exist even
  though the test suite does not. Do not fold them into `ci.yml`, and do not re-enable CI on push.
- **DCO check:** `dco.yml` verifies every commit in the PR has a `Signed-off-by:` matching its
  author, with a clear failure message quoting `git commit -s --amend` / `git rebase --signoff`.
- **`CODEOWNERS`:** owner required to review `LICENSE`, `LICENSE-DOCS`, `LICENSING.md`, `CLA.md`,
  `CONTRIBUTING.md`, `.github/**`, `package.json`, `package-lock.json`, `mcp/package.json`,
  `.githooks/**`, `scripts/spdx.mjs` and the `licenses` script. Turn on "require review from
  code owners".
- **Contributor settings:** require approval for workflows from first-time contributors, restrict
  who can push to `main` and tags, and turn on private vulnerability reporting if it is not already
  (`SECURITY.md`).
- **Squash-merge policy:** decide it. A squash commit is authored by the PR author but
  `Signed-off-by` lines can be lost; configure "default to PR title and description" and confirm
  the sign-off survives, or require the merger to keep it. Record the outcome in the decision record.
- **PR template:** add "I have signed the CLA" beside the sign-off line.
- **Do not alter** `.github/ISSUE_TEMPLATE/`; contributions arrive as PRs.

### Part 5 — A local backstop for pushes the PR checks never see

PR checks do not see a collaborator's direct push, or the owner merging by hand.
Add `scripts/check-contributors.mjs`: for the commits being pushed, every author email must be the
owner's, a bot on the allow-list, or present in `.github/cla-signatures.json`; otherwise exit 1
naming the author and commit. Call it from `.githooks/pre-push` next to the existing
`stamp verify-push`. It must be fast (git log only, no network) and tolerate a missing signatures
file by treating it as owner-only. Match the `.githooks/pre-push` style already there: read it first.

### Part 6 — Human gate: review by someone qualified

Before App Store submission, not before merging this task: the owner has the CLA text and the
"Distribution under other terms" wording reviewed by a lawyer or equivalent, covering the VLC-style
conflict, the CLA's enforceability, AI-assisted authorship, and the docs-licence choice. Record in
the decision record who reviewed it and when, or that it was deliberately skipped. This task does
not block on it; the App Store submission does.

### Out of scope (name the owner of each so nothing is silently dropped)

- Apple Developer enrolment, certificates, provisioning profiles and signing in CI: a later `build`
  task after the Capacitor spike (`build-003` follow-up row 1).
- Re-verifying `package.json`'s three.js pin (`0.186.1`) against `CLAUDE.md`'s `0.185.1`: separate
  docs correction.

## Effort

M — most of it is careful writing and GitHub configuration, little code. Parts 1, 2 and 6 are the
parts that need the owner's judgement; allow for a back-and-forth.

## Testing

- `scripts/check-contributors.spec.js` (Vitest, plain Node, mock `git` at the boundary): owner
  commit passes; allow-listed bot passes; unknown author fails and names the commit; author present
  in the signatures file passes; a different case or `+tag` form of the owner's email is handled
  deliberately (decide and test it); empty push and a new-branch push (all-zero old SHA) do not
  crash; missing signatures file means owner-only.
- A scratch-repository walk of the new pre-push hook, in the same way `build-014` logged its
  manual scratch-remote check in `TODO/VERIFY.md`: push as the owner (passes), push a commit by
  a made-up author (blocked). Re-run `build-014`'s original scratch-remote steps too, since this
  edits `.githooks/pre-push`, the subsystem that finding changed.
- The two workflows are verified on a throwaway fork or a test PR from a second GitHub account:
  unsigned PR shows a failing `cla` and `dco`; signing flips `cla` green; the merge button is
  blocked until both pass; the owner's and Dependabot's PRs are exempt. Record the evidence (PR
  links) in the decision record. This cannot be done with a unit test.
- `npm run spdx` passes (new `CLA.md` carries its marker; run `node scripts/spdx.mjs --fix`) and
  `npm run licenses` is unchanged unless Part 2 changes the allow-list.
- No `*.e2e.js` is added: nothing here is reachable from `/`.

Acceptance scenarios touched: none. No file under `src/` changes, so none of the scenarios in
`TODO/ACCEPTANCE.md` can regress.

Closed findings re-run: `build-014` (the pre-push gate), as above. No finding about the app
subsystems is extended.

Responsive layout and browser engines: not applicable, no runtime code.

## Notes for whoever picks this up

- Do not edit `LICENSE`, `LICENSE-DOCS`, or any SPDX marker. Dual licensing is described *around*
  them.
- Settings changes on GitHub are the owner's to apply. Print the exact `gh api` command or the
  menu path for each and ask before running anything that edits repository settings.
- If the owner later decides to take outside contributions only for code and not prose, or the
  reverse, the CLA scope in Part 3 changes; ask rather than guessing.
- Land this before the first outside pull request is merged. If one is already open when this task
  starts, do not merge it until its author has signed.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
