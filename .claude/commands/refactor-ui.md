# Refactor UI Components

Use this skill when asked to refactor a Vue view, or proactively when you encounter
a view or component that is large, complex, or hard to test.

---

## When to Offer This Refactor

Proactively offer this workflow when you see any of these signals in a `.vue` file:
- Template longer than ~100 lines
- Multiple visually distinct sections (toolbar + viewport + inspector + tree, etc.)
- Geometry or coordinate math inline in a component — that belongs in `src/core/`
- Inline logic that could be its own focused component
- No corresponding `.spec.js`, or tests that are hard to write because the component does too much
- Component name ending in `View` that contains non-trivial UI

Say: *"This view is doing a lot — would you like me to break it into smaller, reusable components?
I'll organize them into categories and cover each one with unit tests, workshop stories, and E2E tests."*
Wait for confirmation before proceeding.

---

## Step 1 — Analyze the View

Read the target file in full.
Identify logical sections that could be independent components:
- Each section has a clear single responsibility
- Each section could be tested, previewed in the component workshop, and reused independently
- Each section is not tightly coupled to the parent's internal state (props/emits instead)

Separately, flag any **geometry or document logic** you find in the template or
`<script>` — that doesn't become a component, it moves to `src/core/` (or a composable)
and gets its own plain unit tests. Extracting a component around untestable math just
relocates the problem.

List the proposed components and their category. Example:

```
src/components/
  viewport/
    ViewportCanvas.vue        ← the drawing surface and its pointer handling
    ViewCube.vue              ← orientation widget
  features/
    ToolPalette.vue           ← tool selection strip
    ToolOptionsBar.vue        ← options for the active tool
  layout/
    SectionHeader.vue         ← reusable titled section wrapper
```

Ask: *"Does this grouping make sense? Any components to add, remove, or rename?"*
Wait for confirmation before writing any files.

---

## Step 2 — Agree on Component Categories

Standard categories for this project, matching `CLAUDE.md`'s Component Categories list
exactly (extend only if nothing fits):

- `viewport/` — drawing surface, camera/navigation controls, orientation gizmo,
  transform (move/rotate) gizmos, grid (major/minor lines + dimensions), axes,
  on-canvas overlays
- `timeline/` — the feature history list, rollback, suppress, reorder
- `features/` — per-feature-type parameter editors, tool palette and option bars
- `sketch/` — 2D sketch entity and constraint UI
- `inspector/` — property panels, dimension editing, unit-aware numeric entry
- `storage/` — project browser, save/open, remote-backend connection UI
- `ai/` — chat panel, intent capture, agent activity
- `layout/` — generic wrappers, panels, splitters, toolbars
- `controls/` — generic reusable inputs (sliders, toggles, steppers, unit-aware fields)
- `display/` — read-only display elements (badges, counters, labels, indicators)

Use an existing category when the component clearly belongs there.
Propose a new category only when none of the above fit — and if you do, add it to
`CLAUDE.md`'s Component Categories list too, so the two never drift apart.

---

## Step 3 — RED: Write Tests and Stories First

For each new component, write the following **before** implementing the component:

### Unit test (`ComponentName.spec.js`, next to the component)
```js
// Test one behavior at a time:
it('emits tool-select with the tool id when a palette button is pressed', ...)
it('shows the disabled state when no document is open', ...)
it('renders the value in the document unit from props', ...)
```
- Use Vitest + Vue Test Utils
- Mock all props at their boundary (no internal API calls, no real canvas context)
- Run the test. **It must fail.** Show the output.

### Component workshop story (`ComponentName.stories.js`, next to the component)
```js
export default { title: 'Features/ToolPalette', component: ToolPalette }
export const Default = { args: { activeTool: 'line' } }
export const Disabled = { args: { disabled: true } }
export const Overflowing = { args: { tools: manyTools } }
```
- One story per meaningful visual state
- Use realistic prop values
- Verify it renders in the workshop tool's dev server before moving on

### Workshop E2E test (`ComponentName.story.e2e.js`, in `e2e/`)

The `.story.e2e.js` infix is load-bearing, from day one: a spec that navigates to the
component-workshop iframe proves the *component* works in isolation, not that a
user-facing capability works. Name it wrong and it silently passes as if it were the
latter — the first attempt at this project shipped 24 "done" UI tasks that way before
anyone noticed the real app never rendered any of them (see `PREVIOUS-ATTEMPT.md`).
`e2e/naming.spec.js` (create it in the first testing-harness task if it doesn't exist
yet) should fail the build if a `*.e2e.js` without the `.story` infix points at the
workshop tool.

```js
test('ToolPalette emits selection on click', async ({ page }) => {
  await page.goto('http://localhost:6006/iframe.html?id=features-toolpalette--default')
  await page.click('[data-testid="tool-line"]')
  // assert event or visual change
})
```

**This component is not "done" until it's reachable from the running app** — mounted in
a real view, not only previewed in a story — with a real `*.e2e.js` spec that navigates
to `/` and exercises it there. A story-level spec is not a substitute for that, and
never describe one as proving the app-level capability. If wiring it into a view is
genuinely a separate, larger task, say so explicitly to the user now, before this task
is marked done — don't let it default to "someone will do that later" silently.

Run all tests. Confirm they fail (red) before implementing.

---

## Step 4 — GREEN: Implement Each Component

For each component:
1. Create the `.vue` file with the simplest implementation that passes its tests
2. Props in, events out — no reaching into parent state
3. Support dark mode: use CSS custom properties, not hardcoded colors
4. Add `data-testid` attributes to interactive elements
5. Keep the pointer/render path allocation-free — a component in the drag path should
   not create objects per event
6. Run unit tests after each component — they must all pass before moving on

---

## Step 5 — Update the Parent View

Replace inline sections in the original view with the new component imports.
The parent view should become a thin composition layer:
```vue
<template>
  <div class="editor">
    <ToolPalette :active-tool="activeTool" @tool-select="setTool" />
    <ViewportCanvas :document="doc" @pick="onPick" />
    <Inspector v-model:selection="selection" />
  </div>
</template>
```

Run the `test` skill (`/test`) for the full suite. All stages must pass.

---

## Step 6 — Update Documentation

- `README.md` — note the refactor; no `> **New:**` callout needed unless the component is user-visible
- Add `<!-- screenshot: [description] -->` for any new visual states worth capturing
- `CLAUDE.md` — update the component category list if a new category was added

---

## Step 7 — Propose a Commit

Hand off to `/commit`. The message should follow this shape:

```
refactor(<view-name>): extract into small reusable components

<WHY: explain what was complex, what was extracted, and how the new
structure makes each piece easier to test and reuse independently.>

Components: list extracted components and their categories
Tests: unit tests + workshop stories + *.story.e2e.js for each; note whether the
component is reachable from a real view yet and, if so, that an app-level *.e2e.js
spec covers it — a story-only spec never satisfies this line by itself.
```

Only commit on confirmation, per `/commit` Step 9.
