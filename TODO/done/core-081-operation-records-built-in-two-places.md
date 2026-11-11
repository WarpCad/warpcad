---
title: Build operation records in one core module, not in the toolbar and the AI tools separately
category: core
kind: finding
priority: medium
model: opus
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: done
---

## Problem

The record for an operation (boolean, group, fillet, chamfer, resize, mirror, snap, align) is
assembled in two places that do not know about each other:

- **The UI**, inside components: `OperationsToolbar.vue:497` (boolean and group), `:1120` (fillet
  and chamfer), `:1241` (resize), `:1418` (mirror); `AlignPopover.vue:255` (snap and align);
  `GroupMergePopover.vue:96` (group merge). Each picks the id prefix, decides `target` and
  `supersedes`, and fills `params`, then calls `documentStore.append(record, { origin: 'local' })`.
- **The AI tool registry**: `src/ai/tools/operate.js:110` (boolean), `:137` and `:222` (in-place
  edits with `supersedes: operands[0].terminal`), `:315-346` (group and group merge), `:613` (mirror).

The rules they must agree on are subtle and are written down only as comments at each site: which
id prefix (`bool`, `group`, `fillet`, `chamfer`, `mirror`, `snap`, `align`), that an in-place edit is
unnamed and supersedes the body's *terminal* record, that `group.assemble` records `names` from the
operands' body names and not their labels (`OperationsToolbar.vue:540-547`), and when a boolean with
a multi-part operand goes off-thread.

Why it is a problem:

- **A human and the AI can produce different records for the same operation**, and nothing tests
  that they match. The document is replayed from these records, so a divergence is a document that
  behaves differently depending on who made the step.
- **Record construction lives in components**, which `CLAUDE.md` rules out ("Geometry logic lives in
  `src/core/`"). It is untestable there without mounting a 2,900-line component.
- `OperationsToolbar.vue` reaches for `documentStore.raw.nextId(...)` four times. `raw` is the
  renderer's escape hatch, not a component API.

## Affected files

- `src/components/viewport/OperationsToolbar.vue:471-570, 1109-1160, 1228-1300, 1404-1440`
- `src/components/viewport/AlignPopover.vue:240-266`
- `src/components/viewport/GroupMergePopover.vue:90-100`
- `src/ai/tools/operate.js:100-350, 600-620`
- `src/core/operationRecords.js` (new), `src/core/operationRecords.spec.js` (new)

## Proposed fix

1. Add `src/core/operationRecords.js`, framework-free, with one builder per operation family:
   `booleanRecord(document, op, operands)`, `inPlaceRecord(document, op, operand, params)`,
   `groupRecord(...)`, `mirrorRecord(...)`, `snapAlignRecord(...)`. Each returns a complete
   `OpRecord` (id included, from `document.nextId`) or throws the same message the fold would.
2. Move the rules out of the comments and into those builders. `operate.js` already has the cleaner
   shape (`inPlaceSpec`), so start from it and make the UI sites call the same functions.
3. Components keep only what is theirs: reading the selection, calling the builder, appending with
   origin `local`, and showing the error. The AI tools keep their own origin and turn limits.
4. Leave the Split sheet alone (`src/stores/splitSheet.js` writes its own record) unless it falls
   out naturally. Note it in the retirement text either way.

## Effort

M (a few hours): the logic exists twice already; this picks one and deletes the other.

## Testing

- `src/core/operationRecords.spec.js`: for each family, the record for a fresh body, for a body that
  has been moved (so `terminal` differs from the root id), and for a drilled-in sub-part operand.
  One spec asserts that the UI path and the AI tool path produce deep-equal records for the same
  operands, apart from the id counter.
- Existing `src/ai/tools/operate.spec.js` and `OperationsToolbar.spec.js` must pass unchanged.
- E2E: no new spec. Run the existing boolean, fillet/chamfer, resize, mirror, snap/align and
  group-merge specs. They touch the kernel, so all three engines; viewports per the rotating pair.
- Acceptance scenarios to re-drive: 4 (boolean gating), 5 (hidden-part boolean), 6 (group vs.
  sub-part), 16 (mirror), 32 (group merge).
- Closed findings whose reproductions re-run: `ui-040` (a `pieces` address the fold rejects),
  `core-079` (off-thread boolean with a multi-part cutter), `ui-027` (fillet record shape).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
