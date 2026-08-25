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

**A new enemy type is not a new colour.** `buildEnemyView` branches on
`def.shape`; a type that reuses another's body is a reskin however different
its numbers are, because at 320x200 through fog the silhouette is nearly all
the player gets. `render.test.ts` iterates `ENEMIES`, so every new type
inherits the floor-clearance property automatically.

**Pain must not be able to delete a committed attack.** `damage()` moves an
enemy into `pain` from any live state, and `pain` overwrites `mind.timer` --
which IS the wind-up clock. Because `attackCooldown` keeps running through the
stagger, a staggered creature restarts a FULL wind-up the instant it recovers,
so any weapon firing faster than the wind-up completes deletes attacks in a
loop. That is why the roster shipped unable to fight back: over 400 seeded lives
a Grub landed a hit in 0% of them and a Brute in 48%, and tripling every health
pool did not fix it, because it is a race between the wind-up and the trigger
rather than a health problem. `def.commitAt` is the fraction of the wind-up past
which the stagger is refused. It is two-sided and both halves are tested: at 0
the creature becomes unstoppable once it twitches, at 1 the bug is back.

**A volley is ONE hit.** `resolveVolley` sums a shotgun's pellets per creature
and applies the total in a single `damage` call. Applying pellets individually
made the largest single damage instance in the game 12, against a lowest
`gibThreshold` of 38 -- so gibbing was unreachable and `playGib` was dead code --
and it rolled the pain chance eight times per blast, which fed the loop above.
`gibThreshold >= hp` is an invariant the suite holds: a gib is one-blow overkill.

**A lunge latches its direction.** `enemy.ts` recomputes the heading to the
player every tick, which for a charger meant the lunge homed and could not be
sidestepped however the comments described it. `Enemy.lungeX/lungeZ` freeze the
line when the wind-up begins and clear when it ends -- a stale one would steer
the next lunge. `charge` is now sized against a sprinting player (2.6 * 1.75)
rather than well past them; at 8.5 it covered 4.7 cells to their 2.5 and backing
off was not a choice either.

**`Intent.velocity` is signed, and attacking beats retreating.** Negative
velocity walks the line to the player backwards — a kiter giving ground without
turning its back. The FSM tests the attack branch first on purpose: a kiter
that retreats INSTEAD of attacking reverses into a wall and stays there
refusing to shoot, turning the most dangerous thing in the room into a free
kill. Armour is likewise applied at the shot rather than in `damage`, because
it is the only rule that depends on where the shot came from.

**Door state lives on the `Cell`, not on `cell.door`.** `parseLevel` copies the
legend spec shallowly, so every `D` cell would otherwise share one object -- the
one the level module exports, and the one every other parse gets. `world/doors.ts`
is the only module that writes `cell.open`; everything that collides, raycasts or
checks line of sight reads it through `isSolid`, which is why it is there rather
than threaded through ten signatures.

**`geometry.ts` culls faces against `opaque`, never `isSolid`.** A door is solid
to collision but a portal to geometry -- its leaf is a separate mesh that rises
away. Culling against `isSolid` left the jambs beside a doorway with no face and
the door cell with no floor, so opening a door revealed a hole through the wall.
`geometry.test.ts` fails on both counts if that comes back.

**Reachability is key-aware.** `reachableFromStart` is a fixed point over the
keys the player can actually collect; one pass assumes you hold every card, so a
key sealed inside the vault it opens ships as an unfinishable level. Secrets are
impassable to it on purpose -- a secret must never be load-bearing.

**`justDied` must be read BEFORE the machine steps.** `damage` sets it and
`step` clears it at the top of the next tick, and the player's shots land
earlier in a tick than the creature update does -- so reading it after
`updateEnemy` reads a flag that has just been wiped. It was on the wrong side
from G3 to G6: every creature the player shot died completely unobserved, the
kill counter never left zero, the intermission always read KILLS 0%, and no
Slimebloat ever burst. `didStrike` is the opposite -- `step` SETS that one, so
it has to be read on the far side. Nothing had been played since G5, which is
why neither was noticed.

