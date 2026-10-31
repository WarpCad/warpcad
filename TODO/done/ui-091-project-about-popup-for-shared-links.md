---
title: An "About this project" field in Project settings, shown as a popup to anyone who opens a share or gist link, and in the gist README
category: ui
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-10-29 at the owner's request)
depends: []
status: done
---

> **What shipped (2026-10-31):** the owner decided to reuse io-023's `description` field as the About text, so there is no second `about` register, field, cleaner, renderer or tool. Shipped: the popup (`SharedAboutPopup.vue`) on Shared links with a non-blank description, not for the owner's own link; the header About button; the sender-hint row (`DescriptionHint.vue`) in the Share sheet and Save as gist; the description passed to the assistant as data inside the untrusted-data wrapper, with `ai-partner.md` updated. The popup carries a `shared-link` help topic. Open-question answers used: 2000 characters, Markdown subset, assistant sees it, assistant tool (the existing `set_description`). Scenarios 22 and 29 are not yet driven by hand; see `TODO/VERIFY.md`.


## Goal

**In user terms:** a person who taps a WarpCad share link or a gist link lands on a 3D model with no
explanation. They do not know what the part is, what it is for, what to look at, or what to change. The author
knows, and has nowhere to say it. Today **File ▾ → Project settings…** holds two things, both written for the
**AI assistant**: *Standing instructions* and *Build volume*. Neither is for a human reader.

Add a third, written for people: **About this project**, a short plain-text description saved with the project.
Done means:

1. **Project settings** has an **About this project** field (above *Standing instructions*), with a character
   counter like the instructions field has, and the help text "Shown to anyone who opens your share link or
   gist. What this is, what it is for, what to look at. Saved with the project file."
2. A **share link** (`#/share/v1/…`) or **gist link** (`#/gist/<id>`) whose project has an About text opens the
   Shared view with that text in a **popup** over it. One button, **View the model**, dismisses it. A project with
   no About text opens exactly as it does today, with no popup.
3. After dismissing, an **About** button in the Shared view's header opens the same popup again, so the text is
   not lost the moment it is closed.
4. A **gist** published or updated from the project carries the text in its **README**, as the quote under the
   title (the slot `gistReadme()` already has as `note`, and `useGistPublish.js` fills with `''` at both call
   sites, `:218` and `:342`).
5. The sender can see the field exists from where they share: the Share sheet and **Save as gist…** each show
   one line, "People who open this will see: *<first line of the About text>*", with **Edit…**, or, when it is
   empty, "Add a description for the people you are sending this to" with **Add…**. Both open Project settings.

**This is not the assistant's.** The About text is **never** sent to the AI assistant, not as instructions and not
as context, so this task adds no new text to the trust model in `docs/decisions/ai-partner.md`. (Open question 3
asks whether it should be.)

**What is already there, so this does not duplicate it:**

- The Shared view already shows `share.note` (`SharedView.vue:84`). That is the **sender's per-send message**,
  typed in the Share sheet and carried in the link's JSON preamble (`shareLink.js:148`); it is not part of the
  project. About is the project's standing description, travels *inside* the project file, and so also reaches
  someone who was sent the `.ndjson` file by hand. The two can both show: the note in the header, About in the
  popup.
- The Shared view also shows the gist's own GitHub **description** line (`plainGistDescription`). Unchanged.
- `io-023` is already open and lists "a project description" as its Open question 2, with recommendation (a):
  reuse the `note` slot and add a one-line editor in File ▾. **This task is that editor**, bigger than one line
  and aimed at readers, not a competitor. When this lands, `io-023`'s Step 5 ("fill `note` from the project
  description") is already done and its Open question 2 is answered; say so in this task's commit and edit
  `io-023`'s Open question 2 to point here.

## Interaction model

