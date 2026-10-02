# Initial Design — WarpCad2 on JSCAD V3

Status: kickoff design draft. This expands the original design note (kept verbatim
below as the source of intent) into the comparison, data model, catalog, mockups, and
sequencing `CLAUDE.md` requires before `TODO/ROADMAP.md` can be written. Nothing here
is code yet — this is the document that Library-decision and Interaction-model work
gets built from.

## Original note (verbatim, as written at kickoff)

> This attempt will be a different kind of 3D cad. And the scope will be reduced. For
> modeling, we will use JSCAD V3. The goal is to be a interactive CAD. The goal will be
> to create projects like `picam-2` and `picam-touch` using the `jscad-utils`,
> `jscad-hardware`, and `jscad-raspberrypi` libraries. Note these are all JSCAD V1,
> none of them are compatible with JSCAD V3.
>
> **Modeling Data**: The main data structure is an array of objects and actions.
> Instead of keeping track of meshes, it stores functions that represent library
> objects or primitives and their parameters. This is the first version, it's expected
> to be inefficient. When edited the entire data structure is replayed to generate the
> meshes (this is how JSCAD V1 works; the UI will be an interactive version). No
> JavaScript should be stored in the data structure — it should store as straight
> JSON/NDJSON/text so it can load from a remote URL without security issues. There
> should be a wrapper library for primitives and actions, in a separate directory.
>
> **Main UI Goals**: Works on Safari/Firefox/Chrome/Edge; responsive on
> iPhone/iPad/Desktop. Primitives and groups (RPI5, Bolt) drag-drop from a Library into
> the 3D view — a drag shows an icon until it reaches the viewport, then a ghost
> version that can snap/align to existing items (guides on the nearest item). Selecting
> an item shows move/rotate + dimensions; selecting a group shows the group's
> move/rotate/dimensions, and clicking an item inside the group shows just that item's
> dimensions. Selected items get an editable property panel (color picker, etc.).
> `jscad-hardware` items are Bolt/Nut/Washer — not every head-style combination as a
> separate draggable — you drag a bolt, then pick its properties (hex, panhead, wood,
> M3...). Use the three libraries' own tests to build a list of every operation, and
> cover each with a UI-driven E2E test.

Everything below answers this note's own open questions using the actual source of
the three libraries and two reference projects — not assumptions about them.

---

## 1. What this changes in `CLAUDE.md`

- **Geometry kernel — resolved.** `CLAUDE.md`'s Stack table lists this row as
  **Open**; this document proposes closing it as **JSCAD V3 (`@jscad/modeling`)**. See
  §2 for the comparison `CLAUDE.md`'s Library-decisions rubric requires, which still
  needs to land as `docs/decisions/geometry-kernel.md` before the row can flip from
  Open to Committed.
- **Document model / sync — proposed as deferred, not resolved.** Nothing in this
  note asks for multi-writer merge. The replay-log model in §3 is trivially
  single-writer (append actions, replay). Recommendation: **no CRDT for v1**; leave the
  row Open in `CLAUDE.md` but note explicitly that concurrent editing is out of scope
  until there's an actual second writer to support (a remote MCP session editing the
  same project while a human has it open is the concrete case that would revive this —
  see `CLAUDE.md`'s AI Partner section). Deferring silently is what `CLAUDE.md`
  explicitly warns against, so this has to be a stated decision, not an omission.
- **Rendering / PWA / hosting / E2E / component workshop** — untouched by this note;
  still defaults-to-reconsider per the existing Stack table.
- **Project Structure** — the "wrapper library... in a separate directory" ask in the
  original note is already `CLAUDE.md`'s `src/core/kernel/`: *"the geometry kernel
  adapter and its worker RPC. Everything else in `core/` talks to the kernel through
  this interface, never to the underlying geometry library directly."* No new
  top-level directory is needed — §4 below is a specification for what goes inside the
  directory that already exists in the plan.
- **Library items favor internal-format composition over ported JS mesh code — new
  in this update.** The original note's "wrapper library" was written as a place to
  *port* `jscad-hardware`/`jscad-raspberrypi`'s own mesh-building functions into V3.
  This document now flips the default: a library item's registry entry should expand
  its `params` into more rows of the same op/primitive/boolean/transform vocabulary §3
  already defines (a **composite op**), not reimplement the source library's internal
  geometry code as a hand-translated JS function. This is dogfooding in the literal
  sense — the format the app asks end users and the AI partner to trust (plain,
  inspectable JSON ops) becomes the same format the app's own bundled library content
  is authored in, rather than a special opaque case only the app's own code can produce.
  See §4 for the mechanism and §6 for which catalog entries qualify. A small, explicitly
  flagged minority of ops can't do this — geometry generated by a genuine curve/
  point-sampling algorithm rather than a composition of primitives (`jscad-gears`'
  involute tooth profiles are the concrete example this update names; gears aren't in
  this project's catalog, they're cited purely to illustrate the exception class) stay
  **native**: real ported JS behind the registry entry, exactly as originally planned,
  just no longer the default.

★ Insight ─────────────────────────────────────
`CLAUDE.md` already anticipated exactly this shape of decision — "kernel adapter,
never talk to the underlying library directly" — before any kernel was picked. That's
why swapping in JSCAD V3 doesn't touch the Architecture or Project Structure sections
at all, only the Stack table's one Open row. A good abstraction boundary is one you
can point a completely different library at without the surrounding plan noticing.
─────────────────────────────────────────────────

---

## 2. Library decision: geometry kernel = `@jscad/modeling` (JSCAD V3)

Per `CLAUDE.md`'s Library-decisions rubric: several real options, features/size/health
comparison, an explicit rejection table, and manifold-3d experience factored in
explicitly (not re-derived from scratch). This section is the draft; the committed
version belongs in `docs/decisions/geometry-kernel.md`.

### Options considered

