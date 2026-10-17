# Analytics: Google Analytics 4 (page views only)

**Status:** accepted 2026-10-17 (`TODO/build-007`). The owner asked for Google Analytics 4 by name
and decided on 2026-10-16 to use a separate GA property for WarpCad and **no consent banner**. This
record is short on the winner and honest about the alternatives, as `CLAUDE.md`'s Library decisions
section asks. GA4 is a third-party service reached by a script tag, not an npm dependency: nothing is
added to `package.json`.

## What the app needs

- A light count of visits to the hosted app (GitHub Pages, custom domain `app.warpcad.com`). The
  expected audience is small, mostly the owner.
- **Inert by default.** A build without a measurement ID has no script, makes no request and
  allows no Google host in its Content-Security-Policy.
- **Nothing private leaves the browser**: no URL hash (`#/gist/<id>`, `#/help/…`), no document
  content, project name, AI key or IndexedDB data.
- No backend of our own (`docs/decisions/hosting.md`), so the target is a hosted service.
- Nothing from `npm run dev`, a local preview or a test run.

## Options compared

Numbers fetched 2026-10-17 from the GitHub API and by downloading each script.

| | **Google Analytics 4** | Plausible (hosted or self-hosted) | GoatCounter (hosted or self-hosted) | Umami (self-hosted or cloud) | No analytics |
|---|---|---|---|---|---|
| Needs a server we run | No (Google hosts it) | Hosted plan is paid; self-hosting needs a server and a database | Free hosted tier for non-commercial use; self-hosting is one binary | Cloud free tier, or self-host | No |
| Cookies | Yes (`_ga`, `_ga_<id>`) | No | No | No | n/a |
| Script size (minified / gzip) | `gtag.js` **439,625 / 152,842 bytes**, loaded from Google, plus about 1.1 / 0.7 kB of our own loader | 2,841 / 1,285 bytes | 9,213 / 3,319 bytes | 4,810 / 2,333 bytes | 0 |
| Licence | Proprietary service | AGPL-3.0 | EUPL-1.2 | MIT | n/a |
| Stars | n/a | 29,519 | 6,067 | 39,434 | n/a |
| Issues, open / closed | n/a | 60 / 753 | 50 / 582 | 109 / 2,241 | n/a |
| Latest release | n/a (service) | v3.2.1, 2026-05-15 | v2.7.0, 2025-12-15 | v3.4.0, 2026-09-17 | n/a |
| Contributors | n/a | 100+ | 65 | 100+ | n/a |
| CSP footprint | Three hosts across `script-src`, `connect-src`, `img-src` (below) | One host | One or two hosts | One host (self-hosted: our own) | none |
| Why it might be right | Already used by the owner on another site; free; no server | Privacy-first, tiny | Smallest to run, free for small sites | Self-hosted, MIT | The most private |

### Rejection table

| Option | Why not (here) |
|---|---|
| Plausible | A better privacy story and 1/100th of the script, but the hosted plan costs money and the owner asked for GA4; self-hosting would add the server this project deliberately does not have. Stays a drop-in later: swap `src/analytics/analytics.js` and the hosts in `scripts/analytics-build.mjs`. |
| GoatCounter | Same reasoning: cookie-free and tiny, but the owner chose GA4. The best replacement if the cookie note becomes a problem. |
| Umami | Needs a server and a database for the self-hosted path; the cloud tier was not asked for. |
| No analytics | The status quo. Gives the owner no sign of whether the hosted app is used at all, which is the point of the task. |
| GA4 via Tag Manager (a GTM container) | Adds `gtm.js`, a second container to maintain and a wider CSP, for the same page view. |

The owner's choice stands; if the cookie or the 150 kB script ever matters (a wider audience, the
EU/UK), GoatCounter or Plausible is the move, and the consent decision reopens either way.

## Decision

**GA4**, loaded by a hand-written loader, `src/analytics/analytics.js` (about 1.1 kB minified, 0.7 kB
gzip; the main chunk differs by 12 bytes, the ID itself, between a build with and without one). No dependency.

### The measurement ID

