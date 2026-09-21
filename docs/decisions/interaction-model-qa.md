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

**Sections 8-19 (M6: persistence, export, timeline history, undo/redo) were added by
`TODO/data-002`** and start at the "M6 controls" heading near the end of this file.

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

---

# M6 controls — persistence, export, timeline history, undo/redo (`TODO/data-002`)

> **Status: confirmed by the user (2026-09-19), with two revisions to the agent's first
> draft.** The answers below were first drafted from existing precedent and then
> reviewed; the two the user changed are **hosted saves gain an opt-in auto-push**
> (section 11) and **rollback is Fusion-style**, with new steps inserting at the
> rollback marker rather than being blocked (section 18). Everything else was confirmed
> as drafted. **Unsure:** marks the smaller calls the user did **not** explicitly decide
> and that the task building the control should confirm or settle by measurement. This
> is the decision record `TODO/ui-032`, `ui-033`, `ui-034`, `data-003`, `data-004`,
> `io-001`, `io-002` and `io-003` are built against.

Same format and same Q10-Q17 as sections 1-7. Q1-9 are answered by `TODO/data-001`'s
decision doc (`docs/decisions/persistence-export.md`) and the M6 rows of
`TODO/ROADMAP.md`. Three constraints from `persistence-export.md` are treated as fixed,
not re-argued:

1. **File System Access (FSA) is desktop-Chromium-only (~31%)**, so the
   `<a download>` / `<input type=file>` fallback is the **primary** path on every phone
   and tablet and on Firefox/Safari. A control must be *labelled by what the active path
   can actually do* — never "Save" when it can only download a new copy.
2. **IndexedDB autosave (`idb`)** is the local-durability mechanism; a portable file is a
   separate, explicit action offered on top of it.
3. **Hosted git backend is hand-rolled `fetch`** with a user-supplied token, and a stale
   write is refused by the API itself (409). Export is split: STL/OBJ from the kernel
   (`src/core/export.js`), glTF from three.js (`src/render/export.js`).

## Cross-cutting decisions (read these before sections 8-19)

### The "document bar" — where every global control lives

Every control in this milestone is **document-level, not selection-gated** (Undo, Redo,
History, File ▾ with Save/Open/Export/Hosted). None of them belongs in the Library
(creation), the Operations toolbar (operations on selected geometry, gated on operand
count) or the viewport nav chrome (camera/mode controls). *Precedent:
Q5's creation-vs-operation split, extended one step — these are neither; and `ui-015`/
`ui-027`'s own retirement notes, which record the Operations toolbar hitting its width
limit twice with real cross-engine regressions.*

**Decision: they live in the app's existing full-width header bar (`.app__bar` in
`AppView.vue`), right-aligned, as one cluster:**

```
WarpCad   <hint text ...........>      [↶ Undo] [↷ Redo] [History] [File ▾ •]  (save-status chip)
```

| Control | `data-testid` | Notes |
|---|---|---|
| Undo | `undo-button` | icon button, 44px tap target |
| Redo | `redo-button` | icon button, 44px tap target |
| History (Timeline toggle) | `timeline-toggle` | `aria-pressed`; icon + label at ≥641px, icon-only below |
| File menu | `file-menu-button` | opens the File popover; carries a small status dot (hosted/autosave state) |
| Save-status chip | `save-status` | `role="status"` live region; text at ≥641px, a dot at phone (see section 8) |

Why the header and not the viewport corners: the top-left is the Operations toolbar, the
top-right is the orientation gizmo, the bottom is the nav chrome and the Library/Inspector
sheet tabs (`--viewport-bottom-inset` already arbitrates that band). The header is the one
strip that is always visible, never overlaps a viewport control, and is outside the
`--viewport-bottom-inset` arithmetic entirely. It is also where `ui-033`'s own "global,
non-selection-gated action" precedent points — `ui-019`'s gear is nav chrome only because
it configures the viewport; save/undo do not.

**Phone (390px) budget, checked arithmetically:** title ~60px + Undo 44 + Redo 44 +
History 44 + File 44 + chip dot ~24 + gaps and padding ~60 ≈ 320px < 390px. The header
`app__hint` (mouse-oriented prose) is **hidden below 641px** to make room — it already
truncates at 390px today. The header grows from ~30px to ~48px tall at phone width because
of the 44px tap targets; that is a deliberate cost.

**Stacking (measured against the current tree):** the Inspector phone sheet is z-index 11,
`SketchToolbar` 12, the Library sheet 20/10, Operations popovers 30/31. File and
Export popovers reuse the existing teleport-to-`<body>` popover pattern at **z-index 31**;
modal dialogs (Connect repository, replace-project confirm, conflict) at **z-index 40**; the
History phone sheet sits in the Inspector's tier (**11**) because the two are mutually
exclusive by the arbitration rule in section 13.

**Selection is never disturbed by header controls.** `Viewport.vue` clears selection only
on its own canvas/empty-space pointer events; header buttons must not route through that.
This is a stated requirement, not an assumption, because Export's scope (section 12)
depends on selection surviving a click on File ▾ — a header click that cleared the
selection would silently turn "export the union" into "export the whole scene."

### Keyboard shortcuts (additive only — every one has an on-screen control too)

