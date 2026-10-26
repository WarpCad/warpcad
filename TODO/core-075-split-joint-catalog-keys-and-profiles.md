---
title: More ways to join split pieces — butterfly keys, loose dowels and tenons, dovetails, puzzle tabs, laps, fingers, magnets
category: core
kind: feature
priority: medium
model: opus
milestone: none — outside any milestone (filed 2026-10-26 at the owner's request)
depends: []
status: open
---

## Goal

**In user terms:** split a part too big for the bed, print every piece **and every key that joins
them**, and put it back together with a joint suited to the part: a flat sign, a long beam, a
display model that has to come apart, a wing.

**Today.** The Split sheet (`io-007`, `ui-067`, both done) offers **Pins and sockets**, **Tongue
and groove** and **No joint**. **Place connectors by hand** adds **Post**, **Wedge** and **Screw
boss** (`core-059`). Every one of these except the screw boss is a feature printed onto piece A
that sits in a socket in piece B. They stop the pieces sliding across the cut face, but none of
them stops the pieces **pulling apart** along the cut axis, so glue does that job. None of them
makes a **separate part** either, so **Export → Print pieces** only ever writes A and B. The
kernel also has no notion of a key, a part that belongs to the joint and not to either piece.

**The research** (sources at the foot of this file) gives four families of joint for splitting
FDM prints. The tables below are what this task adds. The last column says what each joint
resists that the existing joints do not.

**Separate printed keys.** New: a key is its own part in the split's group and its own file in
Print pieces.

| Joint | Shape and assembly | Resists | Why add it |
|---|---|---|---|
| **Butterfly (bowtie) key** | A double-dovetail key let into a pocket that straddles the seam on an **outer surface**. Push the pieces together, then press the key in from outside | pull-apart across the seam, shear | Requested by name. It is the only joint here that **locks against pull-apart without glue** and can be added from outside after the pieces are already together. Each key prints flat on its big face, so the narrow waist takes tension along the layers, which is the strong direction for FDM |
| **Loose dowel** | A blind socket in **both** cut faces and a separate pin (PrusaSlicer's "Dowel" connector) | shear; twist when there are two or more | A pin printed onto piece A stands upright if A prints on its cut face, which puts the layer lines across the pin's shear plane. A loose dowel lies down to print and is strong. A dowel can also be **bought**: a steel pin, or a length of 1.75 mm filament (the "filament rivet") |
| **Loose tenon (spline, floating tenon)** | A flat stadium-shaped key in matching mortises in both faces, like a Domino joint | shear, twist | One tenon stops twist that would otherwise need two dowels. It prints flat |

**Seam profiles.** These shape the seam itself. They are integral, with no extra part, but unlike
today's joints they run out to the outer surface.

| Joint | Shape and assembly | Resists | Why add it |
|---|---|---|---|
| **Sliding dovetail** | A trapezoid rail the full length of A's face and a matching channel in B. B slides on from one end (PrusaSlicer's Dovetail cut mode) | pull-apart, shear in one direction | Holds under tension in one axis. In a single-test comparison reported online, a printed dovetail beat a slotted tenon and a screw |
| **Puzzle (jigsaw) tabs** | Necked round-headed tabs through the full thickness of a plate-like section. Assemble by dropping one piece onto the other along the thickness | pull-apart and shear in the plate's plane | The usual joint for flat signs, panels and tiles. Locks without glue in the plane that matters |
| **Half lap (step)** | Each piece keeps half the thickness, overlapping past the cut by a lap length | locates in two directions | Several times the glue area of a butt joint on a thin plate, and the step stops the pieces sliding while the glue sets |
| **Finger (box) joint** | Alternating fingers across the seam, through the thickness | shear along the seam | The most glue area. Self-aligning along the seam |

**Hardware pockets.** Nothing extra is printed. The sheet and the bill of materials list what to
buy.

| Joint | Shape and assembly | Resists | Why add it |
|---|---|---|---|
| **Magnets** | Disc-magnet pockets in both faces, open at the cut | light pull-apart, and it **comes apart on purpose** | Display models, lids, transport splits. Pair with dowels for location |
| **Stock dowel** | The loose dowel's sockets, sized for a bought steel pin or 1.75 mm filament, with no key part generated | as loose dowel | The strongest pin for the least printing |

**Done** means all of the following:

- The kernel builds every kind in the tables above.
- The Split sheet offers each one in a grouped picker. It is a hand-written list, not one built by
  iterating `PLACEMENT_KINDS`, per `CLAUDE.md`'s creation-vs-operation rule.
- Butterfly keys, dowels, tenons and magnets can also be **hand-placed** with today's tap-to-add
  markers.
- Each key comes out of **Print pieces** as an STL laid in its **strong** orientation.
- The zip carries an **`assembly.txt`**: which pieces, how many of each key, what hardware to buy,
  and the assembly order and direction.
- The bought hardware appears in the Inspector's **Bill of materials** (`src/core/bom.js`).
- The AI tool for split can ask for all of it.
- A person can split a 300 mm plank with butterfly keys, open the zip, print, and assemble it.

### Considered and left out, with the reason

- **Snap-fit hooks and snap posts.** PrusaSlicer's own Snap connector has an open report of
  slicing as a separate island. Printed snaps need a flexible material (PLA is called too
  brittle in every guide found). A hook's undercut also needs a flex slot that is a design
  problem of its own. Better as a follow-up once the key-part plumbing exists.
- **Threaded spigot (screw the pieces together).** This needs `core-074`'s thread recipes and
  only suits round sections. File a follow-up after `core-074`.
- **Bayonet or twist-lock.** Round sections only, with the same dependency.
- **Bolt with captive nut.** The existing screw boss with a heat-set insert covers bolting the
  pieces together. A nut trap needs a side slot out to an outer face. Follow-up if asked.
- **Scarf (angled) cut.** Split only cuts axis-aligned planes. An angled plane is its own task.
- **Glue channels and vents.** Cheap and useful: a shallow groove around a joint so excess glue
  has somewhere to go. It is a cut-face option, not a joint kind. Follow-up.

## Design

### One principle for all the new kinds: clip to the uncut solid

Today's connectors must sit **wholly inside** the material. `contains` refuses a pin whose wall
breaks out. Butterfly keys and every seam profile **deliberately reach the outer surface**, so
containment cannot be their check. Instead, for each kind:

- **Key** = the nominal shape ∩ the **uncut** solid. A butterfly key on a curved wing surface
  then has a top that follows the surface exactly, and its flat floor is what it prints on.
- **Pocket** = the nominal shape grown by `clearanceMm` square to every side (the mitred offset
  `joint.wedge.js` already uses for slanted sides), subtracted from **both** pieces for a key,
  or from B only for a profile.
- **Profile feature** = the nominal shape ∩ the uncut solid on B's side, unioned onto A. The
  matching cavity, grown, is subtracted from B.

What *does* still need a wall: a pocket's floor (a butterfly pocket must not break through the far
side unless it is meant to go through) and the rest of a profile's neck. Those reuse the clearance
field and `contains` on the part of the feature that is meant to be enclosed.

