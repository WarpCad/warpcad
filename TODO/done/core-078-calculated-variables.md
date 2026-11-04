---
title: Calculated variables — a small formula language over variables and part sizes, with no eval
category: core
kind: feature
priority: high
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-03 at the owner's request)
depends: []
status: done
---

> **Shipped (2026-11-04), four parts, four commits:** `34a59c5` the formula language (`src/core/formula.js`, no eval, no
> dependency); `7363051` the fold (`var.derive`, both evaluation tiers, the "varies" note, rename, delete and impact);
> `51fb54f` the AI tools (`define_formula`, `set_formula`, `evaluate_formula`, the prompt rule); and Part 4, the
> Variables panel with Insert…, the chip and "varies" notes, `docs/variables.md`, `docs/decisions/formula-language.md`,
> acceptance scenario 33 and scenario 8 step 7. Accepted gaps, recorded in the decision doc: a measuring formula that fails
> only during the fold can still make a load refuse the file when other rows depend on it (matches `var.define`); and a
> printed formula drops redundant parentheses. The `part-default-hidden` e2e flake that appeared with Part 1 is tracked in
> `TODO/FIND-testing-016-part-default-hidden-canvas-same-flakes.md`, not here.

## Goal

**In user terms:** an AI run could not express a calculated value such as
`group1.part1.width - (group1.part2.width / 2)`. A variable can only hold a literal, so the
model has to do the sum itself and write the answer down, and that number is wrong the moment
either part changes. A person has the same problem. The owner's JSCAD projects are full of these
calculations, and this was the known next request when variables shipped
(`docs/decisions/project-variables.md`, "Why no expressions yet").

**Done means:**

1. A project can hold a **formula variable**: a named value calculated from other variables and
   from the measured size and position of bodies and their parts. It is bound to params the same
   way as any variable, with `{ "$var": "name" }`.
2. The owner's example works exactly as written, from the Variables panel and from an AI tool.
   Changing `part1`'s width updates everything bound to the formula, as one Undo step.
3. **Nothing in the path can execute code.** A formula is text in a language this project defines,
   read by a parser and walked by an interpreter. No `eval`, no `new Function`, no new dependency,
   no change to the Content-Security-Policy. A formula from a stranger's file can cost a bounded
   amount of time and produce a number or a named error, and nothing else.

## What the JSCAD projects actually do

Twenty hand-written project files under `~/src/jscad`, tallied 2026-11-03 (`picam3`, `picam-touch`,
`picam-2`, `guide-mount`, `scope-pi`, six `scope-jack2` files, `PiPieceX`, `pvc-joints`,
`window-motor`, `headphone-stand`, `pitablet`, `light-mount`, `drive-wheel`, `bahtinov-mask`).
Libraries, generated `public/` copies and vendored code were left out. Counts include some
commented-out lines, so read them as proportions.

| Call | Count | What it means for this task |
|---|---|---|
| `.snap(` / `.align(` | 486 / 305 | Relations, not arithmetic. WarpCad already has these as ops. **Do not replace them with formulas.** |
| `.enlarge(` / `.stretch(` / `.fit(` | 178 / 61 / 8 | The usual place a computed number lands. `modify.enlarge`'s `delta.*` is already bindable. |
| `util.inch` | 161 | By far the most used helper, so `inch()` is required. |
| `.size()` and `util.size()` | 52 + 13 | **The core need.** Mostly one axis, then `+ - * /`. |
| `calcSnap` | 33 | A distance between two faces. Its source is `w[side][axis] - m[side][axis]`: **a subtraction of two bounds faces**. |
| `getBounds()` / `.centroid()` | 7 / 5 | `centroid` is `min + size / 2`, the centre of the bounds. |
| `util.nearest` | 7 | Wall thickness rounded to a nozzle multiple: `ceil(x / step) * step`. |
| `Math.PI` / `abs` / `cos` / `asin` | 4 / 2 / 1 / 1 | Almost no maths. The `cos` and `asin` are the same commented-out line. |

The vocabulary is therefore **bounds faces on one axis, four operators and a few helpers**. No
hand-written line in the sample needs a loop, an object or a user-defined function in a value
position. Those appear in generators (`gear` tooth curves), which are recipes in WarpCad.

Real lines, each of which must become a fixture in `formula.spec.js`:

| JSCAD | Where | Formula |
|---|---|---|
| owner's example | the request | `group1.part1.width - (group1.part2.width / 2)` |
| `(azsize.y - size.y) / 2` | `guide-mount:444` | `(azmount.depth - plate.depth) / 2` |
| `cutouts.parts.piholes.size().x + 5` | `scope-pi:374` | `cutouts.piholes.width + 5` |
| `cameraCase.parts.caseShell.size().z / 2` | `picam-2:381` | `cameraCase.caseShell.height / 2` |
| `calcSnap(box.parts.top, box.parts['pi-mb'], 'z', 'inside+')[2] * -1 - topBottomThickness / 2` | `picam3:448` | `box.top.max.z - box.[pi-mb].max.z - topBottomThickness / 2` |
| `BPlus.combine('mb,usb1').size().z` | `pitablet:191` | `max(BPlus.mb.max.z, BPlus.usb1.max.z) - min(BPlus.mb.min.z, BPlus.usb1.min.z)` |
| `util.size(deskMount.parts['lowerBolt-head']).z * 2` | `headphone-stand:405` | `deskMount.[lowerBolt-head].height * 2` |
| `lcd.enlarge([0, 0, thickness - lcd.size().z])` | `pitablet:76` | `thickness - lcd.height`, bound to the enlarge row's `delta.2`: a step reading **its own** body |
| `util.nearest.over(2.5, 0.2)` | `scope-jack2/thrustAssembly` | `ceilTo(2.5, 0.2)` |
| `util.inch(3 / 8)` | throughout | `inch(3 / 8)` |
| `Math.abs(splitPoint[2])` | `picam-touch:1056` | `abs(...)` |
| `0.6 * 9`, `nozzel * 3` | `picam3:129`, `scope-pi:62` | as written |

