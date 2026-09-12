# Composite recipes and geometry they didn't create: no two-phase expansion

Status: **Decided**. Two-phase `expand→evaluate→measure→re-expand` is **not adopted**.
`core-001`'s flagged limitation is resolved by mechanisms this project has already
shipped — `core-012`'s origin-probe pattern and `core-013`/`ui-026`'s fold-resolved
`group.snap`/`group.align` records — and needs no new engineering. This unblocks
`core-014`-`core-018`.

> **This document corrects the survey in `TODO/core-014a`'s own scoping pass.** That
> pass concluded the question was moot because "every real cross-part measurement in
> this library is a recipe measuring its own, already-built parts," and that
> "attaching a separately-built camera module to a separately-built board is not done
> inside any real recipe." A fresh survey of the whole `jscad-raspberrypi` source
> (below) finds **that claim is false**: eight accessory recipes take an
> externally-built board group as a parameter and measure against it, two of them
> requiring it. The *decision* stands — but on different and stronger grounds than the
> scoping pass argued, and it is worth knowing which reasoning is load-bearing before
> anyone revisits this.

## The question

From `core-001`'s retirement note (`TODO/done/core-001-kernel-adapter-spike.md`):

> a recipe emits records before any geometry exists, so it can't call `group.snap`
> against arbitrary geometry it didn't itself create — the bolt worked around this
> because its offsets are all analytic (the size table gives every height), but the
> Raspberry Pi board spike will hit this directly.

The constraint is real and still holds. A composite recipe returns an array of op
records, and `core-020`'s fix makes the isolation explicit: a composite record's recipe
"always expands against an empty fold, never against this scene"
(`src/core/kernel/index.js:47`). A recipe cannot reach `byId` for a sibling top-level
body, no matter how `group.snap` is registered.

## What the survey actually found

Surveyed every `.snap(`/`.align(`/`calcSnap(`/`calcCenterWith(` call site in
`~/src/jscad/jscad-raspberrypi/src/*.js` at `62a8e3b` ("Release 5.0.0"), excluding test
fixtures. Two distinct families, not one:

**Family A — recipes that build their own board and measure against it.** All five
camera modules. Every reference is a part the same function built a few lines earlier:
`camera-module-v3.js:14,42-43,51-52,64-65,74-75,82-85,92-94,102-103,113` (all
`g.parts.board` / `g.parts.sensor` / `g.parts.ribbon`), the same shape in
`camera-module-v1.js:15,48-49,65-66,75-76,83-85,92-94,101-102,111` and
`camera-module-v2.js:30,45-46,53-54,62-63,72-73,80-81,91-93,100-101,110`, and
`hq_camera-module.js:52,63-64,69-70,74-75,98-100,107` /
`arducam_hq_camera-module.js:51,62-63,68-69,73-74,82-84,92` (all `camera.parts.board`
/ `camera.parts.ribbon`). Also `boardutils.js:120-122,146-147,178,189-190,199,222`
(`mb` and `boardGroup.parts[hole]`, both built by the caller two lines above) and
`bplus-mounting.js:21-22,52-53` (`mb`, a parameter the caller just built).
`bplus.js`'s ~120 call sites are all self-referential, and `'camera'`/`'camera0'`/
`'camera1'` there (`:268,490,495,694`) are **named ribbon-connector labels at analytic
spec-table positions**, never a real camera module's geometry. For this family the
scoping pass's conclusion is correct, and `core-012`'s pattern already covers it.

**Family B — recipes that take an externally-built board and measure against it.**
The scoping pass missed this family entirely. It is most of the M4 accessory catalog:

| recipe | board parameter | how the external board is used | decomposes? |
|---|---|---|---|
| `hat.js:24` `Hat(pi, options)` | optional, `if (pi)` guard | `:64-68` — translates the **whole group** by `hat.parts.mb.calcSnap(pi, 'xy'\|'z', …)`, then an analytic `hatHeight` | Yes |
| `hyper-pixel-4-rectangular.js:17` `HyperPixel4Rectangular(rpi)` | optional, `if (rpi)` guard | `:58-62` — `align('pad1', rpi.parts.hole1, 'xy')` then `snap('pad1', rpi.parts.mb, 'z', 'outside-')` | Yes |
| `touch-display-7inch.js:16` `TouchDisplay_7inch(rpi)` | **required** | `:153-154` — `align('piMountingPad1', rpi.parts.hole1, 'xy')` then `snap('piMountingPad1', rpi.parts.mb, 'z', 'outside+')` | Yes |
| `touch-screen2.js:16` `TouchScreen2(rpi)` | **required** | `:179-181` — same shape as above, **plus** `:184-193`, below | Mostly — one exception |
| `miniPiTFT.js:81` `miniPiTFT(options, piMotherBoard)` | optional, `if` guard | `:95-100` — translates `board` by three `board.calcSnap(piMotherBoard, …)` calls before adding it; every other part then snaps to `board`, so the whole group follows | Yes |
| `pi-tft24.js:48` `PiTFT24(options, piMotherBoard)` | optional | `:61` — forwards it straight to `Hat(piMotherBoard, options)`; no measurement of its own | Yes |
| `pi-tft22.js:28` `PiTFT22(options, piMotherBoard)` | optional | `:29` — same forward to `Hat` | Yes |
| `spacer.js:51` `Spacer(options, mb)` | optional, **self-probing** | `:52` — `mb = mb \|\| BPlus().parts.mb`, then structural use at `:67` (`BPlusMounting.pads(mb, …)`) and `:103` (`Gpio(mb)`) | Yes — V1 already probes |

