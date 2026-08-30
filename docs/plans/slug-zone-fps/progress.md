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
| G4. Enemies wave 2            | Complete    | 2026-08-24 | Slimebloat, Brute, Shellback. Stunlock diagnosed and fixed in #29                        |
| G5. HUD, pickups, progression | Complete    | 2026-08-22 | Pickups, keycards, doors, secrets, exit, Doom tally, best time in localStorage           |
| G6. Content (E1M2–E1M5)       | Complete    | 2026-08-27 | Registry, progression, E1M1 reworked, E1M2–E1M5 shipped. Five levels, 89 creatures       |
| G7. Boss                      | Complete    | 2026-08-27 | The Matriarch: two phases, new silhouette, in E1M5's nest                                |
| G8. Music                     | Complete    | 2026-08-22 | Tone.js; composed 72-bar track, six sections; M mutes, `[` `]` set volume, persisted     |
| G9. Mobile controls           | Not Started | —          | The next piece of work                                                                   |
| G10. Polish                   | Not Started | —          | —                                                                                        |
| Final. DNS cutover            | Not Started | —          | Blocked on the friend who controls DNS                                                   |

## Where things stand

**Everything through G8 is merged. No PRs of ours are open.** 780 tests across 40
test files, 59 source files. The six open PRs on the repo are all dependabot
bumps against the deleted 2019 browserify tree and can be closed unread.

**The episode is finishable end to end.** Five levels, 89 creatures, a boss, a
registry that walks from one map to the next carrying your health and weapons,
and an ending screen. `slug.zone` still points at the Cloudflare page over HTTP;
`https://slug-zone.pages.dev/game/` is the same thing with a certificate.

