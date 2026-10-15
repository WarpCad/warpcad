# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through
GitHub's vulnerability reporting instead:
**[Report a vulnerability](https://github.com/WarpCad/warpcad/security/advisories/new)**
(the *Security* tab → *Report a vulnerability*).

Include what you found, how to reproduce it (a project file, a URL fragment, or steps), and
which browser and device you used. You will get an acknowledgement within a week. This is a
small volunteer project, so a fix can take longer, and you'll be kept informed along the way.

## What is in scope

WarpCad is a static web app with no server of its own, so the sensitive surfaces are in the
browser and in the local MCP server:

- **Credentials the app holds for you**: your Anthropic API key and a GitHub token, both kept in
  this browser's IndexedDB (`docs/ai-partner.md`, `docs/save-load.md`). Anything that leaks them
  to another origin, into a saved or exported project, into the URL, or into logs is in scope.
- **Loaded projects are untrusted data.** A project file, a shared `#/gist/<id>` link, or a
  library part must never be able to run script, change the Content-Security-Policy, or steer the
  AI partner into actions beyond its documented tool limits (`docs/decisions/ai-partner.md`,
  "trust model").
- **The MCP server and the dev-host live bridge** (`mcp/`, `docs/mcp.md`): file access outside
  the project file it was given, or a bridge connection completed without the pairing code.
- The Content-Security-Policy in `index.html`, and anything that bypasses it.

Out of scope: problems in a third-party service itself (GitHub, the Anthropic API), and attacks
that need an already-compromised browser or machine.

## Supported versions

Only the latest build on `main` (the hosted app) is supported. There are no release branches yet.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