Two facts from these lines drive the design:

- **Hidden parts must be readable.** `cameraCase.parts.interiorVolume` is added hidden and measured
  on the next line (`picam-2:292`). Hidden cut volumes are often the thing being measured.
- **Part names contain hyphens** (`pi-mb`, `lowerBolt-head`, `camera-board`), so a dotted path
  needs a quoted form, or `a-b` could not mean subtraction.

## Design

### The record

A new op, `var.derive`, as the decision doc planned. A build that predates this task already skips
an unknown `var.*` record with a named warning and leaves its bindings broken, so its file still
opens.

```json
{ "id": "var-a1-7", "op": "var.derive",
  "params": { "name": "overhang", "formula": "#cube-a1-3.width - (#cube-a1-4.width / 2)", "unit": "mm" } }
```

- Params: `name`, `formula`, and optional `label`, `unit`, `min`, `max`, with the same rules as a
  `number` variable. **Nothing computed is stored**: no `value`, no parsed tree. A value in the file
  could disagree with the formula, and a tree in the file would be a second hostile surface.
- It shares one namespace with `var.define` (first definition of a name wins) and counts against
  `maxVariables`.
- Same refusals as `var.define`: no `supersedes`, `consumes`, `target`, `operands`, `when` or `name`.
- **A formula never sits in a param slot.** `{ "$var": "x" }` stays the only binding form, so the
  rule that params are never code holds, and every op, recipe and user part keeps working without
  knowing about formulas. `resolveRecord` remains the one resolution point.
- **Result is a number, always.** So a formula cannot bind an enum slot (`slotProblem` already
  refuses it) and cannot be a `when` condition. A measured value therefore can never switch off the
  part it measures, and `condition.js` does not change.

### The language

No reserved words. `pi` and `true` are legal variable names today, and `pi` is a very likely body
name in these projects, so anything built in is **call syntax** (`pi()`). A bare name is a variable,
a name followed by `(` is a function, and a dotted path is a part reference. These cannot collide,
and no existing file changes meaning.

```
formula   := or
or        := and ( '||' and )*
and       := compare ( '&&' compare )*
compare   := sum ( ( '==' | '!=' | '<' | '<=' | '>' | '>=' ) sum )?      no chaining
sum       := product ( ( '+' | '-' ) product )*
product   := unary ( ( '*' | '/' ) unary )*
unary     := ( '-' | '+' | '!' ) unary | primary
primary   := NUMBER | STRING | call | reference | name | '(' or ')'
call      := IDENT '(' ( or ( ',' or )* )? ')'
reference := body ( '.' part )? '.' quantity
body      := IDENT | BRACKET | '#' ID
part      := IDENT | BRACKET
quantity  := 'width' | 'depth' | 'height'
           | ( 'size' | 'min' | 'max' | 'center' ) '.' ( 'x' | 'y' | 'z' )
name      := IDENT
```

- `IDENT` is ASCII `[A-Za-z_][A-Za-z0-9_]*`, the variable-name charset, so no look-alike Unicode.
  `BRACKET` is `[any text but ] and control characters]`. `ID` is `[A-Za-z0-9_-]+`.
- **A reference is read from the right.** The trailing quantity is taken first, then at most one
  part, then the body. `a.min.x` is body `a`, quantity `min.x`. `a.min.height` is body `a`, part
  `min`, quantity `height`. `a.[width].height` reaches a part literally named `width`.
- **Quantities are the world-axis bounds**, in millimetres. `width`, `depth` and `height` are X, Y
  and Z extents, the same as `size.x/y/z`. A rotated part's `width` is therefore its extent along
  world X, exactly as JSCAD's `size().x` was. A body with no part is `boundsOf(geometry)`: its
  visible parts, the same number `describe_scene` reports. A named part may be hidden (see above).
- **Values** are number, boolean, and option text (only to compare with a choice variable). Static
  type check at parse: `+` needs numbers, `if` needs a boolean condition and two numbers, the final
  result must be a number, and `piModel == 6` is refused when 6 is not one of its options.
- **Functions** live in one frozen `Map`: `abs`, `min`, `max`, `clamp`, `round`, `floor`, `ceil`,
  `roundTo`, `floorTo`, `ceilTo`, `sqrt`, `pow`, `hypot`, `sin`, `cos`, `tan`, `asin`, `acos`,
  `atan2`, `pi`, `inch`, `if`. Each states its argument count. `if` evaluates only the branch it
  takes, so `if(piModel == 5, pi.fan.height, 0)` is fine on a Pi 4, which has no fan part.
