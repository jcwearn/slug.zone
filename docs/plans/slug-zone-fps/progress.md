# Progress: slug.zone — Cloudflare Pages + the Salt Shaker FPS

## Current Status: In Progress

| Phase                         | Status      | Updated    | Notes                                                                                    |
| ----------------------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------- |
| 0+1. Scaffold + landing page  | Complete    | 2026-08-22 | Branch renamed to `main`; 2019 React/browserify tree deleted; landing page ships zero JS |
| 2. Cloudflare infra           | Complete    | 2026-08-22 | `slug-zone` project + `deploy-slug.zone` token, applied via cloudflare-infra#43          |
| 3. Deploy workflow            | Complete    | 2026-08-22 | Actions + wrangler; previews verified on push with no PR open                            |
| 4. Interim live-site update   | Complete    | 2026-08-22 | slugzone.github.io#9 merged; PLAY goes to Cloudflare, the 1.19 MB React bundle is gone   |
| 5. Game shell                 | Complete    | 2026-08-22 | 320x200 render target, fixed-step loop, pointer lock                                     |
| G1. World & movement          | Complete    | 2026-08-22 | Level format, collision, DDA raycast, E1M1                                               |
| G2. Weapons                   | Complete    | 2026-08-22 | Salt Shaker + Grinder, tracers, procedural SFX                                           |
| G3. Enemies wave 1            | Complete    | 2026-08-22 | Grub + Spitter, shared FSM, separation, googly eyes                                      |
| G4. Enemies wave 2            | Complete    | 2026-08-24 | Diagnosed and fixed: the roster was stunlocked out of attacking. See #29                 |
| G5. HUD, pickups, progression | Complete    | 2026-08-22 | Pickups, keycards, doors, secrets, exit, Doom tally, best time in localStorage           |
| G6. Content (E1M2–E1M5)       | In Progress | 2026-08-24 | Level registry, progression and E1M2 shipped; E1M3–E1M5 outstanding                      |
| G7. Boss                      | Not Started | —          | —                                                                                        |
| G8. Music                     | Complete    | 2026-08-22 | Tone.js; composed 72-bar track, six sections; M mutes, `[` `]` set volume, persisted     |
| G9. Mobile controls           | Not Started | —          | —                                                                                        |
| G10. Polish                   | Not Started | —          | —                                                                                        |
| Final. DNS cutover            | Not Started | —          | Blocked on the friend who controls DNS                                                   |

## Where things stand

