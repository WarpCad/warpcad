# AI partner: one tool registry, two transports, a branch per turn, raw `fetch`, MCP SDK v2

Status: **Accepted as written by the user, 2026-10-06** (`TODO/ai-001`). All six open calls resolved to the picks recorded here.
Settles the nine questions M9 is blocked on, plus the CRDT question asked on 2026-10-02,
so `ai-002`…`ai-011` can name real modules.

This is a **new decision**. Neither previous attempt built an AI path past a placeholder,
so there's no prior-attempt experience to weigh and this document doesn't make any up.

All figures were measured or pulled on **2026-10-06**:

- **npm**: `npm view` (version, licence, maintainers, unpacked size, dependencies).
- **GitHub**: `gh api` for stars, last push, licence and latest release. Open and closed
  issue counts come from the search API (`type:issue`, so pull requests are excluded).
  Contributors are the first page of `/contributors`, so `100` means "100 or more".
- **Bundle size**: esbuild `--bundle --minify` then `gzip -9`, on a minimal entry that
  does the one thing WarpCad needs (stream one request, or start one stdio server). It's
  compared against **this app's own main chunk, 369.39 KB gzip**, from a `vite build` of
  `main` at `8d31e37`.
- **Licences**: `license-checker@25.0.1 --production` run over a scratch install of each
  candidate, using the same tool and allow-list `npm run licenses` uses.

Anything not verified is marked **unverified**. The two target prompts
(`TODO/ROADMAP.md` M9) are the bar every choice below is judged against:

> Use the sketch tool to create an airfoil for a model plane wing, create the wing then the
> rest of the model so I can 3D print it.

> Here is a drawing of a raspberry pi 7 create a group object to be added to the library.

---

## Summary

