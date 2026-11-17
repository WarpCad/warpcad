---
title: Drive the gist and hosted-save checks against real GitHub with a scratch area
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from the owner-queue triage (TODO/OWNER.md)
depends: []
status: open
---

> **Decided 2026-11-17 (owner, /owner, U1):** use the owner's `gh` login. Secret gists and a private `warpcad-scratch`
> repository only; delete everything at the end. Un-held; in the Findings queue.

> **Progress 2026-11-17 (kept open).** Driven against real GitHub in the production build (a temporary spec copied from
> `e2e/gist-share.e2e.js` with the fake removed, deleted afterwards). Settled in VERIFY.md: `io-023` #1, `io-022` #1,
> `io-020` #1 (OK); `io-019` #1 (**Issue**, filed `io-038`: two Updates 3 s apart lose the first edit; 65 s apart they
> merge) and #2 (OK); `io-002` #1 (OK, 1.49 MB round trip) and #2 (rate-limit half by the unit spec; the permission half
> needs a read-only fine-grained token, `OWNER.md` K6). All four test gists were deleted (ids in the commit message).
> **Left:** `io-011` #1 (two-browser hosted save, UI) and `io-035` #4 (the five send/open repros). The private repository
> `johnwebbcole/warpcad-scratch` still exists for them; delete it with `gh repo delete johnwebbcole/warpcad-scratch --yes`
> when they are done.

## Problem

Nine `TODO/VERIFY.md` rows need the real GitHub, not the e2e fake: gist titles and README rendering, "Update
gist" merging from two devices, a stale hosted save merging, a project over 1 MB through the Contents API, and the
two kinds of 403. They sat in the owner's queue, but nothing in them needs the owner's eyes or hands. Two browser
contexts stand in for "a laptop and a phone", and github.com pages can be read through `gh` or Claude in Chrome.

## Affected files

- `TODO/VERIFY.md` (each row `OK`, `Issue` or `N/A`, dated)
- New `TODO/FIND-…` files for any `Issue`

## Proposed fix

1. Make every gist **secret**. Create one **private** repository `warpcad-scratch`. Record every gist id and the
   repository in this file as you create them.
2. Drive each row below in the production build with the credential U1 named. For "laptop and phone", use two
   Playwright contexts (laptop project and phone project). For github.com rendering, read the page in Claude in
   Chrome and take a screenshot.
3. For `io-002` #2, test the permission half with a token lacking `Contents: write`. Test the rate-limit half
   against the fake with a recorded real 403 body; do not exhaust the real limit.
4. Delete every gist and the scratch repository at the end (`gh gist delete`, `gh repo delete --yes`), and list
   what was deleted in the commit message.

| Row | Check |
|---|---|
| `io-035` #4 | Closed-finding repros io-016 (Send the file), io-017 and io-020 (gist project file name), io-021 (Save as gist), native io-014 (Mail attachment, iCloud file opened in place), each with a `.warpcad` and an `.ndjson` |
| `io-023` #1 | Open a published gist on github.com and read the README: the description quote, **How this was made** with its block quotes and **Reply**, and the **Variables** table (columns, the – range, the em-dash for an open range) render as a table, not raw pipes. |
| `io-019` #1 | With a real throwaway token, edit one published project on a laptop and a phone, tap **Update gist** on both: the second shows the merge strip then *Gist updated*, and the real gist keeps both edits (the 60 s read cache is the unknown). |
| `io-019` #2 | After a gist merge, tap **Undo merge**, then **Update gist**: confirm the gist loses the merged rows ("take mine") and that this reads acceptably. |
| `io-022` #1 | Open a gist published with a prompt on github.com: the quote renders as a quote, `@name` shows as text and does not link to a profile, and nothing else on the page changed. |
| `io-020` #1 | On a real gist (secret, your account): never-saved project, type *Fan Duct* in **Name**, **Publish to a gist**; then type *Desk stand* and **Update gist**. On github.com the gist title and file list show *Desk stand* and no `fan-duct` file. |
| `io-011` #1 | With a real scratch repository and a fine-grained token: save from one browser, change the project from a second and save, then Save from the first. Expect `Merged 1 step from <owner>/<repo>`, no dialog, and the repository holding both changes (check the commit on GitHub). Also confirm a file over … |
| `io-002` #1 | **A project over 1 MB, against real GitHub.** The Contents API stops returning file content above ~1 MB (`"encoding": "none"`, empty `content`), and `hostedBackend.js` follows the blob endpoint rather than reading that as an empty project — which would commit a truncated log over a real one. That … |
| `io-002` #2 | **403 really is two different failures.** A missing `Contents: write` permission and a rate limit both arrive as 403, and they are told apart here by `x-ratelimit-remaining`/the body text, then reported as different messages (*"does not have permission… Contents: read and write"* vs *"Rate limited … |

## Effort

M.

## Testing

- No code change expected. Engines: Chromium (WebKit for the phone context, since gist copy-to-clipboard
  differs in Safari).
- Acceptance scenarios: the gist and hosted-save scenarios the rows name.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
