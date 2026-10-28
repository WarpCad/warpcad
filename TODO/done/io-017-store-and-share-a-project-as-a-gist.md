---
title: Store and share a project as a GitHub gist — a short link, a readable README, the project file, and a token that can touch nothing else
category: io
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-27 at the owner's request)
depends: [io-016, io-002]
status: done
---

> **Shipped (2026-10-28) in two commits: Step 0 and Stage 1 (`193e03c`), then Stage 2 (plumbing, screens, e2e,
> docs); Stage 3 split off as `io-019`.** Step 0 ran real GitHub calls and
> **changed the plan**: a fine-grained token with only the account permission **Gists: write** creates,
> updates and deletes gists and is refused (403) on repositories, so it is the recommended credential and
> the classic `gist` token the fallback (`docs/decisions/gist-storage.md`). `GET /gists?per_page=1` does not
> prove the permission, so validation uses a write probe (`PATCH` on an all-zero id). The `gist` field is
> `{id, public, lastRevision, owner}` stored as `merge.gist` (a fifth last-writer-wins register that older
> builds ignore), and a copy never inherits it. The CSP gained exactly `https://gist.githubusercontent.com`.
> Update **refuses** when the gist changed remotely (the interim rule); merging first is
> `TODO/FIND-io-019-merge-before-updating-a-gist.md`. Open owner checks are in `TODO/VERIFY.md`.

## Goal

**In user terms:** the owner wants a project to live somewhere on the internet that is not their
browser, that can be shared with one short link, and that a person can also *read* without
opening WarpCad. A **GitHub gist** is that place: a tiny git repository with a few files, an id,
a URL, and a revision history for free.

Done means, from a project that is open:

1. **Publish.** **Share → Publish to a gist** creates a gist holding exactly two files:
   - `<project-slug>.ndjson` — the project file, byte-identical to **Download copy**.
   - `README.md` — a short human page: the project's name, its description/note, a body count and
     list of body names, when it was last published, and a link **Open in WarpCad**
     (`https://app.warpcad.com/#/gist/<id>`) plus the gist's own raw-file link for people who
     want the file. On github.com the gist renders this README as the first thing a reader sees.
2. **Share.** The Share sheet (`io-016`) now offers the short gist link
   (`https://app.warpcad.com/#/gist/<id>`) alongside the long `#/share/v1/…` link. It works for
   projects the long link cannot carry (over `SHARE_LINK_MAX_CHARS`, an imported mesh), which is
   `io-016`'s Stage 3 and why this task supersedes the reserved `io-017` row.
3. **Update.** Publishing again from the same project **updates the same gist** (a new revision),
   so a link already sent keeps working and shows the newer project. The gist's history is the
   project's history.
4. **Open.** Opening `#/gist/<id>` reads the gist **with no token and no account**, and shows
   the `io-016` **Shared view** (read-only, one button: **Make my own copy to edit**).
5. **Stop sharing.** **Stop sharing** deletes the gist (after a confirm that says the link dies
   and cached copies may remain).
6. **The token is the tightest GitHub offers for this and can reach nothing else** (next section).

### The token question — this decides the whole shape, so it is step 0

The existing hosted backend (`io-002`) uses a **fine-grained personal access token** limited to one
repository with **Contents: read and write**. The owner's instinct, "a tighter use token", is
right, but **as of this filing GitHub's fine-grained tokens have no gist permission at all**:
the gist API (`POST /gists`, `PATCH /gists/{id}`) works only with a **classic** token carrying the
**`gist` scope**, and with nothing else. **Verify this in step 0 against GitHub's current docs and
a real call before writing any code**, and write the answer into the decision record. If a
fine-grained gist permission has since shipped, use it and drop the next paragraph.

