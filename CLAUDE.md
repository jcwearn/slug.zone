# Working in this repo

`slug.zone` — a static landing page plus a Doom-style FPS, TypeScript on Vite 8,
three.js, deployed to Cloudflare Pages. Read `docs/plans/slug-zone-fps/` for
where the work is up to; this file covers what is easy to get wrong.

## Before committing

```sh
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

That is exactly what CI runs, in that order. `npm ci`, not `npm install`.

## Two sites, and only one of them is this repo

`https://slug-zone.pages.dev` is this repo, on Cloudflare Pages.

`http://slug.zone/` is **not**. It is the 2019 page, served by GitHub Pages from
`slugzone/slugzone.github.io` — a repo owned by a separate account we hold only
write access on, whose login is unrecoverable. Nothing here affects it. The
domain moves across in a DNS cutover that needs the friend who controls DNS.

## Things that will bite you

**Y is not scaled by `cellSize`.** X and Z are grid units multiplied by
`cellSize`; Y is not, because `geometry.ts` builds walls from 0 to `wallHeight`
directly. `world/space.ts` is the single place that knows this and everything
must go through it. Scaling Y as well put the muzzle at 8.8 in a room 4 units
tall, and every salt grain spawned above the ceiling — drawn perfectly, entirely
invisible.

**Never re-derive the facing trig.** Forward is `(-sin(yaw), -cos(yaw))` and
positive pitch is UP, because a three.js camera looks down its own -Z. Use
`movementDelta()` and `aimDirection()`. Both are tested against three.js's own
camera basis rather than a second derivation, because a hand-written expectation
can be wrong in exactly the way the implementation is wrong — which is how both
the WASD bug and the inverted-aim bug survived review.

**Vertical autoaim is not a nicety.** A Grub is 1.4 units tall and the player's
eye is at 2.2, so a level shot passes over its head. `verticalAutoAim()` keeps
the horizontal aim exactly — spread still matters — and snaps only the vertical,
within a full 3D cone so aiming at the ceiling still misses.

**Player/enemy collision is asymmetric on purpose.** The player is BLOCKED by
creatures and slides along them; enemies are PUSHED out of the player. Both
pushing separates by twice the overlap each frame and flings you off a slug you
brushed; both blocking traps you inside one that walked onto you. The push skips
the dead, or you shove corpses along the floor.

**Enemies use the same swept collision as the player.** Giving them a simpler
mover is the usual way they end up embedded in geometry.

**`public/faces.png` cannot be regenerated from source.** It is the HUD portrait
sheet: reference art, cropped, downsampled and quantised. `facesheet.test.ts`
holds four properties, and two of them are opposites — no face may have a hole
punched in it, and the corners must actually be cleared — because fixing one of
those is how the other got broken. The private reference photo is not in this
repo and must stay out; only the generated sheet is committed.

**Level geometry is data.** Levels are ASCII grids with a legend in
`world/levels/`. `level.test.ts` asserts every shipped level parses, has a
reachable exit, strands no walkable cells, and embeds no entity in a wall. Those
checks found an exit sealed behind 43 cells, a keyed door on the wrong side of
the vault it gated, and three entities buried in rock — all on the first level
written. `visibility.test.ts` additionally holds that the starting encounter is
visible from spawn, because reachable is not the same as findable.

## Deploying

Pushing any branch deploys it. `main` is production; every other branch gets
`<branch>.slug-zone.pages.dev`, and previews fire on push whether or not a PR is
open. That URL scheme is load-bearing — do not change how deploys work without
preserving it.

The Pages project is **`slug-zone`**; this repo is **`slug.zone`**. They differ,
and `wrangler pages deploy` CREATES a missing project rather than failing, so a
typo in `project-name` yields a second empty project and a site that silently
stops updating.

Both workflows pin `jcwearn/workflows@c9e49bd`. **Do not "simplify" that to
`@v1`** — that tag resolves to a commit predating
`cloudflare-pages-deploy.yaml`, so the deploy fails outright.

Cloudflare config lives in `jcwearn/cloudflare-infra`. Plan only, never apply.

## Testing

Pure logic is tested; rendering is not. Collision, level parsing, the enemy state
machine, weapon state, aim, health and the seeded RNG all have tests. Shaders,
the scene graph and the audio graph do not — those are verified by looking at
them.

**Mutation-check anything that matters.** Reintroduce the bug and confirm the
suite fails. Several assertions here were worthless until that was done:
asserting a pupil's distance when `sin`/`cos` bound it regardless of the bug;
comparing a value against the very constant that clamps it; a wall-collision test
whose enemies never moved because nothing had provoked them; a stress test that
alternated direction every frame so the impulses cancelled out. A passing test is
not evidence until you have watched it fail.

Every gameplay random draw goes through the seeded `mulberry32`, not
`Math.random`. That is what makes spread patterns, pain chance and enemy
hesitation assertable rather than merely sampled — pass the rng in.