**Everything through G8 is merged, plus the G4 combat fix (#29).** 680 tests, 37
files.

### The G4 diagnosis, which the last handoff got backwards

The previous notes guessed the wave-2 enemies were too HARD and named three
numbers as suspects. Jackson's actual report was the opposite -- "most of them
you just shoot a few times and they go down" -- and all three guesses were
wrong.

`damage()` moved an enemy into `pain` from any live state including mid-attack,
and `pain` overwrites `mind.timer`, which IS the wind-up clock. The cooldown
kept running through the stagger, so the creature restarted a full wind-up on
recovery and a weapon firing faster than the wind-up deleted attacks in a loop.
Measured over 400 seeded lives: the Grub landed a hit in 0% of them, the Spitter
0%, the Brute 48%. The Shellback felt like the only real fight because its
armour meant shots barely registered, so it barely rolled pain -- the armour was
accidentally the only anti-stunlock mechanism in the game.

Not a health problem: tripling every health pool left the Grub silent in 91%.
Fixed with `def.commitAt`, plus three other bugs found in the same read (a
homing lunge that could not be sidestepped, an unreachable `gibThreshold` with
`playGib` as dead code, and death bursts that never chained).

**Jackson has played the fix and says combat is still too easy.** That is
deliberately not being chased with another tuning pass -- the remaining headroom
is encounter design, and the agreed plan is to address it as the levels get
fleshed out. The Salt Shaker is still 48 dps with infinite ammo, near-zero
spread and autoaim, which is the ceiling underneath any enemy tuning.

**Live:** `https://slug-zone.pages.dev` -- landing page, and the game at
`/game/`. Deploys from this repo's Actions on push to any branch; `main` is
production, every other branch gets `<branch>.slug-zone.pages.dev`.

**`http://slug.zone/` now points at it.** The 2019 React page is gone: the
GitHub Pages repo serves a static landing page whose PLAY button goes to
`https://slug-zone.pages.dev/game/`. 1,216,989 bytes to 34,509, of which 30,446
is the slug picture. Still HTTP-only -- that domain has never had a certificate,
which is what the DNS cutover fixes.

**E1M1 is a level you can finish**, with five kinds of slug in it: pickups,
three keycards, doors, a secret, a signed exit you press E on, a Doom-style
tally against par, a persisted best time, an automap that fills in as you
explore, and a soundtrack.

`npm run format:check && npm run lint && npm run typecheck && npm test && npm run
build` is what CI runs, in that order.

## Next up, in the order I would do it

1. **Play E1M2 and the transition.** Still nobody's hands on it. The registry
   PR rewrote roughly ninety references in `main.ts` and that file has no unit
   tests -- `world/scene.ts` and `campaign.ts` were extracted precisely so the
   testable parts could leave it, but `advance()` itself is verified by reading.
2. **Rework E1M1's encounters.** It is seven creatures on a 20x17 grid fought
   almost entirely one at a time, which is why the roster's premise never comes
   up. E1M2 was written to the opposite brief and is the reference.
3. **E1M3-E1M5.** The registry makes this pure authoring, and `level.test.ts`
   covers every new level automatically the moment it is added to `LEVELS`.
4. **Listen to the music.** It shipped without ever being heard by the person
   who wrote it. Still unheard: no audio out for an agent, so this needs
   Jackson. The mix levels are guesses.
5. **The DNS cutover.** Still the only thing between the game and a real address
   with HTTPS, and still blocked on the friend who controls DNS.

## Handoff notes

### Known problems, in the order they will bite

1. **The G4 enemies have issues and it is merged anyway.** Jackson played them
   and said so; they were never diagnosed. The likely suspects, none confirmed,
   all single numbers in `enemies/definitions.ts`:
   - the Brute's `charge: 8.5` covers most of its own reach during a 0.55s
     wind-up, so the lunge may be undodgeable rather than tight;
   - the Slimebloat's `deathBurst` of 32 over 2.6 cells lands exactly where the
     Grinder wants you to be, which was the intent but may simply be unfair;
   - the Shellback's 12% armour multiplier may still read as a broken weapon
     despite the ricochet cue, in which case the arc or the multiplier moves.
2. **Nothing from G5 onward was played in a browser by the agent that wrote
   it.** No browser automation was available and there is no audio out.
   Everything was verified by tests, by reading, and by fetching modules off
   the dev server to confirm they transform. That is not the same as knowing it
   works, and two bugs got through that way: a stuck intermission overlay and a
   click-to-play button that stopped working entirely.
3. **`CNAME` on `slugzone/slugzone.github.io` holds two domains** --
   `slug.zone` and `www.slug.zone`, on separate lines. GitHub Pages expects
   one, and this is the likeliest reason certificate issuance for the apex was
   never initiated. Deliberately not touched: changing it could take the
   working HTTP site down, and that account's login is unrecoverable. It stops
   mattering at the DNS cutover.

### Do not stack PRs on this repo without checking the head afterwards

G4 was built as three PRs, each based on the one below. GitHub marked the inner
two MERGED when they merged into their _base branches_, which had not yet gone
to main -- so the outer PR's head carried only the first commit, while 483 lines
across 11 files sat on branches with no open PR pointing at them. They were one
merge away from being silently lost. Fixed by fast-forwarding the outer branch
onto the innermost one before merging. **If you stack again, diff the head
against main before merging it.**

### What was learned about testing this codebase

Every module added this session was mutation-checked, and **roughly a quarter of
the assertions were worthless on the first pass**. The failures had shapes worth
recognising, because they will recur:

- **Deriving the expectation from the constant under test.** A pickup-radius
  test computed its boundary from `PLAYER_RADIUS + PICKUP_RADIUS`, so an
  implementation that ignored the radius it was handed agreed with it at every
  value. Fixed by sweeping several radii.
- **Asserting on an infinite set.** A geometry test pinned wall faces to a
  plane without pinning them to a cell, so any wall anywhere along `z=8`
  satisfied it -- while the jamb beside the door had no face at all.
- **Asserting one half of a two-sided property.** "The bass is mostly the root"
  passed for a bass line of 128 identical notes. "It uses the seed" passed for
  a generator whose every chosen note was the same pitch.
- **Two code paths that both clamp.** A settings test read a clamped value back
  through a loader that also clamps, so it proved nothing about the writer.
  Fixed by asserting on the raw stored text.
- **Testing across a repeat.** The chorus states the tune twice, so anything
  asserted over the whole chorus was satisfied by the repetition rather than by
  the melody.
- **A mutation that breaks everything proves nothing.** Widening E1M1's exit to
  test a marker rule shortened the grid row and failed all nine shipped-level
  tests for the wrong reason. It read as a pass.
- **A short-circuit upstream of the thing under test.** A standoff test gave
  the enemy line of sight and a ready cooldown, so the attack branch answered
  before the branch being tested could.

The rule that catches all of these is already in CLAUDE.md: reintroduce the bug
and watch the suite fail. It is worth doing on every assertion, not only the
ones that look risky.

### The music is composed, not generated

The first version picked notes at random from a scale. It passed every test
written for it -- in key, galloping, snare on two and four -- and sounded like
nothing, because those are properties a good tune HAS rather than properties
that make one. Measured: a 10.9s loop, bass 83% one note, one bar of literally
nothing but the root.

`audio/track.ts` is now hand-written and arranged into six sections over 72
bars (102.9s), with no randomness and no seed. **To change how it sounds,
change the motifs** -- `RIFF_VERSE`, `RIFF_CHORUS`, `HOOK` -- rather than
looking for a generator to tune. `audio/music.ts` is the Tone.js side and is
not tested, because it is a synth graph.

Tone keeps its **own** AudioContext and starts through `Tone.start()`. An
earlier version handed it the context `sfx.ts` had already made, via
`Tone.setContext`; that is one line shorter and it broke click-to-play
entirely, because it ran inside the engage handler and took pointer lock down
with it when it threw.

### Things that will bite you

**A new enemy type is not a new colour.** `buildEnemyView` branches on
`def.shape` and each shape returns where its eyes belong. At 320x200 through
fog the silhouette is very nearly all the player gets, so a type that reuses
another's body is a reskin however different its numbers are. `render.test.ts`
iterates `ENEMIES`, so every new type inherits the floor-clearance property for
free -- and will fail the moment a body dips below y=0.

**`Intent.velocity` is signed.** Negative walks the line to the player
backwards, which is how a Spitter gives ground without turning its back.
Anything reading it must multiply rather than test it for truthiness.

**Attacking is tested before retreating.** A kiter that backs off INSTEAD of
attacking reverses into a wall and stays there refusing to shoot, so the most
dangerous thing in the room becomes a free kill by walking at it. It gives
ground between shots, never instead of them.

**Armour is applied at the shot, not in `damage`.** It is the only rule that
depends on where the shot came FROM, and the mind has no idea where the player
is standing. An armoured hit also has to sound different -- a creature soaking
nine tenths of every shot while still sounding wet reads as a broken weapon.

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
