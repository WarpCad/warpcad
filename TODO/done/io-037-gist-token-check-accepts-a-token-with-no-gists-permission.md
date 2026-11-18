---
title: Reject a gist token that has no Gists permission at Connect, not at the first Publish
category: io
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md U5 (VERIFY.md io-017 #1)
depends: []
status: done
---

> **Shipped 2026-11-18.** The positive case was 422 as hoped (classic `gist` token, gist count unchanged), so the probe is now `POST /gists {"files":{}}` (422 granted, 403 missing, 401 rejected). `PROBE_GIST_ID` is gone. The e2e fake answers the probe with 422. Acceptance: no scenario drives Connect; `e2e/gist-share.e2e.js` (24/24, webkit-tablet + firefox-laptop) covers it, and `io-017`'s repro is VERIFY.md io-017 #1, now `OK`.

## Problem

`validateGistToken` (`src/storage/gistBackend.js:326`) proves a token can write gists with
`PATCH /gists/<all-zero id>` and treats **404 as "Gists: write granted"**. The decision record expected 403 for a
token without the permission but marked that **not verified** (`docs/decisions/gist-storage.md:28`, `:112`).

Verified 2026-11-17 with a real fine-grained token that has **no permissions at all** (public repositories
read-only, no Gists): the probe answers **HTTP 404**, the same as a token that has the permission. The only
headers are `github-authentication-token-expiration` and `x-accepted-github-permissions: gists=write`, which name
the permission the endpoint needs, not what the token holds. `GET /user` answers 200. So the Connect dialog
accepts a useless token, shows the account as connected, and the owner learns otherwise only when **Publish to a
gist** or **Save as gist** fails.

A candidate probe that writes nothing, from the same drive: `POST /gists` with body `{"files":{}}` answered
**403** `Resource not accessible by personal access token` for the permissionless token. A token that has
the permission should get **422** (validation failed, nothing created). That half is **not yet verified**.

## Affected files

- `src/storage/gistBackend.js:310-355` (`validateGistToken` and its doc comment)
- `src/storage/gistBackend.spec.js` (probe responses)
- `docs/decisions/gist-storage.md:28`, `:49`, `:112` (the probe row and the "not verified" notes)
- `TODO/VERIFY.md` io-017 #1 (set `OK` once fixed)

## Proposed fix

1. Verify the positive case first, with a token that has Gists write. `testing-045` has the owner's `gh` login (a
   classic OAuth token with `gist` scope), and a fine-grained one can be made the same way as the U5 token:
   `POST /gists {"files":{}}` must answer 422 and create no gist (`gh gist list` before and after).
2. If it does, switch the probe: 422 means write granted, 403 missing, 401 rejected or expired. Keep reading
   `x-oauth-scopes` for classic tokens and `github-authentication-token-expiration` as today. If the positive case
   is not 422, keep `PATCH` and add the `POST` probe only to tell 403 from 404, and say why in the decision record.
3. Update the decision record's probe row with both measured answers and the date. Remove "not verified".

The permissionless test token is in Keychain item `warpcad-test-nogist-token` (account `warpcad`). It expires
2026-11-24 15:12 UTC, so run this before then or ask for a new one through `TODO/OWNER.md`.

## Effort

S.

## Testing

- `gistBackend.spec.js`: the probe at 422 (valid), 403 (missing permission, `forbidden`), 401 (rejected), and the
  classic-token scope path unchanged. A spec that a 404 is no longer read as success.
- One live check each way with the two real tokens, recorded in VERIFY.md io-017 #1 (no API key involved, GitHub only).
- e2e: the gist connect specs that mock `api.github.com` (search `PROBE_GIST_ID` in `e2e/`); update the fake to the
  new probe. Chromium is enough (no WebGL, canvas or persistence path).
- Acceptance scenarios: the gist share scenario the connect dialog appears in. Closed-finding regression: `io-017`'s
  original reproduction.

## Interaction model

No new control. The Connect dialog's existing refusal message (the `forbidden` failure) now appears for this
token at Connect, where today it appears only at Publish.

## Documentation

- **Page**: the gist page under `docs/` that describes connecting a token. Check that its "needs Gists: read and
  write" sentence matches the refusal wording. No new media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
