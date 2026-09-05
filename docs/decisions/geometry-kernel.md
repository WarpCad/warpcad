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