- **Units.** Documents are millimetres, so numbers are plain with no dimensional checking. Trig
  takes and returns **degrees**, the unit the rest of the app uses for angles. `inch()` is the one
  conversion. `unit` on the record only labels the value.
- **Every failure is an error with a name**, never `0`, `NaN` or a substituted literal: division by
  zero, `sqrt(-1)`, `asin(2)`, overflow, a zero `step`. A non-finite result is an error at every
  node, not just at the end. `min`/`max` on the record do not clamp; a value outside them is an error.

A throwaway prototype of this grammar (64 dense lines, not kept, not a starting point) evaluated the
owner's example and the `scope-pi`, `picam-2`, `picam3`, `pitablet`, `headphone-stand`, `inch`,
`ceilTo` and `abs` lines against a fake scene, refused 31 hostile strings by name, and took 200,000
fuzzed strings with no exception other than its own formula error. It had no static type check, no
caps beyond length, nodes and depth, and no fold integration, so it tested the grammar and nothing
else. Expect the real module to be roughly 400-500 lines with JSDoc and that check.

### What is stored, and what is shown

The file holds **body ids**: `#cube-a1-3.width`. People and agents read and type **names**:
`Base.width`, `[Cube 1].width`. One AST printer goes both ways, and rewrites are never done on text.

| | Names in the file | **Ids in the file (chosen)** |
|---|---|---|
| Rename a body | rewrite every formula in one batch | free |
| Second body named `Screw` (duplicates are legal, `naming.js`) | **breaks an unrelated formula when someone adds a part** | no effect |
| Two copies merged, one renamed the body | formula from the other copy dangles | still resolves |
| Reading the raw file | nicer | fine: `#cube-a1-3.width` |

Variables stay **by name**, as bindings do, because a person chose that name and `renameVariable`
already has a rewrite batch to extend. This matches the precedent on both sides: records name bodies
by id (`target`, `operands`, `when.ref`) and variables by name.

- `formulaToStored(text, lookup)` runs at the command layer. A name matching two bodies is refused
  and lists them: *"Two bodies are named Screw (screw-a1-2, screw-a1-5): use #screw-a1-2 to choose
  one."* A non-root id is normalised to its lineage root with `rootOf`, so an id from
  `describe_scene` always works.
- `formulaToDisplay(stored, lookup)` prints current names, quoted only where needed, and falls back
  to `#id` for a body that no longer exists or whose name contains `]`.
- A body whose id does not fit `ID` (only a hand-edited or hostile file can hold one) cannot be
  referenced, and the command layer says so by name.
- Part names remain text. A part a variant does not have is a named error at fold time listing the
  parts it does have.

### When a part is read: at the consumer's row

This is the central decision. Variables today are read from the log before the fold, and "a variable
never depends on a record" is what rules out cycles. Part reads end that, so a rule has to replace it.

**A formula has no row of its own. It is evaluated at each row that binds it, against the bodies as
they stand just above that row.** That is what a JSCAD line does: `head.size().z * 2` reads `head`
when the line runs. A row can only read rows above it, so **a geometric cycle cannot be written**,
and no dependency graph over geometry is needed.

| Option | Verdict |
|---|---|
| **Evaluate at the consumer's row** | **Chosen.** Place C, write a formula, bind C all just works. A later step can read its own body, the `pitablet:76` case. Fits the linear timeline. |
| The formula's own row in the log (what [Onshape does](https://cad.onshape.com/help/Content/variable.htm): "variables are features... placement in the Feature list is important") | Rejected. The most common order, *place C, then write the formula, then bind C*, would be a forward reference until someone reorders rows, and reading your own height needs an extra row in the middle of the lineage. |
| Always the end of the log, as a spreadsheet would | Rejected. Needs a dependency graph over lineages, a reordered fold and cycle detection, and gives up CLAUDE.md's linear timeline for one feature. |
| Fold twice, measuring on the first pass | Rejected. Geometry would depend on a stale copy of itself, and no bound says it converges. |

Rules that follow, all enforced in the fold:

- **Plain tier.** A formula that (transitively) reads no part is evaluated once in `readVariables`,
  topologically, independent of position, exactly like a `var.define`. Formula-to-formula cycles are
  found here and reported by naming the loop: *"a → b → a"*.
- **Measuring tier.** A formula that reads a part, directly or through another formula, is resolved
  in step 4 of `foldActiveRows` by a `read(rootId, part, quantity)` function handed to `resolveRecord`.
  Build that reader on `foldView()` (`document.js`), which `pattern.repeat` already uses: `stateOf`,
  `valueOf` and `terminalByRoot` give exactly "this lineage as of this row".
- **Reading what is not built yet** is a broken row: *"C's size[0] reads Base, which is not built
  until step 7."* A body reading itself while being created gets the same message. `bindParam`
  refuses it up front with that reason, and the bind list shows it instead of binding.
- **Reading a consumed body works, and reads that body.** A cutter that went into a Subtract keeps
  its last geometry (`scene.byId` retains it), as a JSCAD constant would. `stateOf` distinguishes
  this from a delete. **Do not resolve the reference with `currentIdOf`:** it deliberately walks
  through a retired root to the boolean's result, so `cutter.width` would silently measure the wrong
  solid. Use `terminalByRoot`, as `foldView().valueOf` does, and pin this with a test.
