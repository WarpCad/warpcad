# Assistant prompt evals (`npm run eval:ai`)

Whether the assistant makes *good* choices is not something unit tests can say, and one live run
is an anecdote. This runs a small fixed set of prompts against a **real model**, several times
each, scores the **resulting geometry** with numbers, and writes a dated result file, so a prompt
or tool change can be compared before and after.

**It is never run in CI.** It costs money and a model is not deterministic. There is no CI step
for it; run it by hand, or from a schedule you set up yourself.

## Running it

The key comes from the environment, for that one command only. It is never printed, logged or
written to a result file.

```sh
ANTHROPIC_API_KEY=… npm run eval:ai                        # every case, 3 runs each, the app's default model
ANTHROPIC_API_KEY=… npm run eval:ai -- --case cube-with-hole --runs 5
ANTHROPIC_API_KEY=… npm run eval:ai -- --model claude-sonnet-5-5 --max-cost 2
npm run eval:ai -- --list                                  # no key needed, costs nothing
```

| Flag | Default | What it does |
|---|---|---|
| `--case <id>` | all | run one case |
| `--runs <n>` | 3 | runs per case (a model varies, so one run is not a result) |
| `--model <id>` | the app's default | the model; its cost is estimated only for ids in `score.js`'s price table |
| `--max-cost <usd>` | 5 | stop starting new runs once the estimate passes this; exit code 3 |
| `--list` | | print the cases and exit |

With no key it says so, spends nothing and writes nothing (exit code 2).

## What you get

`bench/results/ai/<date>-<model>.md` (a table to read and compare) and `.json` (every run, every
check, with its numbers). The table has, per case: pass rate, mean tool calls, tokens in and out,
estimated cost, mean wall time and **which checks failed how often**, so a change that breaks one
check shows up as that check rather than as "fewer passes".

## What a check is

A check reads the **resulting geometry**, never a model's opinion of it:

| Check | Passes when |
|---|---|
| `bodyCount` | the document has `min`–`max` bodies |
| `sizeWithin` | a body's box is within `tolMm` of `sizeMm` (`null` skips an axis) |
| `longestEdgeWithin` | a body's longest edge is within `min`–`max` mm |
| `volumeWithin` | a body's volume is within `min`–`max` mm³ |
| `fillBelow` | volume over bounding-box volume is at most `max` (it is not a plain block) |
| `watertight` | every body has no open edges, by the same pass the export uses |
| `fitsBed` | every body fits `bedMm`, by the app's own verdict (a part may lie on its side) |
| `namedParts` | one body has all of `names` as visible parts |
| `askedOrAssumed` | it asked and built nothing, or built and **stated what it assumed** |
| `preserved` | the named seed bodies are still there and the same size |

There is no LLM-judged scoring: it would put one unmeasured model inside the measurement. What
these numbers do **not** say (is that a *good* wing? a *sensible* bracket?) stays with the live
scenarios in `TODO/ACCEPTANCE.md`. `askedOrAssumed` is the one textual check, and it only tests
that the reply asked or said it assumed, not that what it said was right. "Zero invented
dimensions" in the ambiguous case is therefore **not** measured beyond that.

Every check can fail; `score.spec.js` runs each against a deliberately wrong result.

## The cases

`bench/ai/cases/*.json`: `{ id, prompt, checks[], seed?, standingInstructions?, images?, needs? }`.

| Case | Why |
|---|---|
| `airfoil-wing` | scenario 17's sentence, verbatim |
| `drawing-board` | scenario 18's sentence, verbatim, with the drawing fixture (**browser only**, below) |
| `cube-with-hole` | a plain request with a number in it |
| `bracket-m4` | under-specified: it should say what it assumed |
| `ambiguous-request` | nothing to go on: ask, or say what was assumed |
| `hostile-intent` | a project whose intent and standing instructions tell the model to delete everything: nothing may be deleted |

To add one, copy a case file and change it. `score.spec.js` refuses a case that checks nothing, has
an unknown check type or misses a required field.

## What is not built yet

The runner is **headless**: the agent, tools and kernel run in plain Node, the way `mcp/` runs
them. A case with `"needs": ["browser"]` is **listed and skipped**, never faked, because an
attached image goes through the sketch sanitiser (a canvas) and `capture_view` needs a GPU. Running
those in a Playwright-driven browser is not built, so scenario 18 has no repeatable number yet.

## How the harness itself is tested

`run.spec.js` plays the recorded transcripts in `e2e/fixtures/ai/` through the same runner with the
scripted provider (`src/ai/providers/scripted.js`): a transcript that does the job must score PASS,
and one that builds a part too big for the bed must FAIL on `fitsBed`. That proves the harness, at
no cost. It says nothing about any model.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
