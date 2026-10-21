# App Store licensing: how the owner can ship the iOS app under other terms

**Status:** Mechanism decided (CLA). Part 2 audit recorded for the npm packages. The native-package
and asset audits wait for the Capacitor shell (`build-003`). The GitHub settings are a checklist the
owner applies, not yet applied. The lawyer review (Part 6) is **not done**.

**Decided:** 2026-10-21, iOS App Store only (ROADMAP row `build-016`). Android and sideloading are
out of scope; see the native shell record, Question 7.

**Not legal advice.** This is general engineering guidance. Part 6 below is the gate for legal
review before any App Store submission.

## Why this is needed

The public code is AGPL-3.0-or-later. The App Store's terms add restrictions the AGPL forbids a
distributor from adding. VLC was removed from the App Store in 2011 over this conflict. A copyright
holder is not bound by their own licence, so the owner can ship an App Store build under other
terms, **but only for code the owner owns or has been licensed to relicense**.

Today that is all of the code: `git shortlog -sne HEAD` lists one author, John Cole, with 468
commits, and no outside contribution has been merged. The DCO certifies that a contributor may submit
a change under the project licence. It does not grant the owner any right to relicense it. So the
first accepted outside pull request would put code in the app that could not go on the App Store
without that contributor's consent. The CLA is cheap to collect before the first contribution and
hard to collect after it.

## Part 1: The mechanism

### Options compared

| Option | Does it grant relicensing? | Needs a signature? | Notes |
|---|---|---|---|
| **CLA granting the owner a relicensing right** (chosen) | Yes: a perpetual, irrevocable, worldwide, sublicensable grant. The contributor keeps copyright. | Yes, once per contributor | Model: an Apache-style grant, written as an original document (`CLA.md`), not copied. Familiar to app-store lawyers. |
| AGPL section 7 "additional permission" naming App Store distribution | Only as far as the wording goes | No | Every contributor already licenses under the AGPL text, so it needs no signature. But it is harder to word, is rarely used, and the exception text becomes part of each file's effective licence. |
| DCO only; the owner ships the AGPL build as-is | No | Sign-off only | Leaves the VLC conflict standing. Rejected unless the owner decides to accept it. |
| Copyright assignment | Yes, strongest | Yes, a transfer | Most off-putting to contributors, and not legally portable everywhere. |
| Stay sideload-only (no App Store) | Not needed | No | Out of scope for this record: the owner's hardware is iPhone only, and the owner chose the App Store. |

### Rejection table

| Runner-up | Why it lost |
|---|---|
| AGPL section 7 exception | Weaker and less tested than a CLA. It would also bind every future user of every file, not only the App Store build. |
| DCO only | Does not solve the problem. It would certify rights the owner cannot use for the store. |
| Copyright assignment | Heavier than needed. A licence grant gives the owner the same right without taking contributors' copyright. |
| Sideload only | Drops the App Store, which is the owner's chosen target. |

### AI-assisted commits

Commits written with an AI tool carry a `Co-Authored-By` trailer. The owner submits and signs off on
them. The owner should state, in the Part 6 review, what the owner has concluded about whether model
output carries any third-party claim. This record does not decide that.

### CLA effective date

The CLA takes effect on the commit that lands `CLA.md`. Every commit before that is the owner's own
work. Evidence at the time of writing (`git shortlog -sne HEAD`, 2026-10-21):

```
   468	John Cole <230922+johnwebbcole@users.noreply.github.com>
```

## Part 2: What the iOS bundle contains

Dual licensing covers only code the owner can license. Anything else in the bundle has to be
independently safe for the App Store.

### npm production dependencies (audited 2026-10-21)

`npx license-checker@25.0.1 --production --excludePrivatePackages --csv` returned 47 packages.

| Licence | Count | Packages |
|---|---|---|
| MIT | 41 | `@babel/*`, `@jscad/*` (array-utils, modeling, obj-serializer, stl-serializer), `@sentry/*` (11.8.0 and conventions 0.27.0), `@vue/*`, `birpc`, `csstype`, `estree-walker`, `hookable`, `magic-string`, `nanoid`, `nostics`, `perfect-debounce`, `pinia`, `postcss`, `three`, `vue`, `@jridgewell/sourcemap-codec` |
| ISC | 2 | `idb`, `picocolors` |
| BSD-2-Clause | 1 | `entities` |
| BSD-3-Clause | 1 | `source-map-js` |
| Apache-2.0 | 2 | `typescript`, `web-vitals` |
| **MPL-2.0** | **0** | none shipped |
| **CC-BY-4.0** | **0** | none shipped |

So nothing shipped needs a file-level copyleft or an attribution notice beyond the existing
third-party notices (`TODO/build-011`). The allow-list in `package.json`'s `licenses` script is
unchanged.

`typescript` is a `devDependencies` entry in `package.json`, yet `--production` reports it, so some
production package pulls it in. Whether any of it reaches the bundle is **unverified**; its licence
is Apache-2.0 either way, so the answer does not change the outcome.

### Native dependencies (not yet audited)

Capacitor core and its plugins bring Swift, Objective-C, CocoaPods or SwiftPM packages, which
`license-checker` cannot see. **Nothing native is in the project yet**: the shell is a research
task (`build-003`). The native audit is a condition of that shell landing. Reject any GPL, LGPL or
AGPL pod outright.

### Assets (not yet audited)

