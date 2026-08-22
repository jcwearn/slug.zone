# Progress: slug.zone — Cloudflare Pages + the Salt Shaker FPS

## Current Status: In Progress

| Phase                        | Status      | Updated    | Notes                                                                                                  |
| ---------------------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| 0+1. Scaffold + landing page | In Progress | 2026-08-22 | Branch renamed to `main`; 2019 tree removed; Vite/TS/three installed; landing page builds with zero JS |
| 2. Cloudflare infra          | Not Started | —          | Must apply BEFORE phase 3 pushes — see handoff                                                         |
| 3. Deploy workflow           | Not Started | —          | —                                                                                                      |
| 4. Interim live-site update  | Not Started | —          | —                                                                                                      |
| 5. Game shell                | Not Started | —          | —                                                                                                      |
| G1–G10. The game             | Not Started | —          | —                                                                                                      |
| Final. DNS cutover           | Not Started | —          | Blocked on the friend who controls DNS                                                                 |

## Handoff Notes

**Ordering trap — read before touching phase 3.** `wrangler pages deploy`
_creates_ a Pages project that does not exist rather than failing. If the deploy
workflow runs before cloudflare-infra applies, wrangler creates `slug-zone` with
its own defaults, and the next `tofu plan` wants to create it again — which the
infra repo's CLAUDE.md says must not be applied. Apply the infra first, then push.

**Workflow pinning.** The `v1` tag in `jcwearn/workflows` resolves to `6dee2c5`
(2026-08-15), which **predates `cloudflare-pages-deploy.yaml` existing**. Pinning
the deploy workflow to `@v1` fails outright. Both `ci.yml` and `deploy.yml` here
pin `c9e49bd4c2226fa829a0179277df707b4585ce9e`, the digest `anupamaandjackson`
uses.

**Branch rename is done** — `jcwearn/slug.zone` defaults to `main`. This matters
because `production_branch` is hardcoded to `main` in cloudflare-infra's
`pages.tf`; on `master` every push would have deployed as a _preview_ and
production would never update, silently, behind a green check.

**Still needs a human with admin:** add `jcwearn/slug.zone` to the GitHub App
installation that writes Actions secrets, or the cloudflare-infra apply fails on
`github_actions_secret`.

**Preview parity is an acceptance criterion, not a follow-up.** Previews must
fire on push to _any_ branch, PR or not, at `<branch>.slug-zone.pages.dev`.

**Assets carried from the old repo:** `public/slug.png` is byte-identical to
`slugzone.github.io`'s `dist/images/slug.png` (md5 `cf411249a...`).
`src/style.css` is the original rules, reindented by Prettier — verified
character-for-character identical ignoring whitespace. `public/favicon.ico` is
new: the old page referenced one that was never committed and 404'd for six years.

**`passWithNoTests: true`** is set in `vitest.config.ts` because nothing here has
testable logic yet. Remove it when the first real module lands in G1.
