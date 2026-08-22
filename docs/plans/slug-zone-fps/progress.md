# Progress: slug.zone — Cloudflare Pages + the Salt Shaker FPS

## Current Status: In Progress

| Phase                         | Status          | Updated    | Notes                                                                                    |
| ----------------------------- | --------------- | ---------- | ---------------------------------------------------------------------------------------- |
| 0+1. Scaffold + landing page  | Complete        | 2026-08-22 | Branch renamed to `main`; 2019 React/browserify tree deleted; landing page ships zero JS |
| 2. Cloudflare infra           | Complete        | 2026-08-22 | `slug-zone` project + `deploy-slug.zone` token, applied via cloudflare-infra#43          |
| 3. Deploy workflow            | Complete        | 2026-08-22 | Actions + wrangler; previews verified on push with no PR open                            |
| 4. Interim live-site update   | **Not Started** | —          | `http://slug.zone/` still shows the 2019 "Coming Soon" page                              |
| 5. Game shell                 | Complete        | 2026-08-22 | 320x200 render target, fixed-step loop, pointer lock                                     |
| G1. World & movement          | Complete        | 2026-08-22 | Level format, collision, DDA raycast, E1M1                                               |
| G2. Weapons                   | Complete        | 2026-08-22 | Salt Shaker + Grinder, tracers, procedural SFX                                           |
| G3. Enemies wave 1            | Complete        | 2026-08-22 | Grub + Spitter, shared FSM, separation, googly eyes                                      |
| G4. Enemies wave 2            | Not Started     | —          | Five more types; silhouettes to be designed as a set                                     |
| G5. HUD, pickups, progression | Complete        | 2026-08-22 | Pickups, keycards, doors, secrets, exit, Doom tally, best time in localStorage           |
| G6. Content (E1M2–E1M5)       | Not Started     | —          | —                                                                                        |
| G7. Boss                      | Not Started     | —          | —                                                                                        |
| G8. Music                     | Not Started     | —          | —                                                                                        |
| G9. Mobile controls           | Not Started     | —          | —                                                                                        |
| G10. Polish                   | Not Started     | —          | —                                                                                        |
| Final. DNS cutover            | Not Started     | —          | Blocked on the friend who controls DNS                                                   |

## Where things stand

**Live and working:** `https://slug-zone.pages.dev` — landing page, and the game at
`/game/`. Deploys from this repo's Actions on push to any branch; `main` is
production, every other branch gets `<branch>.slug-zone.pages.dev`.

**`http://slug.zone/` is still the 2019 page.** It is served by GitHub Pages from
`slugzone/slugzone.github.io`, a repo owned by a separate account we hold only
write access on. Nothing in this repo affects it.

**E1M1 is now a level you can finish.** Ten kinds of pickup, three keycards, the
door and the vault, the secret, and an intermission tally against the 90-second
par with a best time that survives a reload. All 168 walkable cells are
reachable in play; before the doors opened, 44 of them were not.

484 tests, 30 files. `npm run format:check && npm run lint && npm run typecheck &&
npm test && npm run build` is what CI runs, in that order.

## Next up, in the order I would do it

1. **G4 enemies.** Five more types. Design the silhouettes as a set of seven
   rather than one at a time — the Grub and the Spitter already read as a pair
   because they punish opposite habits, and the remaining five should extend
   that rather than each be invented alone.
2. **G6 content.** E1M2–E1M5. The level tests are now strong enough to author
   against: they hold that a level parses, is completable **with the keys it
   actually gives you**, strands nothing, buries no entity, reaches every
   secret, and authors no doorway two cells wide.
3. **Phase 4 or the DNS cutover.** The interim landing page on the old GitHub
   Pages site was deferred because pointing PLAY at a spinning cube would have
   advertised something that did not exist. That is no longer true — the game
   is a game. Worth deciding whether to do it or go straight to the cutover.

## Handoff notes

### Things that will bite you

**`cell.door` is shared between every door in the level, and between parses.**
`parseLevel` copies the legend spec shallowly, so every `D` cell held the same
object -- the one the level module exports. Door state therefore lives on the
`Cell` as `open`, never on `cell.door`; `parseLevel` now deep-copies `door` as
well, and `doors.test.ts` opens a door in one parse and asserts the same cell is
still solid in another. Writing runtime state onto anything that came out of a
legend will open every door in the game at once.

**`world/doors.ts` is the only module allowed to write `cell.open`.** `isSolid`
reads it, and collision, the DDA raycast, line of sight, the enemy mover and the
glob step all funnel through `isSolid` -- so one write reaches all of them. That
is the reason the flag is there rather than threaded through ten signatures.

**`geometry.ts` must NOT cull faces against `isSolid`.** A door is solid to
collision but a portal to geometry: its leaf is a separate mesh that rises away.
Culling against `isSolid` left the jambs beside every doorway with no face
toward it and the door cell with no floor or ceiling at all, so opening a door
revealed a hole through the wall into the unlit inside of the block. Culling
asks `opaque` -- wall or void only. `geometry.test.ts` holds both halves and
fails on both fixtures if `isSolid` comes back.

**Reachability is key-aware and must stay that way.** `reachableFromStart` runs
a fixed point over the keys the player can actually collect. A single pass
assumes you hold every card in the game, so a red key sealed inside the red
vault it opens passes every other check and ships as an unfinishable level.
Secrets are deliberately impassable to it: a level that only completes by
finding one is a level most players cannot complete.

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