| Shortcut | Action | Suppressed when focus is in |
|---|---|---|
| Ctrl/Cmd+Z | Undo | a text/number/select field (the field's own undo wins) |
| Ctrl/Cmd+Shift+Z, Ctrl+Y | Redo | same |
| Ctrl/Cmd+S | Save (local; never a network write) | — (works even from a field; the field commits first) |
| Ctrl/Cmd+O | Open… | — |
| Esc | Close the open popover/dialog/menu, else leave preview | — |

Rests on `CLAUDE.md`'s rule that keyboard alone fails on touch, and on the fact
that the Inspector's numeric fields are the obvious place a global Ctrl+Z shortcut would
eat a native field-undo. **Unsure:** whether Esc should also exit preview (drafted: yes,
after popovers; not explicitly decided).

### The one status surface

One `role="status"` element (`save-status`) reports **autosave state, the result of the
last explicit save/open/export/push, and remote-change notices**. Success messages are
transient (4-6s, then the chip returns to its resting autosave text); **errors persist**
(`role="alert"`, error colour) until the next success or until dismissed. Silence is only
ever used for a *user-cancelled* picker. Never a modal for success. *Rests on
`io-001`'s "subtle, non-intrusive indicator" and `CLAUDE.md`'s "never silent."*

### The ambiguities the task file called out — decided

| Ambiguity | Decision | Section |
|---|---|---|
| Autosave vs discrete Save | **Both, and they are different things.** Autosave to IndexedDB is automatic, silent-restoring, has no trigger. Save/Download is an explicit portable-file action. | 8, 9 |
| Local vs hosted: one control or two | **One File ▾ menu with two visibly separate groups** (local file / hosted repo), not a target picker on Save. Ctrl+S always means local. | 9, 11 |
| Hosted write timing | **Explicit "Save to owner/repo" / "Load from owner/repo"**, not auto-push. | 11 |
| Export whole scene vs selection | **Default follows selection (0 selected → whole scene, 1+ → selection), always shown and overridable in the popover.** Disabled only when there is nothing to export. | 12 |
| Filename convention | Project: `warpcad-project.ndjson` (FSA) / `warpcad-project-YYYYMMDD-HHMM.ndjson` (download). Export: `<body-name-slug>.<ext>` for one body, else `warpcad-scene.<ext>`. | 9, 12 |
| Hosted token entry | Password-type field in a modal Connect dialog; validated before storing; stored in IndexedDB; never shown again. | 11 |

---

## 8. Autosave (implicit — no trigger)

*Precedent: `docs/decisions/persistence-export.md` sub-decision 1;
`io-001`'s own Interaction model ("autosave has no trigger"); `src/stores/settings.js`'s
degrade-to-nothing try/catch boundary.*

- **Q10 (flow)** — Precondition: none. Trigger: **none** — every document mutation
  schedules a debounced (trailing, ~500ms; exact value is `io-001`'s tuning) write of the
  whole NDJSON action log to IndexedDB, and the write is **flushed immediately on
  `visibilitychange → hidden` and `pagehide`** (mobile Safari kills backgrounded tabs
  without warning; a debounce alone would lose the last edit). Restore: on startup, if an
  autosave exists it loads **silently, with no "restore?" prompt** — reopening the app
  means reopening the project. An empty or absent autosave starts an empty scene.
  Feedback: the `save-status` chip cycles `Saving…` → `Saved · 14:02`; on reload it reads
  `Restored your last session` for ~6s. Failure (quota, blocked store, private-mode
  IndexedDB) shows a **persistent** `Not saved — browser storage unavailable` in error
  colour, and clicking it opens the File menu, whose Save/Download item is then the
  user's escape hatch. Nothing else in the app stops working.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — No control; only the status chip in the header cluster
  above.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — n/a.
- **Q15 (selection count)** — n/a; selection is UI state and is **not** persisted.
- **Q16 (phone width)** — The chip collapses to a single 10px status dot (green saved /
  amber saving / red failed) beside the File button, with the full text in an
  `aria-label` and repeated as the first line of the File popover. Flush-on-hide (Q10) is
  the phone-specific requirement.
- **Q17 (acceptance scenario)** — Scenario 10's first half (reload restores).
- **Not autosaved:** timeline *preview* (section 14) is UI state and is never written.
  A **rollback point** (section 18) *is* document state and is persisted.
- **Unsure — multi-tab.** Two tabs on the same origin autosave to the same IndexedDB key
  and the last writer silently wins — exactly the single-writer assumption
  `document-sync.md` names. Drafted, not decided: `io-001` adds a revision counter (and a
  `BroadcastChannel` ping) and the second tab shows `Project changed in another tab —
  Reload / Keep this version` instead of overwriting. Not scoped by this Q&A; flagged so
  `io-001` doesn't discover it late.
- **Undo across reload — decided.** The undo/redo stacks start empty after a reload even
  though the document is restored (section 19).

---

## 9. Save (explicit portable file)

*Precedent: `persistence-export.md`'s "the two paths are not semantically
equal" table and its instruction that `ui-033` label by capability; `ui-019`'s
toggle-popover mechanism.*

- **Q10 (flow)** — Precondition: none (document-level; independent of selection; allowed
  on an empty scene). Trigger: **File ▾ → Save** (or **Ctrl/Cmd+S**). The item's label
  depends on the capability check `typeof window.showSaveFilePicker === 'function'`:
  - **FSA path (desktop Chromium):** `Save` writes to the retained file handle with no
    second prompt; if no handle exists yet it opens the save picker (identical to Save
    As). A second item, `Save As…` (`file-save-as`), always opens the picker.
  - **Fallback path (Firefox, Safari, every phone and tablet):** a single item labelled
    **`Download copy`**. It is **never** called "Save", and there is **no** "Save As…"
    item (it would be a duplicate of the same action).
  Both carry `data-testid="file-save"` so specs and scenarios can address them
  uniformly; only the visible label differs.
  Filename: FSA suggested name `warpcad-project.ndjson`, thereafter the handle's own name;
  fallback `warpcad-project-YYYYMMDD-HHMM.ndjson` (a timestamp, because the browser
  otherwise dedupes to `warpcad-project (3).ndjson`, which is indistinguishable and worse
  on a phone's Files app). Feedback: FSA → `Saved to warpcad-project.ndjson · 14:02`
  (4s); fallback → `Download started: warpcad-project-20260918-1402.ndjson` (6s) — the
  word is "started" because a download cannot be confirmed to have landed. A **cancelled
  picker is silent** (no error). A write failure (permission revoked, disk full) is a
  persistent error naming the file.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Header **File ▾** menu (`file-menu-button`), the cross-cutting
  document bar. Not a new toolbar button, not the Operations toolbar.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — n/a; opening the menu changes no selection.
- **Q15 (selection count)** — n/a; never disabled by selection.
- **Q16 (phone width)** — This is the *primary* path at phone width, not an edge case:
  the File popover is teleported to `<body>`, `min(320px, 100vw − 16px)` wide, with 44px
  rows, and the only Save-family item present reads `Download copy`. On iOS the browser's
  own download sheet is the confirmation the user will actually see; `docs/save-load.md`
  must say so and must say where iOS puts the file.
- **Q17 (acceptance scenario)** — Scenario 10's second half (file round-trip).
- **Unsure — project name.** The app has no project-name concept, hence the fixed
  `warpcad-project` stem. Adding a name field would be a larger change (rename UI,
  persistence of the name); runner-up option if the user wants it: prompt for a name on
  first Save As.

---

## 10. Load (Open a project file)

*Precedent: `persistence-export.md` (FSA `showOpenFilePicker` vs hidden
`<input type=file>`); the "confirm before destroying" pattern is new to this app.*

- **Q10 (flow)** — Precondition: none. Trigger: **File ▾ → Open…** (`file-open`, or
  **Ctrl/Cmd+O**). FSA path: `showOpenFilePicker`, and the returned handle is retained so
  a later `Save` writes back to the same file. Fallback: a hidden `<input type=file>` whose
  `click()` is invoked synchronously inside the menu item's click handler (user-gesture
  requirement). If the current scene is **non-empty**, a modal confirm (`file-open-confirm`,
  z-40) appears first: **"Open replaces the current project. Save or download it first if
  you want to keep it."** with `Replace` / `Cancel` — *before* the picker opens, so a
  cancelled picker after a confirmed replace never loses anything. The file is **fully
  parsed and validated before anything is replaced**; a bad file leaves the current
  project untouched. Feedback on success: the scene renders, the camera **frames the
  loaded content** (a loaded project whose geometry sits outside the current view would
  read as an empty scene — the same class as the second attempt's "too dark to see
  anything"), selection is cleared, any preview/rollback strip is cleared, and the chip
  says `Opened warpcad-project.ndjson · 5 steps`. Failure: a persistent error naming the
  file and, if `parseNdjson` can supply it, the line number; an op kind the app doesn't
  know is refused by name (a file from a newer version), never half-loaded.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Header **File ▾** menu.
- **Q13 (drag-to-place)** — n/a. (Dropping a file onto the window is a plausible later
  convenience and is explicitly out of scope here.)
- **Q14 (inspector/gizmo contract)** — n/a; selection is cleared.
- **Q15 (selection count)** — n/a.
- **Q16 (phone width)** — Same File popover. `<input type=file accept>` on iOS greys out
  files whose type it doesn't recognise, so `io-001` should accept `.ndjson,.json,.txt` and
  `text/plain` rather than only a custom extension. The confirm dialog is a top-anchored,
  full-width-minus-16px modal (never bottom-anchored, so the on-screen keyboard can't hide it).
- **Q17 (acceptance scenario)** — Scenario 10's second half.
- **Open is not undoable — decided.** Open replaces the document, **clears the undo/redo
  stacks**, and there is no recovery (the confirm dialog is the safeguard). Runner-up,
  rejected: make Open one undoable transaction whose inverse restores the previous log —
  friendlier, but it needs `data-003` to define a whole-document inverse and holds the
  previous document in memory.
- **Unsure — "New project".** There is no way to start from an empty scene except opening
  an empty file or clearing browser storage. A `New` item in File ▾ is an obvious
  companion to Open (same confirm dialog) and is **not** in `io-001`/`ui-033`'s scope;
  flagging the gap rather than silently adding a control.

---

## 11. Hosted storage (Connect repository / Save to / Load from)

*Precedent: `persistence-export.md` sub-decision 3 (three REST endpoints,
409 on stale `sha`); `io-002`'s conflict requirement ("refuse to silently overwrite");
the Snap/Align popover for a many-field form; section 10's confirm-replace.*

- **Q10 (flow)** — Precondition: none for Connect; Save/Load-to-repo require a connection.
  **One control, two groups.** The File popover has a **local** group (Save / Save As… /
  Download copy, Open…, Export…) and, below a divider labelled **Hosted storage**, a
  **hosted** group. Not connected: `Connect repository…` (`hosted-connect`). Connected:
  `Save to owner/repo` (`hosted-save`), `Load from owner/repo` (`hosted-load`),
  `Auto-push` (`hosted-autopush`, a checkable menu item, `aria-checked`) and `Disconnect`
  (`hosted-disconnect`). **Hosted writes are explicit by default, with an opt-in
  auto-push.** Every write is a git commit, so auto-push is **OFF for every new
  connection** and the user turns it on deliberately; the explicit `Save to` / `Load from`
  items stay whether it is on or off. **Ctrl/Cmd+S always means the local Save/Download
  and never performs a network write**, with auto-push on or off — a shortcut must not
  unexpectedly use the network.
  - **Connect dialog** (`hosted-connect-dialog`, modal, z-40) fields: **Token**
    (`type="password"`, `autocomplete="off"`, `autocapitalize="none"`, spellcheck off,
    `hosted-token`), **Repository** `owner/repo` (`hosted-repo`), **Path** (default
    `warpcad-project.ndjson`, `hosted-path`). Helper text: create a fine-grained token
    limited to *this one repository* with Contents read/write; the token is stored in this
    browser's IndexedDB and sent **only** to `api.github.com`. `Connect` validates
    **before storing anything** and distinguishes the failures (`io-002`/`persistence-export.md`
    already require these): 401 `GitHub rejected this token`; 403 rate-limit vs missing
    scope, reported as different messages; 404 `Repository not found, or the token has no
    access to it`; a missing *file* in an otherwise reachable repo is **not** an error —
    `No project file yet — the first Save to owner/repo will create it`. After success the
    dialog shows `Token saved in this browser` with `Replace token` and never displays the
    token again.
  - **Save to owner/repo**: `PUT` with the last-known blob `sha`. Success → chip
    `Saved to owner/repo · 14:05` and the File-button dot turns to the "in sync" state.
    **Conflict (409)** → modal (`hosted-conflict`): **"The repository copy changed since
    you last loaded or saved it."** with three buttons — `Overwrite remote`, `Load remote
    (replaces this project)`, `Cancel`. **No automatic merge** (`document-sync.md` deferred
    that deliberately). The first-ever Save when the remote file already exists and this
    session has no `sha` for it goes down the **same** conflict path, so connecting never
    silently overwrites or silently pulls.
  - **Load from owner/repo**: identical replace-confirm to section 10, then GET + parse +
    validate before replacing.
  - **Auto-push** (per-connection setting, stored with the connection in IndexedDB, cleared
    by `Disconnect`). The rules, decided rather than left to the implementer (the numbers
    are `io-002`'s to tune by measurement, the shape is fixed):
    1. **When it pushes:** a **trailing 30-second debounce** after the last local mutation,
       so one burst of work — a gizmo-drag session, several field edits, a drop and a
       boolean — becomes **one** commit, plus a **5-minute maximum wait** so continuous
       editing still pushes. Undo, Redo, timeline edits and rollback are mutations like any
       other and schedule a push. Preview (section 14) is not a mutation and never does.
       What is pushed is the current whole log (including a rollback marker and inactive
       rows, section 18), through the same `PUT`-with-`sha` path as the explicit item. The
       commit message is `WarpCad: auto-push <ISO time>`; the explicit item's is
       `WarpCad: save`.
    2. **Turning it on:** does one normal `Save to owner/repo` immediately (same conflict
       rules) so the user sees it work, and the menu item says so (`Auto-push — pushes now
       and after each burst of edits`). It is never on silently.
    3. **On startup / reload:** if the restored autosave is ahead of the last pushed
       revision and auto-push is on, one push is scheduled as if an edit had just happened.
       There is **no flush on `pagehide`** — a network write cannot be relied on while a
       tab is being killed, and the local autosave (section 8) already protects the work.
    4. **Feedback, on the File-button dot (visible with the menu closed) and mirrored in
       the chip, each state distinct by shape and not only colour:** `●` solid green **in
       sync**; `◌` hollow ring **pending** (edits are waiting for the debounce; chip
       `Auto-push pending`); animated ring **pushing** (chip `Pushing to owner/repo…`);
       `!` amber **paused, needs you** (a conflict, or a retrying network failure); `✕`
       red **failed** (bad token or scope). A successful push returns to `●` and the chip
       reads `Pushed · 14:05` for 4s. Auto-push off shows `●`/`!`/`✕` only for the
       explicit actions.
    5. **A 409 during auto-push pauses it and raises the same dialog — it never
       overwrites.** The `hosted-conflict` modal (Overwrite remote / Load remote (replaces
       this project, **including edits not yet pushed**) / Cancel) appears **once**, and is
       deferred until no drag is in progress and no other popover or dialog is open, so it
       never lands under a finger mid-gizmo-drag. While paused the dot is `!`, no further
       dialogs appear and no further pushes are attempted, and the menu item reads
       `Auto-push paused — repository changed`. **Overwrite remote** pushes with the fresh
       `sha` and **resumes** auto-push. **Load remote** replaces the project (clearing the
       undo stacks, as Open does) and resumes. **Cancel** leaves auto-push **paused, not
       off**; the user resolves it by an explicit `Save to owner/repo` (which raises the
       same dialog again), `Load from owner/repo`, or toggling Auto-push off and on.
    6. **Other failures:** a **network** failure is not a conflict — the dot is `!`, the
       chip says `Offline — will retry`, and auto-push retries with backoff (10s, 30s, 2min,
       capped at 5min), with no dialog. A **401/403** pauses auto-push, turns the dot `✕`,
       and shows a persistent error naming the cause (token rejected, missing scope,
       rate-limited with the wait time); the fix is `Connect repository…` → `Replace
       token`. Neither ever drops a local edit: the IndexedDB autosave is the durable copy.
    7. **Two tabs, or a human plus MCP, both auto-pushing** simply meet rule 5: whichever
       writes second gets the 409 and the dialog.
  - Failures are named and persistent: `No network — nothing was written`, `Token
    expired or revoked`, `Rate limited — try again in N minutes`.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Header File ▾ menu (hosted group) plus the modal dialogs.
  The File button carries a small dot for hosted state visible **without opening the
  menu** (`ui-033`'s requirement): none when not connected; otherwise one of the five
  shape-coded states in the Auto-push rules above (in sync, pending, pushing, paused
  `!`, failed `✕`). With auto-push off the dot still reports the explicit actions' outcome
  and a `!` when the repository copy is known to have changed.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — n/a.
- **Q15 (selection count)** — n/a.
- **Q16 (phone width)** — The Connect dialog is modal, top-anchored, scrollable, full
  width minus 16px, and **inputs are ≥16px font** (iOS Safari zooms the whole page on
  focus of anything smaller, which would push the dialog off-screen). The token field is
  the one place a phone user pastes a long secret, so it must not autocorrect/capitalise.
- **Q17 (acceptance scenario)** — Scenario 10's hosted half (needs a scratch repo).
- **Explicit push/pull plus opt-in auto-push in one File menu — decided by the user.**
  `ui-033`'s Documentation example and `io-002`'s Interaction model both say "subsequent
  saves write to that repo automatically"; that is superseded — hosted writes are explicit
  unless the user turns Auto-push on. Runner-up, rejected: always-on auto-push (a commit
  per debounce for every user); and two top-level controls instead of one menu.
- **Unsure — branch.** The design uses the repo's default branch and does not expose a
  branch field. Cheap to add later; omitted to keep the phone dialog to three fields.
- **Settled while building `ui-033` (2026-09-21).** (1) **Branch and path unchanged**: the
  repository's default branch, no branch field, and `warpcad-project.ndjson` as the Path
  field's default — nothing in building the dialog argued otherwise. (2) **`Replace token…` is
  a menu item, not only a button inside the Connect dialog**: the rule-6 recovery ("`Connect
  repository…` → `Replace token`") needs a way in while connected, and `Connect repository…`
  is replaced by the connected group once connected. It is shown whenever a connection exists;
  it reconnects, so Auto-push comes back **off**. (3) **`Load from owner/repo`'s replace
  confirm** uses the same dialog as `Open…` with its first clause naming the repository
  ("Loading owner/repo replaces the current project. …"). (4) **The chip is a button while it
  shows an error** (§8) and the File menu then offers **Dismiss this message**: §"one status
  surface" says errors persist "until the next success *or until dismissed*", and nothing
  offered dismissal. (5) **Of two transient notices, the newer wins** in the chip.
  (6) While **History is previewing**, Save/Download copy and `Open…` stay enabled (§14, as
  written), the menu says Save writes the current project not the preview, and a completed
  Open/Load ends the preview.

---

## 12. Export (STL / OBJ / glTF)

*Precedent: `persistence-export.md` sub-decision 4 (formats and module
split); the Snap/Align/Fillet popover pattern for the format form; Q5's creation-vs-
operation split. **Deliberately departs from `TODO/ui-034`'s "Operations toolbar button,
never disabled" — see below.***

- **Q10 (flow)** — Precondition: **at least one exportable body exists** (a 3D body;
  sketch-only geometry is not exported in v1). With none, `Export…` (`file-export`) is
  **disabled** with the reason `Nothing to export` as its tooltip/`aria-description`.
  Selection count does **not** gate it. Also **disabled while previewing a past state**
  (section 14) with the reason `Return to the latest step to export` — a preview's state
  is not the document, so exporting what the viewport shows would be the "looks live but
  silently isn't" failure `SECOND-ATTEMPT.md` names. While **rolled back** (section 18) it
  stays enabled and exports the active state, labelled `(rolled back — N later steps not
  included)`. Trigger: **File ▾ → Export…** opens
  the export popover (`export-popover`, z-31, backdrop closes it):
  - **Scope**, two radios: `Selection — Union 1` (or `Selection — 2 bodies`) and
    `Whole scene — 3 bodies`. **Default: Selection if 1+ bodies are selected, otherwise
    Whole scene.** The `Selection` radio is disabled at 0 selected. The line always states
    exactly what will be exported, so the user is never guessing which scope is active.
    A drilled-in sub-part selection exports its **whole parent body**, not the part
    (**Unsure**: the alternative is exporting just the sub-part — plausibly wanted for a
    hardware part, but it can't be selected as an export unit elsewhere).
  - **Format**: segmented radio `STL` · `OBJ` · `glTF (.glb)`, default **STL** (the v1
    priority per scenario 11, whose consumer is a slicer), remembering the last choice
    per-viewer in `localStorage` via the settings-store pattern (a per-viewer
    convenience, wrapped in try/catch). glTF is exported as **binary `.glb`** so it is one
    file with no sidecar `.bin` to lose (**Unsure**: `.glb` vs `.gltf` is `io-003`'s to
    confirm; this doc proposes `.glb`).
  - `Export` (commit) and `Cancel`. Feedback: a normal browser download; the popover closes
    on commit (same as every other popover); the chip says `Exported union-1.stl`. glTF
    lazy-loads its exporter (`persistence-export.md` notes it is 75% of the export
    cost) so the button shows a brief `Preparing…` state on first use.
  Filename: one body → its display name, lowercased and slugged (`union-1.stl`,
  `cube-1.obj`); several bodies or the whole scene → `warpcad-scene.<ext>`. Errors: a
  kernel evaluation failure names the body; an export producing zero triangles is refused
  by name rather than downloading an empty file (`io-003`'s own degenerate case).
- **Q11 (operand count)** — 0 or more, but **not** an operation: it consumes nothing and
  appends no record. Scope, not enablement, varies with selection count.
- **Q12 (control location)** — **File ▾ menu in the header, not the Operations toolbar.**
  Reasons: (1) Q5 defines the Operations toolbar as controls whose enablement is gated on
  selection count and which act on geometry — Export does neither, and a lone
  never-disabled control there is the divergence `ui-034` itself had to flag with a
  "deliberate divergence" comment; (2) that toolbar has hit its width limit twice
  (`ui-015`, `ui-027`), and each new button cost a real cross-engine layout regression;
  (3) at phone width the toolbar is icon-only, and an "export" glyph in a row of
  Union/Subtract/Fillet glyphs would be unreadable. **This changes `ui-034`'s Affected
  files** (no `OperationsToolbar.vue` edit; a new `src/components/storage/` popover
  instead) and its Testing section (the "toolbar width vs orientation gizmo" re-check no
  longer applies to this task, though its spirit does apply to the header at 390px).
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — Opening the popover changes no selection and the
  backdrop prevents selection changing while it is open, so the scope line cannot go
  stale under the user.
- **Q15 (selection count)** — 0 → Whole scene; 1 → that body; 2+ → those bodies as
  one file (whether a multi-body selection is one combined mesh or one file per body is
  `io-003`'s open point; the popover states which). Never disabled by count.
- **Q16 (phone width)** — Same popover pattern, 44px radios; the download is handed to
  the browser, so on iOS Safari the download sheet is the confirmation. No horizontal
  scroll; the popover is `min(320px, 100vw − 16px)`.
- **Q17 (acceptance scenario)** — Scenario 11.

---

## 13. Timeline panel — open and close

*Precedent: `CLAUDE.md`'s AI-chat rule (a phone/tablet panel is an overlay or
dismissible bottom sheet, never a permanent split that pushes the viewport off-screen);
`AppView.vue`'s single-bottom-sheet-slot arbitration between Library and Inspector; the
`components/timeline/` category.*

- **Q10 (flow)** — Precondition: none (a document always has history; an empty one shows
  `No steps yet — drag a shape in from the Library`). Trigger: **History** button in the
  header (`timeline-toggle`, `aria-pressed`); close by pressing it again or via the panel's
  own `✕` (`timeline-close`). **Default closed on every device**, every load — the
  viewport stays clear until asked. Not persisted across reloads. Feedback: the panel
  appears (below) and the toggle shows pressed.
  - **≥641px (tablet, laptop): a bottom dock inside the viewport column**, ~220px tall,
    full width of the viewport column. The Library and Inspector columns stay visible, so
    "selecting a body shows its Inspector" (`CLAUDE.md`, non-negotiable) is never
    displaced. Rejected here: a third column (no room at the 820px tablet reference —
    210 + 220 side columns already leave ~390px for the viewport) and a tab inside the
    Inspector column (would hide the Inspector while History is active).
  - **Phone (390px): a bottom sheet in the Inspector's slot** (z-index 11), ~46vh, with
    the same collapsed-tab / open states `AppView.vue` already arbitrates
    (`data-inspector-sheet`). `AppView` gains a `timelineSheet` state; while History is
    open the viewport-bottom inset is computed the same way as for the Inspector sheet, so
    nav chrome and the scale readout stay clear (the exact defect `ui-010`'s drive found).
    **Arbitration, asymmetric like Library-vs-Inspector:** opening History collapses the
    Library sheet; while History is open the Inspector **does not auto-open on selection**
    (the user asked for History, so the Inspector declines, as it already does over an open
    Library); tapping the Inspector's tab closes History.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — New: `src/components/timeline/` (first content), mounted
  by `AppView.vue`; toggle in the header bar.
- **Q13 (drag-to-place)** — n/a. (While History is open the Library still works; a drop
  appends a row to the list.)
- **Q14 (inspector/gizmo contract)** — Timeline row selection and 3D body selection are
  **two different selections** and never trigger each other: a selected row gets an accent
  left bar; a selected body gets the 3D highlight/gizmo. One passive link only: selecting a
  body in the viewport gives every row that touches that body a subtle tint
  (`timeline-row--related`) without selecting or scrolling anything.
- **Q15 (selection count)** — n/a for the panel itself; row selection is exactly one row
  at a time (no multi-row selection).
- **Q16 (phone width)** — As above. Rows are ≥44px tall; per-row actions are revealed by
  expanding the selected row (Q10 of sections 14-18), not shown as five tiny icons on
  every row. **Closing the panel while previewing ends the preview**; a rollback
  (section 18) persists and keeps its strip.
- **Q17 (acceptance scenario)** — Scenario 12, step "open History".
- **Rows.** One row per document record, in order: step number, glyph, a human label
  (`Cube 1 — placed`, `Chamfer Top (+Z) 5 mm on Cube 1`, `Union Cube 1 + Cylinder 1`),
  and status chips (`suppressed`, `inactive` after a rollback, `broken`, and an origin
  chip such as `via MCP` / `pulled from GitHub`, absent for local edits). **Unsure:**
  a single gizmo drag or param edit appends its own record, so a busy session produces
  many `Move Cube 1` rows; drafted, not decided: consecutive transform records on the same body
  collapse into one expandable row. That depends on how many records a drag emits —
  `ui-032`'s Step 2 must check before committing to it.

---

## 14. Timeline — select a row to preview that point in history

*Precedent: `ui-032`'s own Feedback section ("a clear visual indicator that
the viewport is in a 'previewing a past state' mode"); `SECOND-ATTEMPT.md`'s
"looks-live-but-isn't" failure class.*

- **Q10 (flow)** — Precondition: History open and at least one row. Trigger: **tap/click a
  row** (`timeline-row-<n>`). Selecting the **last** row is not a preview (it *is* the
  current document). Selecting any earlier row **previews** the document as evaluated up
  to and including that step. Feedback, all four at once:
  1. A full-width **preview strip** (`timeline-preview-strip`) between the header and the
     main area — outside the viewport, so it cannot collide with the Operations toolbar or
     the orientation gizmo: **`Previewing step 2 of 5 — read-only`** with a `Back to
     latest` button. Esc does the same.
  2. The viewport gets an amber inset outline.
  3. **Everything that would mutate the document is disabled and says why**: Library rows
     (drag-to-place), every Operations toolbar button, the transform gizmo handles, the
     Inspector's editable fields, Undo/Redo, Save-family items stay enabled (they save the
     *real* document) but `Export…` is disabled (section 12), Open is enabled.
  4. Body selection is **cleared on entering preview** (a selection in a state that may
     not contain that body is meaningless); it is not restored on exit.
  Preview is **UI state only**: never autosaved, never in the undo stack, never a
  document record.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — The row; the strip is a header-adjacent element mounted by
  `AppView.vue`.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — Inspector shows `(nothing selected)` while
  previewing (selection cleared). The strip persists even if the panel is scrolled.
- **Q15 (selection count)** — Exactly one row.
- **Q16 (phone width)** — The strip is one 32px line; the sheet stays open under it. Tapping
  a row expands it (Q10 of 15-18) and previews in the same tap — one tap, not two.
- **Q17 (acceptance scenario)** — Scenario 12, preview step.
- **Inactive rows (section 18) are not previewable**: tapping one selects it but does not
  preview. If a rollback is active, previewing an *active* row still works, and the
  rollback strip stays under the preview strip.
- **Any row action (edit, suppress, reorder, rollback) ends the preview and returns the
  viewport to the latest state** so the user immediately sees the whole-document result —
  the scenario's "sphere is untouched" check needs the sphere visible.

---

## 15. Timeline — edit a step in place

*Precedent: `ui-029`'s param-edit path and the Inspector's param fields
(reuse the same per-op param editors from `src/components/features/`, don't build a
second set); `data-004`'s recommendation that the replay let a downstream build throw
and report which record failed.*

- **Q10 (flow)** — Precondition: a row selected whose op has editable params (a
  placement, a chamfer/fillet, a transform's numeric values). Boolean/Group rows have no
  params: `Edit` is disabled with `This step has no parameters`. Trigger: **`Edit`**
  (`timeline-edit`) in the selected row's action bar, which opens the op's own fields
  inline in the row (radius, face, size, position...). `Apply` (or Enter) / `Cancel` (or
  Esc). Feedback on success: the full document replays, the strip clears, the viewport
  shows the latest state with the edited body changed and every unrelated body
  byte-identical, and the row's label shows the new value. Feedback on failure: **the edit
  is atomic — if any record in the replay throws, nothing changes**, the form stays open
  with the value the user typed, and a named error appears in the row and the chip: `Step
  4 (Fillet Top (+Z) 4 mm on Cube 1) can't be built: radius 4 mm doesn't fit` — and the
  failing downstream row is marked `broken` while the failure is on screen. The document is
  never left half-replayed and no geometry is silently dropped.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Inside the selected timeline row; not the Inspector. (The
  Inspector edits the *current* state of the selected body via `ui-029`; this edits a
  *past record*. Same fields, different target, and the row makes that visible.)
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — Applying re-selects nothing; body selection stays
  cleared from the preview.
- **Q15 (selection count)** — One row.
- **Q16 (phone width)** — The edit form is inline in the sheet, scrolls with it, inputs
  ≥16px (no iOS focus-zoom), and Apply/Cancel are 44px.
- **Q17 (acceptance scenario)** — Scenario 12's core (chamfer 5 → 3 mm).
- **Reject vs apply-with-broken-step — decided: reject atomically.** Runner-up, rejected:
  apply the edit and mark the downstream step `broken` (its geometry omitted). Reject never
  leaves the document with a hole or wrong geometry, at the cost of stopping a user who
  meant to fix the downstream step next. `data-004` implements this one contract for the
  whole stack (edit, suppress, reorder, and roll-forward — section 18).

---

## 16. Timeline — suppress a step

*Precedent: `ui-032`'s Feedback ("visibly disabled/greyed state in the
list"); the same downstream-validity contract as section 15.*

- **Q10 (flow)** — Precondition: a row selected. Trigger: **`Suppress`**
  (`timeline-suppress`, `aria-pressed`) in the selected row's action bar; the label swaps
  to **`Unsuppress`** when suppressed. Feedback: the row greys with a strike-through and a
  `suppressed` chip; the document re-evaluates as if that step never happened; the strip
  clears (row actions end preview). **Non-destructive**: nothing is deleted; Unsuppress
  restores exactly the previous result. If suppressing would break a later step that
  needed it (suppressing a Cube that a Union consumes), it is **refused with the same named
  error and atomicity as an edit** — `Step 3 (Union) needs Cube 1` — and the row does not
  change state. Suppress/Unsuppress is one undoable transaction.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Selected row's action bar.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — n/a.
- **Q15 (selection count)** — One row.
- **Q16 (phone width)** — 44px button; the suppressed state is legible without colour
  (strike-through + chip text).
- **Q17 (acceptance scenario)** — Scenario 12's suppress step.
- **Why not an always-visible eye toggle on every row:** at 390px it puts a destructive-
  looking control next to every row's tap target and invites accidental toggles while
  scrolling. Revealing actions on the selected row costs one extra tap and removes that.
  **Unsure**: if the user prefers the CAD-convention eye icon on every row, the answer
  above changes only in where the button lives.

---

## 17. Timeline — reorder steps

*Precedent: `ui-032`'s "drag-to-reorder in the list (or up/down controls,
for a11y and touch parity)"; the sheet-scroll conflict a touch drag-handle would create.*

- **Q10 (flow)** — Precondition: a row selected and a legal move exists. Trigger:
  **`Move up` / `Move down`** buttons (`timeline-move-up`, `timeline-move-down`) in the
  selected row's action bar. **v1 has no drag handle**: a touch drag inside a scrollable
  bottom sheet collides with scrolling, and it doubles the gesture and test surface for no
  capability the buttons lack. Feedback: the row swaps position, numbering updates, the
  moved row **stays selected and scrolls into view**, the document replays, the strip
  clears. Disabled: `Move up` on step 1, `Move down` on the last step, and — statically,
  from operand references — any move that would put a step above a step it consumes
  (tooltip: `Step 3 uses step 2's result`). Any other move that fails replay is refused
  atomically with the named error, order unchanged. Reorder is one undoable transaction.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Selected row's action bar.
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — n/a.
- **Q15 (selection count)** — One row, moving one step by one position per press.
- **Q16 (phone width)** — 44px buttons; keyboard `Alt+↑/↓` on a focused row is an optional
  desktop addition. A drag handle on ≥641px pointer devices is a listed follow-up, not v1.
- **Q17 (acceptance scenario)** — Scenario 12's reorder step.
- **Requirement on `data-004`:** expose a cheap static `canMove(id, delta)` check based on
  operand/`consumes`/`supersedes` references so the disabled state is honest before the
  press; the full replay remains the final arbiter. `core-020`'s closed finding (ordering-
  sensitive composite absorption) is the regression repro every reorder must re-run.

---

## 18. Timeline — roll back to a step (Fusion-style)

*Precedent: `ui-032`'s Feedback ("rollback is likely non-destructive ... state this
explicitly"); Fusion/SolidWorks's rollback bar, which the user chose over blocking creation
while rolled back. The preview/rollback distinction and the insert semantics below are this
doc's own.*

- **Q10 (flow)** — Precondition: a row selected that is **active** and **not the last
  row** (an inactive row cannot be a rollback target). Trigger: **`Roll back to here`**
  (`timeline-rollback`) in the selected row's action bar. The document keeps one persisted
  **rollback marker**, sitting just after row *k*: rows 1..*k* are **active**, rows after
  it are **inactive** — dimmed, chipped `inactive`, and simply not evaluated.
  - **Non-destructive and persistent.** Nothing is deleted. The marker is document state:
    autosaved, restored on reload, pushed to a hosted repo, undoable. This is what
    distinguishes it from **preview**, which is a row-tap, UI-only, and forgotten on close.
    Rolling back again to an earlier active row simply moves the marker earlier.
  - **The strip.** A persistent strip (`timeline-rollback-strip`) under the header:
    **`Rolled back to step 2 of 5`** and a **`Roll forward`** button
    (`timeline-roll-forward`), with a second, smaller line: **`New steps insert here · 3
    later steps inactive`**. In the list the marker is drawn as a horizontal line between
    row *k* and row *k+1*. The strip outlives closing the History panel, so the user cannot
    forget they are rolled back. A preview strip (section 14), if also active, stacks above it.
  - **Nothing is blocked.** Library drag-place, the Operations toolbar, the gizmo, the
    Inspector's fields and Sketch all keep working, on the *active* document. Selection is
    cleared once, at the moment of rollback (a body may no longer exist), and works
    normally afterwards.
  - **New steps insert at the marker.** Any new local mutation — a placement, an operation,
    a gizmo transform, an Inspector param edit, a sketch commit — is inserted **immediately
    after the marker** and becomes row *k+1*; the marker advances to sit after it; the
    inactive rows keep their relative order and renumber after it. It appears above the
    marker line, briefly highlighted, and the strip's counts update (`step 3 of 6 — 3 later
    steps inactive`). Each insert is one undoable transaction (Undo removes the inserted row
    and moves the marker back). The inactive rows are **never discarded or rewritten** by an
    insert.
  - **Roll forward** (`Roll forward` on the strip) replays **the whole log in its new order
    — active rows, inserted rows, then the formerly-inactive rows — and clears the
    marker.** The formerly-inactive rows therefore run **after** whatever was inserted.
    It is **atomic, with the same contract as an edit (section 15)**: if any formerly-
    inactive row can no longer be built, **nothing changes**, the marker stays, and the
    strip says which row and why — `Can't roll forward: step 5 (Chamfer Top (+Z) 3 mm on
    Cube 1) needs Cube 1 as it was before step 3` — with that row chipped `broken`.
  - **What "broken" means for an inactive row, decided.** A tail row is broken when it
    **references a record the inserted step has since superseded or consumed** (it targets
    Cube 1's old terminal record, but an inserted Move or Union now supersedes/consumes
    that record), or when its own build now throws against the changed geometry. Tail rows
    that reference nothing the insert touched — a placement of an unrelated body, an
    operation on other bodies — replay normally. To surface this **early instead of only at
    roll-forward**, after every insert (and every edit) the inactive tail is **shadow-
    checked**: rows that would not build are chipped `broken` immediately, with the reason
    on hover/expand. This is **informational** — the insert itself still succeeds, because
    inserting was the user's intent and the tail is not part of the evaluated document.
    (Failures in the *active* document remain atomic rejections, section 15.)
  - **Resolving a broken tail row:** `Suppress` it (allowed on inactive rows, and cheap —
    nothing needs evaluating), or `Undo` the insert that broke it. Then `Roll forward` again.
  - **Row actions while rolled back:** on **active** rows Edit / Suppress / Reorder work as
    in sections 15-17, except `Move down` on the last active row and `Move up` on the first
    inactive row are disabled (`Roll forward to move a step past the rollback point`). On
    **inactive** rows only `Suppress` / `Unsuppress` is enabled; `Edit` and `Move` are
    disabled with `Roll forward first — inactive steps can't be checked yet`. Tapping an
    inactive row **selects it (showing its action bar) but does not preview it** — it is not
    part of the active document.
  - **Save, autosave, hosted push, Export while rolled back:** Save / autosave / push
    write the **whole log plus the marker**. Export is **allowed** and exports the **active
    state** (what the viewport shows); its popover says `(rolled back — 3 later steps not
    included)`, so a rolled-back scene is never silently exported as if it were the latest.
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Selected row's action bar (`Roll back to here`), the strip
  beneath the header (`Roll forward`), and the marker line in the list.
- **Q13 (drag-to-place)** — Unchanged and enabled: the drop appends at the marker (above).
- **Q14 (inspector/gizmo contract)** — Normal for the active document; selection is
  cleared once at rollback, not held cleared.
- **Q15 (selection count)** — One row for the row actions; body selection counts as usual.
- **Q16 (phone width)** — The strip is **two lines (~48px) at phone width** (the preview
  strip stays one line): line one carries the text and the `Roll forward` button; line two
  carries `New steps insert here · N later steps inactive`. It sits between the header and
  main, outside the viewport overlays, so it collides with nothing; the header-plus-strip
  height is subtracted from the viewport like the header already is. Opening the History
  sheet is optional — the user can drag-place and use the Operations toolbar with the
  sheet closed and the strip still reporting where new steps will land.
- **Q17 (acceptance scenario)** — Scenario 12's rollback step (roll back, insert a shape
  at the marker, confirm it lands there, roll forward).
- **There is no "delete everything after"** anywhere in this milestone. Nothing in the
  timeline removes history; only Undo removes a recent step. That is a deliberate scope
  line, not an omission.
- **Fusion-style insert-at-the-marker — decided by the user.** Runner-up, rejected: keep
  creation and operations blocked while rolled back (simpler; avoids defining what a new
  record before inactive ones means for their validity).
- **Unsure — how often the tail breaks, and re-parenting.** Ids-based records mean a very
  ordinary action — moving or resizing a body **that a later row also builds on** while
  rolled back — supersedes a record the tail extends, so that tail row is flagged broken
  and the user must Suppress it or Undo. Real CAD regenerates the tail against the edited
  body instead. `data-004` could **re-parent** a tail row onto the inserted record when
  the insert supersedes the exact record the row targets; this Q&A does not require it
  (the flag-and-resolve contract above is sufficient and never produces wrong geometry),
  but `data-004`'s Step 2 should measure how common the conflict is and say whether
  re-parenting is worth the extra contract. The requirement on `data-004` that **is**
  fixed: an insert-at-index primitive on the log, and the tail shadow-check.

---

## 19. Undo / Redo (with transaction-origin scoping)

*Precedent: `data-003`'s Interaction model and its "two small buttons in the
existing toolbar chrome" note; `CLAUDE.md`'s touch-device rule.*

- **Q10 (flow)** — Precondition: `Undo` is enabled iff the **local-origin** undo stack is
  non-empty; `Redo` iff the redo stack is non-empty (a new local mutation clears redo).
  Both are **disabled while previewing** (section 14) — the viewport isn't the document.
  Trigger: header **`Undo`** (`undo-button`) and **`Redo`** (`redo-button`), and the
  keyboard shortcuts in the cross-cutting table (suppressed inside a text/number field so
  native field-undo still works in the Inspector). **The tooltip and `aria-label` name the
  action**: `Undo: Move Cube 1`, `Redo: Chamfer Top (+Z) 5 mm`. **Granularity: one
  user-meaningful action = one step** — a whole gizmo drag (not each pointermove), one
  param-field commit, one drag-placement, one boolean, one timeline edit/suppress/reorder/
  rollback. Feedback: the mesh reverts/reapplies; the affected button disables when its
  stack empties; and the **selection that existed before the undone action is restored if
  those bodies still exist** (undoing a boolean brings back and selects both operands;
  undoing a placement leaves nothing selected).
- **Q11 (operand count)** — n/a.
- **Q12 (control location)** — Header document bar, leftmost of the cluster (the most
  frequently used, so closest to the thumb-reachable edge at phone width).
- **Q13 (drag-to-place)** — n/a.
- **Q14 (inspector/gizmo contract)** — Selection restoration above; the Inspector follows
  as it always does.
- **Q15 (selection count)** — n/a; not selection-gated.
- **Q16 (phone width)** — 44px icon buttons in the header (the same cluster budget as the
  cross-cutting section). Touch has no Ctrl+Z, so these are the only path on a phone — the
  reason the keyboard alone fails `CLAUDE.md`'s rule.
- **Q17 (acceptance scenario)** — Scenario 12's "nothing silently reverts" half, run
  after the edit (Undo restores 5 mm and the sphere stays; Redo returns to 3 mm).
- **What "scoped by transaction origin" looks like to the user:**
  1. **Undo only ever reverts things you did, in this session.** A step added by a
     programmatic origin (the future MCP surface, a hosted-backend pull) never appears
     in the undo stack, so pressing Undo can never remove something the user didn't do.
  2. **Remote steps are not hidden — they are in History** with an origin chip (`via MCP`,
     `pulled from GitHub`), so the user can see them and can Suppress or Edit them like any
     step (which is then a *local*, undoable transaction). That is the user-facing way to
     "undo" someone else's step, and it is why origin is a row chip and not a silent
     filter.
  3. **When a remote change arrives** the chip announces it once (`Project updated via
     MCP · 2 steps`); it does **not** touch the undo buttons.
  4. **If undoing a local step would orphan a remote step that consumed its result**, Undo
     is refused with a named message (`Step 7, added via MCP, depends on this — suppress
     or edit it first`) rather than deleting someone else's work or leaving a hole.
  Today (no MCP, and a hosted pull replaces the whole document via Open-style clearing),
  this scoping is essentially invisible; points 2-4 are the contract for when a second
  writer exists, and `data-003` must build the origin field so they are possible.
- **The stack across reload and across Open — decided.** The undo/redo stacks start empty
  after a reload and after Open / Load-from-repo, even though the document itself is
  restored (`Undo` is greyed on a fresh load). A user who reloads cannot undo their last
  edit — the accepted cost of the simplest honest rule. Runner-up, rejected: persist
  local-origin history so undo survives reload.

---

## Summary: M6 acceptance-scenario cross-reference

| Section | Control | Scenario | New scenario needed? |
|---|---|---|---|
| 8 | Autosave | 10 (reload half) | No — rewritten in place |
| 9 | Save / Download copy | 10 (file half) | No |
| 10 | Open… | 10 (file half) | No |
| 11 | Hosted storage, explicit push/pull and opt-in Auto-push | 10 (hosted half, incl. auto-push and its 409 pause) | No |
| 12 | Export… | 11 | No |
| 13-17 | Timeline open + preview/edit/suppress/reorder | 12 | No |
| 18 | Timeline rollback, insert at the marker, roll forward | 12 | No |
| 19 | Undo / Redo | 12 ("nothing silently reverts") | No |

`TODO/ACCEPTANCE.md` scenarios 10, 11 and 12 are rewritten against these control names
(the M6 analogue of `ui-001` rewriting 1-9). No fourth scenario is needed.

## Downstream TODO files this Q&A changes

Four files' own text is **contradicted** by these answers and carry a "Superseded by
`data-002`" note at the top of the affected section (added by `data-002`; no other edit to
them): `TODO/ui-033` and `TODO/io-002` (hosted writes are explicit with an opt-in
auto-push, not automatic; control surface is the header File ▾ menu; label per
capability), `TODO/ui-034` (Export lives in File ▾, not the Operations toolbar; it is
disabled with no bodies or while previewing; scope defaults to the selection), and
`TODO/io-003`'s Affected files (both `src/core/export.js` **and** `src/render/export.js`,
per `data-001`).

