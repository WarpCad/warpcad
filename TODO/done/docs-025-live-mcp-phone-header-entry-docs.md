---
title: Document the phone header's Live MCP access entry, with a still of the header
category: docs
kind: feature
priority: medium
model: sonnet
depends: [ui-075]
status: done
---

> **Shipped:** as proposed. New phone-only still from `e2e/docs/ai-live-mcp-header.docs.js` (the header element, access enabled so the ring shows); `docs/ai-partner.md` and `docs/mcp.md` gained the phone route and the hosted-copy note. No existing still drifted. Acceptance scenarios: none (docs only), so Step 6 did not apply.

## Goal

`TODO/ui-075` added a **Live MCP access** button to the phone header (`live-mcp-button`,
`src/components/ai/LiveMcpButton.vue`). Nothing in `docs/` says it exists. Done means a phone user
reading `docs/ai-partner.md` can find the button, turn access on, and copy the endpoint, with a
picture of the header showing where the button is.

## Interaction model

n/a. This task adds documentation and media only; the control is `ui-075`'s.

## Documentation

- **Page**: `docs/ai-partner.md`, in "An MCP agent on the project you have open (live mode)"
  (the numbered steps currently say only **Assistant → Live MCP access**). Add the phone route.
  Check `docs/mcp.md`'s Live mode section for the same wording and update it too.
- **Example**: on a phone running `npm run dev`, tap the **⇄** button in the header (left of
  **Assistant**), pick **15 minutes**, tap **Enable access**, then copy the endpoint shown in the
  sheet into the MCP client. The button's corner ring shows access is on; a solid dot shows an
  agent is connected.
- **Media**: one new still in `e2e/docs/ai-live-bridge.docs.js` (or a sibling), phone viewport,
  `ai-live-mcp-header.png`, showing the header with the button. Embed it in `docs/ai-partner.md`.
  The existing docs specs are laptop-only (`viewport.width !== 1440` skip), so this one needs its
  own phone guard. Generate with `npm run docs:media`; do not capture by hand.
- Say plainly on the page that the button is absent on a hosted copy, where live access is
  dev-host only.

## Affected files

- `docs/ai-partner.md`, `docs/mcp.md`
- `e2e/docs/ai-live-bridge.docs.js` (or a new `e2e/docs/ai-live-mcp-header.docs.js`)
- `docs/screenshots/ai-live-mcp-header.png` (generated)

## Proposed fix

Add the phone route to the live-mode steps, add the still, run `npm run docs:media`, then
`npm run docs:screenshots` to confirm no other docs still drifted (the header gaps changed at
phone width in `ui-075`, so existing phone stills of the header will differ: review each and run
`npm run docs:screenshots:update` only for ones that moved because of that).

## Effort

S (< 1hr).

## Testing

- `e2e/docs-media.spec.js` (the `guards` project) passes: no dead link, orphan, or unclaimed picture.
- Acceptance scenarios: none. Docs only.
- Engines: docs media is Chromium only, by design.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