- **Reading a deleted body is an error**, wherever the delete sits in the active log, matching
  `pattern.repeat`'s decision 8 (`foldDeletedRoots`). A suppressed body, or one its condition has
  left out, is an error naming that reason.
- **The memo key is the value.** `resolveRecord`'s memo must key on each formula's computed number,
  not its text. Then an unchanged value hands back the same resolved object, and `core-031`'s
  identity-keyed fold cache still hits.
- **A repeat cannot replay a measuring binding (v1).** `evaluateRepeat`'s `resolve` has no row to
  read from, and a member quietly measuring something different from its source is the wrong-geometry
  class. A repeated step bound to a measuring formula is refused by name. Plain-tier formulas work.

### Reading before a later change must be visible

Row order has one consequence a person will not expect. If C reads `Base.max.z` and Base is then
moved by a **later** row, C keeps the old value. An [Onshape forum answer](https://forum.onshape.com/discussion/comment/99748)
describes the same behaviour for Measure Value, so this is not unusual in history-based CAD. (That
link came from a search summary; re-read it before quoting it in the decision doc.) Silent would be
the "wrong geometry, no error" class, so here it is **reported, not silent**:

- After the fold, compare the value each measuring binding used with the formula's value at the end
  of the active log. **Only a real difference counts**: moving Base changes `Base.max.z` but not
  `Base.width`, and the second stays quiet.
- A difference shows on the chip and in the formula's row: *"Reads Base before step 12 moved it (uses
  34 mm, now 41 mm)."* `list_variables` returns it as `varies: [{ recordId, valueMm, atStep }]`.
- An Inspector parameter edit on an earlier row re-folds through `paramEdit`'s replace path, so it
  follows with no note. That is the normal parametric path.

The panel shows a formula's end-of-log value. **The chip shows the value that row actually used**,
which needs a new `boundValuesOf(recordId)` read from the fold. `inspector.js` must not re-derive it
with `resolveParams`.

### Security

The threat is a project from a stranger: a gist link, a share link, a merged copy, or an AI that was
talked into something. Scenario 8 is the standing test. The design is **no capability to remove**,
rather than a sandbox around one.

1. **No code path from text to execution.** Tokeniser → parser → an AST built only by that parser →
   an interpreter that is one `switch` on node type. No `eval`, `Function`, `setTimeout(string)`,
   dynamic `import()` or compile-to-JS step. Production CSP stays `script-src 'self'` with no
   `unsafe-eval`, so any later slip fails loudly rather than working quietly.
2. **No objects in the language.** A value is a number, boolean or short string, never an object, so
   there is nothing for `constructor` or `__proto__` to walk. `a.b.c` is not property access: it is
   parsed into `{ body, part, quantity }` and passed to one function. This removes the bug class
   behind the expression-library advisories below, which is why it is not a denylist.
3. **Names reach data only through `Map`s and `Object.hasOwn`.** Functions, quantities and variables
   are `Map`s. Never `Math[name]`, never `table[name]`. A part goes through
   `Object.hasOwn(group.parts, name)`, the pattern `group.js` already uses. `#__proto__.width` and
   `box.[__proto__].width` are ordinary "no such body/part" errors.
4. **The evaluator is handed everything it can see.** `src/core/formula.js` imports nothing but its
   own constants and receives `read` and a variable table as arguments. It has no reference to the
   document, kernel, storage, tokens, network, DOM or globals. This is the same guarantee
   `src/ai/tools/limits.js` relies on: what a tool may do is defined by what it is given. It also
   makes it trivially testable in plain Node, per CLAUDE.md.
5. **It cannot loop.** No loops, recursion, assignment or user functions. Each evaluation visits each
   node once. Formula-to-formula references are a DAG, checked before anything runs.
6. **The cost is capped in code, and the total is capped too.** `FORMULA_LIMITS`:

   | Cap | Value | Stops |
   |---|---|---|
   | `maxLength` | 1,000 characters | megabyte strings |
   | `maxNodes` | 256 per formula | oversized trees |
   | `maxDepth` | 32 | stack overflow from `((((` or `----` |
   | `maxArgs` | 16 | |
   | `maxChainDepth` | 32 formula-to-formula | stack overflow across formulas |
   | `maxPartReads` | 32 per formula | |
   | `maxNodeVisitsPerFold` | 1,000,000 | **the worst case**: 10,000 bindings each reaching long formula chains |

   Past the last cap, remaining formula consumers load broken with one named warning, as
   `maxBindingsPerDocument` does. Fold time added by formulas is therefore bounded by a constant,
   whatever the file says. Doubling (`a1 = a0 + a0`, repeated) costs linear time because results are
   memoised within a fold and values are fixed-size numbers, and there is no string concatenation for
   a billion-laughs attack. Tune the numbers against the benchmark, but the budget itself is required.
7. **No regex on untrusted text in the tokeniser.** A character-code loop that is linear by
   construction, so no ReDoS.
8. **A hostile value gets no further than a hostile literal.** A formula's result goes through the
   same `slotProblem` and op validation as a literal or a `var.define`. A formula yielding `1e9` for a
   count-like param must meet the same refusal `1e9` written directly gets. Test this. If the literal
   already hangs, that is a separate finding to file, not something to fix here.