Fonts, the sample and library parts, example projects under `examples/`, imported mesh fixtures,
icons, and the Help GIFs and screenshots under `docs/media/` and `docs/screenshots/` each need a
licence and a source before the iOS bundle includes them. Anything the owner did not create and
cannot show a permissive licence for stays out of the bundle.

### The prose licence (owner's choice, open)

`docs/` and the Help content are CC BY-SA 4.0. That licence forbids applying effective technological
measures that restrict recipients, and Apple's encryption of the app binary is one. The owner
chooses one of:

- **(a)** Relicense the owner's own docs for the app copy. This is possible only because the owner
  owns them. Contributors to docs sign the same CLA.
- **(b)** The app loads Help from the web and ships none of it.

Either way, the public repository's CC BY-SA marks stay unchanged. The 89 MB of Help GIFs (the
native shell record's Decision 7) is decided at the same time.

## Part 3: The CLA and the signing check

- `CLA.md`: a draft. Its governing-law clause is a placeholder until the Part 6 review.
- `CONTRIBUTING.md` step 3 explains the CLA and why it sits beside the DCO.
- `LICENSING.md` has a "Distribution under other terms" section.
- The app's AGPL section 13 source link (Part 3 step 4) is **not yet verified** in-app. If it is
  missing, file a `ui-` finding. This record does not add UI.

### Health check: `contributor-assistant/github-action` was not used

The plan named `contributor-assistant/github-action` (CLA Assistant Lite). Its health check, run
2026-10-21:

| Measure | Value |
|---|---|
| Stars | 350 |
| Open issues | 38 |
| Last push | 2026-03-23 |
| Latest release | v2.6.1 (commit `ca4a40a7d1004f18d9960b404b97e5f30a505a08`) |
| **Archived** | **Yes, archived 2026-10-21 13:15 UTC, the day of this record** |

An archived action gets no further fixes or security patches. So the check is written in-repo as
`.github/workflows/cla.yml` on `actions/github-script`, which is first-party and pinned to a commit
SHA (`f28e40c7f34bde8b3046d885e986cb6290c5673b`, tag v7). Health check of that action:

| Measure | Value |
|---|---|
| Stars | 5,040 |
| Open issues | 94 |
| Last push | 2026-04-09 |
| Archived | No |

**Owner to decide:** the in-repo check is the workflow's own code, about 100 lines, and it needs
review like any other. If the owner would rather depend on a maintained third-party CLA action,
replace `cla.yml` with that action, pinned by SHA, and keep the signatures file format.

### Signatures and allow-list

- Signatures are written by the `cla` workflow to `.github/cla-signatures.json` on a `cla-signatures`
  branch. The branch is created on the first signature. The main branch does not carry the file yet,
  so the local backstop treats the repository as owner-only until the branch is merged or the file is
  copied over.
- Allow-listed: the owner (`johnwebbcole`), `dependabot[bot]` and `github-actions[bot]`. The reason is
  in the workflow and in `.github/dependabot.yml`: bots change lockfiles and workflow pins, not
  authored code.

## Part 4: Repository settings (checklist, not applied)

The owner applies these in the GitHub web UI or with `gh api`. This task does not change settings.

- [ ] **Ruleset on `main`:** require a pull request; require the status checks `cla` and `dco`; block
  force-pushes and deletions; dismiss stale approvals. Decide whether the owner may bypass (the owner
  pushes direct; the pre-push gate from `build-014` still applies).
- [ ] **Code owners:** require review from code owners (`.github/CODEOWNERS`).
- [ ] **Contributor settings:** require approval for workflows from first-time contributors; restrict
  who can push to `main` and tags; turn on private vulnerability reporting if `SECURITY.md` does not
  already route it.
- [ ] **Squash merge:** decide the policy. A squash commit takes the PR author, and `Signed-off-by`
  lines can be lost. Configure the default to the PR title and description, and confirm the sign-off
  survives, or require the merger to keep it. **Outcome: not yet decided.**
- [ ] **PR template:** done (`.github/pull_request_template.md` has the CLA line).
- [ ] **`ISSUE_TEMPLATE/`:** not altered.

`ci.yml` still runs on `workflow_dispatch` and `workflow_call` only (`build-014`). The `cla` and `dco`
checks are separate workflows on `pull_request_target`, so they run without the test suite.

## Part 5: Local backstop

`scripts/check-contributors.mjs` runs from `.githooks/pre-push`. It lists the commits each push would
add, using `git log` only (no network), and refuses a commit whose author is neither the owner, an
allow-listed bot, nor a signer. Its unit spec is `scripts/check-contributors.spec.js`. Matching is
case-insensitive. A `+tag` form of the owner's address is refused, on purpose.

## Part 6: Human gate (NOT DONE)

Before App Store submission, the owner has these reviewed by a lawyer or equivalent:

- the VLC-style conflict and the mechanism chosen here,
- the CLA's enforceability, including its governing-law clause (still a placeholder),
- the AI-assisted authorship question,
- the docs-licence choice.

**Reviewer:** none yet. **Date:** not yet. **Skipped deliberately:** no. This task does not block on
it; the store submission does.

## Verification still outstanding

These need a second GitHub account or the owner's hand. This record does not claim them.

- A throwaway fork or test PR from a second account: unsigned PR shows failing `cla` and `dco`; signing
  flips `cla` green; the merge button is blocked until both pass; the owner's and Dependabot's PRs are
  exempt. Evidence (PR links) goes here when run.
- A scratch-remote push walk of the new pre-push hook, as the owner (passes) and as a made-up author
  (blocked), plus `build-014`'s original scratch-remote steps.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
