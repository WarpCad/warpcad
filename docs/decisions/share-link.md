# Share a project by link: the project is the link

Status: **accepted for Stage 1** (2026-10-27, `io-016`); **Stage 2 built** (2026-10-27, the two
screens — see "Stage 2 as built" below). Stage 3 (gist overflow, `io-017`) and Stage 4 (native app,
`io-018`) build on this record.

## Decision

A project travels inside a URL **fragment**: `https://app.warpcad.com/#/share/v1/<payload>`.
`payload` is base64url (unpadded) of `deflate-raw` over one JSON preamble line
(`{"name":…,"note":…}`) followed by the project's NDJSON. `src/core/shareLink.js` is the only
module that builds or parses it.

Why this shape:

- The app is static GitHub Pages with no backend (`hosting.md`), so there is nowhere to put a
  project except the URL. The document is feature recipes and design intent, never meshes, so it
  is small and compresses well.
- A fragment is never sent to a server. The project stays out of Pages' logs and out of Google
  Analytics, which `docs/privacy.md` already promises for "shared-project links".
- The version is a path segment (`v1`) so a later `v2` is recognised and refused politely by an
  old build rather than mis-parsed.
- `deflate-raw` through `CompressionStream` / `DecompressionStream` ships in Chromium, Firefox and
  WebKit, so no dependency is added.
- The host is a **constant** (`SHARE_HOST`), not `location.origin`: inside the Tauri shell the
  origin is `tauri://localhost` and on the dev server it is `localhost:5183`, neither of which
  anyone else can open.

## Options compared

| Option | Verdict | Why |
|---|---|---|
| **A. The project is the link** (`#/share/v1/…`) | **Chosen, Stage 1** | No server, account or token; works offline once cached; private by construction |
| **B. A GitHub gist** (`#/gist/<id>`) | Stage 3 (`io-017`), overflow only | Short link, no size limit worth naming, but the *sender* needs a token with the `gist` scope, which is the setup friction this feature exists to remove. Whether a fine-grained token can create gists is **unverified**; check before building. Build it only if a real project does not fit A |
| **C. A share service we host** | Rejected for now | Breaks "static, no backend", adds an operated service, abuse handling and a privacy policy. The only option that gives a per-project preview card in Messages. Revisit only if A and B both fail real use |
| **D. Send the `.ndjson` file** | Kept as **Send the file**, not the link | The recipient must know what to do with a file; the native app's job is `io-014` |

## Measured sizes (Step 0, 2026-10-27)

Full URL length for every project file in the repository, produced by `encodeShareLink` with the
file name as the project name:

| Project | NDJSON bytes | Link characters |
|---|---|---|
| `examples/dovetail-phone-holder.ndjson` (largest real project) | 7,203 | 2,303 |
| `examples/chamfer error.ndjson` | 728 | 629 |
| `e2e/fixtures/hostile-images.ndjson` | 2,399 | 805 |
| `e2e/docs/fixtures/small-assembly.ndjson` | 1,657 | 522 |
| `e2e/docs/fixtures/pi-on-screen.ndjson` | 1,135 | 498 |
| the 27 other `e2e/docs/fixtures/*` and `e2e/fixtures/*` files | 99 to 828 | 178 to 571 |

Every file in the repository is **under 2.4 K characters**, about 3.1 to 1 over raw size on the
largest, less on tiny ones where the 170-character host and route dominate. `dovetail-phone-holder`
is the realistic upper end and fits comfortably under a 2,000 to 6,000 character budget.

An imported mesh (`io-009`, an `asset.mesh` record) is not represented in any shipped file, so it
is **not measured here**. It stores welded vertices and indices, which deflate poorly relative to
recipes, so a mesh part is expected to exceed the ceiling. When Stage 2 builds the sheet, measure
one real STL import and record it here.

## The ceiling

Proposed working threshold: **6,000 characters of URL**. Over it the Share sheet says "This
project is too big to send as a link" and offers **Send the file** (and **Make a short link** if
`io-017` exists). It is a constant in the sheet, not in `shareLink.js`, which encodes whatever it
is given.

**Not yet measured on a device.** The 6 KB figure is the filing's estimate. Pasting a long URL into
an iPhone Messages thread and into a Gmail draft, to see where each wraps, truncates or stops
linkifying, needs a person with the hardware; it is logged as an open check in `TODO/VERIFY.md`
and this record should be updated with the real number. Likewise **whether `navigator.share`
exists inside a Tauri WKWebView** is unchecked here and feeds `build-018`'s probe list.

## Receiving: hostile input is the main risk

Text that arrives with a project is data, never instructions (`ai-partner.md`). In code:

| Limit | Value | Where it applies |
|---|---|---|
| Compressed payload | 2,000,000 base64url characters | checked before any decoding |
| Decompressed payload | 8 MiB | enforced **while streaming**; the reader is cancelled at the cap, so a tiny deflate bomb never allocates its full size |
| Parse errors | zero tolerated | any line that is not JSON, or is not an object, refuses the whole link: never a half-parsed project |
| UTF-8 | strict | invalid bytes refuse the link |