**Jackson has played all five levels** — the first time anyone had — and the
verdict was "not perfect but a good start", plus two bugs, both since fixed (#36).
Note that this playthrough was _before_ the Matriarch landed, so **the boss has
never been played by a person**, only by the duel fixture.

### The one thing that has not changed

**Combat is still too easy, by Jackson's account.** That judgement was formed
before #32, which means it was formed against a game where the kill counter never
moved off zero and no Slimebloat had ever exploded. Whether it still holds is
genuinely unknown and is worth asking again before anything is tuned on the
strength of it.

The ceiling underneath any enemy tuning is unchanged: the Salt Shaker is 48 dps
with infinite ammo, near-zero spread and vertical autoaim. Nothing has been done
about the weapon economy, deliberately — it was scoped out early and never
revisited.

## Next up, in the order I would do it

1. **Play it again, now that it is whole.** Specifically the Matriarch, the
   level transitions, and the ending — none of those existed when it was last
   played. The transitions and `advance()` are still verified by reading only:
   `world/scene.ts` and `campaign.ts` were extracted so the testable parts could
   leave `main.ts`, but `main.ts` itself has no unit tests and is ~750 lines.
2. **G9, mobile controls.** The most tractable remaining phase without a device
   in hand: the touch-to-action mapping is pure logic and can be unit tested the
   way `moveVector` already is. Only the on-screen layout needs eyes.
3. **G10, polish.** Undefined. Worth deciding what it means before starting.
4. **Listen to the music.** Still never heard by anyone. It was composed without
   audio out and the mix levels are guesses. This needs Jackson; an agent cannot
   do it.
5. **The DNS cutover.** Still the only thing between the game and a real address
   with HTTPS, and still blocked on the friend who controls DNS.

## Handoff notes

### How to work on this

The gate, which is exactly what CI runs and in this order:

```sh
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

`npm ci`, never `npm install`. Pushing any branch deploys it to
`<branch>.slug-zone.pages.dev`, so every PR is playable at a URL before it lands.

**`CLAUDE.md` is the canonical list of things that will bite you** and it is
long for a reason — nearly every entry is a bug that shipped. This document
deliberately does not repeat it. If the two ever disagree, CLAUDE.md is right.

### There is a bot, and it is the tuning instrument

`src/game/playthrough.test.ts` walks every shipped level from spawn to exit
through the real collision, doors, keys and creatures, with no renderer. It is
what catches the things a flood fill cannot: a body that does not fit through a
gap, a corridor corked by something standing in it, a key that cannot actually be
reached.

```sh
PLAY_OUT=/tmp/play.txt npx vitest run src/game/playthrough.test.ts && cat /tmp/play.txt
```

| level | time  | kills | damage |
| ----- | ----- | ----- | ------ |
| E1M1  | 8.9s  | 5/15  | 11     |
| E1M2  | 14.8s | 7/16  | 22     |
| E1M3  | 33.1s | 16/19 | 131    |
| E1M4  | 36.0s | 9/18  | 142    |
| E1M5  | 21.3s | 10/21 | 47     |

**Read the damage column as the cost of the bot's ROUTE, not as difficulty.** It
sprints between fights, walks inside them, and shoots only what gets in the way,
so a level with a fast line through it scores low however much is in it. E1M5 has
the most creatures in the episode and the lowest figure of the last three, and
that is not a bug in the level. Use it to catch a level that costs nothing, and
to compare a level against itself either side of a change. It is not a ranking.

The bot does not fight the Matriarch — she guards the middle of the nest rather
than the doorway, so it runs past her. `duel()` in the same file is what proves
she is beatable: an empty room, a player circling and shooting, 32 seconds, 95
health, reaching phase two.

### Known gaps, in the order they will bite

1. **`main.ts` has no tests and holds the whole tick.** Three of the worst bugs
   this project has had were in it, and all three were found by writing the same
   logic out a second time somewhere testable rather than by reading it. If
   something is wrong and the suite is green, look there first.
2. **The boss has never been seen by a person.** The phase transition is the kind
   of thing that either lands or does not the moment the shell splits, and no
   test can tell you which.
3. **Nothing about how the game FEELS is tested and nothing can be.** Every claim
   in this repo's test suite is about whether something is possible, not whether
   it is good.
4. **`CNAME` on `slugzone/slugzone.github.io` holds two domains** — `slug.zone`
   and `www.slug.zone`, on separate lines. GitHub Pages expects one, and this is
   the likeliest reason certificate issuance for the apex was never initiated.
   Deliberately untouched: changing it could take the working HTTP site down and
   that account's login is unrecoverable. It stops mattering at the DNS cutover.

### Do not stack PRs on this repo without checking the head afterwards

G4 was built as three PRs, each based on the one below. GitHub marked the inner
two MERGED when they merged into their _base branches_, which had not yet gone to
main — so the outer PR's head carried only the first commit while 483 lines
across 11 files sat on branches with no open PR pointing at them, one merge away
from being silently lost.

A milder version of the same thing happened on 2026-08-27: #35 and #36 merged
fifteen seconds apart, both having edited this file and CLAUDE.md, and git
resolved the phase table to the older side. It left "G6 In Progress, E1M3–E1M5
outstanding" sitting there for three days after all three had shipped. **Two PRs
that both touch the docs will merge cleanly and still be wrong.**

### What was learned about testing this codebase

Every module here was mutation-checked — reintroduce the bug, watch the suite
fail — and **roughly a quarter of the assertions were worthless on the first
pass.** The failures have shapes, and they recur:

- **Deriving the expectation from the constant under test.** A pickup-radius test
  computed its boundary from `PLAYER_RADIUS + PICKUP_RADIUS`, so an implementation
  that ignored the radius it was handed agreed with it at every value.
- **Asserting one half of a two-sided property.** "The bass is mostly the root"
  passes for a bass line of 128 identical notes. Every rule with a threshold needs
  both directions tested: `commitAt` at 0 makes a creature unstoppable and at 1
  brings the original bug back, and the suite fails on both.
- **A threshold that the bug also satisfies.** "Every creature fights back before
  it dies" was first asserted against one number, which four of five creatures
  passed _with the stunlock still in place_ — the Grub's rate with the fix (43%)
  sits below the Brute's without it (58%). The floors are per-creature now.
- **An assertion nothing can move.** A test that a corpse is not re-killed cannot
  fail, because `damage` already refuses the dead. It is kept with a comment
  saying so rather than left looking load-bearing. Another checked that shared
  geometry still had its `attributes` after a transition — three.js leaves those
  in place after `dispose()`, so it could not tell a live texture from a dead one.
- **Testing the layout when the bug is in the upload.** The automap had a
  per-level "fits on the screen" test and a layout unit test. Both passed for all
  five levels while E1M5's map was frozen solid, because the bug was in the
  texture upload and neither test went near it.
- **Two code paths that both clamp.** A settings test read a clamped value back
  through a loader that also clamps, so it proved nothing about the writer.
- **A mutation that breaks everything proves nothing.** Widening E1M1's exit to
  test a marker rule shortened the grid row and failed all nine shipped-level
  tests for the wrong reason. It read as a pass.
- **A short-circuit upstream of the thing under test.** A standoff test gave the
  enemy line of sight and a ready cooldown, so the attack branch answered before
  the branch being tested could.

### The music is composed, not generated

The first version picked notes at random from a scale. It passed every test
written for it — in key, galloping, snare on two and four — and sounded like
nothing, because those are properties a good tune HAS rather than properties that
make one.

`audio/track.ts` is hand-written and arranged into six sections over 72 bars
(102.9s), with no randomness and no seed. **To change how it sounds, change the
motifs** — `RIFF_VERSE`, `RIFF_CHORUS`, `HOOK` — rather than looking for a
generator to tune. `audio/music.ts` is the Tone.js side and is not tested,
because it is a synth graph.

Every level currently names `music: 'cellar'`. `buildTrack(id)` stores the id but
composes the same tune for any of them, so a per-level track means writing new
motifs, not picking a new name.

### Deploy and infra

- The Pages project is **`slug-zone`**; this repo is **`slug.zone`**. They differ,
  and `wrangler pages deploy` CREATES a missing project rather than failing, so a
  typo yields a second empty project and a site that silently stops updating.
- Both workflows pin `jcwearn/workflows@c9e49bd`. **Do not use `@v1`** — that tag
  resolves to a commit predating `cloudflare-pages-deploy.yaml`.
- Cloudflare config lives in `jcwearn/cloudflare-infra` (`pages.tf`, `tokens.tf`,
  `github-secrets.tf`). Plan only; never apply from an agent. `domains` for
  slug-zone is deliberately `[]` until the cutover.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are written into this repo by
  the infra apply. Do not `gh secret set` them.

### The DNS cutover, when it happens

Ask the friend for one thing: change the two nameserver records at
Google/Squarespace to the Cloudflare pair the dashboard names once `slug.zone` is
added as a zone. Then in cloudflare-infra add `zone-slug-zone.tf`, an entry in
`local.zone_ids`, two proxied CNAMEs, **and** `domains = ["slug.zone",
"www.slug.zone"]` in `pages.tf`. Both are required: a proxied CNAME without the
matching `cloudflare_pages_domain` returns a **522**, not a 404.
