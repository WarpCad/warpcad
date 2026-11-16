---
title: Save projects as name.warpcad everywhere the web code names a file, and keep opening .ndjson
category: io
kind: finding
priority: high
model: opus
milestone: M19
depends: [io-036]
status: open
---

> Split 2026-11-16 from [`io-030`](../../warpcad-native/TODO/M19-io-030-project-file-type-claims-every-ndjson.md)
> (owner decision 2026-11-13: shape 2, a `.warpcad` extension). This is the web half. The native half,
> the iOS type declaration, is [`io-036`](../../warpcad-native/TODO/M19-io-036-ios-declares-warpcad-type-and-imports-ndjson.md).
> It lands first, because the native app ships this repository's `build:native` output: a native Save that
> writes `.warpcad` before the shell declares the type leaves a file the Files app cannot open in WarpCad.
> Gates the App Store submission (Gate 5): the first public build must already save `.warpcad`.

## Problem

Every place that writes a project file names it `*.ndjson`. `.ndjson` is a general format (logs, data
exports) that WarpCad does not own, so the native app cannot claim it as its own type (`io-030`). The owner
chose a WarpCad extension: **Save** writes `name.warpcad` (NDJSON inside, unchanged) and **Open** keeps
reading `.ndjson`, so every existing project still opens. No migration renames a user's file; the next
Save As offers the new extension.

The extension is spelled as a literal in many places, not in one constant, so a partial change would leave
some paths writing `.ndjson` and some reading only `.warpcad`.

One web-only risk: `ACCEPT_ATTRIBUTE` in `src/storage/fileSystem.js` exists because iOS Safari greys out
file types it does not recognise (`docs/decisions/interaction-model-qa.md` §10, Q16). In the browser no app
declares `.warpcad`, so the PWA on an iPad may grey out a `.warpcad` file unless `accept` keeps a catch-all
that iOS honours.

## Affected files

Write side (Save names the file `.warpcad`):

- `src/native/files.js:66-69`: `PROJECT_EXTENSION`, `PICKER_FILTERS`; `projectFileNameFor` (`:126-132`),
  `listProjects` (`:244-260`, lists only `PROJECT_EXTENSION`), the opened-file copy name (`:384-395`)
- `src/storage/fileSystem.js:56-79`: `PICKER_TYPES`, `ACCEPT_ATTRIBUTE`, `MIME`, `EXTENSION`; `projectFileName` (`:140-150`)
- `src/core/shareCopy.js:86-107`: `shareFileName` (**Send the file** in the share sheet); `src/components/layout/ShareSheet.vue:230` (its MIME)
- `src/core/gistLink.js:132-163`: `gistFileName`, the project file inside a published gist
- `src/storage/hostedBackend.js:60`: `DEFAULT_HOSTED_PATH`
- `src/ai/subscriptionRoute.js:17` and `src/components/ai/SubscriptionRoute.vue:63`: the `mcp:add` example
- `mcp/server.js:9,306` and `scripts/mcp-add.mjs:8,41,105`: usage text and examples (the server takes any path; no extension check)
- Comments and on-screen examples: `src/components/storage/ProjectNameDialog.vue:10`, `NativeOpenSheet.vue:11`,
  `DiskChangeDialog.vue:4`, `src/stores/fileMenu.js:67`

Read side (Open accepts both):

- `src/storage/gistBackend.js:34,56-57,87,415-428`: `chooseProjectFile` picks the single `*.ndjson`, else
  `project.ndjson`. Must accept `.warpcad` too, and say which wins when a gist holds both
- `src/core/gistMessages.js:105` (the "ambiguous" wording)
- `src/composables/useShareLink.js:174` and `src/stores/persistence.js:178-186` (`nameOfFile`): strip `.warpcad` as well
- `src/native/files.js` `listProjects`: list both extensions in Documents, so projects saved before this change still show

Not changed (internal app data, never shown in Files): `src/storage/nativeMirror.js:23,84,109`
(`autosave.ndjson`, `library/<id>.ndjson`). Say so in the decision record so a later pass does not "fix" them.

Tests and media: 41 unit specs name `.ndjson` (`git grep -l '\.ndjson' -- '*.spec.js'`, including
`mcp/mcp-add.spec.js`, `mcp/lock.spec.js`); app specs that assert a saved name, among them
`e2e/save-load-ui.e2e.js`, `e2e/local-persistence.e2e.js`, `e2e/native-files.e2e.js`, `e2e/gist-save-as.e2e.js`,
`e2e/gist-share.e2e.js`, `e2e/hosted-persistence.e2e.js`, `e2e/merge-file.e2e.js`, `e2e/mcp-merge.e2e.js`,
`e2e/open-pending.e2e.js`, `e2e/ai-subscription-route.e2e.js`, and `e2e/support/fakeGistApi.js`;
`scripts/generate-trace-fixtures.mjs`.

