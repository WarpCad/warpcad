---
title: BYOK model client — the user's own API key, stored in IndexedDB, called straight from the browser
category: ai
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [ai-001]
status: done
---

> **Retired 2026-10-09 (`/fix-todo ai-004`, close-out of an interrupted run).** Shipped as specified, plus
> five things the file did not list. (1) A **Content-Security-Policy meta tag** in `index.html`
> (`docs/decisions/ai-partner.md` decision 8): `connect-src` is `'self'`, `api.anthropic.com` and
> `api.github.com`, `img-src` has no remote host, `script-src` has no inline; the dev server relaxes only
> HMR (`vite.config.js`); `e2e/csp.e2e.js` fails on any `securitypolicyviolation` and proves the policy
> is live. `E2E_PREVIEW=1` runs specs against the production build (`playwright.config.js`). (2)
> **Save and test** uses the free `count_tokens` endpoint, so a Test costs nothing. (3) Prompt caching
> is on the system prompt and the tool prefix. (4) The Assistant button opens a connected **panel stub**
> (dot, model name) that `ai-006` replaces with the chat, and a `ConnectionDot` display component
> carries the dot. (5) A model menu in the sheet (`ai.model`, default `claude-opus-5-5`). Deviation worth
> knowing: on WebKit, against the production build, `page.route` cannot see requests the service worker
> issues, so WebKit projects block the service worker when `E2E_PREVIEW=1` and `csp.e2e.js` routes on
> the context. Firefox cannot launch in this sandbox (`TROUBLESHOOTING.md`); its cells were not run.

## Goal

The app can send a conversation (text, tool definitions, images) to the model with the
user's own key and stream the reply back, with no backend of ours. "Done": paste a key once,
reload, it is still there; a request streams tokens and tool calls; cancel stops it; a bad
key, a rate limit, an offline tab and a CORS refusal each produce a distinct, plain message.

## Design

- `src/ai/client.js`: one provider interface (`stream({ system, messages, tools, signal })`
  → async iterable of `text | tool_call | usage | done`), with the implementation `ai-001`
  chose behind it. The agent (`ai-005`) never sees HTTP.
- `src/storage/aiKey.js`: the key lives in IndexedDB via the existing `idb` wrapper, in its
  own store. **Never** in the autosave blob, a project file, a gist, an export, the URL, a
  log line or an error message (redact on the way out). A "Forget key" action deletes it.
- Images: accepts base64 image parts, downscaled client-side to a maximum edge before send
  (cost and request-size ceiling), with the original kept only in the document asset
  (`sketch-003`), not re-sent each turn.
- Prompt caching on the stable prefix (system prompt + tool schemas) if `ai-001` says so.
- `usage` events feed a per-turn token readout the chat panel shows.
- Reads **one** model setting (`ai.model`), default per `ai-001`; the model id is data, not
  hard-coded across files.

## Interaction model

- **Precondition**: nothing. The assistant button is always present; without a key it opens
  the key dialog instead of the chat.
- **Trigger**: **Assistant** button (opens chat; first time: a key sheet with a paste field,
  a one-line "stored only in this browser" note, and a Test button). **Forget key** in the
  same sheet.
- **Feedback**: Test shows success or the specific failure; the chat header shows a small
  connection dot (`HostedDot`'s pattern) and the model name.
- **Small-screen behavior**: sheet, not modal-on-desktop-shrunk; the paste field must work
  with the phone's paste menu; no horizontal scroll at 390 px.

## Documentation

`docs/ai-partner.md` (new; later tasks extend it): *Getting a key*. Example: "Create a key
in your Anthropic console, tap **Assistant**, paste it, tap **Test**. It never leaves this
browser except in requests to the API."

## Affected files

- `src/ai/client.js`, `src/ai/client.spec.js`, `src/storage/aiKey.js`(+spec),
  `src/components/ai/KeySheet.vue`, `docs/ai-partner.md`, a mounted entry point in the
  header (`src/views/` root, thin).

## Effort

M.

## Testing

- **Unit**: `fetch` mocked at the boundary: SSE parsing across chunk boundaries (a tool-call
  JSON split mid-token), abort mid-stream, 401 / 429 / 5xx / network error mapping, the key
  never appears in any thrown message or serialised document (a spec that serialises the
  whole store and greps for it), IndexedDB unavailable (private window) degrades to
  session-only with a visible note.
- **E2E** (`e2e/ai-key.e2e.js` → `/`): paste, reload, still connected (against a stubbed
  endpoint via Playwright routing). Three viewports; all three engines (IndexedDB).
- **Acceptance**: re-drive 10 (save/reload) to prove the key is not in the saved file.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
