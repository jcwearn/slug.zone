# Plan: slug.zone — Cloudflare Pages + the Salt Shaker FPS

## Context

`http://slug.zone/` was a "Coming Soon" placeholder built in 2019 and last
touched 2020-08-01. It needed modernizing, HTTPS, and a reason to exist: a
Doom/Duke-Nukem-inspired 3D slug game behind a PLAY button.

Three facts shaped the approach:

- **The live site is not served from this repo.** It comes from
  `slugzone/slugzone.github.io` — proven byte-for-byte against the live
  `index.html`, CSS, bundle and PNG. This repo (`jcwearn/slug.zone`) had one
  commit and was never deployed.
- **The live repo is not ours.** `slugzone` is a separate GitHub user account;
  `jcwearn` is only a write collaborator, so custom domain, Enforce HTTPS and
  build type are all unreachable. The account's signup email is unrecoverable —
  the profile has never been edited and exposes no email, keys, gists or events.
- **HTTPS never worked.** GitHub serves its `*.github.io` wildcard for
  `slug.zone`; the Pages API has no `https_certificate` object at all, so
  issuance was never initiated. DNS belongs to a friend and is frozen: a single
  apex A record, nameservers at Google Domains.

So the site is rebuilt here, where we hold admin, and hosted on Cloudflare
Pages — free HTTPS, per-branch previews, and the deploy pattern the rest of the
account already uses. DNS becomes one clean ask at the end.

## Phases

### Phase 0+1: Modernize the scaffold and land the new page

- Rename default branch `master` → `main`; delete the 2019 React/browserify tree
- TypeScript + Vite + Three.js, oxlint + prettier + vitest, matching house style
- Landing page: static markup, same visual design, "It's finally here" and a
  PLAY button. `slug.png` and the CSS carried over from the live repo
- Files: `src/index.html`, `src/style.css`, `vite.config.ts`, `tsconfig.*.json`,
  `.github/workflows/ci.yml`
- Acceptance: `npm ci && npm run typecheck && npm run lint && npm test && npm run
build` clean; landing page ships zero JavaScript; visually indistinguishable
  from the old page apart from the copy

### Phase 2: Cloudflare infra (in `jcwearn/cloudflare-infra`)

- One entry in `local.pages_projects` (`slug-zone`, `domains = []` until cutover),
  `"slug.zone"` added to the `pages_deploy` token set and to `local.repo_tokens`
- Plan only — never apply from an agent
- Acceptance: `tofu plan` a clean no-op post-apply; both Actions secrets present
  on this repo; the granted `pages.dev` subdomain read back from the API

### Phase 3: Deploy workflow

- `wrangler.jsonc` + `.github/workflows/deploy.yml` calling the shared
  `cloudflare-pages-deploy.yaml`
- Acceptance: production and per-branch preview URLs both serve over HTTPS, and
  a push to a branch **with no PR open** still updates its alias

### Phase 4: Interim update to the live GitHub Pages site

- Static landing page committed to `slugzone.github.io`, PLAY → pages.dev
- Acceptance: `http://slug.zone/` shows the new page and no longer loads the
  1.1 MB React bundle

### Phase 5: Game shell

- `engine/renderer.ts` (320×200 render target, nearest upscale, integer
  letterboxing), `engine/loop.ts`, `engine/input.ts`, `engine/math.ts`
  (seeded RNG — every gameplay random draw goes through it), `data/palette.ts`

### Phases G1–G10: The game

G1 world & movement · G2 weapons · G3 enemies wave 1 · G4 enemies wave 2 ·
G5 HUD, pickups, progression · G6 content · G7 boss · G8 music · G9 mobile ·
G10 polish

Six levels (E1M1–E1M6), seven enemy types, six salt-based weapons, and Salinos,
The Unsalted as the boss. Art direction is hybrid: low-poly meshes with
procedurally generated pixel textures, rendered low and upscaled hard.

### Final: DNS cutover

Ask the friend to move nameservers to Cloudflare. Then add the zone, the two
proxied CNAMEs, **and** the matching `cloudflare_pages_domain` entries — a CNAME
without the Pages domain returns 522, not 404.
