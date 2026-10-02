# Update Documentation

Review recent changes and update all documentation to reflect the current state of the app.

---

## Step 1 — Identify what changed

Run `git log --oneline -20` and `git diff HEAD~5..HEAD --name-only` to find:
- Recently added or modified views, features, tools, or routes
- New components, modules, or configuration changes
- Anything removed or renamed

List what you found. Ask: "Are there any other changes I should document that aren't in the git history?"

---

## Step 2 — Update README.md

For each new or changed feature:

- **New features** — Add or update the relevant section with a callout:
  ```
  > **New:** Brief description of what's new.
  ```
- **Changed behavior** — Update any instructions that are now incorrect.
- **Removed features** — Remove references to avoid misleading users.

Keep the README scannable: headers, bullet points, short paragraphs.

---

## Step 3 — Update user documentation (`docs/`)

**For each changed feature, update its corresponding `.md` page.**

Documentation rules:
- Write for the user, not the developer — "how to use it", not "how it works"
- Do NOT include module internals, Vue component details, or kernel implementation notes
- **Do document keyboard shortcuts, modifier keys, and snap/constraint behavior** —
  in a CAD tool these are the interface, and they're invisible from the screenshot
- **Name the units and coordinate conventions** anywhere the user types a number
- Include the relevant screenshot: `![Alt](./screenshots/<name>.png)`
- Screenshots come from Playwright E2E snapshots — keep them in step with the UI

**If a new page was added:** create the `.md` file under `docs/` and add its entry to
the docs site's navigation config.

**If a feature was removed:** delete its page and remove the navigation entry.

---

## Step 4 — Check the docs navigation

Confirm the navigation matches the current feature set and that the grouping still
makes sense (e.g. **Getting Started** / **Sketching** / **Modeling** / **Import &
Export** / **Reference**). A page that exists but isn't in the navigation is a page
nobody finds.

---

## Step 5 — Update `CLAUDE.md` if needed

Update if any of the following changed:
- Build, test, or lint commands
- Directory structure or key file locations
- Architecture (new modules, workers, data flows, undo/history contract)
- Conventions (naming patterns, component categories, testing rules)
- The performance budget or how it's measured
- A Library-decisions outcome — e.g. one of `CLAUDE.md`'s Stack table rows moving from
  "open" or "default — reconsider" to a confirmed choice

`CLAUDE.md` is the source of truth the other skills read. A stale entry there
propagates into every future session, so treat this step as load-bearing, not
housekeeping.

---

## Step 6 — Summary

List every file you changed and what was updated.
Ask: "Does this documentation look accurate and complete?"

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
