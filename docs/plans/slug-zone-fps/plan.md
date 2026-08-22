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

- `engine/renderer.ts` (320x200 render target, nearest upscale, integer
  letterboxing), `engine/loop.ts`, `engine/input.ts`, `engine/math.ts`
  (seeded RNG -- every gameplay random draw goes through it), `data/palette.ts`

### Phases G1-G10: The game

G1 world & movement · G2 weapons · G3 enemies wave 1 · G4 enemies wave 2 ·
G5 HUD, pickups, progression · G6 content · G7 boss · G8 music · G9 mobile ·
G10 polish

Six levels (E1M1-E1M6), seven enemy types, six salt-based weapons, and Salinos,
The Unsalted as the boss. Art direction is hybrid: low-poly meshes with
procedurally generated pixel textures, rendered low and upscaled hard.

### Final: DNS cutover

Ask the friend to move nameservers to Cloudflare. Then add the zone, the two
proxied CNAMEs, **and** the matching `cloudflare_pages_domain` entries -- a CNAME
without the Pages domain returns 522, not 404.

## Deviations from the plan, and why

Recorded because each one changes what a later phase should assume.

**Phases 0 and 1 shipped as one PR.** A config-only Phase 0 could not pass its
own CI: `tsc -b` with `include: ["src"]` and a `build` with no entry HTML both
fail on an empty tree.

**Phase 4 (the interim landing page on the old GitHub Pages site) was skipped**
and is still not done. It was deferred because pointing the live site's PLAY
button at a game that was a spinning cube would have advertised something that
did not exist. It is still worth doing, or worth dropping in favour of going
straight to the DNS cutover.

**G5 was pulled ahead of G4, and shipped in two halves.** Player health turns
the game from a shooting gallery into a fight, and the HUD it needs also fixes
ammo being invisible -- both were blocking playtesting in a way more enemy types
were not. The second half (pickups, keys, doors, secrets, the exit) followed.

**Secret walls lift rather than sliding.** The plan implied Wolf3D push-walls.
E1M1's secret has open floor on BOTH sides, so a push-wall would slide into a
walkable cell and stand there as an unexplained free-floating block -- in a cell
whose neighbours were never given faces. Lifting reuses the door state machine
exactly and needs no destination cell. A sideways slide is still a one-line
change in `doorview.ts` if a later level wants one, but it would need a new
level invariant that the far cell is solid.

**G4 shipped three new enemy types, not five.** The plan called for seven in
total. Two more would have been a longer roster rather than a deeper one, and
there is one level to spread them across -- what makes the set work is that no
two are answered by the same habit, and five already covers standing still,
standing at range, killing at arm's length, being caught in the open, and
fighting head-on in a corridor. The count is worth revisiting in G6, when there
is somewhere to put more.

**The exit loops back to E1M1 rather than advancing.** E1M2-E1M5 do not exist
yet, so the tally screen replays the level. `session.ts` holds nothing that
assumes one level; a level registry is what G6 adds.

**The HUD portrait is a committed sprite sheet, not procedural art.** The plan
said the face would be "procedurally-drawn". Three attempts at a hand-drawn
character grid never got past "generic person with a moustache"; at 32x32 with a
hand-picked ramp there is not enough fidelity to look like anyone in particular.
`public/faces.png` is reference art, downsampled and quantised. This is the only
asset in the project that cannot be regenerated from source, which is why it has
its own test file.

**The Spitter's attack became a travelling projectile.** The plan had ranged
enemies dealing damage directly. A hitscan ranged attack is invisible -- the slug
twitches and health vanishes -- so it throws a glob that can be dodged, aimed
where the player WAS when it fired.