Docs: `docs/save-load.md`, `docs/native-apps.md`, `docs/mcp.md`, `docs/ai-partner.md`, `docs/merging.md`,
`docs/sketch-mode.md`, `docs/README.md`; `docs/decisions/document-sync.md` (records the extension; it does not
mention one today); `TODO/ACCEPTANCE.md` scenarios 10, 22, 23 (and 28's wording, if it names a file).

## Proposed fix

1. **One constant per side.** Add a framework-free module (for example `src/core/projectFile.js`) exporting
   `PROJECT_EXTENSION = '.warpcad'`, `LEGACY_PROJECT_EXTENSIONS = ['.ndjson']`, `isProjectFileName(name)` and
   `stripProjectExtension(name)`. Every file above imports it instead of spelling `.ndjson`.
2. **Save** uses `PROJECT_EXTENSION` in `files.js`, `fileSystem.js`, `shareCopy.js`, `gistLink.js` and
   `hostedBackend.js`. A project opened from `bracket.ndjson` and saved in place keeps its name (no silent
   rename); **Save As** suggests `bracket.warpcad`.
3. **Open** accepts `.warpcad` and `.ndjson`: `PICKER_FILTERS` and `PICKER_TYPES` gain `warpcad`, keep `ndjson`,
   `json`, `txt`. For `ACCEPT_ATTRIBUTE`, add `.warpcad` and keep `text/plain`; check on WebKit and, by hand, on
   an iPad in Safari whether a `.warpcad` file is selectable. If it is greyed out, record the fix chosen (drop
   `accept` on iOS, or another catch-all) in `interaction-model-qa.md` next to Q16.
4. **Gists:** `chooseProjectFile` takes the single project file of either extension; with several, prefer
   `project.warpcad`, then `project.ndjson`, then refuse as today. New gists are published as `<slug>.warpcad`.
5. **MIME:** keep `application/x-ndjson` for downloads and the FSA picker unless `io-036` settles a WarpCad MIME
   string; use the same string in both repositories.
6. **MCP:** usage text and examples say `.warpcad`; the server keeps accepting any path, so `.ndjson` users are
   unaffected.
7. Record the extension, the legacy-read rule and the unchanged internal files in `docs/decisions/document-sync.md`.

## Effort

L. Mechanical in each file but wide (about 20 source files, 41 unit specs, 10+ app specs, 7 docs pages,
regenerated media), and it touches persistence on three engines.

## Testing

- **Unit:** the new module (`isProjectFileName` on `a.warpcad`, `a.ndjson`, `A.WARPCAD`, `.warpcad` alone,
  `a.warpcad.txt`, empty); `projectFileNameFor` adds `.warpcad` and keeps a typed `.ndjson`; `listProjects`
  lists both and nothing else; `chooseProjectFile` for one of each, both, two `.warpcad`, none; `nameOfFile`
  strips both; `shareFileName` and `gistFileName` end `.warpcad`. Update the 41 specs that name `.ndjson`.
- **App e2e at `/`:** extend `e2e/save-load-ui.e2e.js` (Save suggests `.warpcad`; Open of an `.ndjson` fixture and
  a `.warpcad` fixture both load), `e2e/native-files.e2e.js` (fake shell: Save writes `name.warpcad`, a legacy
  `.ndjson` in Documents is listed and opens), `e2e/gist-save-as.e2e.js` / `e2e/gist-share.e2e.js` (published
  file name; a legacy gist still opens). Keep the seven `e2e/fixtures/*.ndjson` as they are: they are now the
  legacy-open coverage. Add one `.warpcad` fixture.
- **Engines and viewports:** persistence path, so all three engines (Chromium, Firefox, WebKit). The save/open
  specs run at phone, tablet and laptop. Run `npm run test:e2e:full` at the end, since this is the milestone's
  release gate.
- **Acceptance scenarios re-driven:** 10 (save, reload, nothing changed), 22 (merge a copy), 23 (Claude Code edits
  the open file, through `npm run mcp:add -- x.warpcad`), and 28 on the device after `io-036` (Save in the app,
  then the file shows as a WarpCad project in Files). Scenarios 1, 8 and 32 open `.ndjson` fixtures by name:
  re-run them to prove the legacy path, since the fixtures do not change.
- **Closed findings re-run:** `io-017` and `io-020` (a gist's project file name), `io-016` (**Send the file**),
  `io-021` (Save as gist), and native `io-014`'s inbound-file reproduction (a Mail attachment and a file opened
  in place from iCloud Drive), with both a `.warpcad` and an `.ndjson`.
- **By hand:** an iPad in Safari (PWA, not the app): **Open…** can select a `.warpcad` file. Log the result in
  `TODO/VERIFY.md` only if no spec can cover it.

## Documentation

- **Pages:** `docs/save-load.md` (the file is `name.warpcad`; older `.ndjson` projects open as before and keep
  their name until Save As), `docs/native-apps.md`, `docs/mcp.md`, `docs/ai-partner.md`, `docs/merging.md`,
  `docs/sketch-mode.md`, `docs/README.md`.
- **Example** (for `docs/save-load.md`): "Choose **File ▾ → Save As…**, type `bracket`, press **Save**. The file
  is `bracket.warpcad`. To open a project saved before November 2026, choose **File ▾ → Open…** and pick
  `bracket.ndjson`; it opens the same way."
- **Media:** re-shoot the pictures that show a file name, from `e2e/docs/save-load.docs.js`,
  `native-files.docs.js`, `share-sheet.docs.js`, `share-gist.docs.js` and `mcp.docs.js`, with
  `npm run docs:media`. Do not use `docs:gifs` for a single movie (it rewrites every GIF); encode through a
  scoped movies directory.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
