---
title: Keep the Anthropic key and GitHub token in the iOS Keychain inside the app
category: ai
kind: feature
priority: medium
model: sonnet
milestone: M19
depends: [build-017]
status: open
---

## Goal

`src/storage/tokenStorage.js` (`createCredentialStore`, IndexedDB `warpcad-credentials`) holds the
GitHub token and, through `aiKey.js`, the BYOK Anthropic key. Any script on the origin can read
them, and iOS can evict them with the rest of the web storage (`native-mobile-shell.md` Q2,
"What to mirror"). In the iOS app the secrets should be in the **Keychain**, behind the same
interface, so nothing above `createCredentialStore` changes.

Done means: in the iOS app, saving the API key writes a Keychain item (service `com.warpcad.app`,
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so it is not in device backups), and IndexedDB
holds nothing secret. A key saved before this task lands is moved into the Keychain once and
deleted from IndexedDB. Safari and desktop are unchanged.

## Interaction model

- **Precondition**: running in the iOS app.
- **Trigger**: the existing key sheet (**Assistant → API key**). No new control.
- **Feedback**: unchanged, except the sheet's storage line. Where it now says the key is kept in
  this browser, the app says *"Stored in this iPhone's Keychain."* The line comes from the
  credential store's description, not a hardcoded branch in the component.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: same as the PWA (the existing phone sheet).

## Documentation

- **Page**: `docs/ai-partner.md`, the "Your API key" section, with one paragraph for the iOS app.
  `docs/privacy.md`, one line (where the key lives in the app).
- **Example**: "In the iOS app, tap **Assistant**, paste your key and tap **Save**. The sheet says
  *Stored in this iPhone's Keychain*. Deleting the app removes the key."
- **Media**: update the existing key-sheet still only if its text changes in a docs shot; name the
  file in the retirement note. Otherwise none.

## Affected files

- `src/storage/tokenStorage.js` (choose the backend in `createCredentialStore`'s caller, not
  inside it), `src/storage/aiKey.js` (the description line), `src/native/keychain.js` (new: get,
  set, delete via `invoke`).
- `warpcad-native/src-tauri`: three commands (`keychain_get/set/delete`), restricted to an
  allow-listed set of account names (`anthropic`, `hosted-git`) so page script cannot read
  arbitrary Keychain items. Capability grants only these.
- `e2e/native-keychain.e2e.js`.

## Proposed fix

1. **Health check at pull-in** (CLAUDE.md Library decisions): the `keyring` crate 3.x with its
   Apple-native backend on **iOS**, which is **unverified**. Check its iOS support, maintainers,
   last release and licence. If it is not solid, write the three commands as a small Swift plugin
   (Tauri 2's mobile plugin API) over `SecItemAdd`/`SecItemCopyMatching`/`SecItemDelete`, about 60
   lines and no dependency. Record the choice and why in `docs/decisions/ai-partner.md` (Decision 8,
   credential storage).
2. Migration on first launch: if `warpcad-credentials` holds a value and the Keychain does not, copy
   it, verify the read-back, then delete the IndexedDB value. Never delete before the read-back.
3. The trust model: page script can still call `keychain_get('anthropic')` (that is how the BYOK
   client reads it). The gain is eviction safety and the account allow-list, not protection from a
   compromised page. Say that in the decision record, not more.

## Effort

M.

## Testing

- Unit: the store selection, the migration order (copy, verify, delete; a failed verify keeps the
  IndexedDB value), and the account allow-list refusal in the Rust command (`cargo test`).
- **`e2e/native-keychain.e2e.js` navigates to `/`** with the `nativeShell` fixture: save a key and
  assert the fake Keychain holds it, `warpcad-credentials` is empty, and the sheet line reads
  *Keychain*. Then seed an IndexedDB key, reload, and assert it migrated. **Chromium, Firefox,
  WebKit** (persistence); laptop and phone (the sheet line wraps).
- **On device**: save a real key, send one chat message, kill and relaunch, and send another
  without re-entering the key. Report PASS/FAIL.
- **Acceptance scenarios to re-drive**: 24 (edit while the Assistant works, the BYOK chat
  scenario), on device as well as at `/`.
- **Closed findings re-run**: `ai-020`'s repro (the panel says no key during a live-bridge
  session). The key's new home must not make the panel think it is missing.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
