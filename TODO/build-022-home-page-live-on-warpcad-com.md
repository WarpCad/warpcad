---
title: Put the home page live on warpcad.com without disturbing app.warpcad.com
category: build
kind: feature
priority: medium
model: sonnet
milestone: M20
depends: [docs-027]
status: open
---

> **Owner steps.** Pushing, creating the repository, the Squarespace DNS changes and the GitHub
> Pages settings are all outward-facing and are the owner's to do or approve. This task prepares
> the exact steps, waits, and verifies. It mirrors `build-010`, which brought `app.warpcad.com`
> live on 2026-10-17 (`TODO/VERIFY.md` "build-010").

## Goal

Done means `https://warpcad.com/` serves the `docs-027` home page over enforced HTTPS,
`https://www.warpcad.com/` redirects to it (or the reverse, per `docs-026` question 3),
`https://app.warpcad.com/` still serves the app unchanged, and the domain is **verified** for the
WarpCad organisation so that no other GitHub account can claim a `warpcad.com` host.

## Interaction model

n/a inside the app: no control changes. The visitor-facing outcome is `docs-027`'s, now at its
real address. The live check below drives it.

## Documentation

- **Page**: this repository's `docs/README.md` and `README.md` get the `warpcad.com` link that
  `docs-027` deferred until the domain is live. `docs/decisions/hosting.md` gets a short
  "Home page (`build-022`)" section: the DNS records, the verified domain, and the date it went
  live.
- **Example**: n/a (no new control). The live check reuses `docs-027`'s example verbatim.
- **Media**: none.

## Affected files

- `~/src/@WarpCad/warpcad.github.io`: nothing new unless a check fails.
- This repository: `docs/README.md`, `README.md`, `docs/decisions/hosting.md`, a new
  `TODO/VERIFY.md` section "build-022 — Owner checks to bring warpcad.com live".

## Proposed fix

Write the `TODO/VERIFY.md` section as a numbered table, in this order, and walk the owner
through it:

1. **Repository**: `gh repo create WarpCad/warpcad.github.io --public --source
   ~/src/@WarpCad/warpcad.github.io --push` (owner runs or approves). The Pages workflow's first
   run deploys to `https://warpcad.github.io/`. Check that address shows the page.
2. **Verify the domain for the org first**, before any DNS points at GitHub, to rule out a
   takeover: GitHub → WarpCad org Settings → Pages → *Add a domain* `warpcad.com`, then add the
   `TXT` record `_github-pages-challenge-WarpCad` it shows at Squarespace Domains. Verify it.
3. **Squarespace Domains DNS**: remove the four Squarespace `A` records on `@`
   (`198.49.23.144`, `198.49.23.145`, `198.185.159.144`, `198.185.159.145`) and the `www` CNAME
   to `ext-sq.squarespace.com`. Add `A @` → `185.199.108.153`, `185.199.109.153`,
   `185.199.110.153`, `185.199.111.153`; `AAAA @` → `2606:50c0:8000::153`, `2606:50c0:8001::153`,
   `2606:50c0:8002::153`, `2606:50c0:8003::153`; `CNAME www` → `warpcad.github.io`. **Leave the
   `app` CNAME exactly as it is.** Re-check GitHub's current IPs in its Pages docs on the day; do
   not trust this list blindly. If Squarespace has a site or email (MX) on the domain, check with
   the owner before removing anything.
4. **Repository `WarpCad/warpcad.github.io` Settings → Pages**: Source "GitHub Actions", custom
   domain `warpcad.com` (matching `dist/CNAME`), Save; wait for the DNS check to go green.
5. Once the certificate is issued, **Enforce HTTPS**.
6. `dig +short warpcad.com A` prints the four GitHub addresses; `dig +short www.warpcad.com
   CNAME` prints `warpcad.github.io.`; `dig +short app.warpcad.com CNAME` still prints
   `warpcad.github.io.`.
7. `curl -sI http://warpcad.com` is a 301 to `https://warpcad.com/`; `https://www.warpcad.com`
   redirects to `https://warpcad.com/`; `https://app.warpcad.com/` is 200 and the Help version
   line still shows the last app deploy's commit.
8. `https://warpcad.github.io/warpcad/` (the app's old project-site address) redirects to
   `https://app.warpcad.com/` and is **not** served under `warpcad.com/warpcad/`. Record what
   happens; `docs-026` question 2 predicted it.
9. **Live check, by hand**, at phone (390×844), tablet and laptop, in Safari on the owner's
   iPhone or iPad plus one desktop browser: run `docs-027`'s example, then tap **Open WarpCad**
   and do acceptance scenario 1 (place a box and a sphere; both stay visible).
10. The next scheduled run (the day after) succeeds, and the deployed
    `help-index.snapshot.json` matches the app's live `help/index.json`.

Then make the deferred `docs/README.md` and `README.md` edits, and the `hosting.md` section.

## Effort

S of agent work. The DNS and certificate wait is the owner's and can take hours.

## Testing

- The VERIFY table's rows 6–10 are the tests. Each is Pass/Fail with the date and the output
  pasted, as `build-010`'s were.
- **Acceptance scenarios to re-drive**: **1** on the live app reached from the home page, at
  phone and laptop width (row 9). Any DNS mistake that touches `app` would show here first.
- **Closed findings to re-run**: `build-010` rows 4 and 5 (the app loads, its manifest's
  `scope` and `start_url` are `/`, and `sw.js` loads). An org-site custom domain must not change
  the app's base path.
- **Milestone end**: this is M20's last row. `/run-todos` pauses here for the five-minute
  free-form pass: the owner opens `warpcad.com` cold on the phone, tablet and laptop and tries to
  find the docs for something they want to do, with no script.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