Why a classic `gist`-only token is still the tight option: that scope grants read/write on the
account's **gists only**. It cannot read or write any repository, organisation, workflow or
setting, which is a *smaller* blast radius than the repo token `io-002` already asks for. What it
cannot be limited to is *one* gist, and it cannot be repository-scoped, so the sheet says so in
plain words rather than implying more safety than exists. Rules:

- **A separate credential, not `io-002`'s.** Store it under its own key (`GIST_CREDENTIAL_KEY =
  'github-gist'`) in `src/storage/tokenStorage.js`, never under `HOSTED_CREDENTIAL_KEY`. A user may
  hold both, and each token must be revocable on its own. Never ask the user to reuse a repo token
  here and never accept a token that proves broader than `gist` without warning (a classic token's
  granted scopes come back in the `X-OAuth-Scopes` response header; if it lists more than `gist`,
  show "This token can do more than WarpCad needs. Make a new one with only the gist box ticked.",
  still allow it, and never log the header).
- **Same credential rules as `hostedBackend.js`**: one allowlisted origin (`https://api.github.com`),
  token only in the `Authorization` header, never in a URL, **no server text echoed into an error**,
  fields validated before a URL is built. Prefer extending that module's request core
  (`createHostedClient`'s status normalisation, `HostedError`) over a second hand-rolled client;
  step 1 records what is shared and what is not.
- **Native app** (`M19`): the token goes where `ai-025` puts credentials (the Keychain), through the
  same credential boundary, with no second path.

## Decision this task makes (`docs/decisions/gist-storage.md`, step 0)

| Option | Verdict | Why |
|---|---|---|
| **A. A secret gist per project**, files `<slug>.ndjson` + `README.md`, id kept in the project | **Recommended** | Short link, unlimited for our sizes, free history, readable on github.com, reads need no token. **Secret is not private**: anyone with the URL can read it, and it is unlisted, not access-controlled. The disclosure must say so |
| **B. A public gist** | Offered, never the default, behind an explicit tick | Searchable by anyone; a project's notes and standing instructions become public text |
| **C. A repository file** (`io-002`) | Already built; stays | Needs a repository and a Contents token; right for "my backup", wrong for "send to dad" |
| **D. A share service we host** | Rejected for now (`share-link.md` option C) | Breaks "static, no backend" |

Also settle and record in step 0: (a) fine-grained vs classic token as above; (b) whether the
unauthenticated read of `GET https://api.github.com/gists/<id>` is enough or `gist.githubusercontent.com`
raw URLs are needed, and whether `connect-src` in the production CSP (`docs/decisions/hosting.md`)
already allows them; (c) the **unauthenticated rate limit** (60 requests/hour/IP at the time of
writing) and what the Shared view says when it is hit, since a link sent to a classroom shares one
IP; (d) what the API does with a file over about 1 MB (`truncated: true`, fetch `raw_url`) and the
size ceiling WarpCad will accept (reuse `io-016`'s decompressed cap).

## Interaction model

- **Precondition (publish)**: a project is open with at least one body (same as Share), **and** a
  gist token is connected. With no token the sheet shows **Connect GitHub for short links**
  instead, which opens the connect dialog below. Publishing is never possible without an explicit
  user action; **nothing is uploaded on its own**, ever, including autosave.
- **Trigger (publish)**: in the Share sheet (`share-open`), a new group under the long-link
  controls: **Publish to a gist** (`share-gist-publish`) when none exists for this project, or
  **Update gist** (`share-gist-update`) plus **Copy gist link** (`share-gist-copy`),
  **Open on GitHub** and **Stop sharing** (`share-gist-stop`) when one does. A **Make it public**
  checkbox (`share-gist-public`, unticked, only before first publish, cannot be changed after:
  GitHub does not convert a secret gist to public).
- **Trigger (connect)**: **File ▾ → Connect GitHub for gists…** (`gist-connect-open`) and the same
  dialog from the Share sheet. It takes one field, the token, with a link to GitHub's
  token page and the exact instruction **"Tick only the gist box"**, validates it with
  `GET /gists?per_page=1` (reads nothing, proves the scope), and shows the connected GitHub login.
  **Disconnect** deletes the stored record (`io-002`'s rule: Disconnect really deletes).
- **Disclosure, always visible in the group**: *"A secret gist is not private: anyone with the link can
  read it, including this project's notes and instructions. Publishing sends the whole project to
  GitHub."* Public: *"Anyone can find this."*
- **Trigger (recipient)**: opening `#/gist/<id>`. Parsed at boot beside `#/share/v1/` (`io-016`'s
  `useShareLink`), so it must not be code-split behind a click (`perf-003`). The hash is cleared
  after a successful load, as `io-016` does.
- **Feedback (sender)**: a toast, **Published. Link copied** (the short link, on the clipboard) or
  **Gist updated**; the chip beside Share shows **Published** and the last revision time. Failures
  are fixed wording per `hostedBackend.js` (token rejected / expired, no network, rate-limited,
  gist gone) and never lose the project, which is always still autosaved locally.
- **Feedback (recipient)**: the `io-016` **Shared view** with the title and, from the gist,
  the description. A gist that is missing, empty, deleted, or has no readable project file shows
  the plain full-screen message with a **Start WarpCad** button, never the empty editor and never a
  half-parsed project. A rate-limited read says *"GitHub is busy. Try again in a few minutes."*
- **Shared view for the owner**: if the link's gist id equals the id stored on the open or saved
  project (the sender opening their own link), do **not** show a read-only copy; offer **Open it
  to edit** (stay in the current project, merge-aware via `mergeIn`, `io-010`) and **Make a copy**.
- **Placement / Selection response / Selection count**: n/a (no geometry is created).
- **Small-screen behavior**: designed for 390 px. The gist group is part of the Share bottom sheet,
  44 px targets, **Publish** full-width in the thumb zone; the connect dialog is a bottom sheet with
  the token field first and the explanation below it. No horizontal scroll at any reference viewport.

## Documentation

- **Page**: update `docs/sharing.md` with **Publish a project as a gist** and **If someone sent you
  a gist link**, and add the token walkthrough to `docs/save-load.md` beside the existing hosted
  repository section, because both are "give WarpCad a GitHub token" and must not contradict each
  other (this one is classic, `gist` only; that one is fine-grained, one repo). `docs/privacy.md`
  gains one sentence: publishing sends the project to GitHub, and nothing is sent until you
  choose it.
- **Example**: "Open your project. Tap **Share**. Under **Short link with GitHub**, tap
  **Connect GitHub**, open the link it shows, make a token with only **gist** ticked, paste it,
  and tap **Connect**. Back in the sheet tap **Publish to a gist**. The short link is copied. Paste it
  into a text to your dad. Change the model, tap **Share → Update gist**, and the same link now
  shows the new version."
- **Media**: `e2e/docs/share-gist.docs.js` (a still of the Share sheet with the gist group at phone
  width, `docs/screenshots/share-gist.png`) and `e2e/docs/gist-connect.docs.js`
  (`docs/screenshots/gist-connect.png`), both embedded in `docs/sharing.md`. Generated by
  `npm run docs:media`.

## The generated README

`src/core/gistReadme.js` builds it from the project **as data, never as instructions**; the same
text is regenerated on every update, so nobody edits it by hand and loses the edit:

```markdown
# Phone stand

> A stand for a phone, 70° angle, for the desk.            <- the project note, if any

**[Open in WarpCad](https://app.warpcad.com/#/gist/<id>)** — nothing to install, no account.

- 4 bodies: Base, Back plate, Lip, Cable notch
- Last published 2026-10-27 14:05 UTC
- Project file: [phone-stand.ndjson](<raw link>)

Made with WarpCad. This page is generated; edits are overwritten when the project is published again.
```

Rules: names and the note are **escaped for Markdown** (a body named `[x](javascript:…)` or a note with HTML
must render as text); **standing instructions, intent text and the AI conversation are never put
in the README** (they are in the `.ndjson` the owner chose to publish, but the README is the part
that gets skimmed and indexed, so it carries the minimum); length-capped; no images (a thumbnail is a
possible follow-up, not this task). The README's link needs the gist id, which exists only after
creation, so publish is two calls: `POST /gists` (project file plus a placeholder README), then
`PATCH` with the real README. If the second call fails, the gist exists and the link works; the
README says "Open in WarpCad" with the id filled on the next update, and the sheet reports it as a
warning, not a failure.

## Affected files

- `docs/decisions/gist-storage.md` — step 0: the token finding, the table above, the measured limits
- `src/storage/gistBackend.js` (+ `.spec.js`) — `createGist`, `updateGist`, `readGist`, `deleteGist`,
  `validateGistToken`; reuses `hostedBackend.js`'s request core and `HostedError`; **framework-free**
- `src/core/gistReadme.js` (+ `.spec.js`) — pure README text from `{name, note, bodies, publishedAt, id}`
- `src/core/gistLink.js` (+ `.spec.js`) — `gistLink(id)` and `parseGistHash(hash)`; the **only** place
  that builds or parses a `#/gist/` link (like `shareLink.js`), host from `io-016`'s constant
- `src/storage/tokenStorage.js` — `GIST_CREDENTIAL_KEY`; no other change
- `src/stores/gist.js` — UI state: connected login, publish state, last revision (UI-only, per
  `CLAUDE.md`; the gist id lives in the **document** — see Proposed fix)
- `src/composables/useShareLink.js` — also routes `#/gist/<id>` to the Shared view
- `src/components/layout/ShareSheet.vue` (the gist group) and `src/components/storage/GistConnectDialog.vue`
- `src/components/storage/FileMenu.vue` — the **Connect GitHub for gists…** item
- `src/core/` document model — a `gist` project field `{id, public, lastRevision}`, **serialised in the project
  file** so the link survives a reload and Download copy, with the merge rules `docs/decisions/document-sync.md`
  needs (last-writer-wins on the field; it is not a record)
- `e2e/gist-share.e2e.js`, `e2e/docs/share-gist.docs.js`, `e2e/docs/gist-connect.docs.js`
- `TODO/ACCEPTANCE.md` — a new scenario (the next free number after 29)

## Proposed fix

**Step 0 — decide and measure (S).** Write `docs/decisions/gist-storage.md`: prove with a real
call what each token type can do against `POST /gists`; record `X-OAuth-Scopes` behaviour; measure
the unauthenticated read limit; confirm the CSP covers every host the read touches; publish one
real 100 KB and one real 2 MB project and record `truncated` behaviour. **If a gist can only be created with a
token broader than `gist`, stop and ask the owner** before building anything.

**Stage 1 — the format and the client (M).** `gistLink.js`, `gistReadme.js`, `gistBackend.js` with
their specs. Hostile input is again the main risk on the *read* side (`CLAUDE.md`: loaded text is
data): choose the project file by a fixed rule (the single `*.ndjson`, else `project.ndjson`, else
refuse; never run, render or follow anything in the README, and ignore every other file), cap the
size before parsing, and run the content through the same load path as **Open…**, so every existing
validator applies. `errorReporting.js`'s scrubber must strip a `#/gist/<id>` fragment from breadcrumbs
(the id is a bearer capability for a secret gist) — add the spec.

**Stage 2 — the screens (M).** The token dialog, the gist group in the Share sheet, the document
field, the Shared-view branch for `#/gist/`, the owner-opens-own-link branch, **Stop sharing**.
Reuse `io-016`'s Shared view and autosave suspension unchanged: **opening a gist never writes to
IndexedDB** (the same "Opening never writes" test, with a gist fixture).

**Stage 3 — merge (S, optional, can split off).** An owner who edits on two devices and publishes
from both must not silently clobber a revision: update with the gist's last-known revision and, on a
mismatch, `readGist` and `mergeIn` the remote project first (the same shape as `io-011`), then publish
the merged result. If this does not fit, file `io-0NN` and ship Stages 1–2 with "Update refuses if the
gist changed; open it first" as the interim behaviour. State which in the decision record.

## Effort

L (multi-session). Step 0 is a sitting and may change the plan (the token). Stage 1 is one sitting,
Stage 2 the bulk, Stage 3 optional.

## Testing

- **Unit** — `gistBackend.spec.js` with `fetch` mocked at the boundary: create, update, read,
  delete; a rejected, expired and under-scoped token; a rate-limited read; a `truncated: true` file;
  an empty gist; a gist with only a README; a gist with two `.ndjson` files; the token appears **only**
  in the `Authorization` header and **never** in a URL, an error message, a thrown object, or a
  logged string (assert across every failure path); a server error body that quotes the token is
  not echoed. `gistReadme.spec.js`: Markdown/HTML/`javascript:` in names and note rendered inert, an
  empty note, 500 bodies capped, emoji and RTL names, no standing instructions or intent text in any
  output. `gistLink.spec.js`: round-trip, bad ids, wrong host, `#/gist/` vs `#/share/v1/` vs
  `#/help/` never confused. `errorReporting.spec.js` gains the scrubbed `#/gist/` case.
- **E2E (real app, `/`)** — `e2e/gist-share.e2e.js` against a **fake gist API** served by Playwright
  route interception (no real network, no real token in CI): (1) connect a token, place a cube and a
  sphere, **Share → Publish to a gist**, assert the README the fake received contains both body names
  and the link, and the project file is byte-identical to Download copy; (2) open the returned link in
  a **fresh context**, assert both bodies in the Shared view and no editor chrome; (3) change the
  model and **Update gist**, assert the **same id** was patched and a reload of the link shows the
  change; (4) a context with a saved session opens a gist link and the autosave contents are
  byte-identical before and after; (5) **Stop sharing** deletes it and the link then shows the
  "can't be found" screen; (6) rate-limited and deleted-gist responses show their plain messages;
  (7) the owner opening their own link gets **Open it to edit**, not a read-only copy; (8) a project
  over `SHARE_LINK_MAX_CHARS` shows the gist button as the way to share it. **All three viewports
  with a snapshot at each** (Small-screen behavior is not "same as desktop"). **All three engines**:
  it touches IndexedDB (the credential store and autosave), canvas/WebGL and `fetch`, and WebKit is
  where an iPhone link lands.
- **Real gist, once, by hand** — a throwaway classic `gist`-only token and a real publish, read and
  delete from a phone; record the result in `TODO/VERIFY.md` (one-off, not an acceptance duplicate),
  plus how the link and the gist's README look in Messages and on github.com.
- **Coexisting hash routes** — `#/gist/<id>` keeps priority over `#/help/<slug>` (`HelpSheet.vue`;
  `M20-testing-012` already pins that), and a gist link then Help then back works; add the case to
  that spec when this lands.
- **Acceptance scenarios** — adds a scenario, **"Publish a project and open it from a short link"**
  (two contexts, fake API): build, publish, open in the other, copy and edit, confirm the first
  context's project is unchanged. Re-drive by hand per `CLAUDE.md`'s Verification section, plus
  scenario 29 (`io-016`, the long link, since the Share sheet changes), and the scenarios that open,
  save or reload a project (22 "Merge a copy of the project" for certain).
- **Closed findings re-run** — `io-016`'s "Opening never writes" and autosave-suspension tests against a
  gist link; `io-002`'s Disconnect-really-deletes and token-never-leaks tests against the second
  credential (the two stores must not overwrite each other); `ui-072` (phone drag) against the
  Shared view reached from a gist; `ui-061`'s Help-hash mirror.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
