# Geometry kernel: `@jscad/modeling` (JSCAD V3)

Status: **Committed**. Formalizes `Initial design.md` §2 as the Library-decision
record `CLAUDE.md`'s Library-decisions rubric requires before the Stack table's
"Geometry kernel" row can move from Open to Committed.

## Options considered

| Library | Kernel type | Bundle/runtime | Ecosystem fit here |
|---|---|---|---|
| **`@jscad/modeling`** (JSCAD V3) | Pure-JS BSP tree (same lineage as V1's `@jscad/csg`) | Pure JS, no WASM, small | **Direct migration path** from `jscad-utils`/`jscad-hardware`/`jscad-raspberrypi` — same boolean semantics, same author (`jscad`/`z3dev`), same mental model this project already has three libraries and two real reference apps built against |
| `manifold-3d` (previous attempt's pick) | WASM, manifold-mesh guaranteed-watertight booleans | WASM (~1-2MB), fast on complex booleans | Rejected last time for unrelated reasons per `PREVIOUS-ATTEMPT.md` (it "still looks like the right call in isolation" — the *project*, not the library, failed). Has **zero** compatibility with the V1 API surface this attempt is explicitly trying to port; every primitive/hardware/raspberrypi call would need a from-scratch rewrite, not a port |
| `OpenCascade.js` | Full BREP/NURBS kernel (OCCT via WASM) | WASM, tens of MB | Most capable (real fillets/chamfers on arbitrary edges, STEP import/export) but heaviest, steepest API, and furthest from anything this project's source libraries already do |
| `three-csg`/`three-bvh-csg` forks | BSP or mesh-boolean over three.js `BufferGeometry` | Pure JS | Ties geometry representation directly to the renderer, which `CLAUDE.md`'s Architecture explicitly warns against ("geometry always derived... kernel adapter... swappable"); also not what any of the three source libraries target |

## Rejection table

| Rejected option | Specific reason |
|---|---|
| `manifold-3d` | No path to reuse `jscad-utils`/`jscad-hardware`/`jscad-raspberrypi` or the `picam-2`/`picam-touch` reference apps at all — every primitive, every hardware size table, every `Group`/`snap`/`align` helper would be a rewrite from zero, not a port. That tradeoff might be worth it if raw boolean performance or watertightness guarantees were the driving requirement, but the driving requirement here is explicitly "build what `picam-2`/`picam-touch` build," which JSCAD V3 does directly and manifold-3d does not. |
| `OpenCascade.js` | Real BREP fillets/chamfers would fix a genuine known gap (see Open items below), but the WASM payload and API complexity are large costs for a project whose reference designs (enclosures, brackets, hardware assemblies) don't need NURBS surfaces — and it shares manifold-3d's problem of zero continuity with the existing V1 libraries. |
| `three-csg`/`three-bvh-csg` | Couples the document/geometry layer to the rendering library, which `CLAUDE.md`'s "no mesh as document state, kernel is swappable" architecture rule exists specifically to prevent. |

## Manifold-3d experience, factored in explicitly (not skipped)

`PREVIOUS-ATTEMPT.md` records manifold-3d as sound "in isolation" — the previous
project's failure was assembly and verification process, not the kernel. That
experience doesn't argue against manifold-3d technically; it's neutral on the kernel
question. What overrides it here is a different requirement this attempt has that the
first attempt didn't: **direct source-level continuity with three existing,
hand-maintained JSCAD V1 libraries and two working reference applications.** That's a
project-shape decision, not a technical-superiority one, and it's why JSCAD V3 wins
this comparison despite manifold-3d's real performance/robustness advantages on raw
booleans.

## This is a project-shape call, not a pure technical-superiority call

Worth stating explicitly, since it cuts against the usual "pick the most capable
kernel" instinct: on raw technical merits alone, `manifold-3d` (guaranteed watertight
booleans, WASM performance on complex operations) or `OpenCascade.js` (real BREP
fillets/chamfers, STEP I/O) would each have a plausible case. JSCAD V3 wins here
because this attempt's actual requirement — ported from the original kickoff note — is
continuity with `jscad-utils`, `jscad-hardware`, `jscad-raspberrypi`, and the
`picam-2`/`picam-touch` reference apps, all of which are JSCAD V1. Only JSCAD V3 offers
a direct porting path to that surface; the other two would mean rebuilding the entire
primitive/hardware/raspberrypi vocabulary from zero regardless of their other merits.

## Open sub-decision this doc surfaces, not resolves

`jscad-object-api` (a third-party library restoring chained/OOP ergonomics on top of
`@jscad/modeling`'s functional API) is a candidate alternative to hand-porting
`jscad-utils`'s `Group`/`snap`/`align` vocabulary. This needs its own quick health
check (stars/issues/last-release) before the kernel-adapter task (`core-001`) starts —
flagged here, not decided, per `CLAUDE.md`'s "several real options" rule. Resolving it
is `core-001`'s job, not this document's.

## Sources

`Initial design.md` §2 and §5 (JSCAD's own V1→V2 migration guide and V3 wiki, checked
directly against current docs during that design pass), `PREVIOUS-ATTEMPT.md` (the
manifold-3d retrospective this decision factors in).

---

# Addendum (TODO/core-003): fillet/chamfer and Bearing, spiked

**Does not change the decision.** `@jscad/modeling` stays committed. What it changes is
two rows of `Initial design.md` §6 that were marked *Native (tentative)* pending this
spike, and one factual claim in §5.

Everything below was run against **`@jscad/modeling` 2.13.0**, the version in
`package.json`, and against the **actual vendored V1 source** — `jscad-utils` and
`jscad-hardware` are both present under `node_modules/`, so the V1 side of every
comparison here is read from source, not recalled from the published API docs. The
executable form of these findings lives in `src/core/kernel/fillet.spec.js`, so a
future version of the kernel that changes any of it fails the build rather than
silently invalidating this page.

## Finding 1 — Fillet/chamfer: the §6 row was asking for the wrong thing

§6 lists *"Fillet / Chamfer | 1 item (edge/face) selected | radius, orientation |
Native (tentative)"*, and §11 worried that V1's BSP-based implementation might not
survive the port. Reading V1's actual implementation first reframes the question:

**V1 never had an arbitrary-edge fillet.** `jscad-utils/src/util.js` defines
`fillet(object, radius, orientation, options)` and `chamfer(...)` as thin wrappers over
one shared `util.reShape` (util.js:1023-1068). `reShape` cuts a band of height `radius`
off **one axis-aligned end face**, takes a single `sectionCut` cross-section at the cut
plane, lofts a stack of `util.enlarge`-inset copies of that one section through
`slices2poly`, and unions the result back onto the remainder. The `orientation`
parameter in §6's own params column is the tell — it is a face name (`'z+'`), not an
edge reference. So the operation is a **whole-rim** round or bevel of one face, and it
is only correct where the solid is prismatic through the band it touches.

That reframing splits the §6 row cleanly in two.

### 1a. The V1 rim semantics port to V3 fully. Confirmed, shipped, tested.

Every piece `reShape` needed has a V3 equivalent:

| V1 (`@jscad/csg`) | V3 (`@jscad/modeling` 2.13.0) |
|---|---|
| `CSG.sectionCut` | `extrusions.project` over a thin intersected slab (V3 has no section-cut; see caveat below) |
| `CAG` `util.enlarge` inset | `expansions.offset({delta: -δ})` — 2D **does** support a negative delta |
| `slices2poly` + `CAG._toWallPolygons` + `CSG.Connector` frames | `extrusions.extrudeFromSlices` (walls the slices internally) |
| `.cutByPlane` / `union` | `booleans.intersect` / `booleans.union` |

`src/core/kernel/fillet.js` implements this as `filletRim`/`chamferRim`, registered as
the native ops **`modify.filletRim`** and **`modify.chamferRim`** (`operandCount: 1`).
Accuracy against hand-derived analytic volumes — removed material is
`∫₀ʳ [P·δ(z) − C·δ(z)²] dz` for footprint perimeter `P` and Steiner corner constant
`C = Σ cot(θᵢ/2)`, with `C = 4` measured, not assumed:

| Fixture | Analytic | Measured | Relative error |
|---|---|---|---|
| 20mm cube, r=3, 128 slices | 7855.841mm³ | 7855.841mm³ | 1e-7 |
| 20mm cube chamfer, r=3 | 7676.000mm³ | 7676.012mm³ | 1.6e-6 |
| **Boolean-union bar** (35×20×20 from two overlapping cubes), r=3, 128 slices | 13797.898mm³ | 13797.901mm³ | 2.2e-7 |
| **Reflex-corner L** (concave footprint), r=2, 256 slices | 9900.059mm³ | 9899.658mm³ | 4.1e-5 |

The two lower rows are the point: `TODO/core-003` explicitly asked for a
*non-primitive mesh, not just a raw cuboid edge*. The sweep is exact on a
boolean-union result and handles a reflex (concave) footprint corner. Error converges
from below, halving per doubling of slice count — the chorded profile always removes
slightly too much, never too little. Cost is 2ms at 32 slices and 19ms at 128 for the
union bar, comfortably inside a worker.

**The caveat, and it is enforced rather than documented away.** Because the algorithm
sweeps one cross-section, it is only valid where the solid is prismatic through the rim
band. V1 shared this limitation and never checked it — which is exactly the *"real
edge-case coverage was never characterized"* risk §11 flagged. Measured concretely:
filleting the top of a cube-plus-dome with a 3mm radius **silently added ~131mm³**
(8576mm³ out of an 8445mm³ solid), returning a plausible, wrong solid with no error.
`fillet.js` now compares the section at the cut plane against the section at the face
and throws when they diverge by more than 1%. Two further guards came out of the spike:

- **`expand({delta: -δ})` on a solid throws**, despite `expand.js`'s own docstring
  promising *"Contract is expand using a negative delta"* — `expandGeom3` unions the
  shell back onto the original and builds spheres of the given radius, so the radius
  check rejects it. There is **no solid erosion in V3 at all.**
- **A 2D inward `offset` collapses through zero and comes back inverted, silently.**
  On a 4×4mm square: δ=−2 gives area 0 as expected, but δ=−2.1 returns a 0.2×0.2 square
  and δ=−3 a 2×2 square — positive area, sitting inside the original outline, so
  neither an area>0 test nor a containment test catches it. The radius guard therefore
  samples 17 insets across the whole range and requires the area to fall monotonically;
  a two-slice chamfer would otherwise step straight over the collapse.

### 1b. Arbitrary-edge fillet/chamfer is NOT achievable on this kernel

Not "hard" — unavailable, for three independent reasons, any one of which is fatal:

1. **No such operation exists.** The full 2.13.0 export surface has no fillet or
   chamfer of any kind. The nearest neighbours are `expansions.expand`,
   `minkowski.minkowskiSum`, and the `roundedCuboid`/`roundedCylinder`/
   `roundedRectangle` primitives, which bake rounding in at construction.
2. **No erosion, so the standard workaround is closed off.** Rounding a solid without
   edge topology is normally erode-by-r then dilate-by-r. V3 cannot erode (above).
   What it can do is dilate: `minkowskiSum(cube, sphere(3))` and
   `expand({delta: 3, corners: 'round'})` return *bit-identical* results
   (16959.21mm³, 182 polygons) — and both grow the part, pushing a ±10mm cube to
   ±13mm. That is an offset, not a fillet: it rounds every convex edge at once, leaves
   concave edges sharp, cannot be aimed at a chosen edge, and changes the part's
   nominal dimensions. Useful for clearance shells; not a fillet.
3. **There is no edge to select.** This is the deepest one. `geom3` is a polygon soup
   with no shared-vertex or half-edge structure, and boolean results are not even
   edge-consistent: subtracting a cylinder from a cube yields 104 polygons in which
   **112 of 264 undirected edges (42%) have no second face** — BSP splitting leaves
   T-junctions. `modifiers.generalize({snap: true, triangulate: true})` *does* repair
   it to a fully closed manifold (0 unmatched edges), but only by triangulating, which
   shatters every planar face into coplanar triangles and destroys the face identity an
   edge fillet selects against. Recovering feature edges from there means dihedral-angle
   edge-loop extraction, then offsetting, blending and self-intersection handling — i.e.
   writing a mesh fillet engine from scratch. There is also nothing stable to *name*: a
   document that records `fillet(edge #7)` has no durable referent across a rebuild.

### The OpenCascade.js question, put to the user explicitly

Per §11's own instruction, this is surfaced rather than quietly resolved or dropped:

> **Open question for the roadmap, not for this spike to decide.** WarpCad can have
> V1-equivalent rim fillets and chamfers on `@jscad/modeling` today — they are built,
> tested, and registered. It cannot have "select an edge, round it" on this kernel at
> any reasonable cost, and no amount of adapter work changes that, because the
> limitation is in the geometry representation rather than in a missing function.
> Getting true edge fillets means a second kernel: **`OpenCascade.js` (OCCT/BREP)
> alongside JSCAD V3**, which the decision above already rejected as a *sole* kernel on
> payload (tens of MB of WASM), API complexity, and zero continuity with the V1
> libraries this project ports. Those objections all still hold for it as a *primary*
> kernel, and none of them are automatically fatal for a lazily-loaded secondary one.
>
> The three honest options, in ascending cost:
>
> 1. **Ship rim fillet/chamfer only** and drop arbitrary-edge fillet from the catalog.
>    Costs nothing; matches what `picam-2`/`picam-touch` actually do, since V1 never
>    offered edge fillets either and those designs were built without them.
> 2. **Defer.** Ship option 1 now, revisit if real designs turn out to need it.
> 3. **Fork to a dual-kernel architecture** — JSCAD V3 for the catalog, OpenCascade.js
>    loaded on demand for BREP fillets and STEP I/O. This is a genuine architecture
>    change, not a library addition: two geometry representations, a conversion boundary
>    between them, and a much larger `src/core/kernel/` adapter. It should be scoped as
>    its own milestone with the user's explicit go-ahead, never absorbed into a
>    fillet-shaped feature task.
>
> Nothing downstream is blocked while this is open, because option 1 is already
> implemented. **`docs-003`'s roadmap should not commit any task that promises
> edge-selected fillets until this is answered.**

### Answered (2026-09-17): Option 1 — ship rim-only, drop edge fillet from the catalog

The user chose the zero-cost option explicitly, not by default or by inaction: rim
fillet/chamfer (`modify.filletRim`/`modify.chamferRim`, shipped in `ui-027`) is the
catalog's whole fillet/chamfer surface, permanently, not a placeholder pending a
second kernel. Arbitrary-edge fillet/chamfer is **out of scope for this project** —
not deferred, not revisited unless a real design need overturns this decision
explicitly and re-opens it as its own question, the same way any other closed
architectural decision here would be revisited (see this file's own header on
re-running the Library-decisions health check only when a deferred dependency is
actually about to be pulled in — the analogous trigger here is a real design that
needs it, not a calendar date).

No `OpenCascade.js` dependency is added, no dual-kernel fork is scoped. `TODO/ROADMAP.md`'s
M4 `edge-fillet` row is closed accordingly — see that file for the exact record.

## Finding 2 — Bearing: the risk was a phantom, and §5's premise is wrong

§6 marks Bearing *Native (tentative)*, sourced to `hardware.Bearing`, and §5 says its
`.addConnector`/`.connect` mating *"needs a v3-native equivalent, not a literal port."*
Checked against the vendored source, three claims in that chain do not hold:

1. **There is no `Bearing` in `jscad-hardware`.** Its only factories are `Bolt`,
   `Washer` and `Nut` (`jscad-hardware.jscad:20,56,81`); a case-insensitive search for
   "bearing" across the package returns nothing but a jQuery false positive in its docs
   bundle. §6's own prose already hedged this — *"`Bolt`, `Nut`, `Washer` (and arguably
   `Bearing`)"* — and the source settles it. There is no size table and no reference
   implementation to port or diff against.
2. **`addConnector`/`.connect` appear nowhere in `jscad-utils`.** `CSG.Connector` is
   used in exactly two places (`util.js:795-810` and `858-901`), both *inside*
   `solidFromSlices`/`slices2poly`, purely as the position/axis/normal frame that tells
   `CAG._toWallPolygons` how to orient consecutive loft slices. It is **loft plumbing
   for the fillet code path above**, not an assembly-mating API — and V3's
   `extrudeFromSlices` absorbs that job entirely, which is why the ported rim ops need
   no connector type.
3. **V3 has no first-class `connectors` type either.** §5's migration table claims
   *"First-class `connectors`/`curves` (arc, NURBS) geometry types"*. In 2.13.0 there is
   no `connectors` module at all, and `curves` contains exactly one member, `bezier`.
   (`primitives.arc` exists, but as a `path2` producer.) **§5 should be corrected**; it
   is the one factual error this spike found in that table.

So the mating question has no V1 requirement behind it — but the *capability* is worth
confirming, and it is already in the tree. Assembly mating is bounding-box frame
arithmetic, which is precisely what `core-001` ported into `src/core/kernel/group.js`
as `snap`/`align`. Verified against a 608 bearing (ID 8, OD 22, thickness 7 — a
catalogue size typed in by hand, **not** read from a spec file, since none exists here)
mated to a Ø8×40 shaft:

```
align(g, 'bearing', shaft, 'xy')  →  concentric
snap(g, 'bearing', shaft, 'z', 'outside-')  →  seated on the shaft end, z 20..27
snap(g, 'bearing', shaft, 'z', 'inside+')   →  flush inside the end,   z 13..20
```

**Conclusion: Bearing is `composite`, not `native`.** Its geometry is an ordinary tube
— `subtract(cylinder(OD), cylinder(ID))`, measured 2305.363mm³ against an ideal
2309.071mm³ at 64 segments — which decomposes into `primitive.*`/`boolean.*` exactly
like Bolt does, and its mating is covered by the existing Group helpers. It is
deliberately **not** registered yet, for a different reason than fillet: not
infeasibility, but the absence of a real spec table to verify against, which would
break the against-V1-output discipline `hardware.bolt` established. It belongs beside
Bolt/Nut/Washer as a composite recipe once a spec table exists.

## What this changes in `Initial design.md`

| Section | Was | Should be |
|---|---|---|
| §6 Operation table | Fillet / Chamfer — *Native (tentative)*, "1 item (edge/face) selected" | **Native (confirmed)** as `modify.filletRim`/`modify.chamferRim`, **1 item selected, `orientation` names a face, not an edge**. Edge-selected fillet is not on the roadmap pending the OpenCascade.js question above. |
| §6 Creation table | Bearing — *Native (tentative)*, source `hardware.Bearing` | **Composite**, source: none — no `Bearing` exists in `jscad-hardware`. Blocked on a spec table, not on kernel capability. |
| §5 Connectors/curves row | "V3: first-class `connectors`/`curves` (arc, NURBS)" | **Incorrect for 2.13.0.** No `connectors` module; `curves` is `bezier` only. V1's `CSG.Connector` was loft plumbing, replaced by `extrudeFromSlices`. |
| §11 risk 1 | "may not have a clean V3 equivalent... needs a spike" | **Resolved.** Rim ops: yes, shipped. Edge fillet: no, and the kernel-fork question is now open and explicit above. |
| §11 risk 6 (Bearing) | "most likely to actually need the native-op exception" | **Resolved.** Neither needs it as a *creation* op; Bearing is composite. |
