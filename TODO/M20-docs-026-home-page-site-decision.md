---
title: Decide how the warpcad.com home page is built, where it is served, and how it links the docs
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M20
depends: []
status: open
---

## Goal

The owner wants a WarpCad home page with links to the documentation, in a new repository
`~/src/@WarpCad/warpcad.github.io` (requested 2026-10-24). `docs/decisions/hosting.md` already
put the app on `app.warpcad.com` so that "the bare domain [stays] free for a landing page".
Nothing has been decided about that page yet. This task writes the decision record that the
other M20 rows build on, so that none of them chooses a generator, a domain, or a link scheme
on the side.

Done means `docs/decisions/home-page.md` exists, follows CLAUDE.md's Library decisions format
(options compared on features, size, stars, open/closed issue ratio, release recency and
maintainer count, plus a rejection table), and answers the questions below. The owner has
confirmed every answer marked **owner**.

### Questions the record answers

1. **Generator** (Library decision). Compare at least: hand-written static HTML and CSS with a
   zero-dependency Node build script; Vite multi-page (already in the stack); VitePress; Astro;
   Eleventy. **Proposed:** plain HTML and CSS plus a zero-dependency `scripts/build.mjs`, with no
   client-side JavaScript. Reasons: it is one page; no runtime dependency means nothing for
   `npm run licenses` to approve and no supply chain to watch; it loads fastest on a phone.
   Playwright is the only devDependency. Note when this should be revisited: when the site needs
   more than about three pages, or a blog.
2. **Repository and served path.** An organisation Pages site must live in a repository named
   exactly `WarpCad/warpcad.github.io` (case-insensitive), and is then served at
   `https://warpcad.github.io/`, today a 404. Record that `app.warpcad.com` keeps working: its
   CNAME already points at `warpcad.github.io`, and GitHub routes by `Host` header to the repo
   whose Pages settings name that domain. Also record that once the org site has the custom
   domain `warpcad.com`, any project site in the org *without* its own custom domain is served at
   `warpcad.com/<repo>`. `WarpCad/warpcad` has `app.warpcad.com`, so the old
   `warpcad.github.io/warpcad/` address redirects there. Check this, do not assume it.
3. **Canonical host** (**owner**): `warpcad.com` with `www.warpcad.com` redirecting to it
   (proposed), or the reverse. GitHub Pages handles the redirect when the apex and `www` both
   point at it. Today (`dig`, 2026-10-24) both resolve to Squarespace's parking servers
   (`198.49.23.144/145`, `198.185.159.144/145`; `www` is a CNAME to `ext-sq.squarespace.com`).
   Say whether anything on that Squarespace site needs to be kept.
4. **How docs are linked.** **Proposed:** link to the in-app Help, at
   `https://app.warpcad.com/#/help/<slug>`. The docs already render there, open offline once
   cached, and are the only rendering `npm run docs:media` keeps current. Rejected for now:
   publishing a second rendering of `docs/*.md` on `warpcad.com/docs/` (two renderings to keep
   in step, and a second copy of the ~70 MB of GIFs on Pages bandwidth). Record the cost of the
   choice: hash URLs are not indexed by search engines, so the docs pages do not appear in search
   results. Name GitHub's rendering of `docs/` (`github.com/WarpCad/warpcad/tree/main/docs`) as
   the indexable fallback, and add a **Revisit when** line: when search traffic matters.
5. **Where the list of pages comes from.** **Proposed:** at build time, from
   `https://app.warpcad.com/help/index.json`, which the app's build already publishes (31 pages,
   `{ order, pages: [{ slug, title, headings }] }`, served with
   `Access-Control-Allow-Origin: *`). Group the pages with a small committed `docs-groups.json`.
   A grouped slug missing from the index fails the build. An index page missing from the groups
   is listed under **More**, so a new docs page is never silently absent. Rebuild on a daily
   schedule plus manual dispatch, so a new docs page appears within a day without a token
   between the two repositories. Reject a runtime `fetch`: it needs client-side JavaScript, and
   the list should be in the HTML.
6. **Pictures.** The hero picture is the app's own generated docs screenshot
   (`app-overview.png`), fetched from `app.warpcad.com/help/img/screenshots/` at build time and
   served from the home page's own origin. It is never hand-captured, which follows the app's
   "pictures come from Playwright" rule. Hotlinking is rejected, because a rename in the app
   would break it without anyone noticing.
7. **Analytics and privacy** (**owner**). **Proposed:** none: no analytics, no cookies, no
   third-party requests, a CSP with `script-src 'none'`. The app's GA (`build-007`) stays the
   app's own concern.
8. **Licence.** Same split as WarpCad (`LICENSING.md`): code AGPL-3.0-or-later, prose and page
   copy CC BY-SA 4.0, SPDX markers checked by a script. Confirm the logo and favicon may be
   copied from `public/` under the same terms.
9. **Tests and deploy gate.** WarpCad's CI does not run on push (pre-push hook,
   `CONTRIBUTING.md` "Pushing"). For a page whose build takes seconds, **proposed:** the Pages
   workflow runs build, link check and the Chromium e2e before it deploys, and a local
   `npm test` runs all three engines. Record why this repository can differ: there is no LFS and
   the run is about a minute.
10. **App Store support URL.** `build-020` needs a support URL and a privacy-policy URL for the
    listing. Say whether `https://warpcad.com/` (with a Support section) is that support URL. If
    it is, `build-020` gains a dependency on `build-022`. The owner decides; record the answer in
    `build-020` too.

## Interaction model

n/a. This task is a decision record. The page's controls are specified in `docs-027`.

## Documentation

n/a. The output is `docs/decisions/home-page.md` (developer-facing), plus a line in
`docs/decisions/hosting.md`'s Decision section pointing to it.

## Affected files

- `docs/decisions/home-page.md` (new)
- `docs/decisions/hosting.md`: one sentence and a link under Decision
- `CLAUDE.md` Stack table: a **Home page** row (Committed, with the date and link)
- `TODO/build-021`, `TODO/docs-027`, `TODO/build-022`: correct their **Proposed fix** if the
  decision differs from what they assume
- `TODO/build-020`: question 10's answer

## Proposed fix

1. Run the health checks with `gh api` (stars, open/closed issues, latest release, contributors)
   for the generator options. Write the table with real numbers and the date.
2. Check question 2 against GitHub's Pages docs, and write down which parts were checked and
   which were taken from docs only.
3. Put questions 3, 7 and 10 to the owner in one message, with the proposed answer first. Record
   the answers with the date.
4. Stop. This task writes no code in either repository.

## Effort

S.

## Testing

- `npm run spdx` passes (the new record carries its marker at the end).
- Acceptance scenarios: none. This is a docs-only change.
- Chromium only / no e2e: no code changed.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