9. **Text stays text.** A formula, a bracketed name and an error message are data at every sink:
   - Vue text interpolation only, never `v-html`.
   - AI tools return them inside `document_data`; `</document_data>` inside `[...]` must stay literal.
   - `gistReadme.js` puts a formula through its existing cell cleaning, as a code span, so a formula
     cannot inject Markdown into a published README.
   - An error quotes a name truncated to 60 characters with control characters stripped.
   - A formula error is not reported to Sentry. It is a user-facing refusal, and a formula is project
     content. Confirm against `src/core/errorReporting.js`'s scrubber.
10. **Deterministic.** No clock, randomness, locale or environment, so one file gives one result on
    every replica, which merge requires. `Math.sin` can differ by a unit in the last place between
    engines. Values are derived and never stored, so this cannot conflict in a merge; it is far below
    geometric tolerance.
11. **The file is re-validated every time.** Whether a formula arrived by load, merge, or an AI fork
    landing, it is re-parsed from text. Nothing trusts an earlier check.

**Guard tests that keep this true** (`formula.spec.js` reads its own source, as `limits.spec.js` does
for tools): `formula.js` has no import beyond its allow-list, and none of `eval`, `Function`,
`import(`, `globalThis`, `window`, `document`, `self`, `fetch`, `Reflect`, `prototype` or
`setTimeout`, and no computed member access on a value from the input. `src/csp.spec.js` asserts that
production `script-src` does not contain `unsafe-eval` (the dev server adds it for e2e only, so the
assertion must read `index.html`, not the dev policy).

### Library decision: write it, add no dependency

Data from `npm view` and `gh api`, 2026-11-03. Copy this to `docs/decisions/formula-language.md`.