This is corroborated by this project's own larger survey, which the scoping pass also
did not draw on: `core-013` counted 2,147 real `.snap(`/`.align(` call sites across 82
of the user's projects and found **719 (~33%) name `.parts.` on the reference side** —
reaching into *another* item's parts
(`src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md`). Cross-item
measurement is not an absent edge case; it is a third of real usage, and that file's
"shape 3" is exactly it.

## Why the decision holds anyway

Because in every Family B recipe, the external board is used for **one thing only:
positioning the finished accessory relative to the board**. That step is not part of
the accessory's internal geometry — it is precisely a top-level
`group.snap`/`group.align` record between two independently placed bodies, which
`core-013` shipped (`src/core/kernel/registry.js:673,696`, `rawNative` entries with
`{ id, pieces }` sub-part addressing) and `ui-026` surfaced in the UI.

So the port is a **decomposition, not a redesign**:

1. The accessory recipe expands standalone, dropping the board parameter. Every
   remaining reference is internal — Family A's pattern, already proven.
2. The attachment becomes one or two top-level records the user (or a future assembly
   helper) appends: `group.align` on the mounting hole, `group.snap` on Z.

The decomposition is **exact, not an approximation**, and for a reason already written
down and tested in this codebase: `calcSnap` and `calcCenterWith` are
*translation-equivariant* — they return a difference of bounding-box coordinates — so
measuring at the origin and adding the placement afterwards is exact
(`src/core/kernel/recipes/kit.anchor.js:142-145`, with `kit.anchor.spec.js:74-75`
asserting the baked offsets against the same pure functions). An accessory's internal
offsets depend on the board's *dimensions*; the board's *position* enters only through
the top-level record. The two compose without a fold round-trip.

`spacer.js:52` is the strongest single piece of evidence, and it is V1's own answer to
this exact question: when handed no board, the recipe builds a throwaway `BPlus()` and
measures against that. That is `core-012`'s origin-probe pattern, in the source being
ported from, predating this project.

## Options considered

| Approach | Mechanism | Cost | Fit here |
|---|---|---|---|
| **Decomposition — origin probe inside the recipe, `group.snap`/`group.align` record outside it (this decision)** | `core-012`'s probe pattern for internal offsets; `core-013`/`ui-026`'s fold-resolved ops for attachment | Zero new engineering — both halves shipped and tested | Matches every surveyed call site but one; exact by translation-equivariance |
| Two-phase `expand→evaluate→measure→re-expand` (`core-001` candidate 1) | Expansion suspends, the fold evaluates what exists, the recipe resumes with real geometry | Every composite recipe's expansion becomes resumable/re-entrant; partial-expansion state becomes document-adjacent; undo/rollback semantics for a half-expanded recipe all need designing | Solves a case the survey found one hidden-marker instance of; large, invasive complexity against near-zero demonstrated need |
| `group.snap` as a fold-resolved op record (`core-001` candidate 2) | Promote snap/align from pure function to registry op | Already paid — this *is* `core-013` | Already shipped; it is half of this decision, not an alternative to it |
| Recipe nesting — let a recipe invoke another registered recipe's expansion as probe geometry | A recipe could build a real `raspberrypi.bplus` probe rather than hand-rolling a board | Moderate: re-entrant expansion, but no suspend/resume and no document state | **Not adopted now, but the preferred escalation** — see below. Avoids duplicating a 800-line board recipe inside each accessory |

## Rejection table

| Rejected option | Specific reason |
|---|---|
| Two-phase expand→evaluate→measure→re-expand | The survey found exactly one call site that needs it (`touch-screen2.js:184-193`, a *hidden* clearance marker), and every other Family B site decomposes exactly into two shipped mechanisms. Making all composite expansion resumable to serve one hidden annotation part is the premature generality `CLAUDE.md` warns against, and it would put half-expanded recipe state next to the document model — new undo and rollback semantics to design, for a case with no visible geometry riding on it. |
| `group.snap` as a fold-resolved op record | Not rejected — **already built** as `core-013`. Listed here only because `core-001` framed it as one of two competing fixes; it turned out to be a prerequisite of the answer rather than a candidate for it. |
| Recipe nesting (probe by expanding another recipe) | Deferred, not rejected. Nothing needs it yet: `core-014`'s board recipe is self-referential (Family A), and Family B accessories decompose without it. Building it before a recipe actually needs a probe of *another* recipe would be generality ahead of demand — but it is the first thing to reach for if one does, ahead of two-phase expansion. |
| Duplicating board geometry inside each accessory recipe | Rejected on maintenance grounds if recipe nesting is ever needed: `bplus.js` is ~800 lines of spec-table geometry, and a copy inside each of five accessory recipes would drift. If an accessory genuinely needs a board probe, nest the recipe; don't clone it. |