- **Precondition**:
  - *Editing:* a project open in the editor (nothing selected, no tool armed).
  - *The popup:* a share link or gist link that reads and folds successfully **and** whose project has a
    non-blank About text **and** is not the owner's own link. The owner opening their own published link already
    gets the **Open it to edit** / **Make a copy** choice (`useShareLink.js` `isOwnLink`); they wrote the text
    and do not need it read back at them. Their **About** button (3 above) is still there.
  - *Not in scope:* ordinary **Open…**, **Merge file…**, the autosave restore and a project file opened by
    hand. Those open in the editor, where Project settings is one click away; a popup there would interrupt
    the author. Only the two link routes open the Shared view.
- **Trigger**:
  - *Edit:* **File ▾ → Project settings…** (existing), a new first field. Saved by the existing **Save** button
    through `projectSettings.save`, which gains a third argument, beside the build volume.
  - *Popup:* none; it opens itself when the Shared view reaches `ready` (not on `opening` or `incomplete`),
    because the reader has done nothing yet and a button they have to find defeats the purpose.
  - *Re-open:* the Shared view header's **About** button, shown only when there is text.
  - *Sender hint:* the one-line row in `ShareSheet.vue` and `SaveAsGistDialog.vue`.
- **Feedback**: the popup is a labelled modal (`role="dialog"`, `aria-modal`, focus moved into it, **Esc** and the
  button dismiss it, focus returns to the Shared view). The counter reads "N / 1000 characters". Saving with text
  makes the Share sheet row show it; the gist README shows it as the quote under the title.
- **Placement**: n/a (no geometry is created).
- **Selection response / Selection count**: n/a.
- **Small-screen behavior**: built on `ModalShell.vue`, which is top-anchored full width minus 16 px at phone
  width, so the on-screen keyboard cannot hide the **editing** field. The **reading** popup is not the keyboard
  case (no field), so it uses the shell's non-sheet frame at all widths. Long text scrolls inside the popup
  (`max-height` + `overflow-y: auto`, which the shell already gives); the **View the model** button stays at
  least 44 px tall. Nothing about the popup depends on hover. The sender-hint rows wrap, never overflow, at 390 px.

## Documentation

- **Page**: `docs/sharing.md`, a new **Tell people what they are looking at** subsection under **Send a project**,
  and a sentence under **If someone sent you a WarpCad link** and **If someone sent you a gist link** describing
  the popup and the **About** button. `docs/design-intent.md`'s **Set your project's standing instructions**
  gets one line telling the reader the two fields differ (instructions are for the assistant; About is for
  people) and linking to `sharing.md`. No new page, so no sidebar entry.
- **Example**: "Open your project. **File ▾ → Project settings…**. Under **About this project** type *Fan duct
  for a 120 mm fan to a 40 mm hose. Print the three parts upright; the elbow needs supports.* **Save.** Tap
  **Share**, then **Copy link**. The sheet shows *People who open this will see: Fan duct for a 120 mm fan…*.
  Open the link in another browser: a popup shows the text over the model. Tap **View the model**; tap **About**
  in the header to read it again. Publish as a gist and open it on GitHub: the same text is the quote under the
  title."
- **Media**: update `e2e/docs/shared-view.docs.js` with a new shot `docs/screenshots/shared-about-popup.png`
  (the popup over the Shared view), embedded in `docs/sharing.md`; update the existing
  `docs/screenshots/project-settings-dialog.png` (produced by the docs-media spec that already owns it), which
  now has a second field; update `e2e/docs/share-sheet.docs.js`'s sheet shot, which gains the hint row.

## Open questions (decide before building; recommendations given)

1. **Where is it stored?** Two choices, and the second is the safe one. (a) A new LWW register beside
   `standingInstructions` and `buildVolume` (`REGISTER_NAMES` / `SECTION_REGISTER_NAMES` in
   `src/core/merge/state.js`), merged like them. But `docs/decisions/document-sync.md` records that **a released
   build refuses a name it does not know in `merge.registers`**, so an older tab would refuse to open a
   project that has an About text. (b) Mirror the **gist** register (`io-017`): value and stamp in a new
   `merge.about` key, because "a released build ignores an unknown key in the merge section, so an older tab
   still opens a published project". **Recommendation (b).** It is still last-writer-wins and still merges; the
   cost is that an older build ignores the text and drops it on its next save. Step 1 verifies exactly that
   against a fixture, so the recommendation is a test result, not an assumption.
