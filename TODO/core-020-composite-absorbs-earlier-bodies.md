---
title: A composite appended incrementally absorbs every earlier named body into its own group
category: core
kind: finding
priority: high
model: opus
milestone: M3
depends: [core-002, core-001]
status: open
---

## Problem

Appending a composite op (`hardware.*`, `kit.*`) through the **command layer**
(`src/core/document.js` → `core-002`'s `applyAction`) stores a `Group` that
wrongly contains **every previously-placed named body as one of its own parts**.
The same records replayed through a single batch `evaluate()` call are correct.

Found by hand during `TODO/ui-014`'s Step 6 acceptance drive, while checking
whether `ACCEPTANCE.md` scenario 5 (hidden-part boolean — bolt tap-clearance) was
drivable. It is **not caused by `ui-014`** — it reproduces with no `consumes`
field and with no boolean anywhere in the document; the stored group is already
wrong the moment the composite is appended.

### Measured reproduction

Run in the browser against the real modules (a plate, then a bolt):

```js
const d = createDocument()
d.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1',
           params: { size: [40, 40, 6], center: [0, 0, 3] } }, { origin: 'local' })
d.append({ id: 'bolt1', op: 'hardware.bolt', name: 'Bolt 1',
           params: { spec: 'm10 hex', length: 20, fit: 'close' } }, { origin: 'local' })
d.scene.byId.get('bolt1')   // <- the bolt
```

| | `names` of the stored `bolt1` | bounds of `bolt1` |
|---|---|---|
| **`document.append` (incremental)** | `["Shell 1", "head", "thread", "tap"]` | `-20,-20,0 .. 20,20,27` |
| `evaluate([...])` (batch) | `["head", "thread", "tap"]` | `-9.25,-8.01,0 .. 9.25,8.01,27` |

The plate has been swallowed into the bolt. The consequence is severe and silent:
subtracting that "bolt" from the plate removes the **entire plate**, because the
bolt's group now spans it.

```
boolean.subtract(shell, bolt1) via document.append  -> EMPTY   (0,0,0 .. 0,0,0)
boolean.subtract(shell, bolt1) via evaluate([...])  -> correct (-20,-20,0 .. 20,20,6)
```

A **native** operand through the same incremental path is fine
(`primitive.cylinder` subtracted from the same plate gives the correct
`-20,-20,0 .. 20,20,6`), so this is specific to composite (`Group`-returning)
records, not to the command layer in general.

## Why nothing has caught it

- `src/core/library.js`'s `buildRows` filters the Library panel to
  `op.startsWith('primitive.')`, so **no composite has a Library row** — a user
  cannot currently place a bolt, nut, washer or kit part at all. The bug is real
  but unreachable from the UI today.
- Every existing composite test goes through `evaluate()` (the batch path), which
  is correct. `src/core/kernel/index.spec.js`'s own "coerces a composite result to
  geometry when a boolean consumes it" asserts only that `boundsOf(...)` is
  **defined** — which an empty geometry satisfies, so even a batch-path version of
  this failure would pass it.

## Likely cause

`replay.js`'s `applyAction` threads the whole accumulated scene into `evaluate`:

```js
evaluate([action], { registry, initial: { byId: scene.byId, group: scene.group } })
```

A composite record's own result group appears to be assembled **from that
`initial.group`** rather than from a fresh one, so it inherits every name the
scene has accumulated so far. The batch path never shows it because there the
composite's expansion happens while the shared group is still being built in the
same call.

Fix direction (to be confirmed against `src/core/kernel/index.js`'s composite
branch, not assumed): a composite's recipe expansion must assemble into its own
empty group, and only its *result* should be added to the scene group under the
record's `name`.

## Affected files

- `src/core/kernel/index.js` — the composite-expansion branch and how it seeds the
  group it assembles into.
- `src/core/replay.js` — `applyAction`'s `initial` threading, if the fix belongs
  on that side of the boundary instead.
- `src/core/replay.spec.js` / `src/core/document.spec.js` — the missing coverage:
  every composite test today goes through the batch path.

## Testing

- A unit test appending **two named bodies then a composite** through
  `createDocument()` and asserting the composite's stored `names` are exactly its
  own parts — the direct assertion of the table above, and the one no existing
  test makes.
- The same shape through `applyAction` directly, so the guarantee is pinned at the
  replay boundary rather than only at the command layer.
- A subtract of a composite from a primitive through the **incremental** path,
  asserting a non-empty result with the expected bounds — deliberately asserting
  bounds and volume, not merely that `boundsOf` is defined, which is exactly the
  weakness that let this through.
- **Acceptance scenarios**: this blocks the substance of scenario 5 (hidden-part
  boolean). Scenario 1 must be re-driven too — this touches the fold every placed
  body goes through.

## Effort

M — the reproduction is exact and the suspected cause is one seeding decision, but
it sits in the fold every record in the document goes through, so the regression
surface is the whole of `replay.spec.js`, `index.spec.js` and `document.spec.js`.
