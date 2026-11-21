# Store and share a project as a GitHub gist

Status: **accepted for Stage 1** (2026-10-28, `io-017`, Step 0). Stages 2 and 3 build on this record.

## Decision

A project is published as a **secret gist** holding exactly two files, `<slug>.ndjson` (the project
file, byte-identical to **Download copy**) and a generated `README.md`. The gist id is the share
link (`https://app.warpcad.com/#/gist/<id>`). Republishing PATCHes the same gist. Reading needs no
token. The sender's credential is a **fine-grained personal access token with only the account
permission Gists: Read and write**, stored under its own key (`GIST_CREDENTIAL_KEY = 'github-gist'`),
separate from the hosted-repository token (`io-002`).

This reverses the filing assumption that fine-grained tokens cannot touch gists. They can (below),
so the classic `gist`-scope token is the **fallback**, accepted but not recommended.

## Step 0 findings (real calls, 2026-10-28, throwaway tokens, all test gists deleted)

| Question | Result |
|---|---|
| Fine-grained token, Gists: write only: `POST /gists`, `PATCH`, `DELETE` | 201 / 200 / 204. Same id after PATCH. Secret by default (`public: false`) |
| Fine-grained token, write to a repository (`POST /user/repos`) | **403**. Cannot reach repositories |
| Classic `gist`-only token, same calls | 201 / 200 / 204. `POST /user/repos` → 404 |
| Classic token's `X-OAuth-Scopes` | `gist`; exposed to browsers via `Access-Control-Expose-Headers` |
| Fine-grained token's scopes header | **None.** It carries `x-accepted-github-permissions` instead. The "token can do more than WarpCad needs" warning is therefore classic-only; a fine-grained token is narrow by construction |
| Token expiry | `github-authentication-token-expiration` header on both kinds (30 days by default); the dialog should show it |
| `GET /gists?per_page=1` as a validity check | 200, but the response says `allows_permissionless_access=true`: **it does not prove the Gists permission**. Do not use it as the only check |
| Write probe that proves the permission and writes nothing | `POST /gists` with `{"files":{}}` → **422** with the permission (nothing is created; gist count unchanged), **403** `Resource not accessible by personal access token` without it. Both measured 2026-11-18 (classic `gist` token, and a fine-grained token with no permissions). The earlier probe, `PATCH /gists/<all-zero id>`, answers **404** either way, so it proved nothing (`TODO/io-037`) |
| Bad token | 401 `Bad credentials`; the body does not quote the token (we still never echo server text) |
| Login for the dialog | `GET /user` → 200 on both kinds |
| CORS from `https://app.warpcad.com` | `access-control-allow-origin: *` on `api.github.com` (including the `POST`/`PATCH` preflight) and on `gist.githubusercontent.com` |
| Unauthenticated read `GET /gists/<id>` | 200 for a secret gist; limit **60 requests/hour/IP** (`x-ratelimit-limit: 60`). A shared classroom IP can hit it |
| Authenticated limit | 5000/hour |
| 100 KB file | inline in full, `truncated: false` |
| 2 MB file | `truncated: true`, about 0.92 MB inline. `raw_url` (`gist.githubusercontent.com`) returns all 1,999,937 bytes |
| After `DELETE` | the API answers 404 once the cache expires; a public read can still return 200 for up to 60 s (`cache-control: public, max-age=60`). The raw URL is cached 300 s. The delete confirm already says cached copies may remain |

## Consequences for the build

- **CSP.** Production `connect-src` has `api.github.com` but **not** `gist.githubusercontent.com`.
  Reading any file over about 1 MB needs that one host (the API gives no other way to the full
  content). Add exactly that origin in Stage 2, keep `e2e/csp.e2e.js`'s no-wildcard rule, and add
  a test that the host is present.