2. **Length.** The README note cap is `MAX_NOTE_CHARS = 1000` (`gistReadme.js`) and instructions are 2000. The
   share link has a length ceiling (`io-016`; the 6,000-character figure is still an estimate, VERIFY rows 1-6)
   and the About text rides in it. **Recommendation: 1000 code points**, the same as the README so nothing is
   silently cut on the gist path, and measure how many characters a full 1000 adds to a typical link.
   If that pushes a typical project over the ceiling into the gist-overflow path, say so in the Share sheet
   (its existing size note) rather than shrink the cap.
3. **Should the assistant see it?** It would help (the description says what the part is for). But the trust
   model treats any text that arrives with a loaded project as untrusted data, and the assistant is the one
   place hostile text could act. **Recommendation: no in this task.** File a follow-up if wanted, as data only,
   behind the existing "data, never instructions" wrapper.
4. **An assistant tool to write it?** The agent that builds the part knows best what it is. A `set_project_about`
   tool in the shared registry (`src/ai/tools/`) would let it. **Recommendation: not in this task**; it needs
   the registry's hard limits and `ai-027`'s guidance updated. File `ai-0NN` after this lands.
5. **Formatting.** Plain text only, line breaks kept, links not made clickable. **Recommendation: plain text.**
   Markdown or HTML in a popup the reader did not ask for is the exact input hostile projects are made of.

## Affected files

- `src/core/projectAbout.js` (+ spec) (new): `ABOUT_MAX_LENGTH`, `cleanAbout(value)` (control and bidi characters
  stripped, line breaks kept and collapsed to at most one blank line, trimmed, capped, same family as
  `intent.js`'s `cleanText`, which it should reuse rather than copy), and `aboutFirstLine(value)` for the sender
  hint.
- `src/core/document.js` (+ spec): an `about()` getter and `setAbout(text, transaction)`, outside the fold and
  both undo stacks and a version bump, exactly as `setStandingInstructions` is; part of the merge snapshot.
- `src/core/merge/state.js`, `section.js`, `merge.js`, `src/core/mergeUndo.js` (+ specs): the register as
  decided in Open question 1.
- `src/core/project.js` (+ spec): write and read the field; `parseProject` cleans and caps it like every other
  loaded text, so a hostile file cannot smuggle markup or an oversized block. A blank value writes nothing, so a
  project without About is byte-identical to today's file.
- `src/stores/document.js`: expose `about` and `setAbout`; `src/stores/projectSettings.js` (+ spec): `save` takes
  the third argument.
- `src/components/storage/ProjectSettingsDialog.vue` (+ spec): the field, counter and help text.
- `src/components/layout/SharedAboutPopup.vue` (new, + spec), built on `ModalShell.vue`; mounted from
  `SharedView.vue` (+ spec) with the header **About** button. `src/stores/share.js` (+ spec): hold the decoded
  project's About text (rendered as text, never `v-html`) and whether the popup has been shown for this link.
- `src/components/layout/ShareSheet.vue`, `SaveAsGistDialog.vue` (+ specs): the hint row.
- `src/composables/useGistPublish.js` (+ spec): pass `about` as `note` at both call sites instead of `''`.
- `mcp/projectFile.js`: the file round-trip keeps the field when the MCP server rewrites a project it does not
  otherwise edit.
- `docs/decisions/document-sync.md` (one line on where About lives and why), `docs/sharing.md`,
  `docs/design-intent.md`, `e2e/docs/*.docs.js`, `e2e/share-link.e2e.js`, `e2e/gist-share.e2e.js`.

## Proposed fix

1. **Prove the storage choice first.** Build a fixture project with an About value stored as Open question 1(b)
   describes, and load it with the **previous released build's** reader (the way `ai-031`'s
   `prompt-saved-by-v1.2.0.ndjson` fixture does). It must open, show everything else, and ignore the unknown
   key. If it does not, fall back to a state-line key and record the finding in the decision record.
