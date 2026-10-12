---
title: The merge core — position keys, last-writer-wins registers, tombstones, one pure merge function
category: data
kind: feature
priority: high
model: opus
milestone: M15
depends: [data-008]
status: open
---

## Goal

One framework-free module that takes two **merge states** and returns the merged one, with no
knowledge of the kernel, the fold, Vue or files. It is the part of M15 whose correctness is an
algebraic claim, so it is built and fuzzed alone before anything depends on it.

"Done": `mergeStates(a, b)` is commutative, associative and idempotent under a randomised
property suite over three replicas, and the module imports nothing outside `src/core/replica.js`.

## Interaction model

Does not apply — pure `core`, no UI surface.

## Documentation

Does not apply. The algorithm is documented in `docs/decisions/document-sync.md` by `docs-022`;
this task corrects that document where the implementation had to differ.

## Affected files

- `src/core/merge/positionKey.js` (new) — `keyBetween(before, after, replica)`,
  `keysBetween(before, after, count, replica)`, `compareKeys`
- `src/core/merge/state.js` (new) — the `MergeState` shape and `emptyMergeState()`
- `src/core/merge/merge.js` (new) — `mergeStates(a, b)`, `relatedness(a, b)`, `diffStates(before, after)`
- `src/core/merge/*.spec.js`, `src/core/merge/fuzz.spec.js`

## Proposed fix

**The state** (plain JSON-safe data; the record is opaque here):

```
MergeState = {
  projectId: string | null,
  entries: Map<id, { record, origin, intent?, born, pos: [key, stamp], rec: stamp,
                     suppressed?: [bool, stamp], leftBroken?: [bool, stamp] }>,
  dead: Map<id, stamp>,                       // tombstones: id and stamp only
  registers: { rollbackAfter, resolution, standingInstructions, buildVolume },  // each [value, stamp]
  parts: Map<op, [definition, stamp]>,
}
```

**Rules**, each a last-writer-wins choice by `compareStamps`:

- **Presence.** An id is live when its entry's `born`-or-revival stamp beats its tombstone.
  A tombstone newer than the entry removes it; an entry newer than the tombstone (a Redo) brings
  it back. Tombstones are kept after the merge; nothing here collects them.
- **Record, position, flags.** The later stamp wins, per field group. Whole record, one stamp.
- **Order.** Live entries sorted by `(position key, born stamp)`.
- **Registers and parts.** The later stamp wins. `rollbackAfter` names a row id (or `null`); a
  marker whose row is dead resolves to the nearest earlier live row, deterministically.
- **`origin` and `intent`** are set at birth and never change, so they need no stamp.

**Position keys.** Fractional-index strings over a base-62 alphabet. Two properties the fuzz
suite must prove, because they are where hand-rolled sequence merges go wrong:

1. **Runs do not interleave.** When two replicas each insert several rows at the same gap, each
   replica's rows stay contiguous after the merge. Achieve it by ending a fresh gap's key with
   the replica id, so one replica's run shares a prefix.
2. **Same-gap order follows the stamp.** Between two replicas' runs at one gap, the run with the
   earlier first stamp sorts first. `docs-022` relies on this: it is what makes "the later-stamped
   row is the one flagged" true in the common case.

Measure key length after 1 000 inserts at one gap and after 1 000 alternating front inserts;
record both in the retirement note. Anything super-linear is a finding to file, not ignore.

**`relatedness(a, b)`** answers whether two states are copies of one project:
`same` (equal project ids), `legacy-same` (either has no project id, and every id present and
unstamped on both sides holds a byte-identical record), or `unrelated`. Callers decide what to do
with `unrelated`; this module never merges it silently. A merged state takes the defined project
id, or the lexically smaller of two.

**`diffStates(before, after)`** returns the ids added, revised, removed, moved and the registers
changed, so callers can report "Merged 4 steps" and build an inverse (`ui-062`'s Undo merge).

**Untrusted input.** A state can come from a hostile file. `mergeStates` assumes validated
input; validation and caps live in `data-011`. State that boundary in the module header.

## Effort

L

## Testing

- Unit: each rule above with a hand-written pair, including a delete racing a param edit (both
  orders), two moves of one row, a move racing a delete, a Redo after the other side merged the
  tombstone, both sides moving the marker, the marker's row deleted by the other side.
- **Property suite** (`fuzz.spec.js`, seeded so a failure prints its seed): random edit scripts
  on three replicas from a shared base; assert `merge(a,b) = merge(b,a)`,
  `merge(merge(a,b),c) = merge(a,merge(b,c))`, `merge(a,a) = a`, and that all six merge orders
  serialise to identical JSON. At least 2 000 cases in CI, deterministic seed list plus a
  time-boxed random run.
- Property: runs do not interleave; same-gap order follows the stamp (both above).
- Degenerate cases: empty states, one empty side, identical states, a state that is all
  tombstones, 5 000 entries (time it; the merge must be linear-ish, record the number).
- Acceptance scenarios this could break: **none** (nothing imports the module yet).
- Closed findings to re-run: none.
- Engines: Chromium only (plain Node).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
