---
title: The native app loads Help from the web — the loader, the CSP and a sanitiser for remote HTML
category: ui
kind: finding
priority: high
model: opus
milestone: M19
depends: [build-017]
status: open
---

> **Two repositories.** Web changes here: `src/help/loader.js`, `src/help/sanitize.js` (new),
> `src/components/layout/HelpSheet.vue`, `scripts/vite-plugin-help.mjs`, `vite.config.js`. Native
> change in `../warpcad-native`: `src-tauri/tauri.conf.json` (the CSP). Commit each separately, and
> retire this row in this repository's commit.

## Problem

**A decision was made and its work was never filed.** `warpcad-native/TODO/M19-build-020-…md:71`
records, 2026-11-07: "the app loads all Help from the web and ships none of it". The same file,
lines 67–69, says a version-skew line is then needed and to "file it as a follow-up row if the owner
picks that shape". No row exists. Today:

- `npm run build:native` still bundles Help. `dist-native/help/` holds every page, and the folder is
  210 MB with the pictures.
- `src/help/loader.js:51-54` (`helpUrl`) builds every URL from `import.meta.env.BASE_URL`, which is
  `./` in native mode. There is no way to point it at `https://app.warpcad.com/help/`.
- The shell's CSP (`tauri.conf.json`, `app.security.csp`) allows `connect-src` to self, the IPC
  hosts, Anthropic and GitHub, and `img-src 'self' blob: data:`. A fetch of Help text or a Help
  picture from `app.warpcad.com` is blocked by it.

**The security part.** `HelpSheet.vue:290` renders the page with `v-html`. It is the only `v-html`
in the app, and `loader.js:6-8` gives the reason it is safe: "trusted markup produced by our own
build from our own docs". Loading it over the network changes that sentence. The markup then comes
from whatever answers at `app.warpcad.com` at that moment, rendered inside the one web view that
holds the user's API key and GitHub tokens (in IndexedDB now, the Keychain after `ai-025`, readable
by page script either way).

- **Attacker**: anyone who can change what `app.warpcad.com/help/*.html` serves. That is a
  compromised GitHub Pages deploy, a lapsed or hijacked domain (the bare `warpcad.com` is still a
  parking page per `TODO/ROADMAP.md` M20), or a network position on a device that trusts a rogue
  certificate.
- **Entry point**: the Help sheet in the native app.
- **Impact**: `script-src 'self'` blocks injected `<script>` and inline handlers, so this is not
  direct key theft. What does get through raw `v-html`: a form or link styled as the app's own
  "paste your API key" dialog, `<meta http-equiv="refresh">` navigating the web view away, `<base>`,
  `<iframe>`, and CSS (`style-src 'unsafe-inline'`) that restyles the real UI. A store app that
  renders unsanitised remote HTML next to a credential field is the wrong default, and App Store
  guideline 2.5.2 (in `warpcad-native/CLAUDE.md`) is about exactly this kind of remote content.

On the web build nothing changes: Help stays same-origin and precached.

## Interaction model

Changes an existing surface (the Help sheet), in the native app only.

- **Precondition**: the native app, with or without a network.
- **Trigger**: unchanged. The **?** in the header and every tool's help button.
- **Feedback**: Help opens as it does on the web. Offline, the sheet says "Help needs a
  connection. Everything else in WarpCad works offline." with a **Retry** button. When the fetched
  Help's version differs from the app's, a line under the version reads "This help is for WarpCad
  <index version>; this app is <app version>."
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: same as the web build's Help sheet at each width.

## Documentation

- **Page**: `docs/native-apps.md`, a "Help in the app" paragraph.
- **Example**: "Tap **?**. Help loads from app.warpcad.com, so it needs a connection the first time
  you open a page. If you are offline you see **Help needs a connection**; tap **Retry** once you
  are back online."
- **Media**: one still, `native-help-offline`, from a new `e2e/docs/native-apps.docs.js` that uses
  the fake shell fixture (`e2e/fixtures/nativeShell.js`), embedded in `docs/native-apps.md`.

## Affected files

- `src/help/loader.js:45-110` (a help origin; the image rewrite)
- `src/help/sanitize.js`, `src/help/sanitize.spec.js` (new)
- `src/components/layout/HelpSheet.vue:77-96, 290` (offline state, skew line, sanitised output)
- `scripts/vite-plugin-help.mjs`, `vite.config.js:176-178` (native mode emits no `help/`)
- `../warpcad-native/src-tauri/tauri.conf.json` (CSP: `connect-src` and `img-src` gain
  `https://app.warpcad.com`, nothing broader)
- `src/csp.spec.js` (the web policy must not gain the host)

## Proposed fix

