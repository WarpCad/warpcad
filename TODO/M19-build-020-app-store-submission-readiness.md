---
title: Make the iOS app ready for App Review (listing, privacy, licences, icons) and stop at the owner's submit
category: build
kind: feature
priority: high
model: sonnet
milestone: M19
depends: [build-019, testing-011]
status: open
---

> **Ends at a human gate.** This task prepares everything App Review needs and stops. Pressing
> **Submit for Review** is the owner's action, after the legal review that
> `docs/decisions/app-store-licensing.md` Part 6 requires ("Before App Store submission, the owner
> has these reviewed by a lawyer or equivalent"). That review is **not done** as of 2026-10-24.
> Do not submit, and do not mark Part 6 done.

## Goal

Done means the App Store Connect record for WarpCad is complete except for the owner's submit:
icon, launch screen, screenshots, description, keywords, support and privacy-policy URLs, age
rating, privacy "nutrition" labels, export compliance, and a privacy manifest. The licence
questions open in `app-store-licensing.md` are each either answered by the owner or listed as the
blocker. The decision record and the licensing record both say what shipped.

## Interaction model

n/a inside the app, except the launch screen and icon, which are not controls. The listing is
outside the app.

## Documentation

- **Page**: `docs/native-apps.md`, adding the App Store link once it exists (until then, the TestFlight
  section stands). `docs/privacy.md`, a section for the iOS app: what it collects (Sentry crash
  reports if a DSN is set in the native build; no analytics if `build-017`'s GA-off default holds),
  where the key and files live. The App Store's privacy-policy URL points at this page on
  `app.warpcad.com`.
- **Example**: n/a (no new control). The listing copy is written for App Store readers, not docs
  readers.
- **Media**: the store screenshots are **not** docs media and do not live under `docs/`. Generate
  them by Playwright at the App Store's required sizes (6.9" and 6.5" iPhone, 13" iPad if iPad is
  supported) in a separate `e2e/store/` project that `docs-media.spec.js` does not claim, so no
  screenshot is hand-made. If the owner prefers device captures, record that choice.

## Affected files

- `warpcad-native/src-tauri/icons/` (from the existing `npm run icons` source art, `scripts/app-icons.mjs`;
  the 1024 px App Store icon has no alpha), the launch screen storyboard, `PrivacyInfo.xcprivacy`
  (complete: required-reason APIs from Tauri, wry and every plugin, not only fs's C617.1).
- `warpcad-native/store/` (new): `description.md`, `keywords.txt`, `review-notes.md` (how a
  reviewer tries the app with no account, and why it is not a "repackaged website" under 4.2:
  bundled, offline, Files integration, Keychain, a local MCP server).
- `e2e/store/*.store.js` + a Playwright project, `docs/privacy.md`, `docs/native-apps.md`.
- `docs/decisions/app-store-licensing.md` Part 2 (native and asset audits), status line.
- `docs/decisions/native-mobile-shell.md` Question 8 (what shipped, sizes).

## Proposed fix

1. **Owner decisions, asked together, before any build for review** (each is the owner's per the
   decision records; list the options and the record's recommendation, then wait):
   - **Help content in the binary**: ship the 89 MB of Help GIFs, ship Help without the GIFs, or
     load Help from `app.warpcad.com` (`native-mobile-shell.md` Recommendation 7). What each
     shape costs is in `docs/decisions/documentation.md`'s native-shapes table (`docs-028`).
     Loading Help from the web also needs a version-skew line in the Help sheet ("This help is
     for WarpCad <index version>; this app is <app version>") when the two differ: file it as a
     follow-up row if the owner picks that shape.
   - **The prose licence** (`app-store-licensing.md`, "The prose licence"): (a) relicense the
     owner's own docs for the app copy, or (b) the app ships no Help and loads it from the web.
   - **iPad**: support iPad in this first release, or iPhone only. iPad adds screenshots and a
     review on that form factor.
   - **Sentry in the native build**: on (privacy label "Crash data, not linked to identity") or off.
   - **Price and availability** and the **age rating** answers.
2. **Native licence audit** (`app-store-licensing.md` Part 2, "Native dependencies (not yet
   audited)", written for Capacitor; rewrite it for Tauri): `cargo deny list` output by licence for
   the iOS target, committed as a table. Reject GPL/LGPL/AGPL crates outright, as that record says.
   The owner approves any licence not already allowed (`build-017` step 6).
3. **Asset audit** (same record, "Assets (not yet audited)"): every font, icon, example project and
   library part in `dist-native/`, each with its source and licence; anything without one stays out
   of the bundle.
4. Third-party notices: the app shows them (Help → About → Licences), generated from npm
   (`build-011`) **and** cargo, since the App Store build carries Rust crates' notices too.
5. Upload a final build through `build-019`'s script, attach it to the version, and fill every
   App Store Connect field. Run App Store Connect's own validation. **Stop.** Write the owner a
   short checklist in `TODO/VERIFY.md`: Part 6 review, then **Submit for Review**.

## Effort

L (most of it owner decisions and form-filling, which cannot be rushed by an agent).

## Testing

- App Store Connect shows the version **Ready to Submit** (no missing fields). Save the evidence
  path in the retirement note.
- `cargo deny check` passes with the final allow-list; `npm run licenses` and `npm run spdx` pass in
  this repository.
- Install the exact build attached to the version from TestFlight and re-drive **acceptance scenario
  28** in full. Report PASS/FAIL. Re-drive scenarios **1, 7 and 10** too, because icons, launch
  screen and Info.plist changes can break a release build in ways a debug build hides.
- The store screenshot spec runs on WebKit only (it stands in for the iOS WebView) at the store
  sizes. It is not a layout spec, so it does not need the three-viewport matrix.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
