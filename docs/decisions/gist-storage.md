# Store and share a project as a GitHub gist

Status: **accepted for Stage 1** (2026-10-28, `io-017`, Step 0). Stages 2 and 3 build on this record.

## Decision

A project is published as a **secret gist** holding exactly two files, `<slug>.ndjson` (the project
file, byte-identical to **Download copy**) and a generated `README.md`. The gist id is the share
link (`https://app.warpcad.com/#/gist/<id>`). Republishing PATCHes the same gist. Reading needs no
token. The sender's credential is a **fine-grained personal access token with only the account
permission Gists: Read and write**, stored under its own key (`GIST_CREDENTIAL_KEY = 'github-gist'`),
separate from the hosted-repository token (`io-002`).

This reverses the filing assumption that fine-grained tokens cannot touch gists. They can (below),
so the classic `gist`-scope token is the **fallback**, accepted but not recommended.

## Step 0 findings (real calls, 2026-10-28, throwaway tokens, all test gists deleted)

| Question | Result |
|---|---|
| Fine-grained token, Gists: write only: `POST /gists`, `PATCH`, `DELETE` | 201 / 200 / 204. Same id after PATCH. Secret by default (`public: false`) |
| Fine-grained token, write to a repository (`POST /user/repos`) | **403**. Cannot reach repositories |
| Classic `gist`-only token, same calls | 201 / 200 / 204. `POST /user/repos` → 404 |
| Classic token's `X-OAuth-Scopes` | `gist`; exposed to browsers via `Access-Control-Expose-Headers` |
| Fine-grained token's scopes header | **None.** It carries `x-accepted-github-permissions` instead. The "token can do more than WarpCad needs" warning is therefore classic-only; a fine-grained token is narrow by construction |
| Token expiry | `github-authentication-token-expiration` header on both kinds (30 days by default); the dialog should show it |
| `GET /gists?per_page=1` as a validity check | 200, but the response says `allows_permissionless_access=true`: **it does not prove the Gists permission**. Do not use it as the only check |
| Write probe that proves the permission and writes nothing | `PATCH /gists/<all-zero id>` → **404** plus `x-accepted-github-permissions: gists=write`. Expected for a token *without* the permission: 403 (**not verified**; no permissionless token was available. Verify by hand, `TODO/VERIFY.md`) |
| Bad token | 401 `Bad credentials`; the body does not quote the token (we still never echo server text) |
| Login for the dialog | `GET /user` → 200 on both kinds |
| CORS from `https://app.warpcad.com` | `access-control-allow-origin: *` on `api.github.com` (including the `POST`/`PATCH` preflight) and on `gist.githubusercontent.com` |
| Unauthenticated read `GET /gists/<id>` | 200 for a secret gist; limit **60 requests/hour/IP** (`x-ratelimit-limit: 60`). A shared classroom IP can hit it |
| Authenticated limit | 5000/hour |
| 100 KB file | inline in full, `truncated: false` |
| 2 MB file | `truncated: true`, about 0.92 MB inline. `raw_url` (`gist.githubusercontent.com`) returns all 1,999,937 bytes |
| After `DELETE` | the API answers 404 once the cache expires; a public read can still return 200 for up to 60 s (`cache-control: public, max-age=60`). The raw URL is cached 300 s. The delete confirm already says cached copies may remain |

## Consequences for the build

- **CSP.** Production `connect-src` has `api.github.com` but **not** `gist.githubusercontent.com`.
  Reading any file over about 1 MB needs that one host (the API gives no other way to the full
  content). Add exactly that origin in Stage 2, keep `e2e/csp.e2e.js`'s no-wildcard rule, and add
  a test that the host is present.
- **Read path.** Fetch `GET /gists/<id>`; for the chosen file, if `truncated`, fetch `raw_url` and
  check its host is `gist.githubusercontent.com` before following it. Cap the size before parsing
  (reuse `io-016`'s decompressed cap).
- **Rate limit.** A 403/429 with `x-ratelimit-remaining: 0` on the unauthenticated read maps to
  *"GitHub is busy. Try again in a few minutes."*
- **Validation.** The connect dialog validates with the write probe above, not with
  `GET /gists?per_page=1`, then shows the login from `GET /user`.
- **Merge (Stage 3).** Not in this task's first stages. Interim behaviour: **Update refuses if the
  gist's latest revision is not the one last published**; the owner opens the gist first. File
  `io-0NN` for the `mergeIn` flow.

## Options compared

| Option | Verdict | Why |
|---|---|---|
| **A. Secret gist per project** | **Chosen** | Short link, no hosting, free history, readable on github.com, reads need no token. Secret is *unlisted*, not private; the disclosure says so |
| **B. Public gist** | Offered behind an explicit tick, never default | Searchable by anyone |
| **C. Repository file** (`io-002`) | Stays | Right for backup, wrong for "send to dad" |
| **D. A share service we host** | Rejected | Breaks "static, no backend" (`share-link.md` option C) |

### Token type

| Option | Verdict | Why |
|---|---|---|
| **Fine-grained, Gists: write** | **Recommended** | Cannot touch repositories (403), shows its own expiry, GitHub's current model. Account-wide for gists; it cannot be limited to one gist |
| **Classic, `gist` scope** | Accepted, shown as the fallback | Same reach for gists, cannot touch repositories, but classic tokens are the legacy kind and the scopes-header warning only applies here |
| **Reuse the `io-002` repo token** | Rejected | Wrong permission, and the two must be revocable separately |
| **OAuth device flow** | Rejected | Needs a registered OAuth app and, for the web flow, a server |

Neither token can be limited to a single gist; the sheet says so in plain words.

## Open item

The negative case of the write probe (a token with no Gists permission gets 403) is expected from
GitHub's documentation but was not observed. A by-hand check is queued in `TODO/VERIFY.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