It is public (it is in every visitor's page) but comes only from build configuration, never from
source: the Actions **variable** `GA_MEASUREMENT_ID` (`vars.GA_MEASUREMENT_ID`) is passed by
`.github/workflows/pages.yml` to `npm run build`, which reads `GA_MEASUREMENT_ID` or
`VITE_GA_MEASUREMENT_ID` (`scripts/analytics-build.mjs`, `measurementId()`) and bakes it in as
`__GA_MEASUREMENT_ID__` (`vite build` only; the dev server always gets `''`). Only a well-formed
`G-XXXXXXXX` value counts, so a typo or a pasted `UA-` ID is ignored rather than used. Unset the
variable and the next deploy carries no tag.

### Inert unless every gate passes (`initAnalytics`, unit-tested with mocks)

A valid ID; a production build; `https:`; a host that is not `localhost`, `127.0.0.1`, `[::1]` or
`*.localhost` (so `vite preview` and `npm run dev` never report); not an automated browser
(`navigator.webdriver`, so Playwright never reports); and no Do Not Track or Global Privacy
Control signal. The script is added after the `load` event so it never competes with first paint
(`TODO/build-002`).

### What is sent

- `gtag('config', id, { send_page_view: false, allow_google_signals: false,
  allow_ad_personalization_signals: false, page_location, page_path })` and exactly one
  `gtag('event', 'page_view', { page_location, page_path })`.
- `page_location` is **origin + pathname only**, taken once at start. The hash, the query string and
  everything in the document are never given to `gtag`. A deploy under a sub-path keeps the sub-path.
- Google still adds what the browser tag always sends: user agent, screen size, language, referrer,
  its client id (cookie) and a coarse location from the IP.
- **IP handling.** GA4 does not log or store IP addresses; it derives a coarse location and
  discards the address, so the old `anonymize_ip` option is not needed (and does nothing in GA4).
- **Cookies.** `_ga` and `_ga_<id>`. There is no consent banner (owner decision); the privacy page
  (`docs/privacy.md`) says so plainly and lists the opt-outs. Revisit before sharing the link widely
  or serving the EU/UK.
- **Not in code's control, owner's checklist** (`TODO/VERIFY.md`): enhanced measurement (outbound
  clicks, scroll, site search, file downloads, and "page changes based on browser history events")
  is a setting of the web data stream. Turn all of it off so the app sends page views only; the
  history-change event is the one that could otherwise re-send a page view whose browser address
  carries a `#/gist/…` hash.

### CSP: the hosts added, and only with an ID

`index.html` as committed has no Google host. A build given a valid ID gains exactly (build-only
Vite plugin, `addAnalyticsSources()`):

| Directive | Added | Why (from reading the real `gtag.js` on 2026-10-17) |
|---|---|---|
| `script-src` | `https://www.googletagmanager.com` | `gtag.js` is served from it |
| `connect-src` | `https://*.google-analytics.com`, `https://*.analytics.google.com` | Hits go to `https://{www or regionN}.google-analytics.com/g/collect` and `https://{regionN.}analytics.google.com/g/s/collect`; the region label is chosen at run time, so a single-label wildcard on Google's own two domains is the narrowest policy that works (Google's CSP guide lists the same) |
| `img-src` | `https://*.google-analytics.com` | The image-beacon fallback when `fetch` / `sendBeacon` is unavailable |

Deliberately **not** added: `https:`, a bare `*`, `www.google.com`, `*.doubleclick.net`,
`stats.g.doubleclick.net`, `pagead2.googlesyndication.com`, `*.googletagmanager.com` in
`connect-src`, or `'unsafe-inline'`. The ad and `doubleclick` hosts in `gtag.js` serve Google
signals and ad features, which the config turns off. `e2e/csp.e2e.js` asserts, on the production
build, both the inert case and a build with a fake ID, that these are the only additions and that a
stubbed `gtag.js` and collect calls raise no violation while `www.google.com` is still refused.
**If real hits ever fail with a CSP error in the console, widen by that one host and record it here.**

### What was not verified here

No GA property or real ID was available, so no event has reached Google from this code. Everything
is proved with mocks at the `gtag` boundary and with Google's hosts stubbed in the browser; the live
check is the owner's Realtime step in `TODO/VERIFY.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
