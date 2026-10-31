# Home page at warpcad.com: generator, host and links

**Status:** accepted 2026-10-31, from `TODO/M20-docs-026-home-page-site-decision.md` (App Store support URL answered by the owner the same day: GitHub Issues). The generator
(VitePress) and the canonical host (`warpcad.com`) are the owner's decisions of 2026-10-31. Analytics
is wanted, but its provider is not chosen yet, and the CSP and privacy parts of this record depend on
that choice. Health-check figures were taken from `gh api` and `npm view` on 2026-10-31.

## What the page needs

- **One page now, a few later.** A hero, what WarpCad does, a list of the docs, and source and support
  links. The docs themselves stay in the app's Help (`https://app.warpcad.com/#/help/<slug>`).
- **A generator that already fits the stack.** The app is Vue 3 and Vite, so a Vue-and-Vite generator adds
  no new framework family to learn or to keep current.
- **A stable release.** The site is public, so the generator must have a tagged stable version, not an alpha.
- **Source next to the build**, as the app has (`docs/decisions/hosting.md`).

## Options compared

Figures are from GitHub (`gh api repos/...`) and npm on 2026-10-31. "Contributors" counts everyone who has
committed, not maintainers. Where a number was not retrieved, the cell says so rather than guessing.

| Option | Stars | Open issues | Closed issues | Stable release | Contributors | Licence (GitHub) | Notes |
|---|---|---|---|---|---|---|---|
| **VitePress** (chosen) | 18,448 | 376 | 2,551 | **1.6.4** (npm `latest`, 2025-08-05); 2.0 is alpha (`next`, 2026-10-25) | 440 | MIT | Vue and Vite; Markdown-first; the docs site of Vue and Vite themselves |
| Vite multi-page (no generator) | 83,636 (Vite) | 823 (Vite) | not retrieved | 8.3.5 (npm `latest`, 2026) | 1,385 (Vite) | MIT | Already in the stack; no page routing, navigation or Markdown, so the navigation would be hand-written |
| Astro | 63,626 | 122 | 6,757 | 7.4.4 (GitHub release, 2026-10-28) | 1,259 | **NOASSERTION** | Large, its own content model and build; GitHub did not detect a licence, so it would need a manual check |
| Eleventy | 20,001 | 167 | not retrieved | 3.1.7 (2026-10-15) | 131 | MIT | Healthy and small; a template language outside the Vue stack |
| Plain HTML and CSS with a zero-dependency build (the earlier proposal) | n/a | n/a | n/a | n/a | n/a | n/a | No dependency to approve; no navigation or Markdown, so the build script grows with every page |

Bundle size was not measured for any option. That is a gap, not a finding.

## Decision

**VitePress, pinned to the stable 1.6.x line** (1.6.4 at the time of writing).

- It runs on the Vite the app already uses, and it is Vue-based, so the stack gains one build tool it
  shares with the app, not a second framework family.
- It is Markdown-first, which suits the docs-group and page-list work in `docs-027`.
- **Do not adopt 2.0 while it is alpha.** The `next` tag is 2.0.0-alpha.21, and GitHub's "latest release"
  for the repository is that same alpha. A 2.0 upgrade is a later decision, made when 2.0 is stable.

**Revisit when:** VitePress 2.0 is stable (a new decision, not an upgrade), or the page needs a blog or more
than a handful of pages that the docs-groups list cannot cover.

## Rejection table

| Option | Why it lost |
|---|---|
| Vite multi-page, no generator | The app already has Vite, but nothing would render the list of pages or its navigation, so each page would be hand-wired. VitePress gives the same Vite build with that layer included. |
| Astro | Largest of the options, with its own content model and build. Its licence is not detected by GitHub, so it would need a manual check before any adoption. Nothing in the app needs what it adds over VitePress for a site of this size. |
| Eleventy | Healthy and MIT, and the smallest of the library options. It is a second template language outside the Vue stack, and it would be the only non-Vue tool in the project. |
| Plain HTML with a zero-dependency build | This was the earlier proposal: no dependency and fast on a phone. The owner chose a generator instead. It is still the right call if the site stays at one or two pages; `docs-026`'s own revisit line (more than about three pages, or a blog) applies. |

## Consequences that are still open

- **Analytics: Google Analytics 4 (owner, 2026-10-31).** The earlier proposal's `script-src 'none'` and "no
  third-party requests" no longer hold for this page. The app already runs GA4 under the policy in
  `docs/decisions/analytics.md` (`script-src` on `www.googletagmanager.com`; `connect-src` and `img-src` on
  `*.google-analytics.com` and `*.analytics.google.com`). The home page should use that same policy, not a
  looser one. `docs-027` (the page content) and `build-021` (the scaffold) must be corrected to match.
- **Which GA4 property? A new one, for `warpcad.com` (owner, 2026-10-31).** The home page has its own GA4
  property, its own web data stream for `https://warpcad.com`, and Measurement ID `G-JQS0CFWW6C`. The app's
  property (`G-JFYXCZJ1HN`, `TODO/VERIFY.md` build-007) is untouched, so each site's reports show only its own
  data, with no filter to remember. The ID is public, as every GA4 Measurement ID is, so it is recorded here.
- **Privacy text.** `docs/privacy.md` describes the app's analytics. The home page needs its own wording, since
  it is a separate site with its own visitors.
- **Canonical host.** `warpcad.com` is the canonical host, with `www.warpcad.com` redirecting to it (as proposed).
  Both records still point at Squarespace's parking servers, so the DNS change belongs to `build-022`.
- **App Store support URL: GitHub Issues (owner, 2026-10-31).** The support URL is the issue tracker on
  `WarpCad/warpcad`, not `https://warpcad.com/`. So `build-020` does not depend on `build-022` for this.
  The home page's Support section still links the same issue tracker (`docs-027`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
