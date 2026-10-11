---
title: document.batch leaves an appended record and a reviseRecords revision as two Undo steps
category: core
kind: finding
priority: low
model: sonnet
depends: []
status: open
---

## Problem

Found by `TODO/ui-059`, whose Interaction model (and `core-050`'s own handoff) said to wrap
create-and-bind as `document.batch(() => { defineVariable(...); bindParam(...) })`, noting it was
"untested in core". It does not hold: `document.batch` only merges **record** steps. Its own
comment says a row action (`revision`) inside a batch "has no records to concatenate, and is left
as its own step". `defineVariable` appends a record and `bindParam` is a `reviseRecords`, so one
Undo unbound the field and left a stray variable behind (`variables.spec.js`, "document.batch(define;
bind) is two Undo steps").

## What shipped instead

`ui-059` added `bindParamToNewVariable` in `src/core/variables.js`: one `reviseRecords` with the
definition passed as `options.append`, which is one Undo step by construction. That fixes the only
caller that needed it. The general gap remains for any future caller that mixes an append and a
revision in one batch.

## Proposed fix

Either make `batch` merge a trailing record step and revision step into one (it needs a combined
`HistoryStep` carrying both the `records` and the `revision`, and `undo`/`redo` to handle that
shape), or document on `batch` that a revision cannot be batched and point callers at
`reviseRecords`'s `append` option. The second is a doc-only change and probably enough.

## Affected files

- `src/core/document.js` (`batch`)
- `src/core/documentBatch.spec.js`

## Effort

S (document) or M (merge).

## Testing

A spec in `documentBatch.spec.js`: append + revise inside one batch, one `undo()`, assert both are
back.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