The decoded `records` equal what `parseNdjson` returns for the same file, which is the input
**Open…** hands to the load path, so every existing validator downstream (intent caps, image
checks, merge-state checks) applies unchanged. `decodeShareLink` never throws; failures are
`not-share-link`, `unsupported-version`, `too-large`, `malformed` (not base64url or not a complete
deflate stream, which is what a truncated link looks like) and `corrupt`.

`deflate-raw` carries no checksum. Truncation is caught because a deflate stream missing its final
block fails to decompress in every engine; `shareLink.spec.js` truncates a link at every position
to prove it rather than assume it. A link *altered* mid-stream that still decompresses to valid
NDJSON is, by design, just a different project: a link is not signed.

`errorReporting.js` already drops any event containing a URL fragment and strips the fragment
from `request.url` and the referrer; `errorReporting.spec.js` now pins that for a share URL
specifically, because a leaked link is a leaked project.

## Stage 2 as built (2026-10-27)

**What the Shared view reuses from Watch (`ai-017`)** rather than adding a second read-only mode:
the shared project is folded into a throwaway document (never the live one) and handed to
`timeline.watchFork` as a `WatchSource` (`stores/share.js`). From Watch it gets, unchanged: the
viewport rendering the given document instead of the live one (`timeline.previewDocument`), the
scene list and body count following it (`timeline.previewBodies`, so the DOM and the canvas agree),
picking off (`pickAt` returns while `timeline.previewing`, so tapping a body does nothing), no
transform gizmo, and no drop able to append to the log. Two things Watch does not do were added:

- a `presentation` prop on `Viewport.vue` hides the Operations toolbar, the tool sheets, the
  dimension lines and the amber "previewing" outline (that outline means "a past state of *your*
  project", which this is not), and frames the camera on the watched model when it arrives;
- Watch ends on any whole-document load. The boot restore is awaited before the Watch starts, and
  the share store starts it again if anything else ends it while the Shared view is up.

**What it reuses from the open flow.** **Make my own copy to edit** is
`fileMenu.requestOpenShared`, one more branch of the File menu's own Open: the existing **Replace
the project?** confirm (`ReplaceConfirmDialog.vue`, mounted in the Shared view because the File
menu is not) when the browser holds content, with a **Download yours first** / **Save yours first**
button since there is no File menu to do that from; `persistence.openText` for the load, so every
validator, the chip and the autosave that follows are Open's; and, for a link whose project id
equals the open project's, **Merge their changes** through `persistence.mergeText` → `mergeIn` with
its **Undo merge** strip, or **Open theirs instead**. The recipient's copy gets a fresh id from
`createProjectId` (`src/core/replica.js`; the TODO calls it `makeProjectId`) written into the
state line's `merge.project` (`src/core/shareCopy.js`). A legacy project (no id) keeps none: a
document mints an id only for content it made, and synthesising a merge section here would be a
second writer of that format.

**What it reuses from Help.** `useShareLink` runs in `AppView`'s `setup`, beside where
`HelpSheet.vue` reads `#/help/<slug>`, and clears the hash with `history.replaceState` after a
successful load as Help does (`ui-061` item 7). Each route touches only a hash it owns; a share link
pasted into an open tab arrives as `hashchange`.

**Opening never writes.** `createAutosaver` gained one flag, `setSuspended`: while set, changes are
ignored and `flush`/`flushSync` write nothing (store or mirror), and a stale mirror is not cleared.
The share store sets it synchronously in `setup`, before `bootStorage` starts the restore, and
clears it only when the Shared view is left; a write scheduled before suspending is held and sent
on resume. `useShareLink.spec.js` fails if the stored record changes; `e2e/share-link.e2e.js` reads
IndexedDB before and after.

**Choices made where the spec left room:**

- **The empty-scene reason "beside" Share** is visible beside the button at laptop width only.
  Below 1100px the header has no room for words (measured at the 820px tablet: the label and the
  reason pushed the Assistant button 141px off the row), so the button is an icon and a tap on it,
  dimmed, opens the sheet with only the reason in it.
- **The dev host's phone header** also carries the dev-only Live MCP entry (`ui-075`); with Share
  as well the row was 435px at 390. There, and only there, Share steps out of the row and **File ▾ →
  Share…** is its route (the `HelpEntryButton` precedent). The item is in the File menu at every
  width. A hosted build's phone header keeps Share and measures exactly 390px in all three engines.
- **Copy link copies the message and the link** ("the same text" Send… hands over), on two lines.
- **The sender's note** is carried and shown if present; the sheet has no field for one, because
  the spec's list of the sheet's controls has none.
- **Same-project detection** compares the link's project id with the live (restored or opened)
  project's. A recipient who made their own copy has a new id, so a later update from the sender
  asks Replace there, not Merge: that is the "new local project" rule doing its job.
- **The ceiling** stays the 6,000-character estimate (`SHARE_LINK_MAX_CHARS` in `ShareSheet.vue`);
  the iPhone and Gmail measurements are still open in `TODO/VERIFY.md`. An imported-mesh project was
  not measured in this stage either.

## What this decision does not cover

Gist overflow (`io-017`); Universal Links / App Links and whether the `#fragment` survives into a
native launch URL (`io-018`, verified in `build-018`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
