# Interaction-model Q&A — the six §7 controls

Written per `TODO/ui-001-interaction-model-qa.md`, answering
`.claude/commands/feature.md` Phase 1's Q10-17 for every control named in
`Initial design.md` §7, **before** `TODO/ROADMAP.md` (`docs-003`) sequences any of
them as tasks — per `CLAUDE.md`'s explicit ordering. `Initial design.md` §7's own
prose (drag-drop mockup, selection mockup, responsive mockup) is the starting point
for each answer below, not a substitute for it — this document exists specifically to
spell out what §7 leaves implicit: exact operand/selection counts (Q11/15) and
per-control phone-width behavior (Q16).

Q1-9 (the general Phase 1 questions) are answered once, for all six controls, by
`Initial design.md` itself (§3 data model, §4 registry, §6 catalog) and are not
repeated per-control here — only the UI-surface questions (Q10-17) are specific enough
per-control to need individual answers.

**Section 7 below is a later addition, not one of the original six.** `Initial
design.md` gives sketch mode far less design depth than the 3D catalog (two flagged
risk notes, no §7 mockup) — `TODO/ui-020`'s own roadmap row says this needs its own
Q&A pass before it can be scoped, per `CLAUDE.md`'s ordering rule, the same rule that
produced sections 1-6 in the first place. Answered here rather than in a second
document so every control this project has designed stays in one place.

---

## 1. Drag-place a primitive (§7a, empty-scene case — no snap guide)

Covers: Cube/Cuboid, Cylinder, Cone, Hexagon, Triangle, Tube, Sphere (`primitive.*`,
§6's Base creation rows).

- **Q10 (flow)** — Precondition: none; primitive rows are always available regardless
  of scene state. Trigger: pointer-down + drag on a Library row under "Primitives".
  While the drag is over non-viewport UI, a small icon follows the pointer; once the
  drag crosses into the viewport, the icon is replaced by a translucent full ghost
  mesh positioned at the pointer's projected point on the working plane (grid plane at
  Z=0 when no other geometry exists to project against). Feedback: on release inside
  the viewport, the ghost commits as a `primitive.*` op record (§3) appended to the
  action log at the drop position, and the new item becomes selected (control 3 below
  fires immediately as a consequence).
- **Q11 (operand count)** — n/a. This creates geometry from nothing (`operandCount: 0`
  per §4's registry shape); there is no existing-geometry precondition to gate on.
- **Q12 (control location)** — Existing: the Library panel's "Primitives" section,
  already enumerated in §7a's mockup. No new control surface needed.
- **Q13 (drag-to-place)** — Yes, exactly as described in Q10. Explicitly not a
  fixed-origin spawn.
- **Q14 (post-selection inspector/gizmo)** — Once dropped, the item is selected, so
  control 3's contract applies immediately: gizmo attaches, inspector shows the
  primitive's own param schema (e.g. Cuboid → `size [x,y,z]`; Cylinder →
  `diameter, height, resolution`).
- **Q15 (selection count)** — n/a, not a selection-driven tool.
- **Q16 (phone width)** — The Library panel is not persistent at 390px (§7c); it lives
  behind a bottom-sheet tab. The drag gesture itself is unchanged (touch-drag instead
  of mouse-drag), but the sheet must already be open to the Library tab before the
  drag can start — there is no way to drag a row that isn't currently rendered. State
  this explicitly since §7c's mockup shows the sheet closed by default: opening it is
  itself a precondition step at phone width that doesn't exist at laptop width, where
  the Library column is always visible.