- **Read path.** Fetch `GET /gists/<id>`; for the chosen file, if `truncated`, fetch `raw_url` and
  check its host is `gist.githubusercontent.com` before following it. Cap the size before parsing
  (reuse `io-016`'s decompressed cap).
- **Rate limit.** A 403/429 with `x-ratelimit-remaining: 0` on the unauthenticated read maps to
  *"GitHub is busy. Try again in a few minutes."*
- **Validation.** The connect dialog validates with the write probe above (422 = granted), not with
  `GET /gists?per_page=1`, then shows the login from `GET /user`.
- **Merge (Stage 3).** Not in this task's first stages. Interim behaviour: **Update refuses if the
  gist's latest revision is not the one last published**; the owner opens the gist first. File
  `io-0NN` for the `mergeIn` flow. *Replaced by `TODO/io-019`: Update now merges first — see
  "Stage 3: Update merges the gist first" below.*

## Options compared

| Option | Verdict | Why |
|---|---|---|
| **A. Secret gist per project** | **Chosen** | Short link, no hosting, free history, readable on github.com, reads need no token. Secret is *unlisted*, not private; the disclosure says so |
| **B. Public gist** | Offered behind an explicit tick, never default | Searchable by anyone |
| **C. Repository file** (`io-002`) | Stays | Right for backup, wrong for "send to dad" |
| **D. A share service we host** | Rejected | Breaks "static, no backend" (`share-link.md` option C) |

### Token type

| Option | Verdict | Why |
|---|---|---|
| **Fine-grained, Gists: write** | **Recommended** | Cannot touch repositories (403), shows its own expiry, GitHub's current model. Account-wide for gists; it cannot be limited to one gist |
| **Classic, `gist` scope** | Accepted, shown as the fallback | Same reach for gists, cannot touch repositories, but classic tokens are the legacy kind and the scopes-header warning only applies here |
| **Reuse the `io-002` repo token** | Rejected | Wrong permission, and the two must be revocable separately |
| **OAuth device flow** | Rejected | Needs a registered OAuth app and, for the web flow, a server |

Neither token can be limited to a single gist; the sheet says so in plain words.

## Stage 2a as built (2026-10-28)

- **The `gist` field** is `{id, public, lastRevision, owner}` and is stored as `merge.gist`
  (`[value | null, stamp]`), a last-writer-wins register merged like the others
  (`document-sync.md`). Setting it is not a local undo step: it records a fact about GitHub.
- **`owner`** is the GitHub login that published it. A project received as a file otherwise
  inherits the sender's gist and would offer an Update GitHub refuses; with `owner`, a different
  account is offered Publish. Own-link detection also requires the owner to match the connected
  account when one is connected.
- **A copy never keeps the gist.** `withoutGist` (`shareCopy.js`) is applied by `withProjectId`,
  so "Make my own copy to edit" starts a project that owns nothing.
- **Stale reads.** The public (unauthenticated) API can serve a read up to 60 s old
  (`cache-control: max-age=60`), so Update accepts a revision this session itself wrote; the memory
  does not survive a reload. Since `io-038` Update reads with the token and checks the write's
  `parent`, see "Stage 4" below.
- **Byte identity.** A Download copy taken *after* publishing contains `merge.gist`, which a file
  cannot know before the gist exists; the published file equals a Download copy taken before.
- **Undo merge** leaves the gist field alone. A stale `lastRevision` only makes Update refuse,
  which is the safe direction. *(Since `io-019` a stale `lastRevision` makes Update merge again,
  which brings in nothing new.)*

## The gist's name (`TODO/io-020`)

- **One source of truth: the Share sheet's Name.** The sheet's `share-name` field is what the owner
  sees and calls "the recipient's title", so publish and update take it (`choice.name`) and the gist's
  description, README heading and file name all come from it. `ShareGistGroup` receives it from
  `ShareSheet` as a prop.
- **The project's own name is only the fallback** for a caller that passes no name. It is not written
  back when a gist is published. The finding's first choice (write the sheet's name back as the
  project's name) was not taken: it would rename the project file's slug on every publish and touch the
  autosaved document from the Share sheet, which the sheet otherwise never does. Reopening the sheet on
  a never-saved project therefore offers *Untitled* again, while the gist keeps the name it was given;
  the next update with that name keeps the gist and file in step.
- **Blank is never empty.** A blank Name publishes as `Untitled`, the same fallback the README and
  description already had.

## Open item

None on the write probe: both its answers were measured on 2026-11-18 (see the table above).

## Save as gist and Ctrl/Cmd+S (`TODO/io-021`)

- **Ctrl/Cmd+S stays local.** Only File ▾ → Save as gist… / Save to gist, or the Share sheet, saves to the gist. The save chip shows how far behind the gist is ("Gist: N changes not saved") rather than pushing.
- **"N changes" counts document-version bumps** since the last gist save. It is kept for this session only: after a reload or a new project, the chip shows autosave's wording until the next gist save.
- **Save to gist keeps the gist's title.** Without that, a never-saved project would rename the gist's file to `untitled.ndjson`.
- **A gist from another account is not this project's target.** The project counts as having a target only when the gist field exists and its owner is the connected login, or when no account is connected. Otherwise Save as gist… creates a new gist under the user's own account, as the Share sheet does.
- **Share-sheet saves also update the chip**, because both entry points share `useGistPublish`.
- **Failure placement.** A refused Save to gist (e.g. `different-project` or `merge-conflict`; before `io-019`, `changed-remotely`) opens the dialog on its update step with the `gistMessages.js` wording and a retry button. Nothing is written.

## Stage 3: Update merges the gist first (`TODO/io-019`, 2026-10-29)

Replaces Stage 2's interim rule (Update refused with `changed-remotely`, "open its link first,
then update"). An owner who edits the same published project on two devices and taps **Update
gist** on both no longer has to open the gist and redo work.

- **The flow.** `useGistPublish.update()` reads the gist (`readGist`; unauthenticated when this stage shipped, with the owner's token since `io-038`) as before.
  When its revision is neither the field's `lastRevision` nor one this session wrote, the gist's
  project file goes through `persistence.mergeText` — the same `mergeIn` as **Merge file…**
  (`ui-062`) and the hosted Load (`io-011`), under the source name *the gist*, so the same toast
  (`Merged 2 steps from the gist`, **Undo merge**) or conflict banner. Only then is the project
  serialised and patched, so the merged project is what the gist gets.
- **Never write before the local merge has landed.** Checked first, changing nothing: History
  previewing or the Assistant running (`merge-unavailable`, the moments **Merge file…** is dimmed
  for), a file that does not read (`unreadable`), a different project by `relatedness`
  (`different-project`), and a project replaced (Open, New) while the read was out
  (`not-published`). A merge that is refused after that is `merge-failed`. Each writes nothing to
  the gist; each has one fixed sentence in `gistMessages.js`.
- **Conflicts stop the write.** A merge with conflicted rows lands locally with the banner, and
  the update stops (`merge-conflict`): the person looks before their gist changes. The field's
  `lastRevision` moves to the merged revision as soon as the merge lands, clean or not, so the
  next **Update gist** does not merge the same revision again and publishes what the person kept.
  Without that, conflicts are derived from the fold (`docs-022`), so a row the person chose to
  leave broken would refuse every later update.
- **Undo merge after a gist merge** is "take mine": the next Update publishes the project without
  the gist's rows, as ordinary stamped removals, so the copies still converge. The gist's history
  on GitHub keeps the earlier revision.
- **No waiting for a quiet moment.** An unasked-for disk merge (`io-010`) waits while a drag,
  popover or dialog is open. This merge is the answer to a tap on a button inside the Share sheet
  or the Save-to-gist dialog, which are themselves such surfaces, so it runs at once, as Save
  merging a changed file with a menu open does.
- **Stale reads.** The 60-second cache on the public read can serve a revision this
  session just wrote (`io-038` later closed the other-device case): `wroteRevision` still accepts it, so a stale read of our own write is never
  merged. A read that carries no revision is merged and leaves `lastRevision` as it was.
- **GitHub's own `409`** (`conflict`, the gist moved during the PATCH) now says to update again,
  which merges.

## The prompts in the README (`TODO/io-022`)

- **A reversal, on purpose.** `src/core/gistReadme.js` said intent text and the AI conversation are deliberately not in the README, because the README is the part that gets skimmed and indexed. The owner has decided the prompts that made a project belong there, so a reader on github.com sees the requests. This reverses that exclusion for **prompts only**. Standing instructions, intent text and the conversation stay out.
- **On by default, one tick to leave out.** **Include prompts in the README** is on by default, and its note counts the prompts. Unticking it hides them from the README, not from the file: the `.ndjson` always carries them, so the note says so.
- **Public gists list them.** A public gist is listed on GitHub for anyone to read, so the disclosure under the group already says that, and the docs say to check the box first.
- **Still data, never markup.** Each prompt is cleaned, capped and escaped like a body name, and an `@name` is broken (`&#64;`) so a prompt notifies no one. The section caps at 20 prompts and 6,000 characters in all, then counts the rest.

## The README is the project's brief (`TODO/io-023`, 2026-10-30)

- **Why the owner's Fan Duct README had no How this was made.** Not a bug in the publish path. The gist's `fan-duct.ndjson` is the owner's local file byte for byte, record lines included, with `merge.prompts` missing (and the clock two counts on). Only a build from before `ai-031` drops that section, and v1.3.0 has neither `ai-031` nor `io-022`. The gist was created at 16:49:41 UTC on 2026-10-29, 13 minutes after the v1.4.0 deploy finished (16:36:14), and `src/pwa.js` never reloads an open tab: it offers **Reload**. So the tab ran the older build, or restored an autosave the older build had written. An unticked box is ruled out: it never removes prompts from the file. The same file published through this build's Share sheet and **File ▾ → Save as gist…** carries both prompts in the README and the file.
- **What it carries, in order:** the title; the project's **description**; the **Open in WarpCad** link, counts and file link; **How this was made** (each request, then the agent's reply as a second quote headed **Reply**, then the bodies); **Variables**; the footer. The sections after the counts are one list (`SECTIONS` in `gistReadme.js`), so a later property meant for a reader is one entry.
- **The reply travels; requests and replies share one budget.** It is `ai-032`'s stored reply, rendered exactly as the request is: cleaned, quoted line by line, escaped, `@` broken. The 6,000-character cap covers requests and replies together, so the README stays well under GitHub's rendering limits.
- **Only the conversation is opt-out.** **Include prompts in the README** governs the request and the reply, and its note now says so ("the request and the reply"). The description and the variables always go: they describe the part a reader may print or change, not a conversation the owner may want private.
- **A new description, not the old note slot.** The owner wanted text written for people, separate from the standing instructions, which are written for the AI and stay out of the README. It is a new last-writer-wins register, `description`, set by a person in **File ▾ → Project settings…** or by an agent with `set_description`. Like `gist`, it travels in the file's merge section as `merge.description: [text, stamp]`, not under `merge.registers`, because a released build refuses an unknown register name but ignores an unknown section key. A v1.4.0 tab opens such a file and drops the field if it saves; a merge brings it back (fixtures `description-*.ndjson`). The old `note` input, which was never filled, is gone.
- **A Markdown subset, sanitised twice.** Allowed: paragraphs, `- ` / `* ` / `+ ` bullet lists, `**bold**`, `*italic*` / `_italic_`, `` `code` ``. Everything else (links, images, autolinks, HTML, headings, numbered lists, quotes, tables, code blocks) is plain text. The text is cleaned and capped (2,000 characters) when it is stored and on load, and `parseDescription` cleans it again before rendering. The README writes its own markers around escaped text. The app renders the tokens as elements with text content (`DescriptionText.vue`, no `v-html`).
- **Variables with their ranges.** One row per variable, in definition order: name, value with its unit, and a range (`40–120 mm`, `≥ 40 mm`, `≤ 120 mm`, an enum's option labels, `yes / no`). A number with neither `min` nor `max` reads `—`, and the **Range** column is left out when no variable has one, rather than shown blank. Cells are one line, capped, escaped (`|` included) and `@`-broken. At most 100 rows, then "and N more". A range cannot be invented at publish time, so the agent guidance (the shared tools section of the guide and system prompt, and `define_variable`'s schema) now asks agents to set `min` and `max` on every variable a person is meant to change.

## Stage 4: a revision another device wrote moments ago (`TODO/io-038`, 2026-11-19)

Found by driving `io-019` against real GitHub: device B updates, 3 s later device A updates, and A's
write silently dropped B's edit, because the merge's base read was unauthenticated and up to 60 s old.

- **Authenticated base read.** `readGist({ id, token })` sends the token on the API request, so the
  owner's merge base is not the public 60 s cache. The Shared view keeps the unauthenticated read.
  **Unverified assumption:** GitHub does not serve an authenticated `GET /gists/<id>` from that
  cache. Owner item K7 re-runs the two-context drive on real GitHub to settle it; the safety net
  below makes the fix correct either way.
- **The `parent` check.** A `PATCH` reply lists the gist's history; `history[1]` (`parent`) is the
  head the write landed on, whatever the read showed. When `parent` is neither the revision this
  device read nor one it wrote, a revision was missed. `parent` is `null` when GitHub leaves it out;
  that is unknown, never treated as a miss.
- **Merge, then write again.** The missed revision is read by its sha (`GET /gists/<id>/<sha>`,
  exact, no cache can serve it stale), merged like any gist merge, and written again in the same tap.
  The gist's history gains two revisions, and the person sees *Merged 1 step from the gist*, then
  *Gist updated*. Question Q106 asks the owner to confirm this over refusing alone.
- **Session-only memory.** If the recovery cannot finish (offline, History previewing, a conflict),
  the missed revision is remembered for this session and the next Update merges it first. The memory
  is lost on reload; the revision stays in the gist's history on GitHub.
- **`missed-revision`.** The one sentence for a recovery that could not finish:
  *Another device updated this gist a moment ago. Update gist again to merge its changes.*
  (Q107 asks whether to say that rather than "try again in a minute".)
- **The fake.** `e2e/support/fakeGistApi.js` takes `staleBy` (a count of revisions): `GET /gists/<id>`
  answers the gist as it was that many revisions ago, with or without a token, and a read by sha is
  always exact. Case 11 of `e2e/gist-share.e2e.js` uses it.

## An agent leaves the project ready to publish (`TODO/io-040`, 2026-11-21)

The owner asked that, once an agent finishes, **Publish** needs nothing typed: the title, the
description and any extra files are already staged. A person still taps Publish. No agent tool
publishes, asks for a token, or flips **Include prompts in the README**.

### Constraints checked first (Step 1)

| Question | Finding | Source |
|---|---|---|
| Does the Gist REST API take binary file content? | **No.** `files.<name>.content` is a JSON string ("Content of the file", required on create; "The new content of the file" on update). No encoding field and no binary mode is documented. A JSON string carries Unicode text, not arbitrary bytes, so a ZIP (3MF), a binary STL or a PNG cannot pass through unchanged. Base64 would arrive as a `.3mf` that is not a 3MF. A gist is a git repository and `git push` can carry binary files, but that needs the git protocol, which a static page cannot use. | GitHub REST docs, *Gists* (read 2026-11-21) |
| When does a file stop coming back inline? | "The API provides up to one megabyte of content for each file"; over that, `truncated: true` and only part of `content` (measured above: a 2 MB file gave about 0.92 MB inline). `raw_url` serves the whole file up to 10 MB; above that only `git_pull_url` (a clone) has it. The files list itself is cut at 300 files. | Same page, and the Step 0 table above |
| Does WarpCad already write a 3MF? | **No.** `src/core/export.js` writes binary STL (`@jscad/stl-serializer`, `binary: true`) and OBJ. 3MF is import-only (`src/io/meshFormats/`). The same serializer writes ASCII STL with `binary: false`. | Code, 2026-11-21 |
| How big is an ASCII STL? | About 250 bytes a triangle from that serializer (full-precision numbers, seven lines a facet), against 50 for binary: about 5×. A 4,000-triangle part is about 1 MB, which is GitHub's inline limit. | Measured from `CSGToStla.js`'s facet format |
| Do the other two agent paths carry finishing steps? | **Partly.** `warpcad://guide` is composed in `src/ai/prompt.js` (`guideFor`, served by `src/ai/mcpPrompts.js`) from the same `SECTIONS.tools` as the in-app prompt, so it already named `set_description`, but nothing told an MCP agent to set a name, stage files or check readiness. The browser-agent setup text (`STARTER_BROWSER_AGENT`, shown by `BrowserAgentSetup.vue`) named only `record_prompt`, so no finishing step at all, not even `record_response`. | Code, 2026-11-21 |

### Consequences

- **Kinds: `stl` and `note`. `3mf` is dropped from `stage_gist_files`'s enum.** The API cannot
  carry a 3MF, and the app has no 3MF writer anyway. A staged `stl` is published as **ASCII STL**
  (text, so it goes through `content` byte for byte). Every slicer reads ASCII STL. OBJ is also
  text and could be a later kind if someone asks for it.
- **No preview picture** (the task's open question 2: no). A PNG cannot go through the API, and an
  SVG renderer is not worth building for this task. If one is wanted later, it needs its own
  follow-up.
- **Big exports still publish.** An STL over about 1 MB is truncated in the API's inline read, but
  github.com and `raw_url` show it whole up to 10 MB. Publish sends it anyway and the toast says
  it is large. `get_publish_readiness` reports each file's `approxBytes`, so the agent sees the
  size before it hands back.
- **The staged list is document state, never bytes.** The `gistExtras` register holds
  `{ kind, name, ids }` for an STL (`ids: []` means every body on screen) and
  `{ kind, name, text }` for a note. Publish builds the STL from the live timeline at tap time.
  A mesh is never stored (CLAUDE.md, Architecture). Caps are in code (`GIST_EXTRAS_LIMITS`,
  `src/core/gistExtras.js`, read by `src/ai/tools/limits.js`): at most 5 files, a note at most
  20,000 characters, at most 200 body ids a file. File names are slugged the way `gistFileName`
  slugs the project file, and a name that would collide with `README.md` (in any letter case),
  the project file or another staged file is refused.
- **A project name register.** `name`, merged exactly like `description`: a last-writer-wins
  register written as `merge.name: [text, stamp]`, and `gistExtras` as
  `merge.gistExtras: [list, stamp]`. Neither goes under `merge.registers`, so an older build
  ignores both keys and keeps the file. It is cleaned to one line and capped at the README
  title's 120 characters (`MAX_NAME_CHARS`). It is a suggestion for the gist's title and Save's
  dialog, and it never renames a file on disk (the task's open question 1: no).
- **One finishing paragraph** (`src/ai/finishing.js`) is used by the in-app prompt, the MCP guide
  and the browser-agent setup text: set the name, set the description, stage the files a person
  would print with, call `get_publish_readiness` and fix what it lists, then record the reply.
  Never ask for a GitHub token, and never try to publish.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
