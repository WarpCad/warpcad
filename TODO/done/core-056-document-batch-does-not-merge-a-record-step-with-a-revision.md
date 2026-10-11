---
title: document.batch leaves an appended record and a reviseRecords revision as two Undo steps
category: core
kind: finding
priority: low
model: sonnet
depends: []
status: done
---

## What shipped

**The merge, not the doc-only option.** `document.batch` now folds a batch that mixes record
steps and `reviseRecords` revisions into one composite `HistoryStep` carrying `parts` (each pushed
step keeps its own records / revision / rollback markers, and each record part the index it was
inserted at, found by replaying the parts forward over the log the batch started from). Undo
applies the parts newest-first, Redo oldest-first, all or nothing: a refusal part-way (a later
record depends on an appended one) puts the snapshot back and rethrows. The fold-cache fast path
still works, because the merged step is `keepRestore`d against the pre-batch state; only local
steps are ever on the stacks, so remote/AI/mcp edits still never land in the local stack. A batch
of one revision stays a plain revision step; all-record batches are untouched. The undo
dependency check was extracted as `assertNoDependents`. `src/stores/document.js` redo now restores
the pre-step selection for any step with no records. `variables.spec.js`'s pinned "two Undo steps"
test is now "one Undo step". `bindParamToNewVariable` is kept (still the direct route).

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