- **Q17 (acceptance scenario)** — Extends `Initial design.md` §9 scenario 1 ("Two
  independent primitives"). Not a new scenario.

---

## 2. Drag-place a hardware/kit-part item with snap guides (§7a, non-empty scene)

Covers: Bolt, Nut, Washer, Board, BoardFrame, Anchor, Raspberry Pi board/accessories
(`hardware.*`, kit-part, and `raspberrypi.*` composite rows in §6).

- **Q10 (flow)** — Precondition: at least one existing item already placed in the
  scene (a guide needs something to measure against — if the scene is empty, this
  control degrades to control 1's behavior with no guides, not a disabled state).
  Trigger: same drag mechanic as control 1, from the Library's "Hardware"/"Kit
  parts"/"Raspberry Pi" sections. Feedback: during drag-over-viewport, the nearest
  existing item (by distance to the ghost's current position, nearest wins when
  several are in the scene — per the original note and confirmed in §7a) grows dashed
  alignment guides on its own faces/edges; the ghost snaps to the guide once inside a
  tolerance radius. On drop, commits as the composite op's record (e.g.
  `hardware.bolt`) and the item becomes selected.
- **Q11 (operand count)** — n/a for the placement itself (`operandCount: 0`, same as
  control 1 — hardware/kit-part/RPi items create geometry from params, they don't
  consume operands). The *snap guide* is assistive UI feedback, not an operation with
  its own operand-count gate; it doesn't block placement if no snap target is found
  within tolerance — the item still commits at the ghost's last position.
- **Q12 (control location)** — Existing Library panel sections (Hardware, Kit parts,
  Raspberry Pi), already enumerated in §7a.
- **Q13 (drag-to-place)** — Yes, with snap-assist as described in Q10.
- **Q14 (post-selection inspector/gizmo)** — Control 3's contract applies on drop,
  same as control 1, with the composite op's own param schema (e.g. Bolt →
  `spec, length, fit, color` per §7b's mockup).
- **Q15 (selection count)** — n/a, not a selection-driven tool.
- **Q16 (phone width)** — Same bottom-sheet precondition as control 1. Additionally,
  since touch input has no hover state to preview a snap target before commit, the
  snap tolerance radius should be more generous at touch input than at mouse input to
  compensate for finger imprecision (no exact pixel value is fixed by this document —
  that's an implementation-tuning decision for the task that builds this control, but
  the *requirement* that touch tolerance ≠ mouse tolerance is stated here so it isn't
  silently dropped).
- **Q17 (acceptance scenario)** — Extends §9 scenario 3 ("Snap-placement of a kit
  assembly"). Not a new scenario.

---

## 3. Selecting an item → inspector + dimension lines + gizmo (§7b)

- **Q10 (flow)** — Precondition: at least one placed item exists in the scene.
  Trigger: pointer-down/tap directly on an item's mesh in the viewport. Feedback: a
  transform gizmo attaches to the item; three on-canvas dimension lines are drawn (one
  per axis, each an extension line + arrowheads + numeric label, oriented per the
  camera's current projection of that axis — §7b is explicit that this is always all
  three at once, never a single collapsed number); the inspector populates with the
  item's own registry `op`'s param schema.
- **Q11 (operand count)** — n/a; this is a display/targeting contract, not an
  operation with operands.
- **Q12 (control location)** — Existing: Inspector panel (persistent side column at
  laptop/tablet per §7a/§7c, bottom sheet at phone per Q16 below).
- **Q13 (drag-to-place)** — n/a, not a creation control.
- **Q14 (inspector/gizmo contract)** — This *is* the contract Q14 asks about. Explicit
  addition beyond §7b's mockup: the Inspector needs a standing "Transform" field group
  (position X/Y/Z, rotation X/Y/Z) in addition to the per-op param fields shown in
  §7b's mockup (which only shows Bolt's own `spec/length/fit/color`) — §7b's dimension
  lines and gizmo both operate on position/rotation, but the mockup doesn't show a
  numeric position/rotation field group explicitly. This gap is resolved here so
  control 4 (gizmo↔field sync) has concrete fields to write to: **add a
  Transform section to the Inspector, always present alongside the per-op schema.**
- **Q15 (selection count)** — Exactly 1 item selected activates this full contract.
  0 selected → Inspector shows its empty state (§7a: "(nothing selected)"). **2+
  individually-selected items (not yet grouped)** is an explicit case this document
  resolves since neither §7a nor §7b states it: the Inspector shows no per-item fields
  in this state (per `CLAUDE.md`'s single-object-tool gating — there is no single
  object to describe), but this state does enable control 5's boolean/group-forming
  operations, which need exactly this multi-selection.
- **Q16 (phone width)** — Resolves §7c's own open question (its prose sketches "opens
  as a bottom sheet on select" generally without saying whether that's automatic or
  requires a tap): **the Inspector bottom sheet auto-opens on selection**, with no
  extra tap required. Rationale: `CLAUDE.md` states selection is itself a trigger with
  an inspector feedback contract "the same as any other trigger" — requiring a second
  tap to reveal that feedback at phone width would make selection behave differently
  by form factor, which is exactly the kind of platform-specific gap
  `SECOND-ATTEMPT.md` warns about. The sheet is dismissible by swiping down or tapping
  empty viewport space, which also clears the selection (see control 6 for the
  same gesture's meaning when a sub-part is selected).
- **Q17 (acceptance scenario)** — This is the underlying mechanism for §9 scenario 2
  (hardware property edit) and scenario 6 (group vs. sub-part); not a new scenario
  itself.

---

## 4. Gizmo move/rotate ↔ numeric-field sync (§7b)

- **Q10 (flow)** — Precondition: exactly one item or group currently selected (gizmo
  already attached per control 3). Trigger: **either** (a) pointer-drag on a gizmo
  handle (a translate arrow or rotate ring) in the viewport, **or** (b) direct edit of
  a numeric field in the Inspector's Transform section (added in control 3, Q14).
  Feedback: for (a), the mesh transforms live during the drag and the Transform
  section's numeric fields update live in step with the drag — not only after
  release — so both paths visibly agree at every instant, per `CLAUDE.md`'s "must
  drive the same underlying transform and stay in sync" rule. For (b), the mesh
  updates immediately on field commit (blur/Enter). Either path appends/updates the
  same `transform.translate`/`transform.rotate` record (§3).
- **Q11 (operand count)** — n/a; single-object transform, not a multi-operand
  operation.
- **Q12 (control location)** — Gizmo lives in `viewport/` (on-canvas), numeric fields
  in the Inspector's Transform section (`inspector/`) added by control 3 — no new
  top-level control surface, but the Transform section itself is a net-new addition to
  the Inspector this document specifies.
- **Q13 (drag-to-place)** — n/a, not a creation control.
- **Q14 (inspector/gizmo contract)** — Same contract as control 3, both directions
  now live (gizmo → fields, fields → gizmo/mesh).
- **Q15 (selection count)** — Exactly 1 selected item or exactly 1 selected group
  (group case: the gizmo transforms the whole group's combined bounding box/origin,
  per §7b's group-selection behavior) — same single-selection gate as control 3, since
  this is that same selection's transform affordance, not a separate tool.
- **Q16 (phone width)** — Gizmo handles need touch-sized hit targets: a larger
  invisible hit-test radius around each handle than the handle's own rendered size, to
  compensate for finger contact area versus a mouse pointer's single-pixel precision.
  Numeric fields live in the same bottom sheet control 3 opens, edited via the
  platform's on-screen keyboard.
- **Q17 (acceptance scenario)** — Strengthens §9 scenario 2, but from the opposite
  direction: scenario 2 as drafted only edits the Inspector field and checks the mesh;
  it does not drive the gizmo and check the field. Flagging this explicitly for
  `docs-004`: **scenario 2's steps should include a gizmo-drag step** (not only an
  inspector-field edit) so the two-way sync this control specifies is actually
  exercised by the driven scenario, not just the one-way direction a scripted test
  would default to writing first. Not a new scenario — a refinement to scenario 2's
  steps.

---

## 5. Boolean operation (Union/Subtract/Intersect) with selection-count gating (§6)

- **Q10 (flow)** — Precondition: 2 or more solids currently selected. Trigger: a
  button in a dedicated **Operations** control — a toolbar strip, separate from the
  Library panel, populated from the registry's `operandCount` field rather than a flat
  feature-registry dump (per `CLAUDE.md`'s creation-vs-operation rule; §7a's mockup
  doesn't show this toolbar explicitly, so this document places it: a row of
  operation buttons — Union/Subtract/Intersect/Combine-into-group/etc. — positioned
  between the Library and Viewport columns at laptop/tablet width, collapsing into the
  same navigation-chrome row as the viewport's own orbit/zoom controls at phone
  width, per Q16). Feedback: buttons are disabled (dimmed, non-interactive) until the
  count precondition is met; once met, clicking replaces the selected solids with one
  `boolean.*` record (operands = the selected ids, §3); the resulting solid becomes
  the new selection (firing control 3); the buttons immediately disable again since
  only one solid now remains selected.
- **Q11 (operand count)** — 2 or more (`operandCount: '2+'` per §4's registry shape).
  Made visible via: (a) the disabled state itself, (b) a tooltip on hover/long-press
  while disabled reading "select 2 or more solids", and (c) once eligible, a live
  counter badge on the toolbar (e.g. "2 selected") so the requirement is visible
  *before* it's satisfied, not only inferred from the button becoming clickable.
- **Q12 (control location)** — **New control**: the Operations toolbar described in
  Q10. Explicitly not merged into the Library panel or rendered as a dropdown item
  alongside primitive/hardware rows — this is the concrete instance of `CLAUDE.md`'s
  non-negotiable creation-vs-operation split for this control.
- **Q13 (drag-to-place)** — n/a; this acts on existing geometry, it doesn't create new
  geometry at all (per Q11's premise).
- **Q14 (inspector/gizmo contract)** — Not during the operation itself (no single item
  is selected while 2+ are staged for a boolean); once the operation completes and the
  result is auto-selected, control 3's contract takes over on the result.
- **Q15 (selection count)** — 2 or more for Union/Intersect. **Subtract specifically
  needs order, not just count** — §6 states "first is base" — so the UI must expose
  *which* selected solid is first: the first-selected solid is outlined in the
  standard selection-highlight color, and each subsequently-selected solid gets a
  visually distinct secondary highlight (e.g. a dimmer or differently-hued outline),
  so the base/subtrahend relationship is visible on screen before Subtract runs, not
  just inferred from selection order after the fact.
- **Q16 (phone width)** — The Operations toolbar must remain reachable without a
  keyboard and without depending on a panel that's hidden behind a sheet at 390px
  (unlike Library/Inspector, this is not a candidate for sheet-collapse, since its
  enabled/disabled state needs to stay visible while the user is actively selecting
  items in the viewport). Recommendation: an icon-only row anchored to the
  viewport's own navigation-chrome band (same band as orbit/pan/zoom, orientation
  gizmo per §7a/§7c), not inside either sheet.
- **Q17 (acceptance scenario)** — Extends §9 scenario 4 ("Boolean gating") directly.
  Flagging for `docs-004`: scenario 4's steps should explicitly check Subtract's
  base/subtrahend visual indicator (Q15 above), since that's a detail a scripted spec
  is unlikely to assert on its own. Not a new scenario.

---

## 6. Group selection vs. clicking a sub-part inside an already-selected group (§7b, `Group.pick`)

- **Q10 (flow)** — Precondition: a group (2+ items previously combined via control 5's
  "Combine into group" operation) already exists and is *already selected as a whole*
  from a prior click. Trigger: a **second, distinct** tap/click landing specifically
  on one of the group's member meshes — not a fresh click starting from empty
  selection (a fresh click on any part of an unselected group always selects the
  whole group first, never jumps straight to a sub-part). Feedback: gizmo, dimension
  lines, and Inspector re-target from the group's combined bounding box to the
  clicked sub-part's own bounding box and param schema; the Inspector header shows a
  breadcrumb (e.g. "Group ▸ Camera Module") so the change in pick depth is visible,
  not just a silent field swap that could be mistaken for a bug.
- **Q11 (operand count)** — n/a; this is a selection re-targeting mechanism
  (`Group.pick`), not an operand-consuming operation.
- **Q12 (control location)** — Existing viewport click/tap-to-select behavior,
  extended with pick-depth state. No new control surface, but the Inspector's
  breadcrumb (Q10) is a net-new small addition, and is itself clickable — tapping the
  "Group" segment of the breadcrumb steps back up to the whole-group selection, since
  otherwise the only way back from a sub-part to the group level is to deselect
  entirely and re-click the group from scratch.
- **Q13 (drag-to-place)** — n/a, not a creation control.
- **Q14 (inspector/gizmo contract)** — Re-targeted to the sub-part per Q10; identical
  contract shape to control 3, just scoped to the sub-part's own geometry/params
  instead of the group's combined bounding box.
- **Q15 (selection count)** — Exactly 1 group must already be selected as a whole
  before sub-part narrowing can trigger at all — clicking a sub-part mesh when nothing
  is currently selected selects its parent group first (Q10), it does not narrow
  straight to the sub-part on that first click.
- **Q16 (phone width)** — Same auto-opening bottom sheet as control 3, now showing the
  breadcrumb. Additionally: sub-parts inside a visually dense group are harder to
  target precisely with a finger than a mouse pointer at the same on-screen size, so
  hit-testing for group members should carry some minimum tap-target padding
  independent of the mesh's own rendered screen size at phone width, the same
  touch-target concern control 4 raises for gizmo handles.
- **Q17 (acceptance scenario)** — Extends §9 scenario 6 ("Group vs sub-part
  selection") directly. Not a new scenario.

---

## Summary: acceptance-scenario cross-reference for `docs-004`

| Control | §9 scenario | New scenario needed? |
|---|---|---|
| 1. Drag-place primitive | 1 | No |
| 2. Drag-place hardware/kit-part with snap | 3 | No |
| 3. Selection → inspector/dimensions/gizmo | 2, 6 (underlying mechanism) | No |
| 4. Gizmo ↔ numeric-field sync | 2 (needs a gizmo-drag step added) | No — refine scenario 2 |
| 5. Boolean with selection-count gating | 4 (needs Subtract base-indicator check added) | No — refine scenario 4 |
| 6. Group vs. sub-part selection | 6 | No |

No control among these six needs a new `TODO/ACCEPTANCE.md` entry beyond the 8
already drafted in `Initial design.md` §9 — every one is either a direct match or a
refinement to an existing scenario's steps. `docs-004` should incorporate the two
flagged refinements (gizmo-drag step in scenario 2; Subtract base-indicator check in
scenario 4) when it transcribes §9's drafts into the real file.

---

## Addendum: marquee (drag-box) multi-select — modifier key and touch equivalent (`TODO/ui-024`)

`TODO/ui-024`'s own Interaction model section asked for this decision to be recorded
here rather than made silently mid-implementation ("record the choice ... control 6's
area"). Control 6 above is a different mechanism (group vs. sub-part re-targeting), so
this is its own addendum rather than an edit to that section — cross-referenced from
here so a future reader looking for "the marquee decision" finds it either way.

**The problem.** `TODO/ui-018`/`ui-019` already claim the desktop drag surface: plain
left-drag orbits (the default the whole viewport-scaffold regression suite depends on),
Shift+left-drag and right-drag both pan. The TODO's own prose recommended "plain
left-drag on empty space starts a marquee," but that would silently steal the one
gesture `e2e/viewport-scaffold.e2e.js`'s `'mouse drag orbits, and pans once the mode is
switched'` test (and the everyday orbit gesture itself) depends on — orbiting via a
plain left-drag is the primary way anyone navigates the viewport with a mouse, and nothing
in this task's own scope is worth breaking it for. That literal recommendation was
**not** implemented; the decision below replaces it.

**The decision, in two parts:**

1. **Desktop: Ctrl (or Cmd) held at press-down, drag starting on empty space** — not on
   a body's mesh, not on a gizmo handle (which never reaches this gesture at all, since
   `Gizmo.vue`'s own hit targets sit above the canvas and stop the event there). Ctrl/Cmd
   is genuinely free: `mouseDragOverride()` never reads it, so it collides with nothing
   `ui-018`/`ui-019` already claimed. **Additive mode** (add to the selection rather than
   replace it) is Shift held at the same time — Shift is otherwise claimed for panning,
   but only when Ctrl/Cmd is *not* also held, so `Ctrl/Cmd+Shift+drag` reaches marquee's
   additive path rather than the pan override.
2. **Any pointer type, including touch — the touch equivalent this task's own
   Interaction model section requires stating explicitly: a third `'select'` mode on the
   viewport's existing Orbit/Pan chrome toggle** (`NavigationChrome.vue`,
   `data-testid="nav-mode-select"`), mirroring the toggle `ui-018` already built for
   exactly this kind of gesture ambiguity. With `'select'` active, a plain one-finger
   drag from empty space starts a marquee — touch's only path, since touch has no
   modifier key at all. Additive mode is still Shift, which is simply never true on a
   touch pointer, so touch marquees always replace the selection — the explicit,
   stated **"additive marquee is desktop-only for now"** decision the TODO's Interaction
   model section asked to record rather than leave implicit, rather than a second
   touch-only toggle this task's own M-effort estimate didn't budget for.

Both paths are gated in `Viewport.vue`'s `decideGestureKind()`, checked before falling
through to `effectiveDragMode()` — so neither disturbs orbit/pan's existing behaviour
when neither modifier nor the `'select'` toggle applies, which is exactly what let the
existing `ui-018`/`ui-019` regression specs keep passing unmodified.

**Precedence edge case, decided explicitly rather than left implicit:** a Ctrl/Cmd-held
drag (or a drag while `'select'` mode is active) that *starts on a body* is not a
marquee — the precondition above requires empty space. It falls through to ordinary
orbit, the same as any other drag that doesn't match a more specific gesture; there is
no separate "grab and drag a body directly" gesture in this app (that is the transform
gizmo's job).

**Partial overlap counts as enclosed** (a marquee that clips even a corner of a body
selects it), matching most CAD/DCC tools' rubber-band convention — stated in
`TODO/ui-024`'s own Testing section and implemented in
`src/render/annotate.js`'s `marqueeIntersectsBox`.

---

## 7. Open sketch mode and draw one entity (new — `src/sketch/`'s first control, `TODO/ui-020`)

Scoped narrowly on purpose: `Initial design.md` gives this no mockup at all, and
`src/sketch/`'s eventual full job (snapping, dimensions, constraint solving, profile
detection) is not this control's job — this answers only "open sketch mode, and draw
one entity," the minimum bar `TODO/ACCEPTANCE.md`'s own template header names, with a
straight line segment as that one entity. Every later sketch tool (rectangle, circle,
arc, constraints) is a follow-up task extending this control, not something this pass
has to anticipate.

- **Q10 (flow)** — Precondition: **nothing selected**, and no operand requirement —
  this is a mode entry, not an operand-gated operation, the same shape as the existing
  Orbit/Pan/Select nav-chrome toggle (`ui-018`/`ui-024`), not the shape of a
  boolean/Snap/Align button. Trigger: a **Sketch** toggle button in the main viewport
  chrome, alongside the existing nav-chrome controls (not the Library or Operations
  toolbar — this isn't a creation or an operation on a body, it's a mode). Clicking it
  enters sketch mode: the camera snaps to look straight down the working plane's normal
  (reusing `render-001`'s existing orientation-gizmo snap-to-view mechanism, aimed at
  the plane rather than a named axis face) and locks there — orbit is suspended while
  sketch mode is active, replaced entirely by the drawing gesture below, per Q13. A
  **Sketch toolbar** appears (currently one tool: **Line**) and an **Exit Sketch**
  control appears alongside it. Drawing: with Line active (the only tool, so active by
  default on entry), pointer-down on the working plane starts a live preview segment
  from that point to the current pointer position; pointer-up commits it as one sketch
  entity. Feedback: the committed line renders as a persistent 2D stroke on the working
  plane, distinct in style (a thin, bright, single-color stroke — not a 3D solid's
  shaded material) from any 3D geometry already in the scene, so a user can tell at a
  glance that what they just drew is sketch geometry, not a body. Exiting sketch mode
  (the Exit control, or re-clicking the Sketch toggle) returns the camera to free orbit
  and hides the Sketch toolbar; the drawn entity persists in the scene as sketch data,
  it does not disappear on exit.
- **Q11 (operand count)** — n/a; this is a creation flow (drawing new geometry), not an
  operation on existing geometry, per Q11's own carve-out for creation controls.
- **Q12 (control location)** — Needs one genuinely new control surface: the Sketch
  toggle lives in the main viewport chrome (the same chrome row `ui-018`/`ui-019`'s nav
  controls and the orientation gizmo already occupy), and the Sketch toolbar (Line tool
  + Exit) is a new, mode-gated toolbar that only mounts while sketch mode is active —
  distinct from the always-present Operations toolbar the same way the Library sheet is
  distinct from the Inspector sheet: a third mode-specific surface, not a repurposing of
  an existing one. "Register a tool type and let a generic list render it" is
  explicitly not the answer here either, mirroring the Creation-vs-Operation rule's own
  reasoning: a sketch tool (Line, later Rectangle/Circle/Arc) is drawing-specific chrome,
  not a row that belongs beside Cube/Cylinder in the 3D-primitive Library.
- **Q13 (drag-to-place)** — Yes, and this is the one place this control most directly
  extends the existing rule rather than restating it: drawing a line is itself a drag
  gesture, pointer-down at the start point, a live preview segment following the
  pointer exactly like `ui-010`'s drag-to-place ghost, commit on release — the 2D
  analogue of `CLAUDE.md`'s "geometry is created by placing it in the 3D view, not
  spawning it at a fixed transform" rule, applied to a sketch entity instead of a
  primitive body. A zero-length release (pointer-down and pointer-up at the same
  point, no drag at all) commits **nothing** — CLAUDE.md's own numerical-code
  convention of covering degenerate cases (zero-length segments) applied at the
  interaction layer, not just in a kernel unit test.
- **Q14 (inspector/gizmo contract)** — Once committed, a line entity behaves as a
  selectable object: clicking it shows its own fields in the Inspector (start point,
  end point, length — plain numeric fields, no registry `ui.defaults` lookup, since
  sketch entities live in `src/sketch/`'s own model, not the kernel registry
  `describeBody` reads from). **No 3D transform gizmo attaches** — translate/rotate
  handles are a 3D-body affordance and a sketch entity lives flat on the working plane —
  instead, each endpoint gets its own small draggable handle directly on the entity
  (the 2D-sketch equivalent of a gizmo, dragging one point rather than the whole
  entity), and editing a handle updates the same Inspector numeric fields live, the
  same "gizmo drag and numeric fields must drive the same underlying value and stay in
  sync" contract control 4 already established for 3D transforms, applied to endpoint
  coordinates instead of a translate/rotate triple.
- **Q15 (selection count)** — n/a for this task: drawing is the only capability this
  control adds. Selecting and editing an already-drawn entity (Q14 above) works at the
  ordinary single-selection count; a future multi-entity sketch tool (a rectangle made
  of four lines, a constraint spanning two entities) is not this task's concern and
  should answer its own Q15 when scoped.
- **Q16 (phone width)** — The Sketch toolbar (Line + Exit) is a bottom chrome row at
  phone width, matching the existing nav-chrome's own collapse pattern
  (`ui-018`/`ui-019`) rather than a new layout idiom. Drawing itself needs no
  modifier key at all on any pointer type (unlike the marquee's Ctrl/Cmd-or-`'select'`-
  mode split in section 6's addendum) — sketch mode's own orbit-suspension (Q10) means
  a plain one-finger drag is unambiguously "draw," on mouse and touch alike, with no
  gesture collision to resolve. This is a genuine simplification worth stating
  explicitly rather than assuming touch needs its own special case here.
- **Q17 (acceptance scenario)** — Not one of `Initial design.md` §9's original 8
  (drawn from `picam-touch`'s toggle matrix, which has no 2D sketching), but
  `TODO/ACCEPTANCE.md`'s own template header separately names "drawing one entity" as
  a cover-at-minimum case. Add it as **scenario 9** when `ui-020` is scoped (this Q&A
  pass's own job, done alongside this section — see `TODO/ACCEPTANCE.md`) rather than
  skip it for lack of a §9 number, per that file's own instruction.
