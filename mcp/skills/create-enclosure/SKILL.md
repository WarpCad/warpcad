---
name: create-enclosure
description: Build a printable box around a WarpCad part or group, with wall thickness, standoffs, cut-outs and a lid split, in an order that survives a History rebuild. Use when the user asks for an enclosure, case, housing or box for a board or device such as a Raspberry Pi.
license: CC-BY-SA-4.0
---

# Create an enclosure

Builds a box around one part, sized from that part. If the part's own steps change later, the box follows it.

## Inputs

Use the user's numbers. Where they give none, use these defaults and say so:

- **The part**: a body id from `describe_scene`.
- **Wall**: 2 mm. Never go under 1.2 mm.
- **Clearance**: 0.2 mm per side, the gap between the part and the inside wall. For how to choose it, see `skill://add-clearances/SKILL.md`.
- **Standoff**: 5 mm under a board that has mounting holes (parts named `hole1`, `hole2` and so on in `describe_body { id }`). Use 0 for a part that sits on the floor.
- **Lid depth**: 8 mm, measured down from the top.
- **Cut-outs**: one for each port the user wants reachable. A ready-made board lists hidden keep-out parts for its ports (`clearance-usbc`, `clearance-hdmi1` and so on). If the user named no ports and the board has none listed, ask once, with zero writes.

## The order, and why

Each step reads the result of the one before it. Build in this order and never go back:

1. Size the box from the part, with formulas.
2. Build the shell: an outer block minus a cavity.
3. Add the standoffs, then drill them.
4. Cut the openings.
5. Split off the lid **last**. Once the box is split it becomes two parts, and every later cut would have to name one of them.

Position everything with `group.align` against the part, never with copied coordinates. An align step re-reads the part when the History is rebuilt; a copied coordinate does not.

## 1. Measure, then define the sizes

1. Call `measure { ids: ["<part>"] }`. Note its size and its lowest z.
2. Call `define_variable { name, kind: "number", value, unit: "mm", min, max }` three times, for `wall`, `clearance` and `standoff`.
3. Call `define_formula { name, formula, unit: "mm" }` six times. Name the part as `[Its Name]`, and check each formula first with `evaluate_formula { formula }`:
   - `cavityW = [Part].width + 2 * clearance` and `cavityD = [Part].depth + 2 * clearance`
   - `cavityH = standoff + [Part].height + clearance`
   - `outerW = cavityW + 2 * wall`, `outerD = cavityD + 2 * wall` and `outerH = cavityH + 2 * wall`

## 2. The shell

1. Create two `primitive.cuboid` bodies with `create { op, positionMm, params }`. Use the formulas' current values as sizes, and put x and y at the part's centre. For the outer block, z is the part's lowest z minus `standoff + wall`. For the cavity, z is the part's lowest z minus `standoff`.
2. Bind every size slot to its formula, six calls in all. For the outer block: `bind_param { id, path: "size.0", name: "outerW" }`, then `size.1` to `outerD` and `size.2` to `outerH`. Do the same for the cavity, with `cavityW`, `cavityD` and `cavityH`.
3. Centre both blocks on the part: `operate { op: "group.align", operands: [{ id: "<block>" }, { id: "<part>" }], params: { axes: "xy" } }`.
4. Subtract the cavity from the outer block: `operate { op: "boolean.subtract", operands: [{ id: "<outer>" }, { id: "<cavity>" }] }`. The result is the shell, under a new id.

## 3. Standoffs (only for a board with mounting holes)

1. Create one post with `create { op: "primitive.cylinder", positionMm, params: { diameter: 6, height: <standoff> } }`. Put its z on the shell's floor.
2. Centre it under the first hole: `operate { op: "group.align", operands: [{ id: "<post>" }, { id: "<part>", pieces: "hole1" }], params: { axes: "xy" } }`.
3. Copy it to the other holes: `repeat { source: "<post>", seedBody: "<part>", seedPart: "hole1", targets: ["hole2", "hole3", "hole4"] }`.
4. Join the posts to the shell with `boolean.union`, listing the shell, the post and the repeat result.
5. Drill the posts by subtracting the part's hole pieces: `operate { op: "boolean.subtract", operands: [{ id: "<shell>" }, { id: "<part>", pieces: "hole1,hole2,hole3,hole4" }] }`. Cutting with only a board's mounting holes leaves the board in place.

## 4. Cut-outs

Cut each opening with the board's own keep-out piece. A cut with only keep-out pieces (`clearance-*`) removes exactly that volume and leaves the board in place, so one board cuts every port:

1. Cut the port: `operate { op: "boolean.subtract", operands: [{ id: "<shell>" }, { id: "<part>", pieces: "clearance-usbc" }] }`. Several keep-outs can go in one call: `pieces: "clearance-usbc,clearance-hdmi1"`. Mixing in any other piece, such as `usb1`, uses the board up.
2. A keep-out reaches 5 mm past the board's edge by default. If `clearance + wall` is more than that, the opening won't go through the wall, so create the board with a bigger `clearance` param before you start (at least `clearance + wall + 1`).
3. Check with `measure { ids: ["<shell>"] }` or `check_clearance`: the port should be open from the cavity to the outside.

## 5. The lid

Split the shell across z with a tongue so the lid locates itself: `operate { op: "modify.splitWithJoint", operands: [{ id: "<shell>" }], params: { axis: "z", offsetMm: <outerH − lid depth>, joint: "tongue", clearanceMm: <clearance>, names: ["Base", "Lid"] } }`. `offsetMm` is measured from the shell's bottom face.

The tongue is sized from the wall: a rib down each wall about a third of its thickness wide, so a 2 mm wall takes a 0.53 mm rib (one printed line). Tell the user it is thin and only locates the lid; tape, glue or screws still hold it. If the wall is under 1.5 mm plus twice the clearance, the call is refused, naming that minimum. Then use `joint: "none"` and say the lid sits loose.

## 6. Check your work

1. Call `measure { ids: ["<shell>"] }`. The outer size should be the part's size plus 2 × (clearance + wall) in x and y. In z it should be standoff + the part's height + clearance + 2 × wall.
2. Call `check_clearance { a: "<part>", b: "<shell>" }`. There must be no overlap volume. A gap of 0 is right only where the part rests on its standoffs.
3. Call `check_printability { ids: ["<shell>"] }`. The shell should be watertight, fit the bed, and have no wall under 1.2 mm. Report every warning.
4. Call `get_timeline` and confirm no step is broken. Then call `list_variables`: each of the six sizes should list the part in its `reads`. That is what lets the box follow the part.
5. Tell the user the wall, clearance, standoff and lid depth you used (their numbers, or the defaults), the measured outer size, and which openings you cut.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
