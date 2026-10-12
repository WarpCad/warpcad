# TDD Cycle — Red → Green

Add a well-tested behavior to existing code using strict Test-Driven Development.

---

## Step 1 — Clarify the behavior

Ask:
1. What specific behavior do you want to test? (One behavior per TDD cycle)
2. Which file or component does this behavior belong to?
3. Is this a unit test (Vitest), a browser-mode test, or an E2E test?
4. What is the expected input? What is the expected output or side effect?
5. What are the degenerate or boundary cases to cover — zero-length geometry, coincident points, empty selection, a value right at the tolerance edge?

Wait for answers. Restate the behavior as a single plain-English sentence and confirm with the user before writing anything.

---

## Step 2 — Read the existing code

Read the target file and any related test files.
Understand:
- The existing test style and naming conventions
- What is already tested
- What mocks or fixtures are in use
- For numeric code: what tolerance the neighboring tests assert with, and why

Tell the user what you found and where the new test will go.

---

## Step 3 — RED: Write the failing test

Write **only** the test(s). Do not touch implementation files yet.

Requirements:
- Use `it('describes the expected behavior clearly', ...)` naming
- Mock all external dependencies at their boundary (canvas/WebGL context, workers, file system access, timers, `requestAnimationFrame`)
- Numeric assertions use an explicit tolerance (`toBeCloseTo`), never bare equality on floats
- Place the test in the correct file next to the code it tests

**Run the tests now.**

The new test must fail. Show the exact failure output.
If the test passes without any implementation changes, stop and ask the user — the behavior may already exist or the test may not be testing the right thing.

Confirm with the user: "Test is red — failing as expected. Ready to implement?"

---

## Step 4 — GREEN: Implement the minimum

Write only the code needed to make the failing test pass.
Do not add anything the tests don't require.

**Run the tests again.**

Show the output. All tests (new and existing) must pass.
If any previously passing test now fails, fix the regression before continuing.

Confirm: "All green. Done."

---

## Notes

- To validate UI changes against the full suite, run the `test` skill (`/test`)
  instead of listing individual commands.
- A single test can be run with: `npx vitest run --reporter=verbose --reporter=./scripts/test-progress/vitest.mjs <filename>`
  (a bare `--reporter` replaces the configured list and turns the test-progress mod off — see `/test` Notes)
- Test files use `.spec.js` for unit/component tests, `.e2e.js` for E2E tests

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