| Option | Unpacked | Stars | Open issues | Last push | npm maintainers | Security and fit |
|---|---|---|---|---|---|---|
| **Hand-written** (chosen) | about 500 lines | n/a | n/a | n/a | this project | Grammar and values fit the document. No objects means no property walk. |
| `expr-eval` 2.0.2 | 142 KB | 1,355 | 70 | 2024-08 | 1 | [GHSA-jc85-fpwf-qm7x](https://github.com/advisories/GHSA-jc85-fpwf-qm7x) (CVE-2025-12735): all versions affected, **no patched version on npm**. `toJSFunction` uses `new Function`. |
| `mathjs` 15.2.0 | 9.2 MB | 15,102 | 240 | 2026-11 | 1 | Two high advisories in April 2026 ([GHSA-29qv-4j9f-fjw5](https://github.com/advisories/GHSA-29qv-4j9f-fjw5), GHSA-jvff-x2qm-6286), both patched, plus two critical code-execution advisories in 2017 and prototype pollution in 2021. Well maintained, but its language has objects, property access and function definitions we would have to switch off. |
| `jexl` 2.3.0 | 86 KB | 662 | 47 | 2023-09 | 1 | No `new Function` in its source. Property access on the context is its core feature, the exact surface we want gone. Stale. |
| `filtrex` 3.1.0 | 662 KB | 1,068 | 16 | 2021-03 (`joewalnes/filtrex`; the package was updated 2024-10, so work may have moved) | 2 | Compiles with `new Function` (`src/filtrex.mjs:414`), so it **cannot run under production CSP**. |
| `jsep` 1.6.0 | 381 KB | 969 | 51 | 2026-10 | 3 | Parser only, no eval. **Closest runner-up.** But its grammar is JavaScript's: `#id-1` and `[Cube 1]` need plugins, and we would still write the interpreter, resolver, printer, type check and caps. It saves the easiest 100 lines and adds a dependency. |

**Rejection summary:** `expr-eval` is unpatched. `mathjs` is large, with a much larger language than
we want exposed. `jexl` makes property access the feature. `filtrex` fails CSP. `jsep` saves too
little. A hand-written parser has its own risk of bugs, which the caps, seeded fuzz test and guard
tests below exist to catch.

### Everywhere else a variable is touched

- `src/core/variables.js`: `variableRecordError` dispatch; `readVariables` adds the plain tier and
  marks measuring formulas; a formula with a problem **stays in the table with its `error`**, so a
  binding says *"bound to overhang, whose formula can't be used: …"*, not "not defined".
  `resolveRecord` takes `read`. New: `defineFormula`, `setFormula`, `bindParamToNewFormula`,
  `formulaReadsOf`.
- `consumersOf` gains kind `formula`. `variableImpactOf` follows consumers **transitively**: changing
  `wall` reaches whatever binds a formula that reads `wall`. The "used by N" count and blast-radius
  line follow.
- `renameVariable` rewrites formula ASTs in the same batch, including suppressed rows. `deleteVariable`
  with `keepValues` replaces the reference with its current value as a literal in the formula; without
  it, `VariableInUseError` lists the formula. Deleting a formula with `keepValues` turns its bindings
  into literals, as today.
- `setVariable` on a formula is refused, naming `setFormula`.
- **Do not add formula reads to `referencedIdsOf`.** Its row-order checks refuse forward references
  and would pre-empt the named errors above. Body deletion instead asks `formulaReadsOf` and lists the
  affected formulas in the existing dependents path.
- `document.js` (lines 2651, 3414, 3936), `replay.js:118` and `project.js:435` route `var.derive` where
  they route `var.define`. Check every `VARIABLE_OP` hit; there are a dozen.
- `project.js` load: a malformed or over-cap formula is a named `LoadWarning`, never a refused file,
  never a hang (`core-037`'s posture).
- `timelineLabel.js`: `Calculate overhang`.
- `gistReadme.js`: the Variables table gains the formula.
- `readVariables` runs before the fold, so it cannot know a measuring formula's value. `variablesOf(document)`
  fills those in from the last fold's end-of-log values. `libraryDefaults.js`, `condition.js`,
  `dependents.js`, `useParamCommands.js`, `useGistPublish.js` and `inspector.js` read through it. That
  is right for labels and defaults, but check each one against the chip rule above.
- **Save as part**: check what a saved user part does with a `$var` binding today and do the same, with
  a measuring formula's used value becoming a literal. Say which in the decision doc.
- **Merge** (`src/core/merge`) handles this as records, with no new code. Test it rather than assume it.

### AI tools (the failure that prompted this)

Thin wrappers in `src/ai/tools/variables.js`, no logic of their own, on all transports:

| Tool | Kind | Notes |
|---|---|---|
| `define_formula` | write | `{ name, formula, label?, unit?, min?, max?, rationale? }`. Takes names or `#ids`. Returns the value, the stored form and what it reads. Charged one record, like `define_variable`. |
| `set_formula` | write | `{ name, formula }`. Runs the impact check first; writes nothing and returns `breakages` if it would break a dependent, as `set_variable` does. Bounded by the step cap. |
| `evaluate_formula` | read | `{ formula, at? }`. **Calculates without writing**: value, reads, or the named error. `at` is a record id to read as of that row. So a model can check a sum before committing to it. |

`list_variables` adds `formula` (display form), `reads`, `error` and `varies`. `rename_variable`,
`delete_variable` and `bind_param` work unchanged on a formula; `set_variable` refuses with a pointer
to `set_formula`. `var.derive` is not in the kernel registry, so `create`, `apply_records` and
`list_ops` never see it.

`src/ai/prompt.js` gets one rule: *if a dimension depends on another part, define a formula and bind
to it. Do not work out the number and write it down, because it will be wrong as soon as that part
changes.* Also update `docs/agent-prompting.md`, and regenerate the generated tool reference
(`docs-029`).

### Out of scope, so nobody adds it silently

- **Inline formulas in a param slot** (`{ "$expr": ... }`). Named only for v1. If it is wanted, typing
  `=...` in a field can create the named variable; that changes no file format.
- Boolean or choice results, and formulas in `when`.
- Volume, mass, or distance-between-bodies. These need a union or a mesh query, so they do not fit
  in a fold.
- Reading another body's **params** (`{ ref, param }` style), and unit-carrying literals (`3/8 in`).
- `transform.rotate` and `rotation` stay unbindable, for the existing reason.

## Interaction model

**The AI tools above are half of this task; the panel is the other half.** Control names are new
unless marked.

- **Precondition:** none to create a formula; variables belong to the project. To bind, a field must
  be bindable (`bindableParams`, unchanged) and a row must be below everything the formula reads.
- **Trigger:**
  - Variables section (`inspector-variables`, existing), **+**: the kind list gains **Formula**,
    showing a name and a formula box (`variable-formula-input`) in place of the value.
  - **Insert…** (`variable-formula-insert`) beside the box: a list of bodies, then their parts
    including hidden ones, then the quantity, inserted at the caret. Nobody has to know the syntax or
    type brackets on a phone.
  - A formula's row: the value is read-only, with the formula as text below (`variable-formula-<name>`).
    Tapping the text edits it. **⋯** has Rename and Delete as usual.
  - The bind list on a field (`param-bind-*`, existing) offers formulas beside other variables, plus
    **New formula from this value…** (`param-bind-new-formula`), which opens the form seeded with the
    field's current number.
- **Feedback:**
  - While typing: a preview line (`variable-formula-preview`) shows `= 40 mm` or the named error, with
    the character position for a syntax error. Create and Save stay disabled during an error.
  - After saving: the row shows its value, and bound fields become chips as today.
  - When a measured part changes: the value and chips update, and the blast-radius line says so:
    *overhang 40 mm → 60 mm — 1 parameter on 1 part changed*.
  - A reading taken before a later change shows the note from "Reading before a later change".
  - A broken formula is a row saying why, in the panel and in History.
- **Placement:** n/a; a formula creates no geometry.
- **Selection response:** n/a to create. Selecting a body with a bound field shows the chip, carrying
  the value that row used.
- **Selection count:** n/a. Insert… lists bodies regardless of selection.
- **Undo:** create, edit, rename and delete are each **one** Undo step. New formula from this value is
  one step for both the formula and its binding (`bindParamToNewVariable`'s shape). `ai`/`mcp` writes
  land in Undo AI turn, never on the user's stack.
- **Small-screen behavior:** the form lives in the existing **Variables** tab of the bottom sheet. The
  formula box is full width and at least 44 px tall. Insert… opens as a bottom sheet like the bind list,
  not a hover menu. The 3D view stays visible behind the sheet as it does today. No horizontal scrolling
  of primary UI at 390 px: a long formula wraps in the row.

## Documentation

- **Page:** `docs/variables.md`, a new **Formulas** section. Update "What cannot be bound" if needed.
  `docs/agent-prompting.md`, `docs/mcp.md` and `docs/ai-partner.md` gain the three tools.
- **Example (verbatim):**
  1. Drag in a Cube and name it `Base`. Set **Size X** to `60`. Drag in a second Cube and name it `Lid`;
     leave **Size X** at `40`.
  2. With nothing selected, open **Variables**, press **+** and choose **Formula**. Name it `overhang`.
  3. Type `Base.width - (Lid.width / 2)`. The line below the box reads **= 40 mm**. Press **Create**.
  4. Drag in a third Cube. Press the link button beside **Size X** and choose `overhang`. The field
     becomes a chip reading 40.
  5. Select `Base` and change **Size X** to `80`. The third cube's Size X becomes 60, and a line says what
     changed. Press **Undo** once and it returns to 40.
- **Also document:** the quantity table (`width`/`depth`/`height` are world X/Y/Z, Z-up, millimetres;
  a rotated part's width is its world X extent); brackets for names with spaces or hyphens; the function
  list; degrees for trig; `inch()`; that a formula reads a part **as it stands just above the step using
  it**, and what the note means; a "from JSCAD" table (`.size().z` → `.height`, `calcSnap` → a subtraction
  of two faces, `util.inch` → `inch`, `nearest.over` → `ceilTo`).
- **Media:** in `e2e/docs/variables.docs.js`, shots `docs/screenshots/variable-formula-editor.png` (preview
  showing a value) and `docs/screenshots/variable-formula-error.png` (a named error), both embedded in
  `docs/variables.md`. No movie. If one is added later, encode it through a scoped `moviesDir`: `docs:gifs`
  rewrites every GIF.

## Affected files

New:

- `src/core/formula.js` (+ `formula.spec.js`): tokeniser, parser, static check, interpreter, printer,
  `FORMULA_LIMITS`, `FormulaError`. Pure, no imports beyond its allow-list.
- `docs/decisions/formula-language.md`: the language, the row decision, the security model, the library
  table above.
- `e2e/formula.e2e.js`
- `e2e/fixtures/hostile-formula.ndjson`

Changed:

- `src/core/variables.js` (+ `variables.spec.js`, which also holds the fold cases), `src/core/document.js`, `src/core/dependents.js`,
  `src/core/replay.js`, `src/core/project.js`, `src/core/timelineLabel.js`, `src/core/gistReadme.js`,
  `src/core/inspector.js`, `src/core/kernel/measure.js` (a memoised part-bounds read)
- `src/ai/tools/variables.js` (+ spec), `src/ai/tools/index.js`, `src/ai/tools/limits.js`, `src/ai/prompt.js`
- `src/composables/useVariableCommands.js`, `src/composables/variableEntry.js`
- `src/components/inspector/VariableAddForm.vue`, `VariableRow.vue`, `ParamBindPopover.vue`,
  `ParamBoundChip.vue`, and a new `FormulaInsertList.vue` (a panel over ~30 template lines stays out of
  the parent)
- `src/csp.spec.js`
- `docs/decisions/project-variables.md`: replace "Why no expressions yet" with a pointer; update the jscad1
  table's `const outer = inner + 2 * wall` row and the "a variable never depends on a record" statement,
  which is no longer true for the measuring tier
- `docs/variables.md`, `docs/agent-prompting.md`, `docs/mcp.md`, `docs/ai-partner.md`, `e2e/docs/variables.docs.js`
- `TODO/ACCEPTANCE.md`: new scenario 33 and a new standing step in scenario 8

## Proposed fix

Land in four commits under this one task, each green on its own (the `ui-092, part N` shape):

1. **Part 1, the language.** `src/core/formula.js` and its spec, with the guard tests. No document
   integration. This part alone should prove the security claims.
2. **Part 2, the fold.** `var.derive`, both tiers, the row rule, the "varies" report, load warnings, and
   rename/delete/impact. Run the benchmark here.
3. **Part 3, the AI tools.** Shipped before the panel, because this is the reported failure.
4. **Part 4, the panel,** with e2e, docs, media and the acceptance scenario.

Do not mark the task done after Part 3. The UI gate still applies.

## Effort

L (multi-session). It is one suggestion, but large; split at the part boundaries if the batch runner needs it.

## Testing

**Unit, the language** (`formula.spec.js`, plain Node, no kernel). Tolerance 1e-9 for pure arithmetic.

- Every real line in the JSCAD table above, against a fake `read`, with hand-worked values.
- Precedence and associativity table: `2+3*4`, `(2+3)*4`, `10-2-3`, `2*-3`, `-a.width/2`, `!a && b`.
- Reference reading from the right: `a.width`, `a.b.width`, `a.min.x`, `a.min.height`, `a.[width].height`,
  `[Cube 1].size.x`, `#cube-a1-3.width`, `#a-1.x` refused (no such quantity). A variable named `pi`, a body
  named `pi` and `pi()` all in one formula.
- `if` evaluates only the branch taken, so a missing part in the other branch is not an error.
- Printer round trip: `print(parse(x))` is stable. Name-to-id and id-to-name round trips, including names
  with spaces, `]`-free brackets and a deleted body. Refused and listed: a duplicate name.
- Degenerate: division by zero, `sqrt(-1)`, `asin(2)`, `1e400`, `ceilTo(1, 0)`, overflow in a middle node
  later divided away, `-0`, empty formula, whitespace only, non-string `formula`.
- **Hostile, each one a `FormulaError` and nothing else:** `constructor.constructor("return this")()`,
  `__proto__.width`, `[__proto__].[__proto__].width`, `#__proto__.width`, `box.constructor.width`,
  `alert(1)`, `fetch("x")`, `import("x")`, `window.location`, `this`, `globalThis.x.y`, a backtick string,
  `a=1`, `a;b`, `function(){}`, `()=>1`, `1;while(1);`, a 1 MB string, 100,000 `(`, 100,000 `-`, a
  1,000-digit number, a lookalike Unicode identifier, a right-to-left override in a bracket,
  `</document_data>` and `<img onerror=...>` in a bracket. Afterwards `Object.prototype` is unchanged.
- **Seeded fuzz:** a fixed-seed PRNG over a token list, 100,000 strings (no new dependency; `fast-check` is
  not in the project). Never a throw other than `FormulaError`, and a stated wall-clock ceiling.
- Guard tests from Security, above.

**Unit, the fold** (kernel worker mocked; tolerance 1e-6 mm for geometry):

- **The owner's example end to end:** two parts in a group, one formula, one bound param. Edit `part1`'s width
  through the replace path: the consumer follows, one Undo restores it.
- Row rule: place C, then define, then bind (works). Forward read (named, bind refused). Self-read at creation
  (named). Self-read on a later enlarge row (works, the `pitablet:76` case). A `moveStep` that turns a
  good read into a forward read (named broken row, no crash).
- Read a hidden part, a consumed cutter, a rotated part (world extent), a zero-size body, an empty sketch. A
  deleted body, a suppressed body, a condition-skipped body, and a part a variant lost: each a named error. A
  rollback marker above the consumer.
- "Varies": a later move reports `max.z` and does not report `width`. An upstream param edit reports nothing.
- Cycles `a→a`, `a→b→a`, and through three formulas, named. Chain past `maxChainDepth`. Doubling across 500
  formulas finishes in linear time. 10,000 bindings past `maxNodeVisitsPerFold` give one named warning.
- `core-031`: an unrelated edit leaves a bound record's resolved object identical (fold cache hit), asserted the
  way `foldReuse.spec.js` asserts it.
- Repeat: a plain-tier formula works; a measuring binding in a repeated lineage is refused by name.
- Rename a variable and a body, and delete with and without `keepValues`, including suppressed rows. Each is one
  Undo step. Transitive impact check: shrinking `wall` so that a formula-bound dependent breaks reports it by
  name before commit.
- Load and merge: the raw line round-trips byte-identically. A formula added on one copy, the body renamed on the
  other: still resolves after `mergeIn`. Same-name formula and `var.define` on two copies: first wins, named
  warning. An AI fork landing re-validates.
- Unknown `var.*` skip still works, so a file with a future op opens.
- A count-like param bound to a formula yielding `1e9` gets the same outcome as the literal.

**Unit, the tools:** happy path and refusal for each tool, `toStrictWire` conformance, origin `ai`/`mcp`, `evaluate_formula`
writes nothing, `set_variable` on a formula refused, an over-cap call refused, the motivating sequence ending in one Undo AI
turn. MCP over the in-memory client; WebMCP shape via `toolShape`.

**End to end:** `e2e/formula.e2e.js` navigates to `/` and runs the Documentation example with real input: create by typing
and by **Insert…**, the error preview, bind, change, Undo, save, reload, chip still present. **All three viewports with a
snapshot at each** (the form and Insert… reflow at phone width). **All three engines**, because the flow ends in the
IndexedDB and save/load path and the viewport rebuild. `e2e/csp.e2e.js` re-run on all three.

**Performance** (`.claude/prompts/perf-benchmark.md`, `bench/fold-benchmark.mjs`, before and after):

- A project with no formula: unchanged within noise, since the path is gated on `usesVars`.
- The 24-body scene with 50 measuring bindings: report the added fold time.
- The hostile worst case at the budget: report it, and tune `maxNodeVisitsPerFold` if it is not small next to a normal
  re-fold (70-163 ms in `core-029`). A body-level read of a group with holes goes through `toGeom3`'s union, so memoise
  by geometry object, and report this case separately. **If it is too slow, stop and decide; do not hide it.**

**Acceptance scenarios to re-drive**, live with the `run` skill, reporting PASS/FAIL:

- **New scenario 33, "Calculate a size from two parts":** the Documentation example, then a later gizmo move of `Base`
  (`width` stays quiet) and a formula on `Base.max.z` (the note appears), then save and reload. This is a new capability
  class, so it earns a scenario.
- **Scenario 8, new standing step 7:** open `e2e/fixtures/hostile-formula.ndjson` through **File ▾ → Open…**, covering the
  hostile list above plus a `__proto__` variable name, a formula cycle and an over-cap chain. Expect: the file opens, each
  problem named, the rest of the project intact, `window.__pwned` undefined, zero dialogs, zero off-origin requests,
  console clean.
- Also **8** (existing steps), **10**, **12**, **15** (change a part's model under a dependent, now with a part read), **21**,
  **22**, **24**, **25**, and **29** or **30** (a formula survives a share link).

**Closed findings that are standing regression surfaces here,** re-run their original repros: `data-007` (resize with a
snapped dependent, through a formula), `ui-052` (composite edit with dependent repair), `ui-044` and `core-050` (one Undo
step), `core-031` (fold cache identity), `ai-014` (landing by diff), `ai-002` (a batch is atomic), and `core-061` (repeat
resolution).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