**`provoked` never resets, so an undivided room is one encounter.** Once a
creature has seen the player it keeps coming forever, with or without line of
sight. A hall with eleven creatures in it is therefore not eleven fights, it is
one fight with eleven creatures, and it will kill anything that walks into the
doorway. E1M3's bulkhead across row 9 exists for that reason and no other.

**There is a bot.** `playthrough.test.ts` walks each shipped level from spawn to
exit through the real collision, doors, keys and creatures, with no renderer. It
answers questions a flood fill cannot: whether a body with a radius fits, whether
a corridor is corked by something standing in it, whether a key can actually be
reached and picked up. It found the bug above on its first run. It MIRRORS
main.ts's tick order rather than calling it, so it cannot catch main.ts being
reordered -- but writing the order out a second time is what made the first one
look wrong.

**A level must not fight its roster one at a time.** What makes the bestiary
work is that no two creatures are answered by the same habit, and that only
comes up when two of them ask at once. `level.test.ts` holds that at least two
thirds of a level's creatures have a companion within 8 cells AND line of sight
to them -- through walls does not count, because two creatures either side of
one are two encounters. E1M1 originally failed this: seven creatures, of which
the Spitter, the Slimebloat, the Shellback and the Brute -- every interesting
one -- were each fought alone.

**Chargers need a room, not a corridor.** The Brute's lunge travels a fixed
line, so it is dodged by stepping sideways; putting one in a one-cell channel
designs the dodge out of it. There are exactly two places on E1M1 with the
lateral room for it.

**Levels are a registry, and the world is rebuilt per level.**
`world/levels/index.ts` holds the episode in order and position in that array
IS the progression. `world/scene.ts` owns everything whose lifetime is one
level, and the `World` interface is the rebuild checklist -- a field added to it
will not compile until `loadWorld` returns it. `Explored` and the automap are
both SIZED from `level.width/height`, so both are rebuilt rather than reset;
`resetDoors` is a reset and is actively wrong across levels, because it writes
`open` at the old door coordinates into the new grid. Parse the next level
BEFORE tearing the current one down, so a malformed one throws with something
still standing.

**Every level must be beatable from a Salt Shaker start.** Dying restarts the
level you are on with a fresh arsenal (`restart()`), while finishing one carries
health, armour, weapons and ammo forward and drops the keycards
(`campaign.ts`). So a level that can only be finished with the Grinder you found
on the previous one is unwinnable for anyone who died on it. No test can check
this.

**The automap overflows past 33 cells.** `minimapLayout`'s scale has a floor of
2 pixels per cell and that floor beats the size cap, so a level wider or taller
than 33 silently overhangs the 320x200 target. `level.test.ts` fails on it per
level. The fix when one is needed is to allow a 1px scale for huge maps, not to
drop the floor everywhere -- at one pixel a wall and the corridor beside it are
the same line.

**A secret may hide a room; it may never gate one.** `reachableFromStart` cannot
pass a secret panel, which is what holds "a level is finishable without finding
any". `reachableThroughSecrets` can, and is what `unreachableWalkableCells` and
the entity-reach check measure against -- otherwise loot behind a panel reads as
stranded and a secret can only ever be a shortcut. A keycard behind a secret is
still caught, by the completability check rather than by either of those.

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

## Music

`audio/track.ts` is a score written out by hand -- motifs, arranged by section.
It replaced a generator that picked scale degrees at random and passed every
test written for it while sounding like nothing, because "in key" and "has a
backbeat" are properties a good tune HAS rather than properties that make one.
To change how it sounds, change `RIFF_VERSE`, `RIFF_CHORUS` or `HOOK`. There is
no seed and no randomness left.

`audio/music.ts` is the Tone.js side and is not tested. Tone keeps its **own**
AudioContext and starts through `Tone.start()` -- handing it the one `sfx.ts`
made, via `setContext`, is a line shorter and broke click-to-play, because it
runs inside the engage handler and took pointer lock down with it when it
threw. Nothing in the audio path may throw into a caller.

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
