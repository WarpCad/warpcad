---
title: Sign the iOS app for distribution and get a build onto TestFlight
category: build
kind: feature
priority: high
model: sonnet
milestone: M19
depends: [build-017]
status: open
---

> **Owner steps first.** This task cannot start until the owner has (1) an active Apple Developer
> Program membership, (2) confirmed the bundle identifier from `build-017` (proposed
> `com.warpcad.app`), and (3) created the app record in App Store Connect under that identifier.
> If any of those is missing, stop and list what is missing. Do not create accounts or records.

## Goal

Tauri's open iOS issues are all in this step: #13578, an IPA rejected for containing `libapp.a`;
#15066, `-lswiftCompatibility56` with Xcode 26+; #15740, the signing identity not found on clean
runners. So this runs **early in M19**, not at the end, so a blocked upload is found while there is
still weekend left.

Done means a release build of the app is **uploaded to App Store Connect, processed, and installable
through TestFlight** on the owner's iPhone, and the steps to do it again are one documented command
in `warpcad-native`. The App Review submission itself is `build-020`.

## Interaction model

n/a. No change inside the app. The user-facing change is that the app installs from TestFlight
instead of Xcode.

## Documentation

- **Page**: `docs/native-apps.md`, a new section "Installing a test build" (TestFlight invite → install
  TestFlight → open the invite → **Install**). Contributor steps (certificates, the release
  command) go in `warpcad-native/README.md`, not in end-user docs.
- **Example**: "Open the TestFlight invite on your iPhone, tap **View in TestFlight**, then
  **Install**. WarpCad appears on your home screen; open it and check **Help ▾ → About** reads
  `iOS app <version> (<build>)`."
- **Media**: none (no Playwright project reaches TestFlight). State this on the page.

## Affected files

- `warpcad-native/src-tauri/tauri.conf.json` (`bundle.iOS.developmentTeam`, version and build
  number), `warpcad-native/package.json` (`ios:release`), `warpcad-native/README.md`.
- `warpcad-native/scripts/ios-release.sh` (new): build, export with
  `--export-method app-store-connect`, upload with `xcrun altool --upload-app` (or Transporter),
  using an App Store Connect API key read from the environment or the macOS Keychain, **never a
  file in the repo**.
- `docs/decisions/release.md`: a short section on how an iOS build number relates to the web
  release version (`release-it`), e.g. the web `version` plus a monotonic build number.
- `docs/native-apps.md`.

## Proposed fix

1. Signing: automatic signing with the owner's team in Xcode is fine for the first upload. Record
   which certificate and provisioning profile were used.
2. Build with `cargo tauri ios build --export-method app-store-connect`. If the upload is rejected
   for `libapp.a` (#13578), apply the reported workaround and **record it, with the issue link,
   in `TROUBLESHOOTING.md`** via `/troubleshoot`. Do the same for every other pipeline failure.
3. Set `ITSAppUsesNonExemptEncryption = false` in the merged Info.plist (the app uses only
   HTTPS/OS crypto). This answers export compliance once, rather than on every upload. Confirm the
   claim is true for `ai-026`'s optional LAN token before marking done.
4. Version: `CFBundleShortVersionString` from WarpCad's `package.json` version;
   `CFBundleVersion` a monotonic integer kept in `warpcad-native`.
5. CI is **not** in scope: `ci.yml` does not run on push here (`build-014`), and #15663/#15740 are
   CI-signing bugs. A local release script is enough for the weekend. Note a CI row as a
   follow-up only if the owner wants it.

## Effort

M (L if a Tauri packaging bug has no workaround).

## Testing

- The upload succeeds and App Store Connect shows the build as **Ready to Test** with no
  missing-compliance or missing-privacy-manifest warnings. Save the processing email or a
  screenshot path in the retirement note.
- Install from TestFlight on the owner's iPhone and hand-drive **acceptance scenarios 1, 7 and 10**.
  This catches a release-only difference from `build-017`'s Xcode install, such as a stripped
  symbol or the CSP from the release config. Report PASS/FAIL.
- Acceptance scenarios that could break: none in the web app; this task does not touch `src/`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
