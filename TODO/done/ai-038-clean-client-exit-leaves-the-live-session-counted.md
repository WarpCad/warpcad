---
title: A Claude Code run that ends normally still blocks the next client as "ambiguous" for up to five minutes
category: ai
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-022 drive of ai-023 #2 and acceptance 25
depends: []
status: done
---

> **What shipped (2026-11-15).** Option 3 (close on the connection ending) plus option 1 (sweep on a timer). `mcp/liveHttp.js`
> tracks, per session, the sockets that carried its requests and the responses still open (an SSE stream is an open response). A
> session with no open socket and no open response that has been silent for `SESSION_ENDED_MS` (5 s) stops counting; a 2 s
> unref'd sweep clears the chip with no request arriving. The five-minute `SESSION_IDLE_MS` stays as the backstop, and the
> refusal wording is unchanged (a second live client is still told to disconnect, which is then true). Option 2 (a one-minute
> "recent request" window) was rejected: a live client mid-turn can be quiet longer than that. Measured with `lsof`: a live
> `claude -p` holds 2 to 4 connections to the endpoint for its whole run and none after it exits, which is why a 5 s grace is
> enough. `writeResponse` now flushes headers so an SSE stream is visible to the client at once. Drives: back-to-back clean
> exits all served; `kill -9` then a second client 2 s later accepted once its first call came 7 s after the kill; two concurrent
> clients both refused as ambiguous. Side effect: the testing-022 expectation "second client refused at +14 s after kill -9" no
> longer holds by design (it is refused only inside the 5 s grace).


## Problem

`FIND-testing-022` ran headless `claude -p` clients one after another against the dev live bridge (lease enabled, 15 minutes). Each
run ended normally (exit 0, the model's final answer printed). The next client, started within about a minute, was refused every
call: *more than one MCP client or enabled WarpCad tab is connected. Disconnect the extra client or turn off access in the other tab*
(`l1` then `l2`; `k4` then `k5`; and the header chip read `MCP routing · ambiguous` with no client running). The first run's session
was still counted. `mcp/liveHttp.js` drops a session on the protocol's DELETE or after `SESSION_IDLE_MS` (5 minutes) of silence, and
the sweep runs lazily on the next request, so the chip kept reading `ambiguous` until the next call arrived. Claude Code 2.1.322's
headless mode evidently does not send DELETE on a normal exit, so a one-shot `claude -p` after another within five minutes fails with
a message that tells a person to "disconnect the extra client" when that client is already gone.

The `kill -9` case (`ai-023` #2) behaves as designed: killed at 17:04:20, a second client at 17:04:34 refused, a third at 17:10:22
(5 minutes 48 seconds later, after the lazy sweep) accepted. This finding is about the ordinary exit, which is the common case.

## Affected files

- `mcp/liveHttp.js` (session counting and the idle sweep)
- `src/ai/bridge/` (the ambiguous wording and the chip)

## Proposed fix

Options to weigh, none chosen here: sweep on the chip's timer as well as on the next request; count only sessions that made a
request in the last minute or so (a client that is mid-turn calls often); close a session when its transport's connection drops
(for Streamable HTTP, the request's socket ending with no open SSE stream); or word the refusal as "another client used WarpCad in
the last five minutes; wait or turn access off and on" so a person is not told to disconnect something that has exited.

## Effort

S to M (the transport options are the cost).

## Testing

- `mcp/liveHttp.spec.js`: a session that stops requesting without DELETE and with its socket closed.
- Re-run `FIND-testing-022`'s `ai-023` #2 drive (kill -9, second client refused, later client accepted) and acceptance 25 step 7.

## Interaction model

Not UI-touching apart from the chip text.

## Documentation

- **Page**: `docs/mcp.md` live-mode section, one line on the five-minute window if it stays.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
