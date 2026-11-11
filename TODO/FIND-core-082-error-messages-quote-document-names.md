---
title: Error messages quote body and file names, so an unhandled one sends document text to Sentry
category: core
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

## Problem

`docs/decisions/error-reporting.md:12` promises "no document content" leaves the browser, and
`:141-143` records the one gap: "An error message that itself quotes document text would be sent;
the app does not build messages from document content on purpose, but that is the residual risk."

The second half of that sentence is not what the code does. About 70 `throw new Error(...)` sites
under `src/` interpolate a name, label or file name into the message, and body, part and variable
names are user-typed document content. Examples:

- `src/core/document.js:6389` `document.renameBody: ${currentNameOfRoot(root)} has been deleted`
- `src/core/document.js:6434, 6440` `document.deleteBodies: ${name} has already been deleted`
- `src/core/repeat.js:828` `${seedName} has no part named ${target}`
- `src/core/repair.js:250, 266` (the dependent body's name)
- `src/core/zip.js:70, 150` (a file name inside an imported archive)

These messages are written for the user, and showing them is right: the toolbar and the AI tools
catch them and display them. The exposure is the ones that are **not** caught. Sentry's
`beforeSend` scrubber (`src/core/errorReporting.js:135-151`) drops an event that contains a key
shape, a URL fragment or a gist id, and otherwise sends the message as it is.

- **Who is exposed**: a user whose part is named after a client, a product or a person.
- **Entry point**: any unhandled exception or rejection whose message came from one of those sites
  (an async path that forgot a `catch`).
- **Impact**: that name is stored in the project's Sentry issue stream. Low: names only, never
  geometry or keys, and only on an unhandled path. The cost is that the privacy page and the
  decision record currently state something stronger than the code delivers.

Inside the native shell the same messages will also carry file paths once `io-014` lands.

## Affected files

- `src/core/errorReporting.js:135-151` (the scrubber)
- `src/core/userError.js` (new)
- the ~70 throw sites, found with
  `grep -rnE "new (Error|RangeError|TypeError)\(\`[^\`]*\$\{[^}]*(name|Name|label|title|path)" src`
- `docs/decisions/error-reporting.md:141-143`, `docs/privacy.md`

## Proposed fix

Keep the messages; change what is reported.

1. `src/core/userError.js`: `class UserFacingError extends Error` with a `code` (a fixed string such
   as `document.deleteBodies/already-deleted`) and the human message. Framework-free.
2. Convert the throw sites that quote document text to `UserFacingError`. No message changes, so no
   UI or test text changes.
3. In `scrubEvent`, for an exception whose type is `UserFacingError`, replace the reported value
   with its `code`. The stack trace and the code are enough to find the bug; the name is not needed.
4. As a backstop for sites that are missed: in `scrubEvent`, replace any double-quoted span in an
   exception message with `"…"`. Several sites already quote the name (`"${file.name}"`).
5. Correct the sentence in the decision record to say what is now true, and check `docs/privacy.md`
   says the same.

## Effort

M (the conversion is mechanical but touches many files).

## Testing

- `src/core/errorReporting.spec.js`: an event built from a `UserFacingError` reports the code and
  not the message; a plain `Error('readZip: CRC mismatch for "secret.model"')` reports
  `"…"` in place of the name; an event with no quoted text is unchanged.
- `src/core/userError.spec.js`: the class keeps `message` for display and exposes `code`.
- A guard case in `errorReporting.spec.js` that greps `src/` for the pattern above and fails on a
  new plain `Error` that interpolates a name, with an allow-list for messages that interpolate only
  ids and numbers.
- E2E: none new. No UI text changes. Chromium only is moot (no browser path changes).
- Acceptance scenarios: none. This changes only what leaves the device on an unhandled error.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