1. **Help origin.** `helpUrl` takes its base from a build-time constant: the app's own base on the
   web, `https://app.warpcad.com/help/` in native mode. Keep it a constant in the bundle, never a
   runtime setting, so nothing in a project file or a URL can redirect Help.
2. **Sanitise before `v-html`, in native mode and on the web alike**, so there is one code path.
   `src/help/sanitize.js`: parse with `DOMParser` into an inert document, walk it, and rebuild from
   an allow-list. The tags `scripts/help-build.mjs` emits are few and known: headings, `p`, `ul`,
   `ol`, `li`, `a`, `code`, `pre`, `strong`, `em`, `blockquote`, `table` parts, `img`, `picture`,
   `source`, `span`, `br`, `hr`. Attributes allowed: `href` (only `#/help/…`, or `https:` with
   `rel="noopener noreferrer"` forced), `src` and `srcset` (only under the help origin's `img/`),
   `alt`, `id`, `class`, `data-help-page`, `data-help-anchor`, `loading`, `media`. Everything else
   is dropped, with its children for `script`, `style`, `iframe`, `object`, `form`, `meta`, `base`,
   `link`. No new dependency. See the decision below.
3. **Integrity, cheaply.** `help/index.json` already carries `version` and `commit`. Show the skew
   line from them. Do not attempt signing now; record it as the next step if the owner wants more.
4. **Native build ships no Help**: in native mode the help plugin emits nothing, which also takes
   the 89 MB of GIFs out of the binary. The assert script from `build-026` can check `dist-native/`
   has no `help/` folder.
5. **CSP** in `tauri.conf.json`: add `https://app.warpcad.com` to `connect-src` and `img-src` only.
   The web policy in `index.html` is untouched.
6. Help links that leave the app go through `build-029`'s external-link handling.

### Owner decision

How Help is shown in the native app:

- **(a) In the app's Help sheet, sanitised** (this file as written). Keeps tool help buttons opening
  the right heading in place. Costs the sanitiser and a slightly wider CSP.
- **(b) In the system browser.** The **?** opens `https://app.warpcad.com/#/help/<slug>` in Safari
  or the default browser through `build-029`. No remote HTML ever enters the app's web view and the
  CSP does not change. Costs the in-place experience: every help button leaves the app.
- **(c) Bundle the text, fetch only pictures.** Reopens the prose-licence question the owner closed
  on 2026-11-07, so it is listed only for completeness.

**Decided 2026-11-10** (owner, asked at the end of the architecture audit): **(a)**, in the app's
Help sheet, sanitised. The Proposed fix above stands as written.

## Effort

M (L if the sanitiser's allow-list turns up Help markup it cannot express).

## Testing

- `src/help/sanitize.spec.js`: every page under a built `help/` round-trips unchanged (the
  allow-list loses nothing the build emits); hostile cases are stripped: `<script>`,
  `<img onerror>`, `<a href="javascript:…">`, `<meta http-equiv=refresh>`, `<base>`, `<iframe>`,
  `<form>`, `<style>`, an `<img src>` on another host, a `data:` SVG image.
- `src/help/loader.spec.js`: native mode builds `https://app.warpcad.com/help/…`; the web build is
  unchanged; a failed fetch leaves the cache clean for Retry.
- `src/csp.spec.js` gains a case reading `../warpcad-native/src-tauri/tauri.conf.json` when present:
  the native policy adds exactly `https://app.warpcad.com` and no wildcard.
- `e2e/native-shell.e2e.js` (exists; navigates to `/` with `e2e/fixtures/nativeShell.js`): Help
  opens with the network stubbed to serve a page; the offline state shows with the network aborted;
  the skew line shows when the stubbed index names another version; a stubbed page containing
  `<img src=x onerror=…>` renders with no `onerror` attribute in the DOM. Phone, tablet and laptop
  with a snapshot at each. No WebGL: Chromium for the layout, plus **WebKit**, the engine that
  stands in for WKWebView.
- Existing `e2e/help.e2e.js`, `help-deep-link.e2e.js`, `help-picture-theme.e2e.js` pass unchanged on
  the web build (`testing-012`'s URL contract).
- **Needs the real shell** (cannot be confirmed in Playwright): that the CSP as written lets the
  fetch and the pictures through under `tauri://localhost`, and that `app.warpcad.com` answers with
  CORS headers a `tauri://` origin can read. GitHub Pages sends `Access-Control-Allow-Origin: *` for
  static files, which is believed sufficient; confirm on the macOS shell and add it to scenario 28
  (`testing-011`).
- Acceptance scenarios to re-drive: 28 (the iOS app end to end) once it exists; none on the web.
- Closed findings whose reproductions re-run: `ui-061` (Help sheet), `docs-028` (retired slugs),
  `docs-030` (light and dark help pictures).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
