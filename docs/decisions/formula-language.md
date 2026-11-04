# Formula language: calculated variables with no eval

**Status:** accepted 2026-11-04 (`TODO/FIND-core-078`, Parts 1-4). Supersedes "Why no expressions
yet" in [`project-variables.md`](project-variables.md).

## The decision in one paragraph

A project can hold a **formula variable**, a `var.derive` record whose `formula` is text in a small
language this project defines: four operators, comparisons, a fixed list of functions, other
variables by name, and the measured world-axis bounds of a body or one of its parts
(`Base.width`, `box.[pi-mb].max.z`). It is read by a hand-written tokeniser and parser and walked
by an interpreter that is one `switch` on node type (`src/core/formula.js`). There is no `eval`,
no `Function`, no new dependency and no change to the Content-Security-Policy. A field binds a
formula with the same `{ "$var": "name" }` as any variable, so no op, recipe or user part has to
know formulas exist. A formula that reads a part is worked out **at each row that binds it**, from
the bodies as they stand just above that row. Its result is always a number. Every failure is an
error with a name; there is no fallback to `0`.

## Why: what the JSCAD projects actually do

Twenty hand-written JSCAD projects (`~/src/jscad`, tallied 2026-11-03) use `.size()` on one axis
followed by `+ - * /` (65 calls), `util.inch` (161), a subtraction of two bounds faces through
`calcSnap` (33), `centroid` (5), and `util.nearest` rounding to a nozzle multiple (7). Almost no
other maths. `.snap()` and `.align()` (791 calls) are relations, and WarpCad already has them as
ops; formulas do not replace them. So the vocabulary is **bounds faces on one axis, four operators
and a few helpers**, plus two facts the lines forced: hidden parts must be readable (a hidden cut
volume is often what is measured), and part names contain hyphens, so a quoted form is needed.

## The language

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

- **No reserved words.** `pi` and `true` were already legal variable names, and `pi` is a likely
  body name. Anything built in is call syntax (`pi()`). A bare name is a variable, a name followed
  by `(` is a function, a dotted path is a part reference. These cannot collide, so no existing
  file changes meaning.
- `IDENT` is ASCII `[A-Za-z_][A-Za-z0-9_]*`, so there are no look-alike Unicode names. `BRACKET` is
  any text but `]` and control characters. `ID` is `[A-Za-z0-9_-]+`.
- **A reference is read from the right**: the quantity first, then at most one part, then the body.
  `a.min.x` is body `a`, quantity `min.x`; `a.min.height` is body `a`, part `min`;
  `a.[width].height` reaches a part literally named `width`.
- **Quantities are world-axis bounds, in millimetres.** `width`/`depth`/`height` are the X/Y/Z
  extents. A rotated part's `width` is its extent along world X, exactly as JSCAD's `size().x` was.
  A body with no part is measured on its visible parts, the number `describe_scene` reports. A named
  part may be hidden.
- **Values** are a number, a boolean, or a short option text (only to compare with a choice
  variable). A static type check at parse refuses `+` on a non-number, an `if` without a boolean
  test, a non-number result, and `piModel == 6` when 6 is not an option.
- **Functions**, in one frozen `Map`, each with its argument count: `abs`, `min`, `max`, `clamp`,
  `round`, `floor`, `ceil`, `roundTo`, `floorTo`, `ceilTo`, `sqrt`, `pow`, `hypot`, `sin`, `cos`,
  `tan`, `asin`, `acos`, `atan2`, `pi`, `inch`, `if`. `if` evaluates only the branch it takes.
- **Units.** Numbers are plain millimetres with no dimensional checking. Trigonometry takes and
  returns **degrees**, the unit the rest of the app uses. `inch()` is the one conversion. A
  record's `unit` only labels the value.
- **Every failure is named**: division by zero, `sqrt(-1)`, `asin(2)`, overflow (a non-finite value
  at any node, not only at the end), a zero `step`, a value outside the record's own `min`/`max`
  (which never clamp).
- **Canonical printing.** One printer turns a tree back into text, with canonical spacing and the
  fewest parentheses that keep the same tree. `printFormula(parseFormula(x))` is stable. So the
  panel shows `Base.width - (Lid.width / 2)` as `Base.width - Lid.width / 2` after it is saved. This
  is accepted: rewrites (renames, keep-values deletes, name/id swaps) always go through the tree,
  never through text, and one printer is simpler and safer than preserving a person's spacing.

