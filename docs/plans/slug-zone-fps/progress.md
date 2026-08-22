# Progress: slug.zone — Cloudflare Pages + the Salt Shaker FPS

## Current Status: In Progress

| Phase                         | Status          | Updated    | Notes                                                                                                           |
| ----------------------------- | --------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 0+1. Scaffold + landing page  | Complete        | 2026-08-22 | Branch renamed to `main`; 2019 React/browserify tree deleted; landing page ships zero JS                        |
| 2. Cloudflare infra           | Complete        | 2026-08-22 | `slug-zone` project + `deploy-slug.zone` token, applied via cloudflare-infra#43                                 |
| 3. Deploy workflow            | Complete        | 2026-08-22 | Actions + wrangler; previews verified on push with no PR open                                                   |
| 4. Interim live-site update   | **Not Started** | —          | `http://slug.zone/` still shows the 2019 "Coming Soon" page                                                     |
| 5. Game shell                 | Complete        | 2026-08-22 | 320x200 render target, fixed-step loop, pointer lock                                                            |
| G1. World & movement          | Complete        | 2026-08-22 | Level format, collision, DDA raycast, E1M1                                                                      |
| G2. Weapons                   | Complete        | 2026-08-22 | Salt Shaker + Grinder, tracers, procedural SFX                                                                  |
| G3. Enemies wave 1            | Complete        | 2026-08-22 | Grub + Spitter, shared FSM, separation, googly eyes                                                             |
| G4. Enemies wave 2            | Not Started     | —          | Five more types; silhouettes to be designed as a set                                                            |
| G5. HUD, pickups, progression | **Partial**     | 2026-08-22 | Health, armour, HUD, portrait, death/restart DONE. **Pickups, keys, secrets, exit, score persistence NOT done** |
| G6. Content (E1M2–E1M5)       | Not Started     | —          | —                                                                                                               |
| G7. Boss                      | Not Started     | —          | —                                                                                                               |
| G8. Music                     | Not Started     | —          | —                                                                                                               |
| G9. Mobile controls           | Not Started     | —          | —                                                                                                               |
| G10. Polish                   | Not Started     | —          | —                                                                                                               |
| Final. DNS cutover            | Not Started     | —          | Blocked on the friend who controls DNS                                                                          |

## Where things stand

**Live and working:** `https://slug-zone.pages.dev` — landing page, and the game at
`/game/`. Deploys from this repo's Actions on push to any branch; `main` is
production, every other branch gets `<branch>.slug-zone.pages.dev`.

**`http://slug.zone/` is still the 2019 page.** It is served by GitHub Pages from
`slugzone/slugzone.github.io`, a repo owned by a separate account we hold only
write access on. Nothing in this repo affects it.

334 tests, 22 files. `npm run format:check && npm run lint && npm run typecheck &&
npm test && npm run build` is what CI runs, in that order.

## Next up, in the order I would do it

1. **Pickups** (rest of G5). Health, armour, ammo and the three keycards are all
   still inert markers. Without them the game is a war of attrition you always
   eventually lose, which is the single biggest thing holding it back.
2. **Doors and the exit.** Doors render as walls and block; 42 of 166 walkable
   cells in E1M1 are unreachable because of it. `world/level.ts` already models
   doors and keys, and `reachableFromStart()` already treats them as passable.
3. **G4 enemies.** Five more types. Design the silhouettes as a set of seven
   rather than one at a time.

## Handoff notes

### Things that will bite you

**World units vs grid units.** `world/space.ts` is the only place that knows the
conversion, and everything must go through it. X and Z are grid units scaled by
`cellSize`; Y is NOT scaled -- `geometry.ts` builds walls from 0 to `wallHeight`
directly, so a room is `wallHeight` units tall. Scaling Y as well put the muzzle
at 8.8 in a room 4 tall and every salt grain spawned above the ceiling,
invisible. `space.test.ts` asserts the space against the buffers the mesh builder
actually emits, not against a restated constant.

**The facing convention.** Forward is `(-sin(yaw), -cos(yaw))` and positive pitch
is UP, because a three.js camera looks down its own -Z. Both `movementDelta()`
and `aimDirection()` are tested against three.js's OWN camera basis rather than a
re-derivation, because a hand-written expectation can be wrong in exactly the way
the implementation is wrong. That is how the WASD bug and the inverted-aim bug
both survived review. Any new code that needs a direction should use those two
functions, not re-derive the trig.

**Vertical autoaim is load-bearing.** A Grub tops out at 1.4 world units and the
player's eye is at 2.2, so a level shot sails over its head and the Grub is
unkillable without aiming down. `verticalAutoAim()` keeps the player's horizontal
aim exactly -- spread and precision still matter -- and snaps only the vertical,
inside a full 3D cone so aiming at the ceiling still misses.

**Player/enemy collision is deliberately asymmetric.** The player is BLOCKED by
creatures and slides along them; enemies are PUSHED out of the player. Both
pushing separates by twice the overlap every frame and flings you off; both
blocking traps you inside a slug that walked onto you. The push skips the dead,
or you shove corpses along the floor.

**`public/faces.png` cannot be regenerated from source.** It is the portrait
sheet, extracted from reference art and quantised. `facesheet.test.ts` asserts
its dimensions, that no line is bright enough to be leftover page, that no face
has a hole punched in it, AND that the corners are actually cleared -- the last
two are opposites, and fixing one is how the other got broken. Extraction notes
are in the commit history around `2e86edd`.

**The private reference photo is not in this repo and must stay out.** Only the
generated sprite sheet is committed.

### Deploy and infra

- Pages project is **`slug-zone`**; this repo is **`slug.zone`**. They differ.
  `wrangler pages deploy` CREATES a missing project rather than failing, so a
  typo in `project-name` yields a second empty project and a site that silently
  stops updating.
- Both workflows pin `jcwearn/workflows@c9e49bd`. **Do not use `@v1`** -- that tag
  resolves to a commit that predates `cloudflare-pages-deploy.yaml` existing.
- Cloudflare config lives in `jcwearn/cloudflare-infra` (`pages.tf`, `tokens.tf`,
  `github-secrets.tf`). Plan only; never apply from an agent. `domains` for
  slug-zone is deliberately `[]` until the DNS cutover.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are written into this repo by
  the infra apply. Do not `gh secret set` them.

### The DNS cutover, when it happens

Ask the friend for one thing: change the two nameserver records at
Google/Squarespace to the Cloudflare pair the dashboard names once `slug.zone` is
added as a zone. Then in cloudflare-infra add `zone-slug-zone.tf`, an entry in
`local.zone_ids`, two proxied CNAMEs, **and** `domains = ["slug.zone",
"www.slug.zone"]` in `pages.tf`. Both are required: a proxied CNAME without the
matching `cloudflare_pages_domain` returns a **522**, not a 404.

### How the tests are meant to be used

Mutation-check anything that matters: reintroduce the bug and confirm the suite
fails. Several assertions in this repo were worthless until that was done --
asserting pupil distance where the bound came from `sin`/`cos` regardless;
comparing a value against the very constant that clamps it; a wall-collision test
whose enemies never moved because they were idle; a stress test that alternated
direction each frame so the impulses cancelled. A passing test is not evidence
until you have watched it fail.
