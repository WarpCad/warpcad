---
title: Hosted git-backend persistence with user-supplied token
category: io
kind: feature
priority: medium
model: opus
milestone: M6
depends: [io-001]
status: open
---

## Goal

The hosted half of M6's two persistence targets: read and write the project's NDJSON
action log to a user-connected git repository (e.g. a GitHub repo), authenticated with
a user-supplied token, so a document can be shared/backed up beyond the local browser's
own storage — the "hosted git-based backend" `CLAUDE.md`'s Storage section has named
since before M0. "Done" looks like: connect a repo once (paste a token, pick or create
a target file/path), and subsequent saves write to that repo while loads read from it,
with a stated, tested answer for what happens if the remote file changed since the last
read (two tabs, or a human plus a future MCP session, both pointing at the same file).

**Correction to this milestone's own header, worth recording rather than silently
carrying forward**: `TODO/ROADMAP.md`'s M6 section describes this as reusing "the same
BYOK pattern the AI chat client already uses for its own API key." Checked directly
against the real tree before writing this file: `src/ai/` contains only a `.gitkeep` —
**no AI chat client, and no token-storage pattern, exists yet.** `CLAUDE.md`'s AI
Partner section describes BYOK as a *planned* pattern ("the user's own API key in
IndexedDB"), not shipped precedent. This task is therefore the **first** real
token-storage boundary in this codebase, not a reuse of an existing one — closer in
shape to `src/stores/settings.js`'s `localStorage` try/catch boundary (the actual
closest precedent) than to anything AI-specific. Whichever of this task or the eventual
AI chat client lands first should build the boundary and have the other reuse it,
mirroring the note `ui-027`/`ui-029` left each other over the shared kernel-error-
display convention.

## Interaction model

> **Superseded by `data-002`** (`docs/decisions/interaction-model-qa.md` section 11;
> confirmed by the user 2026-09-19). Where this section disagrees, that document wins:
> hosted writes are **explicit** (`Save to owner/repo` / `Load from owner/repo`) with a
> **per-connection opt-in Auto-push, off by default** — a trailing 30-second debounce
> with a 5-minute cap, shape-coded status dot, and a 409 that **pauses auto-push and
> raises the Overwrite remote / Load remote / Cancel dialog rather than overwriting**.
> The Connect form is a modal dialog with a password-type token field, validated before
> anything is stored.

- **Precondition** — nothing selected.
- **Trigger** — per `data-002`'s confirmed answer: likely a "Connect hosted storage"
  control (`ui-033`'s surface) that opens a form for a token and repo/path; this task
  builds the underlying read/write/conflict mechanism that control calls into.
- **Feedback** — a connected/disconnected status indicator; explicit feedback on a
  save/load failure (auth rejected, network error, conflict detected) — never silent,
  per `CLAUDE.md`'s Verification bar.
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — same as desktop: a token-entry form is a standard
  form control, no special phone/tablet handling beyond `CLAUDE.md`'s general
  never-require-horizontal-scroll rule.

## Documentation

- **Page** — new `docs/save-load.md` section (shared with `io-001`, coordinate rather
  than duplicate) covering how to connect a hosted repo, where the token is stored, and
  what happens on a conflict.
- **Example**: "Click Connect Hosted Storage, paste a GitHub personal access token with
  repo write access, and choose a repository. Subsequent saves write to that repo
  automatically; if the remote file has changed since your last load, WarpCad tells you
  before overwriting anything."

## Affected files

- `src/storage/hostedBackend.js` (new) — the git-backend client (whichever `data-001`
  selects: a real client library or hand-rolled `fetch`), read/write against the
  repo's file, and conflict detection (compare the remote file's last-known revision/
  hash against what this session last read before writing).
- `src/storage/tokenStorage.js` (new, or folded into `hostedBackend.js`) — the token
  persistence boundary named in the Goal's correction above: IndexedDB (matching
  `io-001`'s own choice, for consistency) rather than `localStorage`, since a token is
  more sensitive than a UI preference and IndexedDB is already this milestone's
  established local-storage mechanism.
- `docs/save-load.md`.

## Proposed fix

**The conflict-on-reconnect behavior needs real design, not a default assumption** —
`docs/decisions/document-sync.md`'s single-writer assumption explicitly "stops holding
the moment two browser tabs or a human-plus-MCP-session both point at the same remote
file," and this task is exactly where that stops being hypothetical. Recommend, at
minimum: before writing, re-fetch the remote file's current revision and compare against
the revision this session last read; if it changed, **refuse to silently overwrite** —
surface the conflict to the user (a "the remote copy changed since you last loaded it,
overwrite / reload / merge?" choice) rather than the two failure modes `CLAUDE.md`
warns against (silent data loss, or a merge algorithm invented on the spot without the
CRDT infrastructure `docs/decisions/document-sync.md` deliberately deferred). Do not
attempt automatic merging — that would reopen the CRDT question `docs-002` explicitly
declined to solve for v1.

Token storage: never send the token anywhere except the git host's own API (the
existing "never send unrelated data to an unrelated service" boundary rule applies
directly here) — this task is a real credential-handling surface and should be reviewed
for exactly that at Step 2, per `CLAUDE.md`'s general security posture even though it
has no separate named security section.

## Effort

L — real architectural ambiguity (conflict handling, per `docs/decisions/
document-sync.md`'s own named revival condition) plus credential-handling surface with
no existing precedent in this codebase to mirror. `model: opus` per `TODO/README.md`'s
guidance on real cross-layer ambiguity with no established pattern.

## Testing

- New `src/storage/hostedBackend.spec.js` — mock the git host's API boundary entirely
  (per `CLAUDE.md`'s "mock at the boundary... never a real network" convention): a
  write succeeds when the remote revision matches what was last read; a write is
  **refused** (not silently forced) when the remote revision has changed since;
  degenerate cases — an invalid/expired token (auth failure surfaced, not swallowed), a
  network failure mid-write (no partial/corrupt write left behind).
- New `e2e/hosted-persistence.e2e.js` (required, new user-visible surface) — this
  necessarily mocks the git host's HTTP endpoints (no real network call in an
  automated spec), but must still exercise the real save/load/conflict UI flow
  end-to-end through the app. Chromium-only is acceptable if this task's own
  investigation confirms no WebGL/canvas/touch involvement — state that explicitly per
  `CLAUDE.md`'s Browser Support rule rather than default to the full matrix
  unreasoned.
- **`TODO/ACCEPTANCE.md` scenario 10** (remote path) by name — drive with a real (test)
  repo once `ui-033` also exists to provide the trigger.
- **Closed-finding regression surface**: none new — first task in this subsystem.