2. Add `projectAbout.js` and the document getter and setter; wire the project file read and write; round-trip
   and merge specs (two replicas edit the text, the later stamp wins, neither is lost on a copy that never
   touched it).
3. Add the field to `ProjectSettingsDialog.vue` and the third argument to `projectSettings.save`.
4. Add `SharedAboutPopup.vue`; open it from `SharedView.vue` when the phase turns `ready`, the text is non-blank
   and the link is not the owner's own; add the header button.
5. Add the sender-hint rows to the Share sheet and **Save as gist…**.
6. Pass the text as `note` in `useGistPublish.js`; confirm `quotedNote` already does the escaping (flattening,
   cap, `@mention` break) and add the About text to the existing hostile-input spec rather than writing a
   second escaper.
7. Docs, media and `io-023`'s pointer, per the Documentation section.

## Effort

M. It mirrors `standingInstructions` closely (a string register, a dialog field, a store argument) and reuses
`ModalShell`, `quotedNote` and the `SharedView` plumbing; the care is in the storage choice (Step 1) and in the
three places the same untrusted text is rendered.

## Testing

- **Unit.** `projectAbout.spec.js`: bidi and control characters stripped; the cap lands on a code point, not a
  UTF-16 unit (an emoji at the boundary is not split); blank and whitespace-only become empty; line breaks kept;
  **numerical rule:** the cap is exactly `ABOUT_MAX_LENGTH`, so 1000 is kept whole and 1001 is cut, with the
  boundary asserted on both sides. `project.spec.js`: round-trip; a blank value writes no new line or key (file
  byte-identical to today's); an old file without it loads with an empty About; a file with an oversized or
  hostile value loads cleaned and capped, with a load warning, not a refusal. `documentMerge.spec.js` and
  `fuzz.spec.js`: concurrent edits converge. `share.spec.js`: the popup state opens once per link, not for an
  own link, not on `incomplete`. `useGistPublish.spec.js`: the text reaches the README as the quote.
- **Hostile input** (the three render sites, in one spec each): `<img src=x onerror=…>`, `[x](javascript:…)`,
  `@octocat` and a bidi override in the About text render as plain text in the popup (no `v-html`, no link), as
  an inert quote in the README (the mention broken so it notifies nobody) and as plain text in the sender hint.
- **E2E (real app, `/`)**: in `e2e/share-link.e2e.js`, set an About text in Project settings, Share, open the
  link in a fresh context, assert the popup shows the text, **View the model** dismisses it and the model is
  visible, **About** re-opens it, and a project with no text has no popup and no **About** button. In
  `e2e/gist-share.e2e.js`, publish against the fake gist API and assert the README body carries the text; open
  a gist link for a project with About and assert the same popup. **The owner's own link shows no popup.**
  **All three viewports** (the popup and the dialog field are layout) **and all three engines** (a share link is
  decoded with `DecompressionStream`, and the path touches IndexedDB and `fetch`), with a snapshot of the popup
  at each viewport.
- **Acceptance scenarios**: re-drive **29** (send a project to someone who has never seen WarpCad; add "the
  recipient reads the About popup and can dismiss it with a finger, with no keyboard") and **30** (publish a
  project and open it from a short link). Also **22** (merge a copy): a copy with a different About text
  merges, and the later edit wins.
- **Closed findings re-run**: `io-016`'s repro (a link opens with no click and never writes to storage: opening
  with an About popup must not write either, and the autosave stays suspended), `io-017`'s and `io-022`'s
  README hostile-text repros, `ai-003`'s (standing instructions from a loaded file are still untrusted and the
  new field did not change that), and `io-019`'s (an older gist revision merges, and a differing About text
  does not make Update refuse).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