| # | Question | Decision |
|---|---|---|
| 1 | Tool surface | **Confirmed**: one framework-free registry in `src/ai/tools/` with plain JSON-Schema tool definitions. Two thin adapters use it: the browser agent (`ai-005`, Messages API `tools`) and `mcp/server.js` (`ai-009`, MCP `tools/list`). Neither adapter adds tools. |
| 2 | LLM client | **Raw `fetch` to the Messages API**, behind a one-method provider interface. **Anthropic-only for v1.** No new dependency. |
| 3 | MCP SDK | **`@modelcontextprotocol/server` 2.3.1** (the v2 split package, Apache-2.0, 3 packages in its tree). It lives in its own `mcp/package.json`, so the app's production dependencies are unchanged. |
| 4 | Tool-input validation | **No zod, no ajv in the app.** A small structural check of the JSON-Schema subset the registry emits runs first. The kernel registry's own validation (the trial fold) stays the authority. Anthropic tool definitions set `strict: true`. |
| 5 | Undo vs origin scoping | **A branch per turn, then one Undo AI turn control.** A turn builds on a forked throwaway document and lands as one atomic `ai`-origin change — since `ai-017`, by **merge**, with the human editing meanwhile. **Undo AI turn** takes that change back (since `ai-017`, `ui-062`'s inverse of the merge). The local undo stack is untouched. A history-revision (inverse records) is rejected. |
| 6 | Concurrency | **v1 MCP edits a closed project file only.** The in-browser assistant isn't a concurrent writer: user edits pause while a turn runs. The live bridge stays the reserved `ai-012`, and its planned answer is "one writer, the AI as its client", not merge. |
| 7 | Trust model | Text from a loaded project goes into a delimited, escaped **data** block and is never placed in `system`. Hard limits live in code, not the prompt: no network, no key access, no writes outside the open document, plus step, record and time caps. |
| 8 | Key handling | The key lives in the existing `warpcad-credentials` IndexedDB store (`src/storage/tokenStorage.js`) and nowhere else. Named exposure: XSS on the origin. Mitigations: a meta-tag CSP with a `connect-src` allowlist, no HTML rendering of model output, no remote images. |
| 9 | Cost | Default model **`claude-opus-5-5`**, with effort set explicitly. The chat shows tokens per turn (input / cache read / cache write / output) and an estimated cost. **Prompt caching is on** for tools + system. |
| — | CRDT for the AI co-editor? | **No.** The branch model plus one-writer `ai-012` meet every concrete need found. See the CRDT section. |

**Items needing the user's call** are collected at the end of the document.

---

## Decision 1 — One tool surface, two transports: **confirmed**

The registry `ai-002` builds is the only place a tool is defined. Each tool is a plain
object: `{ name, description, inputSchema, run(ctx, input) }`. `inputSchema` is plain
JSON Schema (the subset in decision 4), because both transports already speak JSON
Schema without translation:

- **Messages API**: `{ name, description, input_schema, strict: true }`. The browser
  adapter in `src/ai/agent.js` maps `inputSchema` to `input_schema`, and that's the
  whole adapter.
- **MCP**: v2's low-level `Server` advertises `tools/list` with a JSON-Schema
  `inputSchema` directly, and `fromJsonSchema` is exported for the high-level
  `McpServer`. Checked in the installed 2.3.1 export list, not assumed.

What differs per transport, and nothing else does:

| | Browser (`ai`) | MCP server (`mcp`) |
|---|---|---|
| Origin passed to every write | `'ai'` | `'mcp'` |
| `capture_view` (`ai-007`) | Present (needs WebGL) | **Omitted** from the list: no GPU in Node |
| Document | The open tab's document, via a per-turn branch (decision 5) | The project file named on the command line, loaded with `src/core/project.js` |
| Who enforces the caps (decision 7) | `src/ai/tools/limits.js` | The same `limits.js`, same constants |

A tool never sees which transport is calling it beyond `ctx.origin`. That's what keeps
"creation and operation are never the same list" true for the model in both places.
`create` is limited to `operandCount: 0` ops and requires a position. `operate` is
limited to `operandCount ≥ 1` and refuses through the same `acceptsOperandCount` the
toolbar uses.

**What would replace it:** two hand-maintained tool lists, one per transport. That's
rejected for the same reason `CLAUDE.md` rejects a UI menu built by hand: the two would
drift, and a capability would quietly exist on one path only.

---

## Decision 2 — LLM client: **raw `fetch`, Anthropic-only v1, behind a one-method interface**

### Options compared

| | **Raw `fetch` + SSE parser** | `@anthropic-ai/sdk` (browser) | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) | OpenAI-compatible (`openai` → Anthropic's compat endpoint) |
|---|---|---|---|---|
| npm version / published | — (platform API) | 0.131.0 · 2026-09-30 | 7.0.128 + 4.0.72 · 2026-10-05 | 7.28.0 · 2026-10-04 |
| GitHub stars | — | 2,131 | **27,144** | 11,204 |
| Open / closed issues | — | 31 / 276 (**10.1%** open) | 486 / 4,177 (10.4%) | 0 / 715 (0%: issues appear to be triaged elsewhere, **unverified**) |
| Last repo push | — | 2026-09-30 | 2026-10-06 | 2026-10-06 |
| Contributors (first page) | — | 50 | 100+ | 100+ |
| npm maintainers | — | **13** (all `@anthropic.com`) | 5 / 3 (Vercel) | 19 (OpenAI) |
| Unpacked size | 0 | 11.4 MB | 7.9 MB + 2.3 MB | 20.7 MB |
| **Measured min+gzip** (stream one request) | **433 B** | 52,778 B | 196,692 B | 80,300 B |
| …as a share of the app's 369.39 KB main chunk | 0.1% | 14.3% | **53.2%** | 21.7% |
| Licence (package) | — | MIT | Apache-2.0 | Apache-2.0 |
| **Passes `npm run licenses` as-is?** | n/a | **No**: transitive `fast-sha256@1.3.0` is **Unlicense** (via `standardwebhooks`), and Unlicense isn't on the allow-list | Yes (**unverified** for the full transitive tree) | Yes (**unverified** for the full transitive tree) |
| Browser use | `anthropic-dangerous-direct-browser-access: true` header | `dangerouslyAllowBrowser: true` (sets that same header; confirmed in `client.mjs`) | Same header, passed by hand | `dangerouslyAllowBrowser`; whether the compat endpoint answers CORS is **unverified** |
| Prompt caching (`cache_control`) | Yes (it's a body field) | Yes | Via `providerOptions` | **No**: "Prompt caching is not supported" (Anthropic's compat docs) |
| `strict` tool schemas | Yes | Yes | Via provider options | **Ignored** ("The `strict` parameter for function calling is ignored") |
| Multi-provider | No | No | **Yes** | OpenAI-shaped providers only |
| Stated purpose | — | Official client | General multi-provider toolkit | "primarily intended to test and compare model capabilities, and is not considered a long-term or production-ready solution" |

### Why raw `fetch`

The `claude-api` skill's default is the official SDK, and that default was weighed
rather than skipped. Three things specific to this project outweigh it:

1. **The licence gate fails today.** The SDK doesn't pass `npm run licenses` without a
   new allow-list entry (Unlicense, through `standardwebhooks`, a webhook-verification
   dependency a browser chat never calls). A new entry is the user's decision, not this
   document's. See the items at the end.
2. **The credential rules `io-002` already enforces are easier to keep when we own the
   request.** `src/storage/hostedBackend.js` never echoes server error text into a
   message, because a server body can quote the credential it rejected. It also
   allowlists the API origin at construction. An SDK error's `.message` carries the
   server body by design. Raw `fetch` maps the status to a fixed message (401 / 403 /
   429 / 5xx / network / CORS, the distinct cases `ai-004` must show) and never builds a
   message from the response body. The SDK doesn't help with the one case `ai-004`
   names that's hardest to tell apart, a CORS refusal: in the browser it surfaces as a
   bare network `TypeError` either way.
3. **The project has already made this call once, for the same reasons.**
   `docs/decisions/persistence-export.md` chose hand-rolled `fetch` over Octokit for
   three GitHub endpoints at 16.7% of the bundle. Here it's one endpoint (`POST
   /v1/messages`, streaming) at 14.3%, plus a licence failure.

What the SDK would have given, honestly priced:

- **SSE parsing.** About 40 lines. `ai-004`'s Testing already demands the hard cases (an
  event split across chunks, a tool-input JSON split mid-token, abort mid-stream) whatever
  sits underneath.
- **Retries.** The SDK retries 408/409/429/5xx twice by default. Here a retry is an agent
  decision, not a transport one: it re-sends a growing conversation that costs money, so
  `ai-005` owns it explicitly.
- **Types.** This codebase is JSDoc-typed JavaScript. The request and event shapes go in
  one JSDoc typedef file next to the client.
- **API drift tracking.** This is the real cost. The `claude-api` skill lists several
  request shapes that changed in 2025-26 (thinking configuration, forced `tool_choice`
  400s on current models, `fallbacks`). The mitigation is that **the request body is
  built in one function** (`src/ai/client.js`) and every field it sends is listed in
  decision 9. The provider interface is one method, so swapping to the SDK later is a
  one-file change if the user adds the licence entry or the drift cost turns out higher.

**The interface** (for `ai-004`):
`stream({ system, messages, tools, signal }) → AsyncIterable<text | tool_call | usage | done | error>`.
The agent never sees HTTP, so a second provider is a second implementation of this one
method, not a rewrite.

### Why Anthropic-only for v1

Both target prompts depend on features we'd otherwise give up or re-implement per
provider: vision for the drawing, strict tool schemas, prompt caching on a large tool
list, and adaptive thinking. Multi-provider is not a v1 goal. The interface above keeps
it a later option without paying for it now.

### Rejection table

| Rejected | Specific reason |
|---|---|
| `@anthropic-ai/sdk` | Fails `npm run licenses` as-is (transitive Unlicense). 52.8 KB gzip (14.3% of the app) for one endpoint. Its error messages carry server body text, which breaks the credential rule `io-002` set. **It's the documented fallback** if the user prefers it: add `Unlicense` to the allow-list and swap `src/ai/client.js`. |
| Vercel AI SDK | 196.7 KB gzip, **53%** of the current app, for a multi-provider abstraction v1 doesn't want. Anthropic features (`cache_control`, strict tools) go through `providerOptions` and lag the native API. The top-level `ai` package depends on `@ai-sdk/gateway`, a hosted-gateway path this static, backend-free app has no use for. Also the largest open-issue count (486). |
| OpenAI-compatible adapter | Anthropic's own documentation calls it a test-and-compare layer, "not … production-ready". It **ignores `strict`** and **does not support prompt caching**, which decisions 4 and 9 both rely on. Browser CORS on that endpoint is unverified. |

---

## Decision 3 — MCP SDK: **`@modelcontextprotocol/server` 2.3.1, in `mcp/package.json`**

The MCP TypeScript SDK split into packages at v2. The GitHub repository's latest release
is `v2.3.1` (2026-10-05). The old single package is still published as 1.x. Both were
compared.

### Options compared

| | **`@modelcontextprotocol/server` v2** | `@modelcontextprotocol/sdk` v1 | Hand-rolled stdio JSON-RPC |
|---|---|---|---|
| npm version / published | 2.3.1 · 2026-10-05 | 1.32.1 · 2026-10-05 | — |
| Repository | `modelcontextprotocol/typescript-sdk` (shared) | same | — |
| GitHub stars | 13,525 | (same repo) | — |
| Open / closed issues | 255 / 703 (**26.6%** open) | (same repo) | — |
| Last push | 2026-10-06 | (same repo) | — |
| Contributors (first page) | 100+ | (same repo) | — |
| npm maintainers | 5 (Anthropic and modelcontextprotocol.io) | 5 | — |
| Dependencies (installed tree, excluding root) | **3**: `server`, `core`, `zod` | **94** (express, hono, cors, jose, eventsource, express-rate-limit, …) | 0 |
| Unpacked size | 6.4 MB + 1.3 MB core | 6.1 MB | 0 |
| Measured min+gzip (Node bundle, server + stdio) | 108,248 B | 104,412 B | ~2-4 KB (estimate, not built) |
| Licence | **Apache-2.0** (server, core) + MIT (zod) | MIT (82) · ISC (8) · BSD-3 (2) · BSD-2 (1) | — |
| Passes the `npm run licenses` allow-list | Yes (both licences already on it) | Yes | n/a |
| Raw JSON-Schema tools | Yes (low-level `Server`; `fromJsonSchema`) | Yes | Yes |

**Licence note, recorded rather than smoothed over:** the repository's `LICENSE` says the
project is "undergoing a licensing transition from the MIT License to the Apache License,
Version 2.0". New code is Apache-2.0, and contributions without relicensing consent stay
MIT. GitHub reports `NOASSERTION` for that reason. Both licences are on the allow-list
and both are compatible with this project's AGPL-3.0-or-later, so this needs no new
entry.

### Why v2, and why the SDK at all

- **Size doesn't matter here and drift does.** The server runs in Node, outside the
  browser bundle, so the 108 KB is never shipped to a user. What a hand-rolled loop would
  have to own is the protocol around the two calls we care about:
  - the `initialize` handshake and protocol-version negotiation, across dated spec
    revisions;
  - capability advertisement, `tools/list` pagination, `resources/list` and `read`
    (`ai-009` wants `warpcad://scene`);
  - `notifications/cancelled`, progress, and error codes.

  That's exactly the kind of moving spec where an official, actively maintained client
  (pushed the day this was written) beats a private copy.
- **v2 over v1** because v1 brings an HTTP server stack (express, hono, CORS, OAuth via
  `jose`) for transports `ai-009` doesn't use. That's 94 transitive packages against 3,
  each one a licence row and an audit surface. v2 puts stdio behind its own subpath
  (`@modelcontextprotocol/server/stdio`), so nothing HTTP is imported.
- **Its own `mcp/package.json`.** `ai-009` already allows this. It keeps the MCP
  dependencies out of the root production list that `npm run licenses` and the browser
  build read. `mcp/` imports `src/core/` and `src/ai/tools/` by relative path. Both are
  framework-free and already run in plain Node under Vitest.

**Health concern to re-check when `ai-009` starts** (per `CLAUDE.md`'s re-check rule):
26.6% open issues is the highest ratio in this document, and v2 is new (the split
packages run from `2.x`). If `ai-009` starts months from now, re-run this table. If v2 has
stalled, v1 is a drop-in fallback with the same licence answer.

### Rejection table

| Rejected | Specific reason |
|---|---|
| `@modelcontextprotocol/sdk` v1 | 94 transitive packages, mostly an HTTP/OAuth stack for transports v1 of WarpCad's server doesn't use. Same maintainers and repository as v2, so it gains nothing on health. Kept as the fallback if v2 stalls. |
| Hand-rolled stdio JSON-RPC | Saves ~100 KB that is never shipped to a browser, and in exchange WarpCad owns protocol-version negotiation and every spec revision. The one argument for it, "no dependency", carries little weight for a Node-only tool with a 3-package tree. |

---

## Decision 4 — Tool-input validation: **reuse the registry; no zod, no ajv in the app**

Measured for comparison: **ajv 8.20.0** is 38,034 B min+gzip (MIT, 2 maintainers, last
release 2026-04-24). **zod 4.6.5** with `z.object` + `toJSONSchema` is 92,220 B (MIT,
**1** npm maintainer, last release 2026-09-13).

The decision:

1. **The registry stays the authority.** A record the model proposes goes through
   `document.appendAll`, which runs the same trial fold and `ReplayRejection` as every UI
   write. That already validates every param that matters (positive millimetres, finite
   angles, operand kinds, sketch outline shape, the hostile-input point caps). A second
   validator that disagreed with it would be a bug, not a safety net.
2. **A structural pre-check, not a schema engine.** `src/ai/tools/schema.js` (`ai-002`)
   both *emits* the JSON Schema and *checks* inputs against that same small subset:
   `type`, `properties`, `required`, `enum`, `minimum`/`maximum`, `items`,
   `additionalProperties: false`. That's about a hundred lines, and its only job is to
   turn "wrong shape" into a named, model-readable error before a record is built. The
   subset is closed: `schema.js`'s spec fails if the emitter ever produces a keyword the
   checker doesn't handle.
3. **`strict: true` on Anthropic tool definitions.** The API then guarantees
   schema-valid `tool_use.input`. `strict` requires `additionalProperties: false` and
   `required`, which the subset above already has. **Eager input streaming
   (`eager_input_streaming`) stays off**: our inputs are small JSON records, not file
   contents, and turning it on would switch off the API-side validation `strict` provides.
4. **The MCP path runs the same pre-check.** MCP clients aren't bound by Anthropic's
   strict mode. `zod` does arrive in `mcp/` as a dependency of the MCP SDK, but the tool
   registry doesn't use it, so the browser and Node paths validate identically.

**Rejected**: ajv (38 KB to validate a schema subset we generate ourselves) and zod (92 KB,
a single maintainer, and it would make zod schemas the source of truth, a second
definition of every op's params beside the registry's).

---

## Decision 5 — Undo vs origin scoping: **a branch per turn, then one Undo AI turn**

> **Note, 2026-10-12 (`TODO/docs-022`, M15; accepted 2026-10-12).** M15
> replaces "**the human is paused**" while a turn runs. The fork stays; the human keeps editing
> the live document, a status chip with a **Watch** toggle shows the AI's fork, and the turn
> lands by **merge** (`docs/decisions/document-sync.md`) instead of a plain append onto a
> document nobody else touched. Undo AI turn and the origin rule below are unchanged. The text
> below is as decided on 2026-10-06, **amended by `ai-017` (2026-10-14)**: see "Amended by
> `TODO/ai-017`" at the end of "How the chosen design works".

### What `src/core/document.js` already guarantees

See the `data-003` and `core-030` notes in that module, around lines 109-180:

- Undo is **remove-and-rebuild**, not inverse-append. Removing steps is `splice` plus a
  re-fold through the same `ingest` every append uses, and a refused rebuild changes
  nothing.
- **Only `origin: 'local'` steps go on the undo stack.** A programmatic record is in
  `entries`, in `bodies()` and in History, but Undo can't reach it.
- Undo **refuses by name** when a step someone else added depends on the step being
  taken back. It doesn't delete their work.
- When nothing has changed since a step, Undo *restores* the previous state in O(1)
  (`stateToken`). Otherwise it re-folds, and `core-031`'s FoldCache makes that cheap
  (0.1-6.5 ms on the 24-body scene).
- Throwaway documents (the History preview, the tail shadow check) are seeded from
  `foldableEntry` copies and **share the live document's `foldCache`**, so they rebuild
  nothing the live document already built.

### The three candidates

| | **Branch per turn + Undo AI turn (chosen)** | Put AI steps on the local undo stack | History-revision (append an inverse) |
|---|---|---|---|
| Fits `CLAUDE.md`'s "programmatic edits never land in the local undo stack" | Yes | **No**: violates it outright | Yes |
| One action takes the whole turn back | Yes | Only if the turn is one step, and it still mixes with the human's own steps | Yes, as one appended revision |
| Cancel, Stop or an error mid-turn leaves the document byte-identical (`ai-005`) | **Free**: discard the fork | Needs a rollback of partly appended records | Needs an inverse of each partial record |
| Works for a `consumes` record (boolean, group) | Yes (removal re-derives `mergedInto`) | Yes | **No**: there's no honest inverse for consumption, as `data-003` already found |
| Matches section 18 ("only Undo removes a recent step") | Yes | Yes | **No**: puts two History rows where the user expects none |
| Needs a CRDT | No | No | No |
| New code in `src/core/` | One public hook: remove a set of record ids atomically, with the existing by-name refusal | A change to stack policy | A second, parallel history mechanism |

### How the chosen design works

1. **Fork.** When a turn starts, the agent (`ai-005`) creates a throwaway document seeded
   with `foldableEntry` copies of the live entries, sharing the live `foldCache`. That's
   exactly what the History preview already does, so seeding costs a cache-hit fold, not a
   cold one. The fork also carries the rollback marker and resolution, so `appendAll`'s
   insert-at-marker behaves identically.
2. **Build on the fork.** Every write tool runs against the fork, with origin `ai`. The
   model's `describe_scene`, `measure` and `capture_view` read the fork, so the model sees
   its own intermediate results. The viewport shows the fork in the **existing preview
   mode** (`ui-032`'s amber outline). Operations, Library, Undo and Redo are disabled
   there already. So **the human doesn't edit while a turn runs**, which makes the turn
   single-writer by construction (decision 6).
3. **Land, or discard.**
   - **Success**: the fork's new records (those beyond the seed, in order) are appended to
     the live document in **one** `appendAll` with origin `ai`. That's atomic: the trial
     fold either accepts all of them or raises a `ReplayRejection` and changes nothing. A
     turn record `{ turnId, recordIds, stateToken }` is pushed onto an in-memory
     **AI-turn stack**.
   - **Stop, cancel, error or cap hit**: the fork is dropped, and the live document was
     never touched.
4. **Undo AI turn.** This pops the AI-turn stack and removes exactly those record ids
   through the same remove-and-rebuild:
   - It **restores in O(1)** if the live `stateToken` still matches, which is the common
     case: "I don't like that", pressed right away.
   - Otherwise it **re-folds**. If a later step (any origin) builds on one of the turn's
     records, it **refuses by name**, for example: "Cube 3 was moved after this turn —
     undo that first". That's section 19's point 4, applied to the AI.

   The local undo stack is never touched in either direction: a local Undo can't remove
   an AI record, and Undo AI turn can't remove a local one.

   **Amended by `TODO/ai-014` (project variables).** The variable tools change existing rows
   in place (a variable's value, a param bound to it) and `delete_variable` takes one row
   out, so a turn is no longer only "new records". The fork is diffed against the live log
   by record id: new ids land with `insertAt` as before, revised rows land as one `ai`-origin
   `reviseRecords`, removed rows as one `removeRecords`, all inside one `document.batch`.
   The turn record keeps each revised row's previous record and each removed row's index and
   entry, and Undo AI turn applies the inverse in the same batch: the removed rows go back at
   their index with their own origin and intent (`insertAt`'s `entryOrigins`), the revised
   rows get their previous records back, and the new rows come out. Still no entry on the
   local undo stack. This is restoring the exact prior rows, not the rejected
   history-revision (an appended inverse the user would see in History).
5. **Not persisted.** The AI-turn stack is in-memory, like the local stacks (section 19:
   undo doesn't survive a reload or an Open). After a reload the turn's rows are still in
   History with their `ai` chip and can be edited or suppressed like any other row.

**Amended by `TODO/ai-017` (2026-10-14): the human keeps editing; a turn lands by merge.**
Points 1-4 above described a single-writer turn. As built now:

- **Fork as a replica.** The fork is an empty document with its own replica id, seeded by
  `fork.mergeFrom(live.mergeState())` rather than `loadEntries`, so it carries the live rows with
  their own stamps and position keys (a load would derive legacy ones, and the fork's new rows and
  revisions would then mis-order or lose on landing). Its id counter starts past the live ids, as
  the old seed's did, and its merge clock starts from the live document's. Before **every** tool
  call the fork also reads the live clock (`observeMergeClock`, a Lamport receive with no data):
  an edit the user made earlier in the turn is then always stamped earlier than the fork's next
  write, so "first writer sorts first" holds by wall order at tool-call granularity, not by
  replica id.
- **No pause.** Point 2's "the viewport shows the fork in preview mode … so the human doesn't
  edit while a turn runs" is withdrawn. (As built by `ai-006` it was a backstop — a turn whose live
  document changed was refused — not an on-screen lock; both are gone.) The preview machinery is
  kept for an opt-in **Watch**: the viewport shows the fork read-only in `ui-032`'s amber
  preview, with Operations, Library, Undo and Redo disabled while watching. The fork does **not**
  receive the user's mid-turn edits: one merge at the end, not continuous two-way merging.
- **Land by merge.** Point 3's `appendAll` / `insertAt` + `reviseRecords` + `removeRecords` (and
  `ai-014`'s by-id diff, `forkChange`) is replaced by `live.mergeFrom(fork.mergeState(), { origin:
  'ai' })`: atomic, never on either undo stack, every row keeps the origin and intent it was born
  with. A row that no longer builds is flagged (`docs-022`), shown with `ui-062`'s banner, and
  named to the model on its next turn as one `document_data` line (decision 7). Rows both writers
  changed resolve by stamp; the transcript says whose change was kept.
- **Undo AI turn** (point 4) is the merge's returned `change`, restricted to the fork's own diff
  from its seed, undone by `ui-062`'s inverse (`src/core/mergeUndo.js`, moved out of the merge
  store so `src/ai/` stays framework-free) under origin `ai`. Same meaning: it removes the turn's
  rows, restores the rows it revised, brings back the ones it removed, and refuses by name when a
  later step builds on one of them; it is offered only while nothing has changed since the turn
  landed (edits made *during* the turn don't count).
- **Selection.** `get_selection` and `select` act on the fork's own selection, seeded from the
  user's at turn start; the user's selection is never changed by a turn.
- **Unchanged:** the caps count the fork's records (`limits.js`), not the merged total; decision
  11's one-writer rules for the live bridge (`ai-012`) are not relaxed here.

**What `ai-006` should surface** (not decided here, flagged): the header **Undo** does
nothing to an AI turn, by rule. When the most recent change is an AI turn and the local
stack is empty, Undo's disabled-reason line should say so and point at **Undo AI turn**.
Otherwise "Undo does nothing" will be found by a human, not by a spec.

**No Redo AI turn in v1.** Re-asking is the redo. The transcript keeps the request.

### Why the other two fail

- **AI steps on the local undo stack** breaks the one rule `CLAUDE.md` has held since
  kickoff. It also interleaves badly: a human Undo would remove the AI's step instead of
  their own last action, or the reverse.
- **History-revision (an appended inverse)** was already rejected for the whole document
  by `data-003`. There's no honest inverse of a `consumes` record, and an "anti-record"
  is a second history mechanism invented to avoid using the first. It would also put two
  History rows where section 18 promises Undo removes one.

### "AI works on a branch" as an accept/discard *proposal*

The branch above **is** that model. The open question is only whether success lands
automatically or waits for an explicit **Accept**:

- **Decided for v1: land automatically at the end of a successful turn.** **Undo AI
  turn** is the one-step reject. Making Accept mandatory would put a confirmation on
  every turn, including "place a cube". The fork already gives what a proposal was meant
  to give: atomicity, no partial writes, and a clean discard on Stop.
- `ai-008`'s **confirm-before-save** (saving a traced group to the library) stays an
  explicit confirmation, because that writes outside the document.
- A **"Review each turn before applying"** setting can be added later on the same fork,
  with no core change. It's flagged in the items at the end.

---

## Decision 6 — Concurrency: **closed-file MCP for v1; `ai-012` reserved**

> **Note, 2026-10-12 (`TODO/docs-022`, M15; accepted 2026-10-12).** M15
> replaces "**no merge, ever**". A project file the MCP server changed on disk is **merged
> automatically** into the open project, followed by a toast with **Undo merge** (`io-010`);
> the Reload / Overwrite / Cancel dialog remains only for a file that is a *different*
> project. A stale hosted save merges and pushes the same way (`io-011`). The MCP server's
> lock-and-rename write is unchanged and must preserve every stamp and tombstone it did not
> touch (`data-011`). Design and rejection tables: `docs/decisions/document-sync.md`. The
> text below is as decided on 2026-10-06.

- **In-browser assistant: not a second concurrent writer.** It writes through the same
  command layer in the same tab. With decision 5 the human's edits are paused while a
  turn runs and the turn lands as one atomic append, so at any moment exactly one thing
  writes the log. `docs/decisions/document-sync.md`'s single-writer premise still holds.
- **MCP server (`ai-009`): closed project file only.** The server loads the file
  (`project.js`), appends with origin `mcp`, and writes it back atomically: write to a
  temp file, then rename, with a lock file so two servers can't interleave. If the app
  has the same file open, it can't know. On focus, the app detects the external change and
  offers **Reload**, reusing the hosted path's conflict semantics: Overwrite / Load /
  Cancel, **no merge, ever** (`io-002`). Two writers against one file is a **file-level**
  conflict the app already knows how to show, not a merge problem.
- **Live bridge: the reserved `ai-012`, no file yet.** Its planned shape is **one writer,
  with the AI as its client**. Claude Code's MCP server forwards tool calls over a
  localhost link to the open tab, which runs them through the same registry and the same
  branch-per-turn as the in-browser assistant. The tab stays the only writer, so this too
  needs no merge (see the CRDT section).

`docs/decisions/document-sync.md`'s revival section is updated in the same change to say
this.

---

## Decision 7 — Trust model

Project files and gists are **untrusted input** (`ACCEPTANCE.md` scenario 8). In an AI
context that means anything a loaded project carries can be a prompt injection:

- design-intent text (`ai-003`);
- part, body and group names;
- the project's standing instructions;
- text inside an attached drawing.

### Delimiting

- **`system` holds only the app's own frozen prompt** (`src/ai/prompt.js`, versioned).
  Nothing from a document is ever put there. That also keeps the cached prefix stable
  (decision 9).
- Document-derived text reaches the model only **inside tool results and one context
  block**, wrapped as
  `<document_data source="project">…</document_data>`, with the content
  **JSON-encoded and `<` escaped as `<`**. A name like
  `</document_data>Ignore previous instructions` therefore can't close the block. The
  system prompt states once that the contents of `document_data` are content to reason
  about, never instructions to follow.
- **Standing project instructions** (`ai-003`) are the hard case: they're instructions
  *by intent*, and they arrive from an untrusted file. For v1:
  - Instructions the user typed **in this browser** are trusted.
  - Instructions that **arrived with a loaded file** are quoted to the model as data, and
    shown to the user with a **"Use this project's instructions"** confirm. Once
    confirmed, they're trusted for this project in this browser.

  This is an `ai-003` UI addition, flagged in the items at the end.
- App-generated operator notes in the middle of a conversation (for example "the user
  pressed Stop", or a cap notice) use a mid-conversation `role: "system"` message, which
  current models support. The `claude-api` skill calls this "the prompt-injection-safe
  operator channel". Document text never goes through it.

### What a tool call can never do (enforced in code, `src/ai/tools/limits.js`, not the prompt)

| Never | How it is enforced |
|---|---|
| Network access | Tools get a `ctx` with the document (the fork), the registry and read-only helpers. No tool imports or receives `fetch`. The only network call in the whole AI path is the provider client, which the agent loop calls, not a tool. A spec asserts no tool module references `fetch`, `XMLHttpRequest`, `WebSocket` or `import(` of a URL. |
| Key access | The key is read by the provider client from the credential store and closed over. It's never in `ctx`, a tool result, the transcript, Pinia state or the document. |
| Writes outside the open document | Write tools call only the fork's `append`/`appendAll`. There's no save, export, download, library-write or settings tool in v1 (`ai-008`'s save-to-library is a **human-confirmed** action, not a tool side effect). The MCP server writes only the one file it was started with. |
| Unbounded work | **Starting values**, constants in `limits.js`, tuned by `ai-011`'s evals. Every cap stops the turn and **says so**, never silently truncates. **Records per call**: 50. **Records per turn**: 200. **Tool calls (steps) per turn**: 40. **Consecutive failures of the same tool**: 3, then stop and ask the user. **Wall clock per turn**: 10 minutes. **Sketch points**: the sketch model's existing hostile-input caps. |
| Address something the document didn't issue | Operand ids must exist in the fork, as `ai-002` specifies. |
| Act on model-supplied HTML or URLs | See decision 8: model output is rendered as text and no remote resource is ever loaded from it. |

The caps also bound what an injection can achieve. The worst a successful injection can
do is spend tokens up to the caps and build unwanted geometry on a fork, which lands as
one turn that **Undo AI turn** removes.

---

## Decision 8 — Key handling

**Where it lives.** It's the existing credential boundary. `src/storage/tokenStorage.js`
(`io-002`) was written generically "so the eventual BYOK chat client stores its API key
here instead of inventing a second credential boundary". The key is stored under a new
key name (for example `ai-anthropic`) in the `warpcad-credentials` IndexedDB database.
`ai-004`'s `src/storage/aiKey.js` is a thin wrapper over `createCredentialStore`, not a
new store. The existing failure policy applies unchanged: `read` never rejects, `write`
rejects, and a private window degrades to session-only with a visible note.

**Where it never goes.** None of the following may contain the key, and `ai-004`'s spec
serialises each of them and greps for it:

- the autosave blob and the `localStorage` safety copy;
- the project file and a gist;
- an export (STL/OBJ/glb);
- the URL or hash;
- the transcript;
- a log line, an error message, Pinia state or a getter.

It goes in the `x-api-key` header of requests to an **allowlisted origin**
(`https://api.anthropic.com`, checked at client construction, as `hostedBackend.js`
does), and nowhere else. The UI never shows it back after entry, following the Connect
dialog's uncontrolled-field pattern. **Forget key** deletes the record.

**The named exposure: XSS on the origin.** Neither IndexedDB nor memory is protected from
script running on this origin. A successful script injection can read the key and spend
on it. Two things make the AI path a *new* XSS surface:

1. Model output is attacker-influenced text, because injected document text can steer it.
2. Rendering model output as HTML or Markdown-with-images is the classic exfiltration
   route. An image tag with a URL carrying data gets the browser to send it.

**Mitigations (ai-004 / ai-006 must build these):**

1. **No HTML from model output, ever.** Transcript text is rendered as text nodes.
   There's no `v-html` and no `innerHTML`: `src/sketch/imageJob.js` already states the
   same rule for user images, and today's tree has no `v-html` (grep-checked). If
   Markdown formatting is wanted later, it goes through a renderer that emits text and
   element nodes only and **never loads a remote image or auto-follows a link**. A guard
   spec greps `src/components/ai/` for `v-html`/`innerHTML`.
2. **A Content-Security-Policy as a `<meta http-equiv>` tag.** GitHub Pages can't set
   response headers, and a meta CSP can't express `frame-ancestors` or reporting, which
   is stated so nobody assumes otherwise. Starting point:
   - `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'`
   - `connect-src 'self' https://api.anthropic.com https://api.github.com`
   - `img-src 'self' blob: data:; worker-src 'self' blob:`

   `connect-src` is the part that matters: injected script can't post the key anywhere
   else with `fetch`. `img-src` blocks the image beacon. `ai-004` must verify the exact
   policy against the running app in all three engines, with a spec that fails on any
   `securitypolicyviolation` event. Gist loading, the PWA service worker and the
   evaluation and export workers are the parts most likely to need an entry.
3. **Advise a spend-limited key.** `docs/ai-partner.md` (`ai-004`) tells the user to
   create the key in a Console workspace with a monthly spend limit. That's the honest
   answer to "what if it leaks anyway".

---

## Decision 9 — Cost: model, readout, prompt caching

From the `claude-api` skill (model table cached 2026-09-25), not from memory:

| Model | id | Input $/MTok | Output $/MTok | Cache read | Min cacheable prefix |
|---|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4.00 | $20.00 | $0.20 | 512 tokens |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2.00 | $10.00 | $0.20 | 512 tokens |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 | ~$0.10 | **4,096** tokens |

Cache writes cost 1.25× input on the 5-minute TTL.

**Default model: `claude-opus-5-5`.** Both target prompts are long-horizon, multi-step
spatial builds with vision, the workload where model capability matters most. The model
id is **data**, one setting `ai.model` (`ai-004`), never repeated across files.

The key sheet offers **Opus 5.5 (default)** and **Sonnet 5.5**. Haiku 4.5 is left out of
v1: it takes a different thinking configuration (`budget_tokens`, not adaptive), and its
4,096-token cache minimum changes the caching arithmetic, so it would need a second
request shape. Downgrading the default for cost is the user's choice per
the `claude-api` skill's guidance, and the setting is where they make it.

**Request shape** (`src/ai/client.js`, the one place it's built):

- `stream: true`, `max_tokens: 64000`.
- `thinking: { type: "adaptive" }`. On Opus 5.5 it can't be disabled, and
  `{type:"disabled"}` returns a 400.
- `output_config: { effort: "high" }`, **set explicitly**. Opus 5.5 defaults to `medium`,
  one level below Opus 5. `high` is the skill's minimum for intelligence-sensitive work,
  and `ai-011` measures whether `medium` holds quality.
- `tool_choice: { type: "auto" }`. Forced `any`/`tool` returns a 400 on Opus 5.5 and
  Sonnet 5.5. Tools carry `strict: true`, with no assistant prefill.
- **`stop_reason: "refusal"` handled explicitly.** It's shown as a plain message and the
  turn is discarded like any other failure.
- **Refusal fallback.** The skill recommends opting in by default for Opus 5.5:
  `fallbacks: "default"` with beta header `server-side-fallback-2026-07-01`. It's
  **included and flagged** in the items at the end. A CAD conversation rarely triggers a
  safety classifier, so it's cheap insurance, and the user may decline.

**Prompt caching: yes, on the stable prefix.** Render order is tools → system →
messages, and caching is a byte-exact prefix match:

- **Tools**: `list_tools` output in a **deterministic order** (sorted by name) with
  deterministic key order. A varying tool set is a listed silent invalidator, so the tool
  list is per-transport, not per-turn.
- **System**: the frozen versioned prompt, with **one explicit `cache_control`
  breakpoint at its end**. No timestamp, scene summary, selection, standing instructions
  or model-visible state goes in `system`. Those go in `messages`.
- **Top-level automatic caching** (`cache_control: {type:"ephemeral"}`) for the growing
  conversation tail. Within a turn the agent's requests are seconds apart, so the default
  **5-minute TTL** stays warm on its own. The 1-hour TTL (2× write) buys nothing here.
- The tool definitions alone are expected to exceed Opus 5.5's 512-token minimum. That's
  **not measured yet**: `ai-010`'s live run must confirm `usage.cache_read_input_tokens > 0`
  on the second request of a turn, and a zero there is a bug.

**What the chat shows** (`ai-006`), per turn:

- **input**, **cache read**, **cache write** and **output** tokens, summed from each
  request's `usage`;
- an **estimated cost**, computed from a dated price table keyed by model id (data, not
  code) and labelled "estimate";
- a running session total.

The key sheet names the model in use.

**Illustrative arithmetic, not a measurement.** Take a 20-step turn whose context grows
to about 30k tokens per request, with roughly 2k new uncached tokens and about 1k output
tokens per step, on Opus 5.5:

- cache reads ≈ 20 × 30k × $0.20/M = **$0.12**
- uncached input ≈ 20 × 2k × $4/M = **$0.16**
- output ≈ 20 × 1k × $20/M = **$0.40**

That's about **$0.70 per turn**, with output dominating. Without caching, the input side
alone would be about 20 × 32k × $4/M ≈ $2.56. These numbers exist to show *why* caching
is on and *why* output is the term to watch. `ai-010`/`ai-011` replace them with measured
ones.

---

## What a scripted run proves (and what it cannot)

`ai-010` adds a **scripted provider** (`src/ai/providers/scripted.js`): the `AiClient` replayed from
a recorded or hand-written list of model replies, so a spec can drive the **real** agent loop,
tool registry, document, kernel worker and viewport with no network and no key. It is a boundary
mock in `CLAUDE.md`'s sense.

- **It proves the plumbing.** A reply streams in chunks that split words; a tool call lands on the
  real registry; the document changes and the viewport shows every body; Stop lands nothing; Undo
  AI turn removes the whole turn; a follow-up edits instead of duplicating; a library save waits
  for Confirm.
- **It never proves the model's choices are good.** Which airfoil it picks, whether it asks about a
  connector height, whether its overlay residual is honest: only the live runs of scenarios 17 and 18
  in `TODO/ACCEPTANCE.md`, and `ai-011`'s eval, say anything about those. A green scripted run is
  evidence about *our code*, never about the model.
- **It cannot be mistaken for the model.** The chat panel wears a **Scripted** badge, the status
  line says "no model, no key", and the mode exists only in a dev build: a transcript on
  `window.__WARPCAD_SCRIPTED__` is read only when `import.meta.env.DEV` is true, and a spec runs the
  production build to prove it is ignored there. It never reads, writes or forgets the real key.
- **A stale transcript fails, it does not pass.** Each transcript carries a hash of the input
  schema of every tool it calls. When a schema changes, the unit stage fails with "re-record" and
  the scripted client refuses to play the stale call. The fix is to update the calls, run the
  browser spec, and only then run `npm run ai:stamp`.

## CRDT, explicitly: would a CRDT help the AI co-editor?

> **Amended 2026-10-12 (`TODO/docs-022`, accepted 2026-10-12).** The user
> reversed the "one writer" premise below: the AI is a second writer on the same file and its
> edits should **merge**. The answer to *this* section's question is unchanged, **still no CRDT
> library**, and the comparison below was re-checked on 2026-10-12 with the same result. What
> changed is that a merge now exists: a **hand-rolled, state-based merge over the NDJSON
> project file** (replica ids, Lamport stamps, position keys, tombstones), recorded in
> `docs/decisions/document-sync.md`. Point 3 below ("there's no concurrent writer to merge")
> is no longer true from M15 on; points 1, 2 and 4 still hold and are why the merge is
> hand-rolled rather than a library. Kept as written below as the record of the 2026-10-06
> reasoning.

**No.** That was the starting position (user, 2026-10-02), and nothing in decisions 1-8
found a concrete need the branch model and one-writer `ai-012` can't meet.

### Options compared

| | **Branch per turn + one writer (`ai-012`) — chosen** | Yjs | Automerge | Loro |
|---|---|---|---|---|
| npm version | — (no dependency) | 13.6.33 | 3.5.0 | 1.16.4 |
| GitHub stars | — | 22,898 | 6,645 | 6,195 |
| Open / closed issues | — | 114 / 407 (21.9%) | 68 / 254 (21.1%) | 42 / 204 (17.1%) |
| Last push | — | 2026-10-03 | 2026-10-06 | 2026-09-30 |
| npm maintainers | — | **1** | 6 | 2 |
| Unpacked size | 0 | 2.3 MB | 47.5 MB (WASM) | 20.8 MB (WASM) |
| Licence | — | MIT (npm) / `NOASSERTION` (GitHub) | MIT | MIT |
| Guarantees convergence | n/a (one writer) | Yes | Yes | Yes |
| Guarantees the merged log still **replays** | Yes (the trial fold gates every landing) | **No** | **No** | **No** |
| Origin-scoped undo | Already built (`document.js`) | Yes (`UndoManager` `trackedOrigins`) | Manual | Yes (per-peer undo) |
| Fits the timeline's **reorder** and shared **rollback marker** | Yes (it's the existing log) | Poorly: an array move is delete plus insert, and concurrent moves duplicate | Poorly (list move, same issue) | Better (has a movable list), still no shared-marker semantics |

Yjs's origin-tracked undo is a real point in its favour and is recorded as such. It
doesn't change the answer, because this project already has origin-scoped undo.

### Why not

1. **Convergence isn't replayability.** A CRDT guarantees two replicas end with the same
   *array*. It doesn't guarantee that array still *folds*. Two writers can concurrently
   produce a `consumes` of a body the other just superseded, or a fillet on an edge the
   other just removed. Every merge would still need `ReplayRejection` handling (`data-004`)
   and a human-facing answer, so the CRDT removes no work from the hard part.
2. **The timeline's operations fit CRDTs badly.** Reorder (`data-004`'s `canMove`) is an
   array move, and the Fusion-style **rollback marker** is a single shared cursor whose
   meaning depends on the whole log. Neither has a natural CRDT type.
3. **There's no concurrent writer to merge.** The in-browser assistant writes on a fork
   while the human is paused (decision 5). MCP edits a closed file and conflicts at file
   level (decision 6). The live bridge's planned design keeps the tab as the one writer
   (`ai-012`).
4. **Cost.** A dependency (one of them single-maintainer, two of them tens of MB of WASM),
   a document-model rewrite around shared types, and a merge test matrix. All of that for
   a scenario this milestone doesn't contain, in the exact library family `CLAUDE.md` says
   not to carry forward by default.

### Rejection table

| Rejected | Specific reason |
|---|---|
| Yjs | Merges arrays, not parametric histories: a merged log can converge and still not replay. A single npm maintainer. Its one real advantage (origin-tracked undo) already exists in `document.js`. Explicitly not a carried-forward default (`CLAUDE.md`). |
| Automerge | Same convergence-vs-replay gap. 47.5 MB WASM package for a static PWA. List-move semantics don't fit reorder plus a shared rollback marker. |
| Loro | The best fit of the three for reorder (a movable list), but the same convergence-vs-replay gap and no answer for the shared marker. A 20.8 MB WASM package. |
| OT | Already rejected in `document-sync.md`: needs a sequencing server this static-hosted app doesn't have. |

**Revisit only if multi-person real-time editing becomes a goal.** That's a second
*human* in a second browser editing the same open project live. It's the one scenario
where "one writer" stops being achievable by design, and it's recorded as the revival
condition in `docs/decisions/document-sync.md`.

---

## Decision 10 — Subscription users: **the MCP route is the subscription path; the chat panel stays BYOK** (`ai-013`, proposed 2026-10-11)

**The question.** A Claude Pro/Max subscriber has no API credit. Can the in-app chat
panel draw on the subscription instead of a pasted API key?

**What the terms say (re-read 2026-10-11; secondary reports and Anthropic's own
Claude Code "legal and compliance" page, not a quote of the Consumer Terms themselves):**

- Subscription OAuth is intended exclusively for purchasers of Free, Pro, Max, Team and
  Enterprise plans using Claude Code and native Anthropic apps.
- Developers building products or services on Claude, including on the Agent SDK, "should
  use API key authentication".
- Third-party developers may not offer Claude.ai login or route requests through
  Free/Pro/Max credentials on their users' behalf, and Anthropic may enforce this
  without notice. Server-side blocking of such tokens was reported from January 2026.
- Pro/Max limits assume ordinary individual use of Claude Code.

**Verdict:** the terms have not loosened. A static PWA that held or forwarded a
subscription OAuth token would be exactly the prohibited case, and it would also break
Decision 8 (the credential never leaves the credential store).

### Options compared

| Option | Uses the subscription? | Verdict |
|---|---|---|
| A. Reuse the subscription OAuth token in the chat panel | Yes | **Rejected** — prohibited by the terms above; account risk to the user. |
| B. Claude Code + the MCP server (`mcp/server.js`, `ai-009`) | Yes, billed by Claude Code to the subscription | **The subscription path.** Closed-file only in v1 (Decision 6). No new code besides discovery. |
| C. Claude.ai custom connector (remote MCP) | Yes | Deferred — WarpCad has no backend; needs a user-run tunnel or the `ai-012` bridge. Revisit when `ai-012` exists. |
| D. Keep BYOK, make it cheaper (smaller default, visible cost) | No | **Kept** for people who have a key; cost chip below. |
| E. Second provider with a free tier or local model | No | Out of scope for v1; the one-method interface keeps it possible. A separate TODO if wanted. |

### What this decision commits to

1. The chat panel's no-key state offers two separate choices: *Add API key* (existing) and
   *Use my Claude subscription…*, which shows the `claude mcp add` command (copy button)
   and links to `docs/mcp.md`. The app states plainly that the key box is billed as API
   usage and that the subscription route runs in Claude Code, not in the panel.
2. The per-turn readout gains an **estimated cost** from a dated price table in
   `src/ai/models.js` (data, labelled "estimate", one place), as Decision 9 planned. The
   current token-only readout (`TokenReadout.vue`, `ai-006`) is extended, not replaced;
   missing `usage` renders nothing, never `NaN`.
3. No subscription token is ever read, stored or sent by WarpCad.

---

## Decision 11 — Live bridge: **a document-less relay, one writer (the open tab), explicitly enabled** (`ai-012`, accepted 2026-10-12; dev-host access amended 2026-10-16)

**The question.** Decision 6 reserved `ai-012`: let Claude Code (on the user's own
subscription, Decision 10 option B) edit the project the user has **open**, without a
merge. `document-sync.md`'s revival condition ("a second concurrent writer") is answered
by making the tab the only writer and the AI its client.

### What this decision commits to

1. **A relay with no document.** `mcp/server.js --live` stays a stdio MCP server to
   Claude Code and also listens on `ws://127.0.0.1:<port>` (loopback only). A `tools/call`
   is forwarded to the connected tab, which runs it through the same
   `createToolRegistry().run` and returns the JSON (and PNG for `capture_view`). The helper
   never parses a project or writes a file in live mode. A file argument means closed-file,
   `--live` means live; **no silent fallback** between them (that would be two writers).
2. **Live mode lists the browser tool set** (`capture_view`, `get_selection`, `select` in
   addition to the shared tools). Records keep origin `mcp`. The registry gains one seam
   (a capability flag selecting the browser tool list), not a third copy of the tools.
3. **A turn is a group of landed batches, not a fork.** MCP has no turn boundary. Each write
   call lands at once as one atomic `mcp` batch; consecutive batches with the same
   `request` within a 60 s idle gap are one `aiTurns` entry, so **Undo AI turn** removes the
   group in one step and never touches the local undo stack. A failed call lands nothing.
4. **One writer is enforced.** Calls run serially on the tab; user edits are paused while a
   call runs (the existing preview-mode backstop). A call arriving mid-gesture waits up to
   10 s, then is refused with "the user is editing; try again". A call whose live document
   changed under it is refused, never landed over the change.
5. **Dev-host authorization and origin** (amended 2026-10-16 at the user's direction). The
   Vite dev-host live MCP endpoint is loopback-only and keeps its Origin gate, but no pairing
   code is required. Running `npm run dev` alone is not consent: the user explicitly enables
   access in WarpCad for **15 minutes**, **1 hour**, **this tab**, or **unlimited until manually
   turned off**. Timed access starts when enabled; expiry or turning it off revokes the live
   connection. While enabled, any local MCP client that reaches the loopback endpoint may
   request access, so the UI must state that scope. The bridge refuses ambiguous client/tab
   routing rather than sending a call to an arbitrary tab. WebMCP's separate Browser agents
   switch is unchanged.
   The earlier single-use code policy is removed for the dev host. The standalone live host is
   still deferred; its authorization policy must be decided if that host is built.
   *Consequence found while building it (`ai-023`, 2026-10-16):* "refuse when more than one client
   is connected" counts sessions, and a client that crashes or drops without the protocol's DELETE
   would stay counted until the dev server restarts. The dev host therefore closes a session that
   has sent no request for five minutes (`SESSION_IDLE_MS`, swept on the next request); a client
   that is merely quiet reconnects on its next call (the transport answers 404 and MCP clients
   re-initialize).
6. **Caps, trust and data rules unchanged** (Decision 7); no subscription token is read,
   stored or sent (Decision 10 point 3).

### The standalone WebSocket server: **deferred; `ws` not added** (decided 2026-10-12)

**Decision: dev host only for now.** `ai-012` ships the Vite-plugin host and no standalone
`--live` listener. No `ws` dependency enters `mcp/package.json`; if the standalone host is
wanted later, `ws` 8.x is the pick below and its health check re-runs then. A reserved roadmap
row holds it. Everything below in this section is the record of that later option.

The dev host uses Vite's WebSocket and needs none of this. Only the standalone host (a
built or hosted app) needs a WebSocket *server*.

Node has a WebSocket *client* but no server. Options:

| Option | Verdict |
|---|---|
| `ws` (MIT, no dependencies, the de-facto Node implementation) | **Proposed.** `mcp/` already has its own manifest and licence check; MIT is on the allow-list. Re-run the health check (stars, issues, release recency, maintainers) when pulling it in, per Library decisions. |
| Hand-rolled RFC 6455 over `node:http` `upgrade` | Rejected — ~200 lines of framing, masking and close handshake to own and test, for no licence or size gain in a Node-only helper. |
| Server-Sent Events + `POST` (no WebSocket) | Rejected — measured 2026-10-12: WebKit blocks `fetch` and SSE to loopback from an `https` page just as it blocks `ws://`, so it is no fallback (see the spike table). |
| Streamable-HTTP MCP direct to the tab | Rejected — the tab cannot listen; it must dial out, so a relay is needed regardless. |

### Browser-support spike (measured 2026-10-12, Playwright: Chromium 153, Firefox 155, WebKit 26.6)

A page served at `https://…` (route-fulfilled, so mixed-content rules apply) or at
`http://localhost`, probing a loopback listener:

| Engine | https page → `ws://127.0.0.1` | https page → `http://127.0.0.1` (fetch / SSE) | `http://localhost` page → `ws://127.0.0.1` (dev) |
|---|---|---|---|
| Chromium | **Blocked** (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) until the user grants *local network access*; **works once granted** | works once granted | blocked until granted, then works |
| Firefox | works, no prompt | works | works |
| WebKit | **Blocked** as mixed content, `localhost` too | **Blocked** (fetch and SSE) | works |

Consequences, now facts rather than risks:

- **Hosted (`https`) Safari and every WebKit-based iOS browser cannot use the live bridge.**
  There is no fallback transport: the block is mixed-content, not WebSocket-specific, so SSE
  plus `POST` does not help (that fallback row above is withdrawn). The Connect sheet says so
  on WebKit, plainly. It works from `npm run dev` (`http://localhost`).
- **Chromium shows a local-network-access permission prompt** on first connect; the sheet
  tells the user to expect it and to choose *Allow*.
- The e2e spec grants `local-network-access` for Chromium and asserts the WebKit message on
  the hosted origin rather than skipping.
- Port: default `47600`, `--port` override; a taken port is reported in the tool result,
  never silently re-picked.
- MCP SDK: `@modelcontextprotocol/server` 2.3.1 does export
  `WebStandardStreamableHTTPServerTransport` and `createMcpHandler` from its main entry
  (Request in, Response out), so the dev HTTP host needs no new dependency.

### Two hosts, one bridge core (amended 2026-10-12 at the user's request; **only the dev host is built in `ai-012`**)

The bridge is a framework-free module (`mcp/bridge.js`: call queue, access lease, one-writer
rules, timeouts) with two thin hosts:

| Host | When | Claude Code side | Tab side |
|---|---|---|---|
| **Vite plugin** (`configureServer`) | `npm run dev` | Streamable HTTP MCP at `http://127.0.0.1:5183/mcp` (`claude mcp add --transport http`), via the SDK's web-standard handler | **Vite's own HMR WebSocket**: custom events through `server.ws.on/send` and `import.meta.hot` (same origin, already connected, no new dependency, no port) |
| **Standalone** `node mcp/server.js --live` | the built / hosted app | stdio, as Decision 3 | `ws://127.0.0.1:<port>`, authorization policy to decide if built |

In dev the same-origin tab needs no cross-origin check and avoids the WebKit loopback
risk, but the HTTP endpoint is still reachable by any local web page, so the plugin keeps
the `Origin` allow-list and requires an enabled access lease in WarpCad. `npm run mcp:add -- --live --dev` registers
the HTTP form. The registry seam and `request` semantics are identical in both hosts; the
Vite plugin is dev-only and ships nothing in `vite build`. The MCP SDK's HTTP transport
must be confirmed available in `@modelcontextprotocol/server` 2.3.1 before building (it
will be recorded here).

### Compatibility with the M15 merge (`docs-022`, `data-008`..`data-011`; checked 2026-10-12)

The storage conversion landed as TODOs, and it is **not a CRDT library**: a hand-rolled,
state-based merge over the NDJSON file (replica ids, Lamport clock, position keys, tombstones).
`docs-022` and `ai-017` both say Decision 11 is left as written, so this section is the
bridge's side of the contract. The bridge holds no document, so almost nothing moves:

| M15 change | Effect on the bridge |
|---|---|
| **Replica ids** (`data-008`): one per tab, per AI fork, per MCP server process | The bridge helper has no document, so it needs **no replica id**. Tool calls run in the tab and mint ids from the tab's replica. A tab reload gets a new replica; the bridge just sees a reconnect. |
| **Ids become `op-<replica>-<n>`** | `@n` references resolve to real ids through `nextId` (`data-008` point 5 audits this). Nothing in the bridge parses an id. |
| **Every mutator stamps** (`data-010`) | The `mcp`-origin batch the bridge lands is stamped by the command layer like any other write; no bridge code. |
| **Tombstones; Undo records a `dead` stamp** | Undo AI turn on a group of batches is the same remove-and-record-tombstone path. |
| **`AiTurn` becomes `data-010`'s `change`** (`ai-017`) | The bridge's group must be recorded in that same shape, **not** a separate one. This is why `ai-012` builds after `ai-017`'s record exists. |
| **In-app turns stop pausing the user** (`ai-017`) | The bridge's calls land directly on the live document (no fork), so the pause-while-a-call-runs rule stays: it protects one call's read-then-write, not a long turn. A short, deliberate difference; `ai-017` point 7 reserves relaxing it. |
| **Files merge on disk** (`io-010`) and **Merge file…** (`ui-062`) can land mid-call | The staleness refusal (point 4) still applies, and now has a real source of staleness. |

**The one seam:** `documentRevision()` is the document's **Lamport clock value**
(`data-008`'s `clock`), which ticks on every mutation and observes every merged stamp. A call
records it at start and is refused if it moved before landing. A merge that only advances the
clock is a harmless false refusal, which the model is told to retry.

**What the premise now is.** Decision 11 originally said it "resolves the revival condition
without a merge". With M15 the document *has* a merge; the bridge is still a single writer
into it (the tab), with the AI as that writer's client, and needs no merge of its own. The
claim to keep is "no second replica", not "no merge exists".

**Ordering.** Build `ai-012` after `data-010` (stamping) and `ai-017` (the `AiTurn`
shape). `docs-022` must be accepted before `data-008` starts, so `ai-012` is gated on that
acceptance. The closed-file MCP changes under `io-010` (auto-merge replaces
Reload/Overwrite), so "closed-file unchanged" in this task's testing means *as `io-010` left it*.

### Honest limits

Desktop browser on the same machine only (a phone cannot reach another machine's
loopback). Any local process can try the port. The dev host now relies on the explicit
in-app access lease plus the loopback and Origin gates; while access is enabled, the user
accepts that local MCP clients can request access. The residual risk is another local
program on the user's machine, within the same trust boundary as the user's own shell.

---

## Decision 12 — Chat panel on the user's local Claude Code: **not built; the live bridge already covers the need** (`ai-015` closed as won't do, **decided by the user 2026-10-14**)

> **Outcome.** The user accepted a dev-host-only, opt-in build, then, comparing it with the live
> bridge (Decision 11), chose not to build it: Claude Code already edits the open project live on
> the user's plan, and the only gain left was typing in the panel instead of Claude Code. What
> was actually wrong was the panel telling a bridge-connected user to paste an API key; that is
> `ai-020`. The terms analysis and flag findings below stay as the record if this is reopened.

**The question.** `ai-015` would have had the `ai-012` helper spawn the user's own signed-in `claude` in
print mode (`-p`) from a text box in WarpCad's Assistant panel, so a subscriber gets an in-app
chat with no API key. WarpCad never sees a token; the binary is the official, unmodified one
on the user's machine. The open point was whether a third-party program driving `claude -p`
on a subscription login is permitted.

### What the terms say (fetched 2026-10-14, quoted)

From `code.claude.com/docs/en/legal-and-compliance` ("Authentication and credential use"):

- "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max,
  Team, and Enterprise subscription plans and is designed to support ordinary use of Claude
  Code and other native Anthropic applications."
- "**Developers** building products or services that interact with Claude's capabilities,
  including those using the Agent SDK, should use API key authentication through Claude
  Console or a supported cloud provider. Anthropic does not permit third-party developers to
  offer Claude.ai login into their own applications, or to route requests through Free, Pro,
  or Max plan credentials on behalf of their users. Moreover, developers may not collect,
  store, or intermediate Claude.ai credentials or session tokens."
- "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with
  their own Claude subscription, including where a platform hosts Claude Code as described
  under *Can customers offer Claude Code in their products?* above."
- "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude
  Code and the Agent SDK." and "Anthropic reserves the right to take measures to enforce
  these restrictions and may do so without prior notice."

From `code.claude.com/docs/en/headless`:

- "This page covers using the Agent SDK via the CLI (`claude -p`)." Print mode **is** the
  Agent SDK's CLI form, so the "including those using the Agent SDK" sentence names it.
- `--bare` "is the recommended mode for scripted and SDK calls, and will become the default
  for `-p` in a future release"; in bare mode "Claude Code never reads OAuth credentials or
  the system keychain". The subscription login works under `-p` today only because bare mode
  is not yet the default.

### Which side this falls on: **a grey area, accepted at personal scale**

- *For:* WarpCad holds no credential, the binary is unmodified, the user installed and signed
  in themselves, and the feature runs only on the user's own machine for the user's own
  ordinary use. Nothing is hosted, resold or intermediated.
- *Against:* `-p` is documented as the Agent SDK CLI, and the page tells products using the
  Agent SDK to use API keys without separating a company's product from personal tooling.
  Enforcement is "without prior notice" and lands on the **user's** account.
- *Direction of travel:* bare-by-default for `-p` could stop the subscription login working
  with no change on our side, so the feature must fail as one plain sentence (`ai-015` design
  6), never hang.

**Conditions the user accepted on 2026-10-14** (they would have been `ai-015`'s scope; kept for a reopening):

1. **Dev host only**, the same scope as `ai-012` (Decision 11): `npm run dev`. The built or
   GitHub Pages app never offers the engine and uses an API key (BYOK) or `ai-012`.
2. **Opt-in and labelled**: "Runs your local Claude Code. Uses your Claude plan's limits.
   WarpCad never sees your sign-in." Never the default engine.
3. **No shell, no file tools** in the spawned session (`--tools ""` plus the WarpCad MCP
   allow-list, `--strict-mcp-config`), because a model driven from a web page's text box must
   not get Bash.
4. **Off-switch**: the engine is one seam in the chat store and one helper message, so it can
   be removed without touching the key engine if Anthropic's wording changes.

### Technical findings

Verified against `claude --help`, Claude Code 2.1.263, 2026-10-14: `-p/--print`,
`--output-format stream-json` (with `--verbose` and `--include-partial-messages`),
`--resume <id>`, `--mcp-config` + `--strict-mcp-config`, `--tools ""`, `--allowedTools`,
`--permission-mode dontAsk`, `--permission-prompts none`, `--setting-sources`,
`--append-system-prompt`, `--no-session-persistence`. Exact spellings used are recorded in
`mcp/claudeRunner.js` and re-checked against `--help` when it changes.

### Options

| Option | Verdict |
|---|---|
| A. Build `ai-015`, dev host only, opt-in, labelled | Accepted on terms, then **not built**: low benefit over Decision 11. |
| B. Close as won't do; keep `ai-012` + BYOK, fix the panel's no-key state (`ai-020`) | **Chosen 2026-10-14.** |
| C. Ask Anthropic for a written answer first | Optional; revisit if the feature is ever offered beyond the dev host. |
| D. Engine that runs `claude --bare -p` with an API key | Adds nothing over BYOK; rejected. |

---

## Decision 13 — WebMCP: **a third transport onto `TabEndpoint`, registered whenever the browser has the API** (`ai-021`, **accepted by the user 2026-10-14**, default-on and the route table included)

**The question.** Decisions 1 and 11 give two routes in: the BYOK chat and Claude Code over the
dev-host bridge. Both need a key or a terminal. WebMCP lets an agent that already lives in the
browser call tools the page registers, with no socket, so the mixed-content and
local-network blocks of Decision 11's spike do not apply.

**The user's direction (2026-10-14):** *"If WebMCP is available in the browser it should be
supported."* This decision reads that as: feature-detect, register on by default, never throw
where the API is missing. It changes `ai-021` point 4 (see "The one change from the TODO").

### Facts re-verified 2026-10-14 (the TODO's text is wrong on four of them)

| Fact | Verified value | Source |
|---|---|---|
| Entry point | **`document.modelContext`** (`[SecureContext, SameObject]`), not `navigator.modelContext`. A `navigator` alias was reported deprecated in Chrome 150 and removed in 153 (third-party report, not Chrome's own docs). | W3C WebML CG draft, 13 Oct 2026; Chrome docs |
| Register | `Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options)`; tool = `name` (1-128 of `[A-Za-z0-9_.-]`), `description` (non-empty), `inputSchema` (JSON Schema), `execute(input, options)`, optional `title`, `annotations`. | spec; Chrome Imperative API page |
| Unregister | **No `unregisterTool`.** Pass `{ signal }` to `registerTool` and `abort()` it. As of Chrome 153 aborting does not cancel an in-flight `execute`. | spec; Chrome Imperative API page |
| Result | **No MCP content array.** `execute` returns any value; `executeTool` resolves to the **JSON string** of it. A tool reports its own failure inside that value; platform failures reject with a `DOMException`. Chrome's examples return plain strings. | spec; Chrome Imperative API page |
| Annotations | `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, `debugging` (Chrome 156+), all default false. | spec; Chrome docs |
| Visibility | Other origins and cross-origin iframes see nothing unless `exposedTo` lists a secure origin. A frame needs `allow="tools"` to delegate. Site-wide off switch: `Permissions-Policy: tools=()`. | Chrome "WebMCP tool security" |
| Output budget | Chrome advises **1.5K characters per tool output** (guidance, not an enforced limit that I could find). | Chrome "WebMCP tool security" |
| Availability | Early preview; Chromium 146.0.7672.0+ behind `chrome://flags/#enable-webmcp-testing`. An origin trial is reported for Chrome 149-156 (end date and token requirement for deployed sites **not confirmed from Chrome's own pages**; recheck before the docs page states it). | GoogleChrome/modern-web-guidance-src; third-party reports |
| User prompt | None documented for registration. `consequentialHint` is how a tool asks the agent/browser to confirm before running. | Chrome docs |
| Multiple tabs | **Not addressed** by the spec or Chrome's pages (issue #227 only proposes cross-document execution). | spec |

### What this decision commits to

1. **A third transport, no new tools.** `src/ai/webmcp/` adapts `createToolRegistry()` exactly
   as `mcp/server.js` and `tabEndpoint.js` do. Each registry tool becomes one `registerTool`
   with the registry's own (already strict) schema.
2. **Calls run through `TabEndpoint`**, made constructible without the dev-host socket, so a
   WebMCP call and a Claude Code call share one serial queue, the mid-gesture wait and
   refusal, the stale-revision refusal and group-per-`request` into `aiTurns`.
3. **Origin `webmcp`**, a new transport value beside `ai` and `mcp`; out of the local undo
   stack by Decision 5; **Undo AI turn** removes the group.
4. **Refusals are values, not exceptions.** `execute` returns `{ ok: false, error: "<refusal
   sentence>" }` for "the user is editing", stale revision, and cap-exceeded, so the agent's
   loop is never killed by a `DOMException`.
5. **Unregistration is an `AbortController` per registration**, aborted on opt-out and on
   `pagehide`. Since there is no cross-tab guidance, **register only while
   `document.visibilityState === "visible"`** and abort on hidden, so the focused tab is the
   one an agent reaches. This is a hypothesis to verify by hand with two tabs (VERIFY.md).
6. **Annotations are honest and per tool:** read tools (`describe`, `get_selection`, listing)
   carry `readOnlyHint`; any tool that returns document text (intent, names, standing
   instructions) also carries `untrustedContentHint`, matching Decision 7's "data, never
   instructions". Writes are **not** `consequentialHint`: every landed batch is one **Undo AI
   turn**, which is the reversibility that annotation exists to ask for.
7. **Results are JSON values, and `capture_view` is withheld.** There is no image content type
   in the result model, so a PNG would have to be a base64 string far over the 1.5K advice.
   The tool is not registered on this transport; vision stays with the chat and the bridge.
   Other tools' output is measured against the 1.5K budget in the build; any that exceed it
   are summarised with a "ask for more with `limit`/`offset`" hint, not truncated silently.
8. **Feature detect on `document.modelContext`, falling back to `navigator.modelContext` for
   older Chromes.** Missing API means nothing registers and nothing throws. No shim, no
   `@mcp-b/*` dependency. Declarative form attributes stay out of scope.
9. **Trust model unchanged** (Decision 7): `limits.js` caps per call and per group; no key or
   token is read or sent. **New exposure, stated plainly:** a tool result is read by an agent
   WarpCad cannot see or choose, so document text leaves the tab to whichever agent is attached.

### The one change from the TODO: default on, with an off switch

`ai-021` point 4 said "registers nothing until the user opts in". The user's direction is that
support should simply be there when the browser has it. Proposed: **registered by default
when the API exists**, plus an Assistant-header **Browser agents · on / off** chip and switch
whose off state is remembered per browser profile and unregisters everything. Reasons this is
acceptable: other origins see nothing by default; the agent is one the user installed and
pointed at this tab; every write is one undoable group. **What it costs:** an agent that is
attached can read the project without a separate yes. If you would rather keep opt-in, only
the default flips; nothing else in this decision changes.

### Which routes the Assistant offers (the user's rule, 2026-10-14)

Three routes in, and what the environment allows is the whole selector. Routes are additive:
a route that is available is offered, none is hidden because another exists.

| Environment | WebMCP | API key (BYOK chat) | Live bridge MCP (dev host) |
|---|---|---|---|
| Built or hosted app, **no** WebMCP | n/a | **Required** (the only route) | n/a (dev host only, Decision 11) |
| Built or hosted app, WebMCP present | Available | Available | n/a |
| `npm run dev`, any browser | Available if the API is present | Available | **Available** |

Consequences for the build:

- The panel's "no key" empty state (`ai-020`) appears **only** in the first row, where a key
  really is the only way in. With WebMCP present the panel says an in-browser agent can drive
  the project and the key is optional; in dev it also names the Claude Code bridge.
- The **Browser agents** chip is absent where the API is missing (first row), so the panel never
  offers a route that cannot work.
- Detection is two independent checks: `document.modelContext` (WebMCP) and the dev-host flag
  the bridge already uses. No new environment switch.
- All routes share `TabEndpoint`'s one-writer rules, so using the key chat while a WebMCP agent
  or the bridge is attached is serialised, never interleaved.

### Honest limits

Chromium with a flag (or an origin-trial token) only, desktop-first. The real path is not
automatable in Playwright; the e2e spec injects a fake `document.modelContext`. The spec has
moved twice already (`provideContext`/`clearContext` removed, `navigator` to `document`), so
`toolShape.js` is the single place that knows the registration shape.

## Items needing the user's call (before `ai-002`)

1. **The LLM client library.** This document picks raw `fetch`. Choosing
   `@anthropic-ai/sdk` instead requires adding **`Unlicense`** to the `npm run licenses`
   allow-list (transitive `fast-sha256` via `standardwebhooks`). That's a licence-list
   change only you can make. Unlicense is a public-domain dedication and is compatible
   with AGPL-3.0-or-later.
2. **No new allow-list entry is needed for the MCP pick** (Apache-2.0 and MIT are both on
   it), but `mcp/` gets **its own `package.json`**. Confirm that layout, or say if you'd
   rather have one root manifest.
3. **Auto-land vs explicit Accept** (decision 5). The pick is that a successful turn lands
   automatically and **Undo AI turn** is the one-step reject. An explicit Accept per turn
   would be a setting on the same fork if you want it.
4. **Standing instructions from a loaded file** (decision 7) are treated as data until you
   confirm "Use this project's instructions" for that project in this browser. That's a
   small `ai-003` UI addition.
5. **Refusal fallback beta** (decision 9): `fallbacks: "default"` with
   `server-side-fallback-2026-07-01` is included. Decline it and it's dropped.
6. **Default effort `high` and default model Opus 5.5** (decision 9). Both are settings
   with stated reasons, and `ai-011`'s evals are the evidence to change them.

---

## Sources

- **npm registry** (`npm view … --json`, 2026-10-06): `@anthropic-ai/sdk`, `ai`,
  `@ai-sdk/anthropic`, `openai`, `@modelcontextprotocol/sdk`,
  `@modelcontextprotocol/server`, `@modelcontextprotocol/core`, `zod`, `ajv`, `yjs`,
  `@automerge/automerge`, `loro-crdt`.
- **GitHub API** (`gh api`, 2026-10-06): `repos/<r>`, `repos/<r>/releases/latest`,
  `repos/<r>/contributors`, and `search/issues?q=repo:<r>+type:issue+state:{open,closed}`
  for `anthropics/anthropic-sdk-typescript`, `vercel/ai`, `openai/openai-node`,
  `modelcontextprotocol/typescript-sdk`, `colinhacks/zod`, `ajv-validator/ajv`,
  `yjs/yjs`, `automerge/automerge` and `loro-dev/loro`. Also the `LICENSE` file of
  `modelcontextprotocol/typescript-sdk` and of `vercel/ai`.
- **Bundle sizes**: scratch install, `esbuild --bundle --minify --format=esm`
  (`--platform=browser` for clients and validators, `--platform=node` for MCP), then
  `gzip -9`. Entries:
  - **sdk**: `messages.stream`, iterate the events.
  - **vercel**: `streamText` via `createAnthropic`.
  - **openai**: streamed `chat.completions` against the compat base URL.
  - **fetch**: a `POST` plus an SSE line parser.
  - **ajv**: compile one schema.
  - **zod**: `z.object` + `toJSONSchema`.
  - **MCP**: `McpServer` + `StdioServerTransport`.
- **App baseline**: `vite build` of `8d31e37`, main chunk `index-*.js` 1,275.89 KB /
  369.39 KB gzip.
- **Licences**: `npx license-checker@25.0.1 --production` over scratch installs of
  `@anthropic-ai/sdk@0.131.0`, `@modelcontextprotocol/server@2.3.1` and
  `@modelcontextprotocol/sdk@1.32.1`.
- **Anthropic docs**: "OpenAI SDK compatibility"
  (`platform.claude.com/docs/en/api/openai-sdk`, fetched 2026-10-06) for its stated
  purpose and its `strict` and prompt-caching limitations.
- **`claude-api` skill** (bundled, model table cached 2026-09-25) for model ids, prices,
  cache minimums and TTL economics, Opus 5.5's thinking, effort and `tool_choice` rules,
  strict tools, eager input streaming, mid-conversation system messages and refusal
  fallbacks.
- **Anthropic terms, re-read 2026-10-11** (Decision 10): Claude Code "legal and
  compliance" (`code.claude.com/docs/en/legal-and-compliance`) and secondary reporting on
  the February 2026 subscription-OAuth clarification.
- **This repository**:
  - `src/core/document.js` (module notes on supersession, consumption, `data-003`
    undo, `core-030` restore, `core-031` fold cache; `createDocument`'s `foldCache`
    option; `foldableEntry`);
  - `src/storage/tokenStorage.js`;
  - `src/core/kernel/registry.js` (`operandCount`, `acceptsOperandCount`, param
    validation);
  - `docs/decisions/document-sync.md`, `docs/decisions/persistence-export.md`;
  - `TODO/ai-002`, `ai-004`, `ai-005`, `ai-009`; `TODO/ACCEPTANCE.md` scenario 8.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

### Decision 13 addendum (2026-10-17, `ai-024`): alias `navigator.modelContext`

Decision 13 stopped using `navigator.modelContext` (removed in Chrome 153). A real agent run showed
the cost: Claude in Chrome probed only `navigator`, read "no WebMCP" and stopped, while
`document.modelContext.getTools()` listed all 20 tools with the tab visible. Setting the alias by
hand let it add ten cubes and one Undo AI turn removed them. So `startWebMcp` now sets
`navigator.modelContext` to the same object **only when the browser provides none and
`document.modelContext` is usable**, never replacing a real one (`aliasNavigatorModelContext`).
Registration still goes through `document.modelContext`. Revisit if an agent starts reading
`document`, or a Chrome release reuses the `navigator` name differently. The visibility gate
(point 5) is unchanged: it was not the cause.