| Library | Kernel type | Bundle/runtime | Ecosystem fit here |
|---|---|---|---|
| **`@jscad/modeling`** (JSCAD V3) | Pure-JS BSP tree (same lineage as V1's `@jscad/csg`) | Pure JS, no WASM, small | **Direct migration path** from `jscad-utils`/`jscad-hardware`/`jscad-raspberrypi` — same boolean semantics, same author (`jscad`/`z3dev`), same mental model this project already has three libraries and two real reference apps built against |
| `manifold-3d` (previous attempt's pick) | WASM, manifold-mesh guaranteed-watertight booleans | WASM (~1-2MB), fast on complex booleans | Rejected last time for unrelated reasons per `PREVIOUS-ATTEMPT.md` (it "still looks like the right call in isolation" — the *project*, not the library, failed). Has **zero** compatibility with the V1 API surface this attempt is explicitly trying to port; every primitive/hardware/raspberrypi call would need a from-scratch rewrite, not a port |
| `OpenCascade.js` | Full BREP/NURBS kernel (OCCT via WASM) | WASM, tens of MB | Most capable (real fillets/chamfers on arbitrary edges, STEP import/export) but heaviest, steepest API, and furthest from anything this project's source libraries already do |
| `three-csg`/`three-bvh-csg` forks | BSP or mesh-boolean over three.js `BufferGeometry` | Pure JS | Ties geometry representation directly to the renderer, which `CLAUDE.md`'s Architecture explicitly warns against ("geometry always derived... kernel adapter... swappable"); also not what any of the three source libraries target |

### Rejection table

| Rejected option | Specific reason |
|---|---|
| `manifold-3d` | No path to reuse `jscad-utils`/`jscad-hardware`/`jscad-raspberrypi` or the `picam-2`/`picam-touch` reference apps at all — every primitive, every hardware size table, every `Group`/`snap`/`align` helper would be a rewrite from zero, not a port. That tradeoff might be worth it if raw boolean performance or watertightness guarantees were the driving requirement, but the driving requirement here is explicitly "build what `picam-2`/`picam-touch` build," which JSCAD V3 does directly and manifold-3d does not. |
| `OpenCascade.js` | Real BREP fillets/chamfers would fix a genuine known gap (§10), but the WASM payload and API complexity are large costs for a project whose reference designs (enclosures, brackets, hardware assemblies) don't need NURBS surfaces — and it shares manifold-3d's problem of zero continuity with the existing V1 libraries. |
| `three-csg`/`three-bvh-csg` | Couples the document/geometry layer to the rendering library, which `CLAUDE.md`'s "no mesh as document state, kernel is swappable" architecture rule exists specifically to prevent. |

### Manifold-3d experience, factored in explicitly (not skipped)

`PREVIOUS-ATTEMPT.md` records manifold-3d as sound "in isolation" — the previous
project's failure was assembly and verification process, not the kernel. That
experience doesn't argue against manifold-3d technically; it's neutral on the kernel
question. What overrides it here is a different requirement this attempt has that the
first attempt didn't: **direct source-level continuity with three existing,
hand-maintained JSCAD V1 libraries and two working reference applications.** That's a
project-shape decision, not a technical-superiority one, and it's why JSCAD V3 wins
this comparison despite manifold-3d's real performance/robustness advantages on raw
booleans.

### Open sub-decision this doc surfaces, not resolves

`jscad-object-api` (a third-party library restoring chained/OOP ergonomics on top of
`@jscad/modeling`'s functional API) is a candidate alternative to hand-porting
`jscad-utils`'s `Group`/`snap`/`align` vocabulary in §4. This needs its own quick
health check (stars/issues/last-release) before the kernel-adapter task starts —
flagged here, not decided, per `CLAUDE.md`'s "several real options" rule.

---

## 3. Modeling data: the action/object array

The document is an **ordered array of plain-JSON action records**, replayed in full
on every edit to produce the current mesh set — exactly as the original note
specifies, and exactly how JSCAD V1's own `main(params)` model works (call the whole
script again with new parameters; nothing is mutated incrementally). Storage is
**NDJSON** (one action per line): cheap to append, line-diffable, and streamable from
a remote URL without parsing the whole document first — the security property the
original note calls out, since a JSON/NDJSON value can never execute.

### Record shape

```jsonc
{ "id": "a7f3", "op": "primitive.cuboid", "params": { "size": [40, 20, 10] }, "name": "case", "parent": null }
{ "id": "b112", "op": "hardware.bolt", "params": { "spec": "m2.5 socket", "length": 20, "fit": "loose" }, "name": "bolt1", "parent": null }
{ "id": "c9a0", "op": "transform.translate", "params": { "vector": [0, 0, 14] }, "target": "b112" }
{ "id": "d301", "op": "group.snap", "params": { "axis": "z", "orientation": "outside+" }, "target": "b112", "reference": "a7f3" }
{ "id": "e558", "op": "boolean.subtract", "params": {}, "target": "a7f3", "operands": ["b112"] }
```

- `op` is a **registry key string**, never a function reference or code string — the
  wrapper library (§4) is the only thing that maps `op` to an actual `@jscad/modeling`
  call. This is the load-bearing property that satisfies "no JavaScript in the data
  structure": a malicious or malformed NDJSON file can name an unknown `op` (which the
  replay engine simply skips/errors on), but it can never cause code execution,
  because there is no `eval`/`new Function` anywhere in the replay path.
- `params` is always JSON-primitive-shaped — this is exactly the shape
  `jscad-hardware`'s own size tables already use internally (`MetricBolts['m2.5
  socket']` is already a plain data object, not a function — see §5), so this design
  isn't inventing a new pattern, it's promoting an existing internal convention to the
  top-level document format.
- `target`/`operands`/`reference` are `id` references into the same array — this is
  the JSON-safe equivalent of `jscad-utils`'s named-part addressing
  (`camera.parts.lense`, `rpi.combine('hole1,hole2,hole3,hole4')`); §4 covers how group
  membership and part names round-trip through this.
- Replay is a **pure fold**: `actions.reduce((scene, action) => applyAction(scene,
  action, registry), emptyScene())`. `applyAction` lives in `src/core/`
  (framework-free per `CLAUDE.md`), the actual `@jscad/modeling` calls live behind the
  registry in `src/core/kernel/` — this keeps `src/core/` testable in plain Node with a
  mocked kernel, per `CLAUDE.md`'s "always mock at the boundary" convention.
- **Composite library items (§4) are defined by expanding into more rows of this exact
  shape** — not by a hand-ported JS function that builds a mesh directly. The
  `hardware.bolt` record above, for example, expands at evaluation time into an
  internal sequence of `primitive.hexagon`/`primitive.cylinder`/`boolean.union` records
  using this same schema, folded through the same `applyAction`. The document only ever
  stores the single `hardware.bolt` line — editing stays the one-field inspector change
  §7b describes, not five records to hand-edit — but the *definition* of what a bolt is
  never leaves the JSON vocabulary this section already specifies. A minority of ops
  (§4) generate geometry via curve/point-sampling algorithms rather than composition and
  can't do this; those stay **native**, an explicit exception rather than a silent one.

★ Insight ─────────────────────────────────────
This is why the "framework-free `src/core/`" rule in `CLAUDE.md` matters more here
than it would in a typical CAD architecture: because replay is a pure fold over JSON,
`applyAction` never needs a DOM, a GPU context, or even the real kernel to unit-test —
you can assert the *shape* of the resulting scene graph with a fake registry, and
separately assert the registry's real `@jscad/modeling` calls with numeric-tolerance
tests (`CLAUDE.md`'s own numerical-code convention), without ever standing up a
browser. The action-log design and the framework-free core rule reinforce each other.
─────────────────────────────────────────────────

---

## 4. The wrapper library (`src/core/kernel/`) — recipes over ports

Two things live here, and they're different in kind. This section revises the
registry's design from the original plan per §1's new default: prefer that a library
item's *definition* is expressed in the same op/params vocabulary the document already
uses (§3), rather than being a hand-translated JS port of `jscad-hardware`'s/
`jscad-raspberrypi`'s own mesh-building code.

1. **A functional-style port of `jscad-utils`'s `Group` concept**, since V3 removed
   the OOP `CSG`/`CAG` prototype chain entirely (§5) — there is no upstream
   replacement to wrap, only a gap to fill. `jscad-object-api` (§2) is a candidate to
   cover part of this instead of a hand port; that call is still open. These functions
   (`snap`/`align`/`combine`/`pick`/`enlarge`) are genuinely generic bounding-box/axis
   math with no "compose it from other ops" option available — they *are* base
   operations, not library items built out of other ops, so they stay real functions
   regardless of the composite/native split below.
2. **A registry mapping `op` strings to real geometry**, now split into two op classes
   instead of one undifferentiated kind:

### Composite ops (the default)

A composite registry entry doesn't build a mesh itself. It holds a small **recipe**
function whose only job is to expand `params` into an array of *other* op records —
primitives, booleans, transforms, using the exact record shape §3 already defines —
and hand that array to the same `applyAction` fold the top-level document replays
through. No `@jscad/modeling` call happens inside the recipe directly; it only ever
emits more rows in the internal format, recursively folded.

```js
// src/core/kernel/recipes/hardware.bolt.js (shape, not final code)
export function bolt(params, tables) {
  const spec = tables.metricBolts[params.spec]
  return [
    { op: 'primitive.hexagon', params: { diameter: spec.headDiameter, height: spec.headHeight } },
    { op: 'primitive.cylinder', params: { diameter: spec.threadDiameter, height: params.length } },
    { op: 'transform.translate', params: { vector: [0, 0, spec.headHeight] }, target: /* the cylinder */ },
    { op: 'boolean.union', params: {}, operands: [/* hexagon, cylinder */] },
  ]
}
```

Confirmed against source (§6, §9 scenario 5): none of `jscad-hardware`'s or
`jscad-raspberrypi`'s factories do anything a `primitive.*`/`boolean.*`/`transform.*`
composition can't already express — prisms and cylinders combined with unions/
subtracts (board slabs minus mounting holes, bolt heads unioned onto shanks, a hidden
`tap`-clearance cylinder subtracted from a shell). `hardware.bolt`/`hardware.nut`/
`hardware.washer`, the Raspberry Pi board/accessory factories, and the kit parts
(Board/BoardFrame/Anchor) all belong here as composite by default (§6 marks each).
A recipe's expansion is itself just data once evaluated — dumping "here is exactly
what an M2.5 socket bolt expands to" as a JSON fixture under `docs/decisions/` or a
test fixture is diffable and reviewable the same way any other document is. That's the
actual payoff of dogfooding here: nobody has to trust an opaque JS function's output by
reading its source, because the expansion *is* the same JSON vocabulary the app already
knows how to render, replay, and show a human — including the AI partner, which can
introspect a composite op's expansion the same way it reads any other part of the
document, without needing to understand `@jscad/modeling` call semantics at all.

### Native ops (the explicit, minority exception)

A small number of registry entries generate geometry that's genuinely procedural —
computed point-by-point by an algorithm, not composed from unions/subtracts of
primitives — and for which "expand into the internal format" would mean inlining a
raw, uneditable point cloud rather than a meaningful recipe. **`jscad-gears`' involute/
cycloidal tooth-profile generator is the concrete example this update is written
against**: a gear's outline is a polygon built by evaluating a trigonometric curve at
hundreds of sampled angles, parameterized by tooth count/module/pressure angle — not a
boolean of primitives. Forcing that into "a recipe of base ops" would only mean storing
the sampled point array as `params.points`: still legal JSON (so the original "no
JavaScript is stored in the data structure" property from the source note holds exactly
as before — `params` was always plain-JSON-shaped, native or composite), but not
meaningfully editable or dogfooded, since nobody can usefully hand-tune 200 raw
coordinates the way they can tune a prism's `size`. Ops like this stay **native**: the
registry entry is marked `native: true` and its implementation is real, ported/wrapped
geometry-generating JS — exactly the original plan for every op, just no longer the
default, and now explicitly flagged rather than indistinguishable from a composite one.
Gears aren't in this project's catalog (§6) — nothing in `jscad-utils`/
`jscad-hardware`/`jscad-raspberrypi` needs this escape hatch today, per the composite
confirmation above — this is named here as the criterion for recognizing the next
library that does, not a current requirement.

### What this changes about the document itself — nothing at the schema level

The top-level NDJSON is unchanged from §3: `hardware.bolt` still appears as one line,
regardless of whether its registry entry is composite or native. Composite-vs-native is
a registry-*implementation* detail, invisible to undo/redo, to the inspector (§7b still
edits `spec`/`length`/`fit` on the one record), and to replay itself. What changes is
how confidently that record's meaning can be verified: a composite op can always be
expanded and inspected as an exact array of primitives/booleans (useful for debugging,
for the acceptance-scenario verification in §9, and for a possible future "convert to
primitives" explode action), while a native op's mesh must be trusted the same way
`@jscad/modeling`'s own primitives already are — it's a smaller, named exception rather
than the load-bearing default it would have been under the original port-everything
plan.

### Group port — what has to be rebuilt, concretely

This is the generic math layer, not a library item — a composite recipe's own
implementation (above) calls into these functions to compute the concrete numbers
(an offset vector, a rotation) that it then bakes into the `transform.*`/`boolean.*`
op records it emits. `group.snap`, for instance, never appears as its own line in a
recipe's output; its *result* does, as a plain `transform.translate` record with a
resolved `vector`. `jscad-utils`'s `Group` (`src/group.js`) is a named dictionary of solids
(`{name, names, parts, holes}`) with chainable, mutating methods —
`.add/.combine/.pick/.snap/.align/.connectTo`. None of it survives the V1→V3
transition as-is, because V3 has no object to attach methods to (`transforms.translate`
takes geometry as its *last* argument and returns a new value, it doesn't mutate a
`this`). The port target is the same **capability**, expressed functionally:

```js
// V1 (jscad-utils), for reference — will not run against @jscad/modeling
const bolt = Hardware.Bolt(20, MetricBolts['m2.5 socket'], 'loose')
  .rotate('head', 'x', 180)
  .snap('thread', rpi.combine('mb', { noholes: true }), 'z', 'outside+')

// V3 port target — functional, immutable, same capability
const bolt0 = hardware.bolt({ length: 20, spec: 'm2.5 socket', fit: 'loose' })
const bolt1 = group.rotate(bolt0, 'head', 'x', Math.PI)
const bolt2 = group.snap(bolt1, 'thread', group.combine(rpi, 'mb', { noholes: true }), 'z', 'outside+')
```

`group.combine`, `group.pick`, `group.add` all need equivalent functional forms:
`combine(group, names, options) -> Geom3`, `pick(group, names) -> Group`, `add(group,
geometry, name, hidden?) -> Group` (returning a new `Group` rather than mutating).
Same for `snap`/`align`/`enlarge`/`fit`/`bisect` — each is a straightforward port since
the *math* (bounding-box comparison, axis offsets) doesn't depend on JSCAD's version at
all, only the calling convention does.

### Registry — the `op` → kernel-call map, typed composite or native

```js
// src/core/kernel/registry.js (shape, not final code)
export const registry = {
  // true primitives/booleans are always native — they're the base vocabulary
  // composite recipes expand into, there's nothing left to compose them from
  'primitive.cuboid': { kind: 'native', operandCount: 0, build: (params) => primitives.cuboid(params) },
  'primitive.cylinder': { kind: 'native', operandCount: 0, build: (params) => primitives.cylinder(params) },
  'boolean.union': { kind: 'native', operandCount: '2+', build: (geoms) => booleans.union(geoms) },
  'boolean.subtract': { kind: 'native', operandCount: '2+', build: (geoms) => booleans.subtract(geoms) },

  // library items default to composite: a recipe expands params into more
  // op records (§4), never builds @jscad/modeling geometry directly
  'hardware.bolt': { kind: 'composite', operandCount: 0, recipe: recipes.bolt },
  'raspberrypi.bplus': { kind: 'composite', operandCount: 0, recipe: recipes.bPlus },

  // 'gear.spur': { kind: 'native', operandCount: 0, build: (params) => gears.spurGear(params) },
  // ^ illustrative only — not in this project's catalog (§4's native-op exception, §6)
  // ...
}
```

Every `op` in §6's catalog gets exactly one registry entry, tagged `composite` or
`native` per the split above. This tagging is also the enforcement point for
`CLAUDE.md`'s creation-vs-operation rule, unchanged from the original plan and
orthogonal to composite-vs-native: every entry, of either kind, carries an
`operandCount` (`0` for primitives/hardware/parts — they create geometry from nothing;
`1` for enlarge/fillet/single-object edits; `2+` or `"2+"` for boolean/pattern/align)
that the UI's tool-enablement logic reads directly, rather than the UI hardcoding a
duplicate list — this is the concrete mechanism `CLAUDE.md` asks for ("the registry
itself encodes operand requirements the UI can act on").

---

## 5. JSCAD V1 → V3: what actually changes, confirmed against docs

| Concern | V1 (`@jscad/csg`, what the 3 source libraries use) | V3 (`@jscad/modeling`) | Effect on the port |
|---|---|---|---|
| Calling style | Object-oriented, chained: `cube({size}).translate([...])` | Functional: `translate([...], cuboid({size}))`, geometry last | Every `jscad-utils` chain in §4 becomes a fold of function calls |
| Import model | Ambient globals injected by build tooling (`var util`, `var Parts`, ...) | Explicit ES imports: `const { primitives, booleans, transforms } = require('@jscad/modeling')` | No more "drag `dist/` into openjscad.org" — registry (§4) imports directly |
| `cube` | `cube({size:[x,y,z], center:true})` | `cuboid({size:[x,y,z]})`; `cube` now means equal-sided only; **centered by default** | `params.center` becomes meaningless/removable in the action-log schema for box-like primitives |
| Rotation units | Degrees | Radians | UI stays degrees (human-facing); the registry is the unit boundary — `degToRad` conversion happens exactly once, at the kernel-call site, per `CLAUDE.md`'s "name every conversion at its boundary" convention |
| Booleans | `a.union(b)` chained, or array-form `union([a,b,...])` from `@jscad/scad-api` | `booleans.union(a, b, ...)` / `booleans.subtract(...)` / `booleans.intersect(...)` — same array-friendly signature, new import path | Direct 1:1 mapping in the registry |
| CSG/CAG objects | Full OOP API (`CSG`, `CAG`, `.fillet`, `.chamfer`, `.bisect`, `.addConnector`) | **Removed entirely** — replaced by plain `geom2`/`geom3` data + functional operators | This is the whole reason §4's port exists — there is no upstream equivalent to import |
| 2D geometry (`geom2`) | `{ sides: [[vec2, vec2], ...] }` | `{ outlines: [[vec2, ...], ...] }`, booleans reworked onto the `martinez` library | Relevant later if `src/sketch/` ever reuses V1 profile-detection logic — flagged as a risk in §11, not a v1 concern |
| Connectors/curves | `.addConnector`/`.connect` prototype methods (used by `Bearing`) | First-class `connectors`/`curves` (arc, NURBS) geometry types | `Bearing`'s connector-based mating (§6) needs a v3-native equivalent, not a literal port |
| Color | `.color(r,g,b,a)` prototype method, CSS-name table | `colorize`/`colors` module, functional | Straightforward functional equivalent |

Sources: JSCAD's own V1→V2 migration guide and V3 wiki (checked directly against
current docs during this design pass — see `docs/decisions/geometry-kernel.md` once
written for links). V2→V3 is additive on top of the V1→V2 breaking changes above
(geometry-representation and 2D-boolean-engine changes); nothing in V3 reverts a V1→V2
change relevant to this port.

---

## 6. Operations & parts catalog

Directly read from `jscad-utils`, `jscad-hardware`, `jscad-raspberrypi` source and the
two reference apps — not reconstructed from documentation. Split per `CLAUDE.md`'s
non-negotiable creation-vs-operation rule.

### Creation — draggable from the Library panel, spawn new geometry, no selection required

`Kind` follows §4's split: **Base** = the primitive/boolean vocabulary itself, nothing
to compose it from; **Composite** = a recipe that expands into Base ops, confirmed
against source as decomposable; **Native (tentative)** = not yet confirmed
decomposable, pending the spike in §11.

| Category | Draggable item | Key parameters | Kind | Source |
|---|---|---|---|---|
| Primitive | Cube / Cuboid | `size [x,y,z]` | Base | `parts.Cube` |
| Primitive | Cylinder | `diameter, height, resolution` | Base | `parts.Cylinder` |
| Primitive | Cone | `diameter1, diameter2, height` | Base | `parts.Cone` |
| Primitive | Hexagon (prism) | `diameter, height` | Base | `parts.Hexagon` |
| Primitive | Triangle (prism) | `base, height` | Base | `parts.Triangle` |
| Primitive | Tube | `outsideDiameter, insideDiameter, height` | Base | `parts.Tube` |
| Primitive | Sphere | native `@jscad/modeling` `primitives.sphere` (no V1 wrapper existed; named in the original note directly) | Base | `@jscad/modeling` |
| Kit part | Board (rounded PCB slab) | `width, height, cornerRadius, thickness` | Composite | `parts.Board` |
| Kit part | BoardFrame | `outerWidth/Height, innerWidth/Height, cornerRadius, thickness` | Composite | `parts.BoardFrame` |
| Kit part | Anchor | `width, height` | Composite | `parts.Anchor` (example of a multi-part `Group` as one draggable item — its recipe emits the same multi-record expansion `Group` used to compute in memory) |
| Hardware | **Bolt** | `length`, `spec` (a size-table key, e.g. `"m2.5 socket"`, `"1/4 hex"`), `fit` (`tap`\|`close`\|`loose`) | Composite | `hardware.Bolt` — dispatches internally on the spec's own `type` field, never a separate draggable per head style |
| Hardware | **Nut** | `spec` (size-table key), `fit` | Composite | `hardware.Nut` |
| Hardware | **Washer** | `spec` (size-table key), `fit` | Composite | `hardware.Washer` |
| Hardware | Bearing | `ID, OD, thickness` | Native (tentative) | `hardware.Bearing` — §5 already flags its connector-based mating as needing a v3-native equivalent, not a literal port; treat as native pending the spike, not composite by default like the rest of Hardware |
| Raspberry Pi | Raspberry Pi board | `model` (`bplus`\|`3`\|`4`\|`5`), `clearance` | Composite | `raspberrypi.BPlus` — **one factory, model as a parameter**, not one draggable per revision (§7 covers the UI implication) |
| Raspberry Pi accessory | Camera Module (v1/v2/v3, HQ, Arducam HQ) | model select | Composite | `raspberrypi.CameraModuleV1/V2/V3/HQCameraModule/ArducamHQCameraModule` |
| Raspberry Pi accessory | Touch Display (7", TouchScreen2) | — | Composite | `raspberrypi.TouchDisplay_7inch/TouchScreen2` |
| Raspberry Pi accessory | Mini PiTFT, PiTFT 2.2/2.4, HyperPixel 4 | — | Composite | `raspberrypi.MiniPiTFT/PiTFT22/PiTFT24/HyperPixel4Rectangular` |
| Raspberry Pi accessory | Active Cooling Fan, HAT, HAT Standoff, Spacer | — | Composite | `raspberrypi.*` |

### Operation — requires a selection, disabled/hidden otherwise (`CLAUDE.md` selection-count rule)

| Operation | Operand count | Params | Kind | Source |
|---|---|---|---|---|
| Union | 2+ solids selected | — | Base | `booleans.union` (V3) |
| Subtract | 2+ solids selected (first is base) | — | Base | `booleans.subtract` (V3) |
| Intersect | 2+ solids selected | — | Base | `booleans.intersect` (V3) |
| Snap | 1 new/moving item + 1 reference item selected | `axis, orientation, delta` | Base | `add-prototype.js` `.snap` — this **is** the drag-drop guide/snap feature from the original note; a Group-math function (§4), not a library item |
| Align | 1 new/moving item + 1 reference item selected | `axis` | Base | `.align` |
| Enlarge / Fit | 1 item selected | `x, y, z` deltas or target box | Base | `.enlarge` / `.fit` |
| Combine into group | 2+ items selected | group `name` | Base | `Group.add` |
| Pick subset from group | 1 group selected, sub-part chosen | part `name` | Base | `Group.pick` — the mechanism behind "clicking an item in a group shows just that item's dimensions" from the original note |
| Bisect (rabbet-joint split) | 1 item selected | `axis, offset, angle` | Base | `.bisect` — used by `picam-2`'s case-shell split (§9 example) |
| Fillet / Chamfer | 1 item (edge/face) selected | `radius, orientation` | Native (tentative) | `.fillet`/`.chamfer` — **flagged risk, see §11**: V1's implementation is BSP-based and its real edge-case coverage on non-primitive meshes needs verification against V3 before this becomes a committed roadmap item; general-mesh fillet math has no obvious decomposition into a boolean/primitive recipe, so it's a native-op candidate by default rather than composite, pending that spike |

### What "bolt, nut, washer — not every combination" means concretely

Confirmed directly from `jscad-hardware/src/metric.js` and `imperial.js`: there is
**no** `HexBolt()`/`M3Bolt()`/`WoodScrew()` export. `Bolt`, `Nut`, `Washer` (and
arguably `Bearing`) are the only top-level hardware factories; "hex head", "pan head",
"socket cap", "wood screw", "M3", "1/4-20" are all **keys into a flat lookup table**
(`MetricBolts['m2.5 socket']`, `ImperialNuts['1/4 hex']`) whose entries carry a `type`
discriminator (`'HexHeadScrew'`/`'PanHeadScrew'`/`'FlatHeadScrew'`) that `Bolt()`
switches on internally. This confirms the original note's instinct exactly and gives
the inspector panel its real shape: **one flat searchable dropdown of spec strings per
hardware type**, not a cascading head-style → drive → size picker — because that's the
actual shape of the underlying data, not a UI simplification imposed on top of it.

---

## 7. UI design

### 7a. Drag-drop-to-place, with snap guides (laptop reference, 1440×900)

```
┌─ WarpCad2 ──────────────────────────────────────────────────────────────────┐
│ [Project ▾]  [Undo] [Redo]                              [AI ●] [Save] [⚙]   │
├───────────────┬───────────────────────────────────────────┬─────────────────┤
│ LIBRARY       │              VIEWPORT                      │ INSPECTOR       │
│ ▸ Primitives  │                                             │                 │
│   ⬚ Cube      │        ┌──────────┐                         │  (nothing       │
│   ⬤ Sphere    │        │ RPi 5    │◇┄┄┄┄┄┄◇  ← ghost bolt    │   selected)     │
│   ▲ Cone      │        │  board   │        (drag in progress)│                 │
│   ⬭ Cylinder  │        └────┬─────┘                         │                 │
│ ▸ Hardware    │             ┊  guide line snaps ghost to     │                 │
│   ⚙ Bolt      │             ┊  nearest mounting hole on      │                 │
│   ⬡ Nut       │             ┊  the RPi board (closest item   │                 │
│   ◯ Washer    │             ┊  when >1 item is in the scene) │                 │
│ ▸ Raspberry Pi│                                             │                 │
│   ▭ Pi board  │  [+] [-]  🧭(orient. gizmo)     [orbit|pan|zoom icons — touch] │
│   📷 Camera   │                                             │                 │
│   ▭ Touch LCD │                                             │                 │
├───────────────┴───────────────────────────────────────────┴─────────────────┤
│ Grid: 10mm minor / 50mm major, ruler along X/Y edges                        │
└───────────────────────────────────────────────────────────────────────────┘
```

Precondition/trigger/feedback for this control, per `CLAUDE.md`'s Interaction Model
rule:

- **Precondition**: none — creation controls are always available.
- **Trigger**: pointer-down + drag on a Library row. During drag-over-non-viewport, a
  small icon follows the pointer. On drag-over-viewport, the icon is replaced by a
  translucent full ghost mesh at the pointer's projected 3D position.
- **Feedback**: if the scene has ≥1 existing item, the nearest item (by screen-space
  or world-space distance to the ghost, nearest wins when several are present, exactly
  as the original note specifies) grows dashed alignment guides on its own
  faces/edges; the ghost snaps to the guide within a tolerance radius. On drop, the
  ghost commits as a real `op` record (§3) appended to the action log, and the item
  becomes selected (feeding directly into 7b).

### 7b. Selection → move/rotate/dimensions/inspector

```
┌─ WarpCad2 ──────────────────────────────────────────────────────────────────┐
│ ...                                                                          │
├───────────────┬───────────────────────────────────────────┬─────────────────┤
│ LIBRARY       │              VIEWPORT                      │ INSPECTOR       │
│               │                                             │ Bolt            │
│               │        ┌──────────┐        Z┆20.0mm          │ ───────────────│
│               │        │ RPi 5    │  ⟲       ┆               │ Spec            │
│               │        │  board   │↕         ┆               │ [M2.5 Socket ▾] │
│               │        └────┬─────┘         ⊥┴ (vert. dim,   │ Length (mm)     │
│               │             ⚙ ←gizmo             along Z)    │ [ 20        ]   │
│               │        ├─3.0mm─┤      ⤢3.0mm (diag. dim,     │ Fit             │
│               │      (horiz. dim,       along Y — camera-     │ (•)loose ( )close│
│               │        along X)         relative angle)       │ Color           │
│               │                                             │ [■ silver ▾]    │
├───────────────┴───────────────────────────────────────────┴─────────────────┤
```

- **Selecting a lone item**: gizmo + **three dimension lines drawn on-canvas in the
  viewport itself**, one per axis, each an extension line + arrowheads + numeric label
  running parallel to that axis's actual 3D direction as the current camera projects
  it — horizontal for X, vertical for Z (Z-up per `CLAUDE.md`), and on whatever
  diagonal the camera currently shows for Y, exactly like a SolidWorks/Fusion
  dimension annotation, not three numbers stacked in a flat text readout. These are
  `viewport/` on-canvas overlays (`CLAUDE.md`'s Project Structure list), not inspector
  text — a bolt's length-only dimension would hide that its diameter is wrong, which
  is why all three lines are always shown together, never a single collapsed number.
  Inspector shows its own registry `op`'s param schema (bolt → spec/length/fit/color,
  as shown) — a second, numeric-editable view of the same lengths, not a replacement
  for the on-canvas lines.
- **Selecting a group** (e.g. the whole Pi+camera+screen assembly): gizmo + the same
  three on-canvas dimension lines, measured on the group's combined bounding box and
  drawn along its edges instead of a single item's; inspector shows group-level fields
  (`name`, overall color override).
- **Clicking an item inside an already-selected group** (a second, more specific
  click, not a fresh click from empty selection): re-targets gizmo/dimensions/inspector
  to that sub-part only — this is `Group.pick` (§6) surfaced directly as a selection
  behavior, not a separate command.
- Numeric inspector fields and gizmo drag write to the **same** `transform.*` action
  record — `CLAUDE.md`'s "gizmo drag and numeric-field edits must drive the same
  underlying transform and stay in sync" is satisfied by both paths appending/updating
  the identical record shape from §3, not two parallel state paths.

### 7c. Responsive: tablet (820×1180) and phone (390×844)

```
Tablet (touch-primary, persistent side panel still fits)      Phone (panels collapse to sheets)
┌─ WarpCad2 ────────────────────────┐                          ┌─ WarpCad2 ──────────┐
│ [☰] Project        [AI] [Save]    │                          │ [☰]  [AI]  [Save]   │
├───────────┬────────────────────────┤                          ├──────────────────────┤
│ LIBRARY   │      VIEWPORT          │                          │                      │
│ (narrower,│                        │                          │      VIEWPORT        │
│  icon+    │   🧭  [+][-]           │                          │   (full width/height)│
│  label    │   [orbit|pan|zoom]     │                          │   🧭  [+][-]         │
│  rows)    │                        │                          │   [orbit|pan|zoom]   │
│           │                        │                          │                      │
├───────────┴────────────────────────┤                          ├──────────────────────┤
│ (no separate inspector column —    │                          │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │  ← bottom sheet:
│  opens as a bottom sheet on select)│                          │ (Library / Inspector  │    Library tab or
└─────────────────────────────────────┘                          │  swipe-up sheet)     │    Inspector tab,
                                                                   └──────────────────────┘    dismissible
AI chat: translucent overlay, dismissible, never a permanent split — viewport stays visible underneath at both sizes.
```

Matches `CLAUDE.md`'s Responsive Layout section directly: designed phone-first (bottom
sheet, not a shrunk desktop panel), AI chat as overlay/sheet at phone+tablet, viewport
navigation chrome (zoom buttons, orbit/pan icons, orientation gizmo) present at every
size because touch has no keyboard shortcuts to fall back on.

---

## 8. Analysis steps — what happens next, in order

This document is input to the steps `CLAUDE.md`'s Working Files section already
defines; it doesn't replace them.

1. **`docs/decisions/geometry-kernel.md`** — formalize §2 as the committed
   Library-decision doc; flip the Stack table row from Open to Committed.
2. **`docs/decisions/document-sync.md`** — record the "no CRDT, single-writer replay
   log, revisit if/when MCP-concurrent-editing becomes real" decision from §1
   explicitly, so it's a stated deferral, not a silent gap.
3. **Kernel-adapter spike** — port enough of `Group`/`snap`/`align`/`combine` (§4) and
   wire three native registry entries (`primitive.cuboid`, `boolean.union`,
   `boolean.subtract`) plus **one composite recipe end-to-end** (`hardware.bolt`,
   dimensionally diffed against its V1 output per §11's recipe-fidelity risk) before
   committing to the full catalog in §6. This validates both the V1→V3 mapping in §5
   and the composite-recipe pattern in §4 against real code, not just documentation or
   source-reading, before either is load-bearing across dozens of roadmap tasks.
4. **Action-log schema + replay engine** in `src/core/` (framework-free): NDJSON
   read/write, the `applyAction` fold from §3, numeric-tolerance tests covering
   degenerate cases (`CLAUDE.md`'s numerical-code convention) — zero-length bolts,
   an `op` referencing a nonexistent `target`, an unknown `op` string.
5. **Interaction-model Q&A** (`.claude/commands/feature.md` Phase 1, Q10-16) for each
   control in §7 — drag-place primitive, drag-place hardware/kit-part with snap guide,
   select→inspector, gizmo move/rotate, boolean with selection-count gating,
   group-pick-subpart — written up *before* any roadmap entry names these as tasks,
   per `CLAUDE.md`'s explicit ordering.
6. **`TODO/ROADMAP.md`** — milestones built from steps 3-5's output.
7. **`TODO/ACCEPTANCE.md`** — see §9 for drafted scenario candidates, ready to
   transcribe once step 5 confirms the exact control shapes.
8. **App shell + viewport scaffold**, mounted from day one per `CLAUDE.md`'s
   Interaction Model rules — grid with major/minor lines and dimensions, orientation
   gizmo, orbit/pan/zoom chrome — this is also the first task with a real `*.e2e.js`
   gate (§10).

---

## 9. Draft `TODO/ACCEPTANCE.md` scenario candidates

Drawn directly from the real toggle/parameter matrix in `picam-touch`'s own test
harness (`test/helpers/params.js`, `ENABLED_*` constants in `picam-touch.jscad`) —
this *is* the "list of operations" the original note asked for, already exercised by
a real project, translated into human-driven scenarios rather than scripted asserts:

1. **Two independent primitives** — drag a Cube and a Cylinder into the viewport;
   confirm both remain visible and independently selectable (the exact class of bug
   `SECOND-ATTEMPT.md` names as its sharpest regression).
2. **Hardware property edit** — drag a Bolt in, select it, change spec from a default
   to `M2.5 Socket` and fit to `loose` in the inspector; confirm the 3D mesh updates
   to match (length/diameter change visibly).
3. **Snap-placement of a kit assembly** — drag a Raspberry Pi 5 board in, then drag a
   Camera Module V3 near one of its mounting holes; confirm alignment guides appear on
   the board and the camera snaps to the holes on drop (`picam-touch`'s own
   `createCameraModule` alignment, §6/§9 mirrored as a UI flow).
4. **Boolean gating** — select a single solid; confirm Union/Subtract/Intersect stay
   disabled. Select two; confirm they enable. Run Subtract; confirm the result reflects
   both operands and the tool disables again once only one result solid remains
   selected.
5. **Hidden-part boolean** — place a Bolt near a case shell such that its hidden `tap`
   clearance geometry (§3, §6) overlaps the shell; run Subtract; confirm a
   correctly-sized hole appears matching the bolt's thread diameter, not the bolt's
   visible head/thread mesh.
6. **Group vs sub-part selection** — select the full Pi+camera+screen group; confirm
   gizmo/dimensions cover the whole assembly. Click the camera module specifically;
   confirm gizmo/dimensions narrow to just that sub-part.
7. **Touch-only viewport navigation** — on the iPad reference viewport, with no
   keyboard/mouse, orbit/pan/zoom via on-screen chrome and snap to a standard view via
   the orientation gizmo.
8. **Remote-load safety** — load a project from a `#/gist/<id>`-style NDJSON URL;
   confirm it replays into the expected scene and confirm (via a deliberately malformed
   NDJSON line with a bogus `op`) that a bad record is skipped/reported, never executed.

---

## 10. When real UI testing starts

Directly answering the original note's question. Per `CLAUDE.md`'s Interaction
Model and Verification sections, this isn't a milestone scheduled for later — it
starts at the first UI-touching task and never stops being a per-task gate:

- **Step 8 above (app shell + viewport scaffold)** ships with the **first**
  `*.e2e.js` spec against `/` — not a Storybook story — at all three responsive
  viewports (phone/tablet/laptop) with a snapshot at each, and against all three
  browser engines (Chromium/Firefox/WebKit) because it's WebGL from line one.
- **Every subsequent UI-touching task** (drag-place primitives, hardware placement,
  snap guides, selection/inspector, gizmos, booleans) ships its own `*.e2e.js` spec
  under the same rule — this catalog (§6) is large but each row becomes one
  reachability-gated task, not a deferred batch.
- **Snap-guide placement specifically** (scenario 3, §9) is flagged as needing the
  "driven, not scripted" verification pass (`CLAUDE.md` Verification) earliest and
  most often — guide-snap tolerance and timing is exactly the class of bug a
  pre-written click sequence is least likely to catch (a drag at a slightly different
  angle or speed), per both retrospectives' shared finding.
- **Milestone boundaries** get the five-minute free-form human pass at
  phone/tablet/laptop per `CLAUDE.md`, triggered automatically by `/run-todos` per
  `TODO/BUDGET.md`'s milestone-boundary rule — the first one lands at the end of the
  milestone containing step 8.

---

## 11. Open risks / questions to resolve before they're load-bearing

- **Fillet/chamfer on arbitrary edges** may not have a clean V3 equivalent — V1's
  `.fillet()`/`.chamfer()` are BSP-based and their real robustness on non-primitive
  meshes (vs. just box/cylinder edges) was never fully characterized in the source
  read for this document. Needs a spike before it's promoted from "listed in §6" to
  "committed roadmap task" — if it's not robust, general-mesh fillet may need to move
  to OpenCascade.js-as-a-later-addition territory rather than staying in the JSCAD V3
  path, which would be a real architecture fork worth flagging to the user before
  scoping it, not silently working around.
- **`jscad-object-api` vs. hand-porting `Group`** (§2, §4) — genuine open choice,
  needs its own quick health check.
- **V3's `martinez`-based 2D booleans and new `geom2` `outlines` format** (§5) matter
  once `src/sketch/` exists; not a v1 concern, flagged so it isn't rediscovered late.
- **`picam-touch`'s own `PiTypes` mapping has a latent inconsistency**
  (`{bplus: 1, ...}` passed into `BPlus(model)`, whose own default-model semantics
  document `2`/`3` for B+/Pi3 — `model: 1` doesn't match either) — don't port this
  mapping verbatim into the registry's Raspberry Pi model dispatch; define the
  UI-facing model keys against `BPlus`'s actual semantics instead.
- **`cameraModuleV3`'s bottom shell is known non-watertight** in the source project
  (explicitly `test.skip`'d there, "32 unmatched edge(s)"). If this part ships in the
  initial catalog, any export/3D-print-adjacent scenario should expect this as a
  pre-existing defect, not flag it as a new regression when found.
- **Recipe-decomposition fidelity needs verification, not just source confirmation.**
  §4's composite-ops claim — that `jscad-hardware`/`jscad-raspberrypi` factories
  decompose cleanly into `primitive.*`/`boolean.*` recipes — was checked by reading the
  source, not by running a decomposed recipe next to the original V1 output and
  diffing the meshes. Step 3's kernel-adapter spike (§8) should include at least one
  hardware recipe (Bolt) and one Raspberry Pi recipe (a board with mounting holes)
  compared dimensionally against the V1 original before the composite pattern is
  trusted across the full §6 catalog.
- **`jscad-gears` is this document's confirmed example of a native-op library, not a
  hypothetical one.** It isn't in this project's catalog (§6) — nothing in
  `jscad-utils`/`jscad-hardware`/`jscad-raspberrypi` needs the escape hatch — but if a
  future roadmap item adds gear generation (or any other library whose geometry comes
  from curve/point-sampling rather than primitive composition), §4's native-op path is
  the intended answer, not a fresh design question.
- **Bearing and Fillet/Chamfer are marked Native (tentative) in §6**, not Composite,
  pending the same decomposition spike above — Bearing's connector-based mating (§5)
  and general-mesh fillet/chamfer (already flagged above) are the two catalog entries
  most likely to actually need the native-op exception rather than qualifying as
  composite once someone tries the decomposition for real.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
