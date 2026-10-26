---
title: Share a project by link — one tap to send, one tap to see it, no account on either end
category: io
kind: feature
priority: high
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-26 at the owner's request)
depends: []
status: open
---

## Goal

**In user terms:** the owner has made a few projects and wants to show them to their dad, who
has never used CAD. Dad should get a text or an email, tap the link, and see the model on his
phone, turning it with a finger, with nothing to install, no account and nothing to explain.
The sender should get there in two taps from the project they have open.

**Today there is no way to do this.** A project leaves WarpCad only as a `.ndjson` file
(**File ▾ → Download copy**, `docs/save-load.md`) that the recipient must save somewhere and
then open with **Open…**, which is a four-step errand for someone who does not know what the
file is. `CLAUDE.md` and `docs/decisions/hosting.md` both reserve `#/gist/<id>` for "a gist ID,
a project reference", and `docs/privacy.md` already says analytics never collect "shared-project
links"; **no code reads or writes either**. This task builds the first real share link.

Done means, with both ends on a phone:

1. **Sender:** open a project, tap **Share**, tap **Send…**. The phone's own share sheet opens
   (Messages, Mail, WhatsApp, AirDrop…) with a ready-written message and the link. On a laptop,
   **Copy link** puts the same text on the clipboard.
2. **Recipient:** tap the link. WarpCad opens straight onto **the model**, large, with the
   project's name over it, an orbit/pan/zoom control and a view cube, and **one** button:
   **Make my own copy to edit**. There is no toolbar, no timeline, no library, no assistant and
   nothing to dismiss first.
3. **Nothing the recipient already has is overwritten** by opening a link (see Interaction
   model, "Opening never writes").
4. The same link works in a browser today and, unchanged, opens the **native app** once
   `M19` ships it (Stage 4).

## Decision this task makes (state it in `docs/decisions/share-link.md`, step 0)

How does a project travel inside a URL? `CLAUDE.md` commits to static GitHub Pages with no
backend, and the document is a plain-text NDJSON file, so the options are:

| Option | Verdict | Why |
|---|---|---|
| **A. The project is the link**: `https://app.warpcad.com/#/share/v1/<payload>`, payload = project NDJSON, deflate-raw, base64url | **Stage 1 (recommended)** | No server, no account, no token, works offline once the app is cached. The fragment is never sent to any server (so the project stays out of GitHub Pages' logs and Google Analytics, which `docs/privacy.md` already promises). **Measured:** `examples/dovetail-phone-holder.ndjson` is 7,203 B raw, 1,716 B deflated, about 2.3 KB as base64url. The document stores feature recipes and design intent, never meshes (`CLAUDE.md`), which is why it compresses so well |
| **B. A GitHub gist**: `#/gist/<id>` | **Stage 3, only for what A cannot carry** | Short link, no size limit worth naming. But the *sender* needs a GitHub token with the `gist` scope (a fine-grained token cannot create gists, **verify**), which is exactly the setup friction this task exists to remove. Reading a public gist needs no token and `api.github.com` is already in the CSP. Build it as the overflow path, not the front door |
| **C. A share service we host** (Worker plus storage, short ids, preview images) | **Rejected for now** | Breaks "static, no backend" (`hosting.md`), adds an operated service, abuse handling and a privacy policy. Revisit only if A and B both fail real use. It is the only option that gives a *rich link preview* in Messages (per-project title and thumbnail), which A cannot |
| **D. Send the `.ndjson` file** through the share sheet | **Not the link, but kept** as **Send the file** in the same sheet for people who already have WarpCad, and it is the native app's job (`io-014`) | The recipient must know what to do with a file |

**Known ceiling of A, which the sheet must handle rather than hide:** texts and emails are
happiest under roughly 2,000 characters and tolerate more (iMessage and WhatsApp carry tens of
KB; some mail clients wrap or truncate far past that). Stage 1 therefore measures: under about
**6 KB of URL** it just works; over that the sheet says "This project is too big to send as a
link" and offers **Send the file** (option D) and, once Stage 3 exists, **Make a short link**.
A project with an imported mesh (`io-009`) is usually over. Pick the real threshold in step 0
from a test on an iPhone Messages thread and a Gmail draft, and write the measured number into
the decision record.

## Interaction model

- **Precondition (sender)**: a project is open and has at least one body. With an empty scene
  **Share** is present but disabled with the reason beside it ("Nothing to share yet").
  Selection does not matter; the whole project is shared.
- **Trigger (sender)**: a **Share** button in the top bar, to the left of **File ▾**
  (`data-testid="share-open"`), opening a **Share sheet** (a bottom sheet at phone width, a
  popover under the button at laptop width). The sheet has:
  - **Send…** (`share-send`), shown only where `navigator.canShare` / `navigator.share`
    exists (iOS Safari, Android Chrome, the native app). It hands the OS the title, a message
    and the URL. Cancelling the OS sheet is not an error and shows nothing.
  - **Copy link** (`share-copy`), always shown.
  - **Send the file** (`share-file`), a secondary link, which does what **Download copy** does
    today with a better name in this context.
  - A one-line disclosure, always visible: *"Anyone with this link can open and copy this
    project, including its notes. It can't be taken back."*
  - The **name** being shared, editable in place (it becomes the recipient's title). It
    defaults to the project name and falls back to "Untitled" never to an empty string.
- **Trigger (recipient)**: opening the URL. `#/share/v1/<payload>` is parsed at boot. No click
  is needed. The hash is cleared from the address bar after a successful load (as
  `ui-061` item 7 does for Help) so a reload or a bookmark goes to the app, not to a stale
  copy, and so a screenshot of the address bar does not carry the project.
- **Feedback (sender)**: *Copied* toast with the byte size ("Link copied, 2.3 KB"); the OS sheet
  is its own feedback. Over the ceiling: the explanatory state above, never a silent failure.
- **Feedback (recipient)**: the **Shared view** (below). A link that cannot be read (truncated by
  a mail client, a version this build does not know, a payload over the size cap) shows a plain
  full-screen message, not the empty editor: *"This link looks incomplete. Ask {the sender} to
  send it again, or send the file."* with a **Start WarpCad** button. It never shows a stack
  trace and never loads a half-parsed project.
- **Shared view (recipient)**: a read-only presentation of the project.
  - The viewport fills the screen, camera framed on the whole model, with the existing
    navigation chrome (orbit/pan/zoom controls and the view cube — `CLAUDE.md` makes these
    mandatory, and a phone has no keyboard).
  - The project's name as a title, and the sender's note if the sheet had one.
  - Exactly one primary action: **Make my own copy to edit**. A quiet secondary **Save a copy
    of the file**. Nothing else. No timeline, library, operations, inspector, assistant, File
    menu, gizmo or selection. Tapping a body does nothing.
  - Reuse whatever **Watch** (`ai-017`, the read-only fork view) already does for a read-only
    document rather than adding a second read-only mode; step 1 reads it and records what it
    reuses.
- **Opening never writes**: autosave (`src/storage/autosave.js`) is **off** while the Shared
  view is showing, and nothing is added to IndexedDB. A person who already has a saved session
  and taps a link therefore loses nothing by looking. This is the second attempt's "adding an
  item overwrote the previous one" failure in a new place; guard it with a test that fails if
  the autosave key changes.
- **Make my own copy to edit**: replaces the Shared view with the full editor holding the
  project as a **new local project** (`makeProjectId`, `data-013`, so it is not mistaken for
  the sender's). If the browser already holds a session with content, the existing **Replace
  the project?** confirm appears first, with its existing wording and a **Save or download
  yours first** path, so this is not a second, different "are you sure". A first-time visitor
  (empty IndexedDB, Dad's case) sees no confirm.
- **Same project, later version**: if the link's project id equals the open or saved project's
  id (the sender re-sent an update), do **not** offer Replace; offer **Merge their changes**
  using `mergeIn` and its Undo-merge toast (`io-010`/`ui-062`), and **Open theirs instead**.
  Keep this to one extra branch in the open flow; the merge machinery already exists.
- **Placement**: n/a (no geometry is created by the link). **Selection response**: none in the
  Shared view by design. **Selection count**: n/a.
- **Small-screen behavior**: designed for 390 px first. The Share sheet is a bottom sheet with
  44 px targets; the Shared view's title sits above the model and the single action is a
  full-width button in the thumb zone. At laptop width the same screen is centred with the
  action beside the title. No horizontal scroll at any of the three reference viewports.

## Documentation

- **Page**: new `docs/sharing.md` (sidebar entry per `.claude/commands/docs.md` Step 4),
  linked from `docs/save-load.md`'s "hand to somebody else" paragraph (line ~142) and from
  `docs/getting-started.md`. It has two audiences with two headings: **Send a project** and
  **If someone sent you a WarpCad link** (written for the recipient who has never used CAD, in
  words that assume nothing). `docs/privacy.md` gains one sentence: the link *contains* the
  project and is read only in the recipient's browser.
- **Example** (sender): "Open your project. Tap **Share**. Tap **Send…**, pick **Messages**
  and your dad's name, and tap send. Dad's message reads *'Here's a model I made in WarpCad:
  Phone stand'* followed by the link." (recipient): "Tap the link. The model appears. Drag one
  finger to turn it, pinch to zoom. Tap **Make my own copy to edit** only if you want to change
  it."
- **Media**: `e2e/docs/share-sheet.docs.js` (a still of the Share sheet at phone width,
  `docs/screenshots/share-sheet.png`) and `e2e/docs/shared-view.docs.js` (a still of the Shared
  view, `docs/screenshots/shared-view.png`), both embedded in `docs/sharing.md`. Generated by
  `npm run docs:media`, never by hand.

## Affected files

- `docs/decisions/share-link.md` — step 0, the table above with the measured numbers
- `src/core/shareLink.js` (+ `.spec.js`) — `encodeShareLink(records, {name, note})` and
  `decodeShareLink(hashOrUrl)` → `{ok, records, name, note}` or `{ok:false, reason}`. **Pure
  and framework-free** (`CLAUDE.md`): string/bytes in, string/bytes out. Compression uses
  `CompressionStream('deflate-raw')` / `DecompressionStream`, available in all three target
  engines; a Node fallback (`node:zlib`) is allowed only for the spec. No dependency is added
- `src/core/ndjson.js` — reused unchanged (`serializeNdjson`, `parseNdjson`)
- `src/composables/useShareLink.js` — boot-time hash handling beside `HelpSheet.vue`'s
  `openFromHash()`; owns the route, the "cleared after load" behaviour and the autosave pause
- `src/components/layout/ShareSheet.vue`, `src/components/layout/SharedView.vue` (or
  `viewport/` for the latter, whichever the Watch reuse suggests)
- `src/views/` — mount point only; thin, per `CLAUDE.md`
- `src/storage/autosave.js` — a "suspended" flag the Shared view sets; no other change
- `index.html` — generic `og:title`, `og:description`, `og:image` (the one preview card every
  link gets, because per-project previews need option C), and `twitter:card`
- `e2e/share-link.e2e.js`, `e2e/docs/share-sheet.docs.js`, `e2e/docs/shared-view.docs.js`
- `TODO/ACCEPTANCE.md` — a new scenario (29; 28 is reserved by `testing-011`)

## Proposed fix

**Step 0 — decide and measure (S).** Write `docs/decisions/share-link.md`. Measure the payload
for every file in `examples/` and `e2e/docs/fixtures/`, and one with an imported mesh. Paste
one URL into a Messages thread to a real iPhone and into a Gmail draft, and record where it
breaks. Check, and record, whether `navigator.share` exists inside a Tauri WKWebView (it feeds
`build-018`'s probe list). Settle the ceiling.

**Stage 1 — the format (M).** `shareLink.js`:

- Format `v1`: `#/share/v1/<base64url>`. The version is in the path so a future `v2` is
  recognised and refused politely by old builds instead of mis-parsed.
- Payload header: a tiny JSON preamble line `{"name":…,"note":…}` then the NDJSON, deflated
  together, so one string carries everything.
- **The host is a constant, not `location.origin`.** `https://app.warpcad.com` is the canonical
  host (`hosting.md`); `location.origin` is `tauri://localhost` or `localhost:5183` inside the
  native shell and the dev server, which would produce a link nobody else can open. A single
  exported constant with an override for tests.
- **Hostile input is the main risk** (`CLAUDE.md`: text that arrives with a project is data,
  never instructions). Cap the *compressed* length before decoding, cap the *decompressed*
  length while streaming (abort at, say, 8 MB so a 4 KB deflate bomb cannot expand to
  gigabytes), reject on any `parseNdjson` error that `repair` cannot handle, and run the result
  through the same load path as **Open…** so every existing validator applies. **Nothing in a
  shared project auto-runs the AI**: standing instructions and intent text load as data and the
  Shared view has no assistant at all.
- `errorReporting.js`'s scrubber already strips URL fragments; add a spec that a share URL in a
  breadcrumb or request URL arrives scrubbed, because a leaked link is a leaked project.

**Stage 2 — the two screens (M).** `useShareLink` parses the hash at boot, **at the same point
`HelpSheet` does**, and must not be code-split behind a click (see Testing: `perf-003`). Build
`SharedView` and `ShareSheet` per the Interaction model; wire autosave suspension; wire the
Replace/Merge branches into the existing open flow rather than writing a second one.

**Stage 3 — big projects (reserved, `io-017`, file after Stage 1 lands).** Gist overflow:
**Make a short link** creates a secret gist using the stored GitHub token (`tokenStorage.js`,
the `hostedBackend.js` credential rules apply — token in the `Authorization` header only) and
produces `#/gist/<id>`; the recipient reads it unauthenticated from `api.github.com`. Needs
the token-scope check from step 0, and a plain "connect GitHub first" path. **Do not build
this speculatively**: if step 0 shows every real project fits, `io-017` is closed unbuilt.

**Stage 4 — the native app (reserved, `io-018`, after `build-017` and `io-014`).** The seam is
already in the design:

- The link is `https://…`, never a custom scheme, so Messages, Mail and a browser all treat it
  as an ordinary link. **Recipient without the app** (Dad today, and Dad on an Android phone
  forever) gets the web app. **Recipient with the app** gets it opened in the app through
  **Universal Links** (iOS, iPadOS, macOS: `apple-app-site-association` served from
  `app.warpcad.com/.well-known/`, which GitHub Pages can host as a static file) and **App
  Links** (Android: `assetlinks.json`), and a `tauri-plugin-deep-link` handler on Windows.
  **Verify in `build-018`** that the `#fragment` survives into the app's launch URL on each
  platform; if it does not on one, that platform needs the payload in a path segment, which
  breaks the "hash only" rule and must be raised as a decision, not worked around.
- `shareLink.js` is already the only place that builds or parses a link, so the native app
  adds a *transport* (the OS share sheet via `io-014`'s file/share path; an incoming-URL event
  feeding the same `decodeShareLink`) and no second format.
- **Send the file** and **Open in WarpCad** from Files/Mail are `io-014`'s; do not duplicate
  them here.

## Effort

L (multi-session). Step 0 and Stage 1 are one sitting; Stage 2 is the bulk (two screens, the
open-flow branches, three viewports, three engines). Stages 3 and 4 are filed as their own
tasks.

## Testing

- **Unit** — `src/core/shareLink.spec.js`, with the degenerate and hostile cases named:
  round-trip equality of records for every `examples/` file and `e2e/docs/fixtures/*.ndjson`;
  empty project; a name with emoji, RTL text and 10,000 characters; payload truncated at every
  position of a short link (never a thrown exception, always `{ok:false}`); invalid base64url;
  valid base64url that is not deflate; a deflate bomb stopped at the decompressed cap; a version
  `v9`; and `e2e/fixtures/hostile-intent.ndjson`, `hostile-images.ndjson` and
  `hostile-merge.ndjson` loaded through a link and shown to behave exactly as through **Open…**.
  `errorReporting.spec.js` gains the scrubbed-share-URL case. Mock the clipboard and
  `navigator.share` at the boundary (`CLAUDE.md`).
- **E2E (real app, `/`)** — `e2e/share-link.e2e.js`: (1) place a cube and a sphere, **Share →
  Copy link**, read the link back, open it in a **fresh browser context** (no IndexedDB, no
  service worker), assert both bodies are visible in the Shared view and the editor chrome is
  absent; (2) tap **Make my own copy to edit**, assert the editor holds both and edits work;
  (3) **a context that already has a saved session**: open a link, assert the autosave
  contents are byte-identical before and after, then tap the copy button and assert the Replace
  confirm appears; (4) a truncated link shows the "looks incomplete" screen, not the editor;
  (5) a link for the project already open offers Merge, not Replace.
  **All three viewports with a snapshot at each** (Small-screen behavior is not "same as
  desktop"). **All three engines** — it touches IndexedDB, canvas/WebGL, touch input and
  `CompressionStream`, and WebKit is where Dad's iPhone lives.
- **Cold-link contract** — like `testing-012` does for `#/help/<slug>`, a cold open of
  `/#/share/v1/…` is now a public contract once it is in a text message. The spec above is that
  guard. It is also directly at risk from `perf-003` (deferring code not used at boot): the
  share route must mount at boot, and `perf-003`'s file should gain a one-line pointer to this
  spec when this lands.
- **Coexisting hash routes** — `#/help/<slug>` (`HelpSheet.vue`'s `HASH_RE`) and `#/share/…`
  must not interfere: open a share link, then Help, then back; and a help link still opens
  Help when a share was loaded earlier in the session.
- **Acceptance scenarios** — adds **scenario 29, "Send a project to someone who has never seen
  WarpCad"** (two browser contexts: build and share in one; open, orbit by touch, copy and edit
  in the other; confirm the first context's project is unchanged). Must be re-driven, by hand
  per `CLAUDE.md`'s Verification section, **on an actual iPhone in Safari receiving the link in
  Messages**, plus the existing scenarios that open, save or reload a project (22 "Merge a copy
  of the project" for certain; grep `ACCEPTANCE.md` for **Open…** and reload for the rest),
  because the open flow is changed.
- **Closed findings re-run** — `ui-072` (phone drag does not register) against the Shared
  view's touch navigation; the `ui-061` Help-hash mirror; `data-013`'s unrelated-project
  refusal against the "new local project id" path; `io-008`'s save fallback for **Save a copy of
  the file** on an engine with no File System Access.
- **Manual, `TODO/VERIFY.md`** (one-off, not an acceptance duplicate): the link preview card
  Messages draws for a bare WarpCad URL, and how the link looks in Gmail on Android.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