## What is stored: body ids, shown as names

The file holds `#cube-a1-3.width`; people and agents type and read `Base.width`. One AST printer
goes both ways (`formulaToStored`, `formulaToDisplay`).

| | Names in the file | **Ids in the file (chosen)** |
|---|---|---|
| Rename a body | rewrite every formula in one batch | free |
| A second body named `Screw` (duplicates are legal) | breaks an unrelated formula when someone adds a part | no effect |
| Two copies merged, one renamed the body | the other copy's formula dangles | still resolves |
| Reading the raw file | nicer | fine |

Variables stay **by name**, as bindings do, and `renameVariable` rewrites formula trees in the same
batch. A typed name matching two bodies is refused and lists both (*Two bodies are named Screw
(screw-a1-2, screw-a1-5): use #screw-a1-2 to choose one.*). A non-root id is normalised to its
lineage root. **Nothing computed is stored**: no value, no parsed tree. A stored value could
disagree with the formula, and a stored tree would be a second hostile surface.

## When a part is read: at the consumer's row

Variables used to be read before the fold, and "a variable never depends on a record" ruled out
cycles. Part reads end that, so a rule replaces it.

| Option | Verdict |
|---|---|
| **Evaluate at the consumer's row** | **Chosen.** Place C, write a formula, bind C: it works. A later step can read its own body (`pitablet:76`, `lcd.enlarge([0, 0, thickness - lcd.size().z])`). It fits the linear timeline. A row reads only rows above it, so **a geometric cycle cannot be written** and no dependency graph over geometry is needed. |
| The formula's own row in the log (Onshape's model: [variables are features](https://cad.onshape.com/help/Content/variable.htm), so their place in the list matters) | Rejected. The most common order (place C, then write the formula, then bind C) would be a forward reference until rows were reordered, and reading your own height needs an extra row mid-lineage. |
| Always the end of the log, as a spreadsheet would | Rejected. Needs a dependency graph over lineages, a reordered fold and cycle detection, and gives up CLAUDE.md's linear timeline for one feature. |
| Fold twice, measuring on the first pass | Rejected. Geometry would depend on a stale copy of itself, with no bound on convergence. |

Rules, all enforced in the fold (`src/core/variables.js`, `src/core/formulaRead.js`):

- **Plain tier**: a formula that reads no part, directly or through another formula, is worked out
  once in `readVariables`, in dependency order, wherever it sits. Formula loops are named (*a → b →
  a*).
- **Measuring tier**: resolved per row by a reader built on `foldView()`. Reading a body not built
  until later is a named broken row (*reads Base, which is not built until step 7*), and `bindParam`
  refuses it up front with the same reason.
- **A consumed body reads its last geometry** through `terminalByRoot`, never `currentIdOf` (which
  would walk through to the boolean's result and silently measure the wrong solid). A deleted,
  suppressed or condition-skipped body is a named error.
- **The memo key is the value**, so an unchanged value hands back the same resolved object and
  `core-031`'s identity-keyed fold cache still hits.
- **A repeat cannot replay a measuring binding (v1)**: it has no row to read from. It is refused by
  name; plain-tier formulas work.
- **Reading before a later change is reported, not silent.** After the fold, each measuring binding's
  value is compared with the formula's value at the end of the active log. Only a real difference
  counts (moving Base changes `Base.max.z`, not `Base.width`). The chip and the formula's row show
  *Reads Base before step 12 (Move Base) changed it (uses 34 mm, now 41 mm)*; `list_variables` returns
  it as `varies`. An Inspector edit on an earlier row re-folds through the replace path, so it follows
  with no note. **The chip shows the value its row used** (`document.boundValuesOf`), never one
  re-derived in `inspector.js`.

## Security model

The threat is a project from a stranger: a gist, a share link, a merged copy, or an AI that was
talked into something. `TODO/ACCEPTANCE.md` scenario 8 is the standing test, now with step 7 and
`e2e/fixtures/hostile-formula.ndjson`. The design is **no capability to remove**, not a sandbox
around one.

1. **No code path from text to execution.** Tokeniser → parser → an AST only that parser builds →
   one `switch`. No `eval`, `Function`, `setTimeout(string)`, dynamic `import()` or compile step.
   Production CSP stays `script-src 'self'` with no `unsafe-eval` (`src/csp.spec.js` reads
   `index.html`; `e2e/csp.e2e.js` re-runs on all three engines), so a later slip fails loudly.
2. **No objects in the language.** A value is a number, boolean or short string. `a.b.c` is not
   property access: it is parsed into `{ body, part, quantity }` and handed to one function. This
   removes the bug class behind the expression-library advisories below, so it is not a denylist.
3. **Names reach data only through `Map`s and `Object.hasOwn`.** `#__proto__.width` and
   `box.[__proto__].width` are ordinary "no such body/part" errors.
4. **The evaluator is handed everything it can see.** `formula.js` imports nothing; it receives a
   `read` function and a variable table. It has no reference to the document, kernel, storage,
   tokens, network, DOM or globals, which a guard test checks by reading its source.
5. **It cannot loop.** No loops, recursion, assignment or user functions; formula-to-formula
   references are a DAG, checked before anything runs.
6. **The cost is capped in code, and so is the total** (`FORMULA_LIMITS`): 1,000 characters, 256
   nodes, depth 32, 16 arguments, a chain of 32 formulas, 32 part reads per formula, and 1,000,000
   node visits per fold. Past the last, remaining consumers load broken with one named warning.
   Results are memoised within a fold and values are fixed-size numbers, so doubling chains cost
   linear time and there is no string growth.
7. **No regex on untrusted text in the tokeniser**: a character-code loop, linear by construction.
8. **A hostile value gets no further than a hostile literal.** A formula's result goes through the
   same slot and op validation as a literal.
9. **Text stays text** at every sink: Vue text interpolation only, never `v-html` (the panel, the
   Insert… list, chips, errors); AI tools return formulas inside `document_data`; the gist README
   puts a formula in a code span with backticks removed and pipes escaped (`gistReadme.js`
   `codeCell`); an error quotes a name cut to 60 characters with control and direction characters
   removed. **A formula error is never reported to Sentry**: it is a user-facing refusal and the text
   is project content. Every refusal is caught where it happens (the panel, the tool layer) and shown,
   so none reaches `errorReporting.js`'s `beforeSend`.
10. **Deterministic**: no clock, randomness, locale or environment. `Math.sin` may differ by one ulp
    between engines; values are derived, never stored, so a merge cannot conflict on it.
11. **Re-validated every time.** Load, merge and an AI fork landing all re-parse from text.

## Library decision: write it, add no dependency

Data from `npm view` and `gh api`, 2026-11-03.

| Option | Unpacked | Stars | Open issues | Last push | npm maintainers | Security and fit |
|---|---|---|---|---|---|---|
| **Hand-written** (chosen) | about 1,300 lines with JSDoc | n/a | n/a | n/a | this project | Grammar and values fit the document. No objects means no property walk. |
| `expr-eval` 2.0.2 | 142 KB | 1,355 | 70 | 2024-08 | 1 | [GHSA-jc85-fpwf-qm7x](https://github.com/advisories/GHSA-jc85-fpwf-qm7x) (CVE-2025-12735): all versions affected, **no patched version on npm**. `toJSFunction` uses `new Function`. |
| `mathjs` 15.2.0 | 9.2 MB | 15,102 | 240 | 2026-11 | 1 | Two high advisories in April 2026 ([GHSA-29qv-4j9f-fjw5](https://github.com/advisories/GHSA-29qv-4j9f-fjw5), GHSA-jvff-x2qm-6286), both patched, plus two critical code-execution advisories in 2017 and prototype pollution in 2021. Well maintained, but its language has objects, property access and function definitions we would have to switch off. |
| `jexl` 2.3.0 | 86 KB | 662 | 47 | 2023-09 | 1 | No `new Function`. Property access on the context is its core feature, the exact surface we want gone. Stale. |
| `filtrex` 3.1.0 | 662 KB | 1,068 | 16 | 2021-03 (`joewalnes/filtrex`; the package was updated 2024-10) | 2 | Compiles with `new Function` (`src/filtrex.mjs:414`), so it **cannot run under production CSP**. |
| `jsep` 1.6.0 | 381 KB | 969 | 51 | 2026-10 | 3 | Parser only, no eval. **Closest runner-up.** Its grammar is JavaScript's: `#id-1` and `[Cube 1]` need plugins, and we would still write the interpreter, resolver, printer, type check and caps. It saves the easiest 100 lines and adds a dependency. |

**Rejection summary:** `expr-eval` is unpatched. `mathjs` is large, with a much larger language than
we want exposed. `jexl` makes property access the feature. `filtrex` fails CSP. `jsep` saves too
little. A hand-written parser has its own bug risk, which the caps, the seeded 100,000-string fuzz
test, the 30-odd hostile strings and the source guard tests in `formula.spec.js` exist to catch.

## Decisions made while building it

- **Load-refusal gap, accepted for v1** (Part 2). A malformed or over-cap formula record loads with a
  named `LoadWarning`, never a refused file. But a **measuring** formula that fails only during the
  fold can still make a load refuse the file when other rows depend on it. This matches `var.define`
  today and is accepted rather than fixed here; a fix belongs with the load path for both.
- **`formulaImpactOf` is the pre-commit check** (Part 3). Changing a formula runs the same
  throwaway-document impact check as a value change (`dependents.js`'s `definitionImpactOf`),
  following consumers transitively through other formulas. The panel's **Save** and the AI's
  `set_formula` both call it first: nothing breaks, it commits as one Undo step; something would, it
  writes nothing (the panel opens the existing repair dialog; the tool returns `breakages`).
- **`evaluate_formula`'s `at`** (Part 3) is a record id: the formula is worked out from the bodies as
  they stand just above that row (`document.formulaReadAt`), exactly as a binding on that row would
  read them. Omitted, it reads at the end of the active log. An `at` that is no step is refused by
  name. The panel's preview line is the same call with no `at`, and writes nothing.
- **Formula writes are capped by `stepsPerTurn` only** (Part 3, `src/ai/tools/limits.js`).
  `define_formula` appends one record and is charged one, like `define_variable`. `set_formula` and
  the other variable writes revise rows in place, so they count against `stepsPerTurn` and not
  against the record caps: a rename that rewrites sixty bindings is one change. A formula's own cost
  is capped by `FORMULA_LIMITS` on every fold, whoever wrote it.
- **`PROMPT_VERSION` bumped to `2026-11-04.1`** (Part 3) for the one new prompt rule: *if a dimension
  depends on another part, define a formula and bind to it; do not work out the number and write it
  down.*
- **"Used by N" and the blast-radius line count what a variable reaches through formulas, not the
  formulas** (Parts 3 and 4). `set_variable`'s counts and the panel's both use bound rows only; a
  formula reading the variable is shown separately (*read by 1 formula*).
- **A part edit announces its formula's change** (Part 4). When a field edit on another body, or Undo,
  moves a formula's value, the Variables section shows *overhang 40 mm → 60 mm — 1 parameter on 1 part
  changed*. It is computed after the fact by comparing formula values by record id between document
  versions, and stays quiet when the panel's own command already announced a line.
- **Deleting a body a formula measures is allowed, and said beforehand** (Part 4). Formula reads stay
  out of `referencedIdsOf` on purpose, so core does not refuse. The Delete button names the formulas
  that read the body and how many parameters they feed (`formulaReadsOf`); the fold then names each
  broken row. Undo is the safety net, as for every delete.
- **Save to library bakes every binding into a literal** (Part 4). Before this task a bound field
  reached a saved part's rebuild check as `{ "$var": … }` and failed with a kernel error, so there was
  no working behaviour to copy. Now `capturePart` writes each bound slot as the value **its row used**
  (`literalParamsOf`, from `document.boundValuesOf`): a plain variable's value, and a measuring
  formula's value at that row, not at the end of the log. A saved part carries no variables.
- **Merge needs no new code**: formulas are records, and the record lines merge byte-identically. Part
  2's tests cover a formula added on one copy while the body is renamed on the other.

## Out of scope for v1

Inline formulas in a param slot (`{ "$expr": … }`); boolean or choice results and formulas in `when`;
volume, mass or distance between bodies (they need a union or a mesh query); reading another body's
params; unit-carrying literals (`3/8 in`); binding `transform.rotate` or `rotation`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
