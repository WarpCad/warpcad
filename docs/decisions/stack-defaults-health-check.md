# Health-check re-confirmation — Stack defaults pulled in by `build-001`

Per `CLAUDE.md`'s Library-decisions rule: a health check runs "when it's actually
about to be pulled in," not only at initial mention. `build-001` is the first task
to install these four carried-forward Stack defaults as real dependencies, so this
is that re-confirmation — a quick check, not a full Library-decision writeup (none of
the four are being rejected).

Checked 2026-09-05 via the npm registry and GitHub API.

| Library | npm version | Last publish | GitHub stars | Open issues | Last push | Verdict |
|---|---|---|---|---|---|---|
| Playwright (`@playwright/test`) | 1.63.0 | 2026-09-05 | 95,667 | 183 | 2026-09-04 | Healthy — active daily development |
| Storybook | 10.6.0 | 2026-09-03 | 91,015 | 1,809 | 2026-09-05 | Healthy — large issue count is proportional to its size and userbase, not stagnation; commits land daily |
| vite-plugin-pwa | 1.3.0 | 2026-05-05 | 4,257 | 189 | 2026-05-05 | Healthy — smaller, more mature plugin scope; ~4 months since last publish is normal for a stable wrapper around Workbox, not a red flag |
| Pinia | 4.0.3 | 2026-08-12 | 14,715 | 23 | 2026-08-28 | Healthy — low open-issue count relative to stars, first-party Vue ecosystem project |

All four confirmed healthy; none rejected, so no rejection table or runner-up
comparison is required here (`CLAUDE.md`'s "full write-ups only required if a default
is actually rejected"). Re-run this check if any of the four sit unused for a long
stretch before actually being exercised by real code, per the same rule's
"re-run the health check when it's actually about to be pulled in" guidance for a
gap between selection and use.

## Advisory gate

CI (`.github/workflows/ci.yml`) runs `npm audit --omit=dev --audit-level=high` in the root and
in `mcp/`. A high or critical advisory in what ships fails the build. A third step,
`npm audit --audit-level=critical || true`, prints the whole tree including dev tools and never
fails: dev-tree advisories (release-it and its proxy chain, vite-plugin-pwa, `@vue/test-utils`) are
reported and fixed when a non-downgrading release exists, since `npm audit fix --force` currently
proposes older majors for some of them.

There is deliberately no audit in `.githooks/pre-push`: it needs the network, its result changes
with no change to the code being pushed, and a push would fail for a reason the author cannot
fix locally. The advisory database moves daily, so CI is where it is checked.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