## The one call site that doesn't decompose

`touch-screen2.js:184-193` adds a clearance marker **into the accessory's own group**
whose position is measured against the external board's GPIO header:

```js
screen.add(
  Parts.Cube({ x: 10, y: 3, z: 1 }).color('red')
    .snap(rpi.parts.gpio, 'x', 'inside-')
    .snap(rpi.parts.gpio, 'y', 'outside-')
    .snap(screen.parts.backPlate, 'z', 'outside-'),
  'noGoPower', true, 'noGoPower');
```

This mixes frames: it positions **one piece** of the accessory against the board while
the rest of the accessory stays put, so "move the whole accessory" cannot express it.
It is recorded here rather than argued away.

Three things keep it from changing the decision. It is a **hidden** part — `add`'s
third argument is `hidden` (`~/src/jscad/jscad-utils/src/group.js:83-95`), so it is a
clearance annotation for downstream enclosure code, not rendered geometry. Its position
is still dimension-derived once the board model is known, so a probe (or, in the
interim, an analytic constant from the same spec table every other offset in these
recipes comes from) reproduces it. And it belongs to `core-016`, which is not the
milestone-gating row — `core-014` does not depend on it at all.

## The revival condition — what would reopen this

Any of the following is new evidence this decision does not have, and should reopen
this document rather than be force-fit into the decomposition above:

1. **A recipe needing a *placed sibling's* geometry for its own internal structure**,
   not just its final placement — i.e. a case where the accessory's own parts change
   shape (not just position) depending on what it is attached to. Nothing in the
   surveyed source does this; `touch-screen2.js:184-193` is the nearest miss, and it is
   positional and hidden.
2. **A `core-016` port that cannot reproduce `noGoPower` from the spec table or a
   probe.** Try recipe nesting first; two-phase expansion remains the last resort.
3. **An accessory whose internal offsets depend on the board's *pose*, not its
   dimensions** — which would break translation-equivariance and therefore the
   exactness claim above. No surveyed call site does this.

Per `TODO/core-014a`'s own escalation clause: this is a decision made on the evidence
gathered, not a guarantee no edge case exists. The scoping pass's survey being wrong on
its central factual claim while still reaching a sound decision is itself the argument
for re-checking the source rather than trusting a prior summary.

## Requirements this places on `core-014`-`core-018`

Stated here so each row can be scoped on its own merits without re-deriving them:

- **`core-014`** (`raspberrypi.bplus`) is unblocked and needs nothing from this
  decision. Its ~120 call sites are all self-referential (Family A).
- **`core-015`** (camera modules) likewise — pure Family A.
- **`core-016`/`core-017`/`core-018`** must **drop the external board parameter** from
  `TouchScreen2`, `TouchDisplay_7inch`, `HyperPixel4Rectangular`, `miniPiTFT`,
  `PiTFT22`/`PiTFT24`, `Hat` and `Spacer`, and expand standalone. The attachment is the
  user's top-level `group.snap`/`group.align`, per `ui-026`'s existing control. A port
  that keeps the parameter and tries to resolve it inside the expansion is fighting
  `core-020`'s empty-fold isolation and will fail.
- **`core-016`** additionally owns the `noGoPower` case above.
- Every one of these recipes must satisfy `ui-016`'s sub-part addressing, since the
  top-level attachment records name pieces (`pad1`, `piMountingPost1`, `mb`, `hole1`,
  `gpio`) on both sides — so a port that collapses its parts into one solid breaks the
  attachment step, not just a breadcrumb.

## Sources

Real V1 source: `~/src/jscad/jscad-raspberrypi/src/*.js` at `62a8e3b`, file:line as
cited above; `~/src/jscad/jscad-utils/src/group.js:83-95` (`add`'s `hidden` argument),
`:297-327`/`:339-373` (`snap`/`align`). This project: `core-001`'s retirement note (the
original flag), `src/core/kernel/index.js:47` and `TODO/done/core-020-*.md` (empty-fold
isolation), `src/core/kernel/recipes/kit.anchor.js:142-145` and `kit.anchor.spec.js:74-75`
(the probe pattern and translation-equivariance), `src/core/kernel/registry.js:673,696`
(`group.snap`/`group.align`), and
`src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md` (`core-013`'s
2,147-call-site survey and its four call shapes).