The rest are consistent with these answers but need these specifics **when each is picked
up** (no note added):

- `TODO/ui-032` — the surface is a bottom dock (>=641px) / bottom sheet (phone) toggled
  from the header, with a preview strip and a rollback strip; per-row actions are an
  expanded action bar; no drag-reorder in v1; reorder uses a static `canMove`; rollback is
  Fusion-style (section 18), so **creation stays enabled while rolled back**.
- `TODO/data-003` — one-action-one-step granularity, selection restoration, the origin
  chip, the named refusal when undo would orphan a remote step, and undo stacks that do not
  survive a reload.
- `TODO/data-004` — atomic reject on a broken replay (edit, suppress, reorder, roll-
  forward alike), the static `canMove` check, an **insert-at-index primitive** on the log
  for insert-at-the-marker, the **inactive-tail shadow check**, and whether tail rows
  should be re-parented (section 18's Unsure).
- `TODO/io-001` — flush on `visibilitychange`/`pagehide`; multi-tab revision check; a file
  `accept` list that works on iOS; project-file naming.
- `TODO/io-002` (beyond its note) — the auto-push rules of section 11: 30s trailing debounce
  with a 5-minute cap, the five shape-coded dot states, pause-not-overwrite on a 409, the
  connect-time validation matrix.
- `TODO/io-003` — `.glb` vs `.gltf`, and one combined mesh vs one file per body for a
  multi-body selection.

---

## Decisions log

**Confirmed as drafted:** header-bar placement of Undo / Redo / History / File ▾ with Export
as a popover from File; Export scope defaulting to the selection with an override, disabled
with no bodies or while previewing; the header-toggled bottom dock (>=641px) / bottom sheet
(phone); atomic rejection of a broken past-step edit with the failing row named;
Move up / Move down only, no drag in v1; Open replaces the project after a confirm; undo
history does not survive a reload. Runner-ups considered and rejected are named beside
each answer above.

**Changed by the user from the first draft:**

1. **Hosted saves: opt-in auto-push** (section 11), off by default, per connection —
   instead of explicit-only. Ctrl/Cmd+S still never touches the network.
2. **Rollback is Fusion-style** (section 18) — persistent, but creation and operations are
   not blocked; new steps insert at the marker and the tail stays inactive until rolled
   forward — instead of blocking creation while rolled back.

**Still open — not explicitly decided, settle in the building task:** the Esc-exits-preview
call; label-per-capability vs a Save As/Open-only menu (drafted: per capability); no
project-name concept; `.glb` vs `.gltf`; exporting a drilled-in sub-part as its whole
parent body; a missing `New project` item; the always-visible suppress eye vs an action
bar; repository branch; multi-tab autosave last-writer-wins; whether one gizmo drag
collapses to one timeline row; and section 18's tail re-parenting.