### Key parts in the result group

- The split's group gains parts after A and B, named `<base> key 1`, `<base> key 2`, and so on.
  Numbering continues across repeated splits, so a second split's keys start at the next free
  number. Names never contain commas, as `readParams` already requires. Each key is stored
  **assembled**, inside its pockets, so the scene shows the finished part. Hiding a piece shows
  its keys (`ui-089`).
- The group needs to know which parts are keys: their kind, their print orientation, and which
  identical keys can share one file. Add a per-part metadata map next to the existing hidden-names
  map (`group.js`'s `hiddenNamesOf`). The exact shape is a Step 2 decision. It must survive the
  project file round trip and the merge (`docs/decisions/document-sync.md`), so it is **derived
  from the record's params at fold time**, never stored as mesh state.
- `crossedPiece` must refuse a later plane that would cut through a key, and say so by name:
  *"the cut plane crosses Wing key 2 — move it clear of the keys"*. Today's "crosses 2 parts"
  wording would be confusing there.

### Print orientation for keys

`printPrep.js`'s `layFlat` puts a part on its **largest flat face**. That is right for a butterfly
key or a tenon (both lie on their big face) and **wrong for a round dowel**. The only flat faces
on a round dowel are its end caps, so it would print standing up, which is the weak orientation.
Two fixes; pick one at Step 2:

1. **Recommended: keys carry a bed-face normal in their metadata**, and `layFlat` takes it as an
   option alongside its existing `bedFace: 'as-placed'`.
2. Give the printed dowel a **D-flat**: one flat along its length, a fifth of its diameter deep,
   so the flat is the largest face once the dowel is longer than about 1.5× its diameter. The
   socket stays round.

Do both: the D-flat also stops a dowel rolling off the bed and gives glue somewhere to go.

### Each kind: geometry and starting sizes

These are starting numbers, confirmed at Step 2 against a test print. The face frame is
`joint.common.js`'s `(u, v)`. *n* is the cut axis.

- **Butterfly key.** `sizeMm` is the waist width *w*, 3–20 mm. The ends are 2*w* wide and the key
  is 4*w* long across the seam (2*w* into each piece), so each wing slopes 1 : 4. Depth defaults
  to half the section's thickness at that point, at least 3 mm, leaving at least `JOINT_WALL_MM`
  of floor, or `through: true`. It is inserted along the face axis nearest the outline's inward
  normal (`side: 'u-' | 'u+' | 'v-' | 'v+'`), which keeps the prism axis-aligned for v1. The
  **search** places keys along the longest straight run of the outline, one per ~50 mm of seam,
  at least one.
- **Loose dowel.** Diameter 2–10 mm, a socket depth in each piece of 1.5× the diameter (clamped
  to the field's reach), the dowel shorter than both sockets by 2 × clearance, and 0.5 mm chamfers
  on both ends. It reuses the pin search, but needs a wall in **both** pieces (today's pin needs a
  wall in B and a base in A). `stock: 'steel' | 'filament'` drops the key part; for filament the
  diameter is fixed at 1.75 mm.
- **Loose tenon.** A stadium in the face, width 6–30 mm, thickness 3–8 mm, embedded 1.5× its
  width into each piece. Searchable like the tongue (its long axis runs the way the tongue's does,
  `ribAlongU`).
- **Sliding dovetail.** A rail along the face's longer direction, full length, clipped to the
  solid. It stands 3–8 mm proud, with a neck of at least 2 × `JOINT_WALL_MM`, flaring at 15° per
  side. Assembled by sliding along the rail, which the sheet and `assembly.txt` must say.
- **Puzzle tabs.** Only when the section is plate-like: thickness *t* ≤ ¼ of the seam length,
  otherwise refused with that reason. Necked round-headed tabs, head diameter 2× the neck, *k*
  tabs evenly spaced, through the full *t*, assembled along *t*.
- **Half lap.** A keeps the −*t* half for `lapMm` (default 2*t*, at least 10 mm) past the cut,
  and B keeps the +*t* half back. Plate-like sections only, like the puzzle tabs.
- **Finger joint.** *k* fingers (default: the seam length divided by about 3*t*, odd so both
  ends belong to A), `depthMm` along *n* (default 2*t*), through *t*.
- **Magnets.** Pick from 6×2, 6×3, 8×3, 10×2, 10×3 and 12×3 mm (diameter × thickness), or a
  custom size. Pocket diameter is *d* + 2 × clearance and pocket depth is thickness + clearance,
  in both faces. Placed by the pin search's field, with a floor wall on both sides.
  `assembly.txt` gives the **polarity** rule: stack the magnets, mark the outward face, and glue
  every A-side magnet mark-out and every B-side magnet mark-in.

**Profiles change a piece's extent along *n*.** A lap, a finger or a tab makes piece A **longer**
than the cut offset. The Split sheet's pieces list and its **fits** badge must use the pieces'
real bounds after the joint is planned, not the plane's offset. Otherwise a piece that is shown as
fitting will be too long for the bed.

**Profiles and point connectors.** In v1 a profile is exclusive with `placements`, with one
exception: magnets and dowels with a half lap, which is the common real case. Decide at Step 2
whether to allow that pairing in v1.

### Record shape (backward-compatible)

`params.joint` grows `butterfly | dowel | tenon | dovetail | puzzle | lap | finger | magnets`,
each with an optional `jointOptions` object for its own sizes (count, side, stock, magnet size).
`PLACEMENT_KINDS` grows `dowel | tenon | butterfly | magnet`. A record with neither, or with
today's values, folds byte-identically to how it folds now, and the closed-finding regression in
Testing checks that.

## Interaction model

- **Precondition** — unchanged: exactly one solid selected, so that **Split…** is enabled.
- **Trigger** — **Split…** in the Operations toolbar opens the Split sheet as today. Its **Joint**
  control becomes a **grouped** list. The labels below are the visible text:
  - *Printed into the pieces*: Pins and sockets, Tongue and groove, Sliding dovetail, Puzzle tabs,
    Half lap, Finger joint
  - *Separate keys to print*: Butterfly keys, Dowels, Tenons
  - *Hardware you buy*: Magnets, Steel or filament dowels
  - No joint

  Under the choice is a one-line *what it's for* (*"Locks the pieces together from outside; print
  the keys flat"*), then that type's own fields (size, count, side, depth, magnet size).
  **Place connectors by hand**'s kind row gains **Dowel**, **Tenon**, **Butterfly** and
  **Magnet**. A Butterfly tap **snaps to the nearest edge of the cut-face outline** and its marker
  is a bowtie straddling that edge. The whole-seam profiles cannot be hand-placed, so choosing one
  unticks hand placement, and the sheet says why.
- **Feedback** — before **Apply**, the pieces list shows the keys as rows with size, count and fit
  (*Butterfly key × 4 — 36 × 18 × 9 mm — fits*), plus a **You'll also need** line for bought
  hardware (*4 × magnets 6 × 3 mm*). Refusals are named, as today. After **Apply**, the Parts list
  shows *Wing A, Wing B, Wing key 1 … 4*. Butterfly inlays and profile seams are visible in the
  viewport. Dowels, tenons and magnet pockets show when a piece is hidden. **Bill of materials**
  lists the bought hardware.
- **Placement** — n/a: no geometry is dragged in. Keys appear assembled in their pockets.
- **Selection response** — selecting a key part (Parts list or viewport) shows its size and its
  Inspector note *"Print × 4, flat side down"*. A key takes no transform gizmo, because moving a
  key out of its pocket is never what the person means; the sheet's Undo is the way back.
- **Selection count** — exactly 1, unchanged. The control is dimmed with *Select exactly 1 solid*
  otherwise.
- **Small-screen behavior** — the sheet is already a bottom sheet at phone width. The grouped
  Joint control is a native `<select>` with `<optgroup>`s there, which iOS renders as a wheel
  with headings, and the type's fields stack one per row. Butterfly taps on the outline need the
  same "zoom in near the handle" advice the docs already give for markers. The kind row wraps to
  two lines at 390 px and keeps 44 px tap targets.

## Documentation

- **Page** — `docs/print-prep.md`. Add:
  - **"Choosing a joint"**, a table with one row per kind: what it resists, glue or not, can it
    come apart, what extra gets printed or bought, and best for (flat sign, beam, display model,
    wing).
  - **"Try it: butterfly keys across a 300 mm plank"**, the step-by-step example below.
  - **"Printing and assembling keys"**: orientation, what `assembly.txt` says, glue, magnet
    polarity, and the slide direction for dovetails.

  Update `docs/bill-of-materials.md` to say that a split's magnets and stock dowels are listed
  there.
- **Example** (verbatim-followable):
  1. Place a **Cube** and set its **Size** to X 300, Y 120, Z 10 (mm). Rename it **Plank**.
  2. Select it and press **Split…**. Set **Axis** to **X** and **Offset** to **150**.
  3. Set **Joint** to **Butterfly keys** (under *Separate keys to print*). Leave **Keys** at
     **Auto**; the list says *Butterfly key × 2*. Set **Side** to **Top** and **Depth** to
     **5 mm**. Leave clearance at 0.2.
  4. Press **Apply**. Two bowtie inlays appear across the seam on the top face. The Parts list
     reads *Plank A, Plank B, Plank key 1, Plank key 2*.
  5. **File ▾ → Export… → Print pieces**. The zip has `plank-a.stl`, `plank-b.stl`,
     `plank-butterfly-key-x2.stl` (or one file per key; Step 2 decides) and `assembly.txt`.
     Print, push A and B together, then press each key into its pocket from the top.
- **Media** — in `e2e/docs/print-prep.docs.js`:
  - New shots `docs/screenshots/split-joint-picker.png` (the grouped Joint list open) and
    `docs/screenshots/split-butterfly-keys.png` (the plank after Apply, keys visible).
  - `docs/screenshots/print-pieces-with-keys.png`: the Export panel listing the key files and
    `assembly.txt`.
  - A new movie `docs/media/print-prep-butterfly-keys.gif` covering steps 2–5.
  - Re-shoot `split-sheet.png` and `split-sheet-manual-joints.png`, which change with the
    grouped picker and the wider kind row.
  - All are embedded in `docs/print-prep.md`. `e2e/docs-media.spec.js` must stay green.

## Affected files

- `src/core/kernel/recipes/joint.common.js` — the clip-to-solid helper, the grown-pocket helper
  (lift the mitred offset out of `joint.wedge.js`), and a two-sided containment check for
  dowels, tenons and magnets.
- New recipes:
  - `src/core/kernel/recipes/joint.dowel.js`
  - `joint.tenon.js`
  - `joint.butterfly.js`
  - `joint.magnet.js`
  - `joint.profiles.js` (dovetail rail, puzzle, lap and finger share one "seam profile" builder)
  - a `.spec.js` beside each
- `src/core/kernel/recipes/joint.placements.js` — the new kinds in `buildPlaced` and
  `defaultSize`, and searches for dowel, tenon and butterfly.
- `src/core/kernel/split.js`:
  - `JOINT_TYPES`, `PLACEMENT_KINDS`, `SIZE_RANGE_MM`, `readParams` and `readPlacement`
  - `planOn` and the result group, which gains key parts and their metadata
  - `crossedPiece`'s key refusal
  - `JointPlan` gains `keys`
- `src/core/kernel/group.js` — the per-part metadata map, carried through `add`, `bisect` and
  `hiddenNamesOf`'s siblings.
- `src/core/printPrep.js`:
  - `layFlat` honours a key's bed normal
  - `exportPrintPieces` dedupes identical keys if Step 2 says so
  - writes `assembly.txt`
- `src/core/bom.js` — magnets and stock dowels from split records.
- `src/stores/splitSheet.js` — the grouped joint list, the new `CONNECTOR_KINDS`/labels, the
  per-type option fields, outline-snapping for Butterfly taps, and the pieces list using real
  bounds.
- `src/components/features/SplitSheet.vue` and `src/components/viewport/ConnectorMarker.vue` —
  the picker, the fields, and new marker glyphs (bowtie, stadium, hollow disc for a magnet).
- `src/ai/tools/operate.js` — the `modify.splitWithJoint` spec. It exposes only `joint` today,
  **not `placements`**, so wedges and screw bosses are unreachable from chat and MCP right now.
  Add `placements` and `jointOptions` to the schema and the description, and update
  `src/ai/prompt.js`'s printing guidance with when to choose which joint.
- `docs/print-prep.md`, `docs/bill-of-materials.md`, `e2e/docs/print-prep.docs.js`.
- `e2e/print-prep.e2e.js` (extend) or a new `e2e/print-prep-keys.e2e.js`.

## Proposed fix (stages; each is a green, committable checkpoint with its own picker entry, doc row and e2e)

Each stage ships its own UI entry, doc table row and e2e assertion. There is no
"docs and UI last" stage, per `CLAUDE.md`.

1. **Key-part plumbing and the loose dowel**: printed, steel and filament dowels; group metadata;
   `layFlat` bed normal and D-flat; Print pieces key files and `assembly.txt`; BOM; the grouped
   picker with **Dowels** and **Steel or filament dowels**; the AI schema including `placements`.
   This is the stage that proves "split, print the keys, assemble" end to end.
2. **Butterfly keys**: the search, hand placement snapping to the outline, and the docs "Try it".
3. **Loose tenon and magnets.**
4. **Seam profiles**: sliding dovetail, puzzle tabs, half lap, finger joint, and the real-bounds
   fit check.

If one session cannot hold it, split stages 3 and 4 into their own TODO files that depend on this
one's stages 1–2, and say so in the commit (the `ui-079` precedent).

## Decisions to confirm at `/fix-todo` Step 2

1. **Identical keys**: one STL per distinct key with the count in its name
   (`plank-butterfly-key-x4.stl`), or one file per key? Recommended: one per distinct shape. The
   slicer makes copies, and `assembly.txt` says how many.
2. **Key metadata shape** on the group (see Design), and confirm it derives from params at fold.
3. **Dowel orientation**: bed normal, D-flat, or both. Recommended: both.
4. **Profile + point-connector pairing** in v1: allow lap + magnets/dowels, or keep it exclusive?
5. **Starting sizes** above, after one test print each at 0.2 mm clearance. The owner's printer
   is the reference; record the result in `docs/print-prep.md`'s clearance note.
6. **Butterfly insertion direction**: axis-aligned only in v1 (recommended), or along the true
   outline normal?

## Effort

L. Seven new geometry kinds, a new part role threaded through group, export and BOM, and a
grouped picker. It is staged so each stage stands alone.

## Testing

- **Unit (numeric, `toBeCloseTo`, `1e-6` relative on volumes, as `io-007` uses)**, per kind:
  - **Volume identity**: vol(A) + vol(B) + Σ vol(keys) = vol(uncut) − vol(clearance gaps), where
    the gaps are computed independently as grown minus nominal.
  - **No interference when assembled**: at `clearanceMm` 0.2, ∩(A, B), ∩(key, A) and ∩(key, B)
    all have zero volume.
  - **Can actually be assembled**: each kind declares its assembly direction (dowel/tenon/magnet:
    along *n*; butterfly: inward along its side; dovetail: along the rail; puzzle, lap and
    finger: along *t*). The test moves B (or the key) along that direction in 0.5 mm steps until
    clear and asserts zero intersection at every step. Moving along any **other** axis must
    collide for the locking kinds (butterfly, dovetail, puzzle). This is the check that the joint
    goes together *and* holds.
  - **Print orientation**: after `layFlat`, a dowel's axis is horizontal, a butterfly's waist
    lies in the XY plane, and a tenon lies on its big face.
  - **Degenerate cases**: a butterfly on a curved surface (the key top follows the surface, still
    watertight); a butterfly where the floor would break through, which is refused unless
    `through`; puzzle or lap on a section that is not plate-like (refused with the reason);
    keys on a face with a hole through it; zero clearance (warning, still builds); `MAX_PLACEMENTS`
    with the new kinds; a later split plane through a key, which is refused by key name.
  - **Multi-split**: a second split keeps the first split's keys and numbers its own from the next
    free number.
  - **Print pieces**: the zip lists the key files and `assembly.txt` with the counts, the hardware
    and the assembly direction.
  - **BOM**: magnets and stock dowels counted.
  - **AI schema**: `checkInput` accepts each new `joint` and placement kind and refuses unknown
    ones by name.
- **E2E** — `e2e/print-prep-keys.e2e.js`, navigating to `/`:
  - place a cube, Split… → **Butterfly keys** → Apply;
  - the Parts list shows the key parts;
  - Export → Print pieces downloads a zip with the key STL(s) and `assembly.txt`;
  - hand-place a **Magnet** and a **Dowel**, and see **You'll also need** update;
  - choose **Half lap** and see the pieces list's size grow by the lap.

  Runs at **phone, tablet and laptop** (the sheet is a bottom sheet at phone, and the grouped
  picker is a native select there), with a snapshot at each, on **Chromium, Firefox and WebKit**
  (the kernel worker, canvas taps on the cut face, a download).
- **Acceptance** — re-drive and report PASS/FAIL:
  - **4 (Boolean gating)**: Split's count rules are unchanged.
  - **11 (Export a solid and confirm it opens elsewhere)**: Print pieces gains files. Open the key
    STL in a slicer or viewer if one is to hand, and say so if not (the standing gap).
  - **17 (Airfoil and wing, ready to print)**: the model may now choose a joint. Run the
    scripted-provider plumbing at least; a live run is the owner's call.
  - Also, by hand: split a 300 mm plank with butterfly keys, open `assembly.txt`, and check it
    describes what is on screen.
- **Closed-finding regression** — this extends `io-007`, `core-059` and `ui-067`'s subsystem.
  Re-run `io-007`'s volume-identity, non-watertight and plane-outside-body specs, `core-059`'s
  placement-refusal specs, and `ui-067`'s hand-placement e2e. A record with today's `joint`
  values and no new params must fold **byte-identically** to before; compare STL bytes of a pins
  split and a placements split against a fixture saved before this change. Also re-run
  `testing-003`'s and `testing-008`'s Split-sheet repros, since the sheet's layout changes and both
  were load-sensitive.

## Sources

- PrusaSlicer Cut tool (Plug, Dowel as an extra printed object, Snap; Dovetail mode):
  <https://help.prusa3d.com/article/cut-tool_1779>
- Prusa forum, a Snap connector slicing as a separate island:
  <https://forum.prusa3d.com/forum/prusaslicer/2-9-0-snap-connector-separated-in-slicer>
- Sovol, keys, glue and assembly for multi-piece prints:
  <https://www.sovol3d.com/blogs/news/3d-printing-large-models-in-multiple-pieces-keys-glue-and-assembly-tips>
- DigiKey Maker.io, splitting and joining large prints:
  <https://www.digikey.com/en/maker/blogs/2024/how-to-split-and-join-large-3d-prints>
- Siraya Tech, joint types and clearances (0.2–0.5 mm for rigid FDM, PETG over PLA for
  friction joints): <https://siraya.tech/blogs/news/3d-print-joints>
- 3DPrinterly, connecting joints and interlocking parts (the dovetail vs. tenon vs. screw test):
  <https://3dprinterly.com/how-to-3d-print-connecting-joints-interlocking-parts/>
- Hubs, snap-fit design: <https://www.hubs.com/knowledge-base/how-design-snap-fit-joints-3d-printing>
- Tokyo Tech, pyramidal concavo-convex mating for printed parts:
  <https://t2r2.star.titech.ac.jp/rrws/file/CTT100902413/ATD100000413/>
- Blender Dovetail Key add-on (cut and rejoin with dovetail keys):
  <https://superhivemarket.com/products/dovetail-key/docs>
- SnapSplit (pin and snap-pin connectors): <https://github.com/Betakontext/snapsplit>

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
