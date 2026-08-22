import { describe, expect, it } from 'vitest'
import {
  buildTrack,
  midiToHz,
  SCALE,
  stepSeconds,
  trackSteps,
  TRITONE,
  type Track,
} from './track.ts'

/**
 * The composition is data, so it can be asserted rather than only listened to.
 *
 * What is worth holding is the interval content and the rhythm -- the two
 * things that decide whether this reads as the genre or as noise. Whether it
 * is any GOOD is not a thing a test can tell you.
 */

const track = buildTrack('cellar', 0xdead)
const inScale = (pitch: number) =>
  SCALE.includes((((pitch % 12) + 12) % 12) as (typeof SCALE)[number])

describe('buildTrack', () => {
  it('is deterministic for a seed', () => {
    // The whole reason it is seeded: a riff that changes on every page load is
    // not a track, and nothing below could be asserted about it.
    expect(buildTrack('cellar', 0xdead)).toEqual(buildTrack('cellar', 0xdead))
  })

  it('actually uses the seed', () => {
    expect(buildTrack('cellar', 1)).not.toEqual(buildTrack('cellar', 2))
  })

  it('uses the seed to choose PITCHES, not just rhythms', () => {
    // The weaker version of this compared two whole tracks, which differ on
    // rhythm alone -- so a generator whose every chosen note was the SAME
    // pitch passed it, because the stab rhythm still moved with the seed.
    //
    // The real track draws 14 distinct pitches; a generator picking one
    // constant manages 6. The bound sits between them rather than just above
    // zero, which is where it was when it proved nothing.
    const pitches = new Set([...track.bass, ...track.lead].map((n) => n.pitch))
    expect(pitches.size, 'the riff keeps picking the same note').toBeGreaterThan(8)
  })

  it('keeps every pitch in the scale', () => {
    // One note from outside it and the riff stops being in a key.
    const strays = [...track.bass, ...track.lead].filter((n) => !inScale(n.pitch))
    expect(
      strays.map((n) => `${n.pitch}@${n.step}`),
      'pitches outside the scale',
    ).toEqual([])
  })

  it('carries the two intervals the genre is built on', () => {
    // A flattened second and a tritone. Without them this is a minor riff
    // played fast, which is a different genre entirely.
    expect(SCALE).toContain(1)
    expect(SCALE).toContain(TRITONE)
    const pitches = new Set([...track.bass, ...track.lead].map((n) => ((n.pitch % 12) + 12) % 12))
    expect(pitches.has(TRITONE) || pitches.has(1), 'the riff never leaves the root').toBe(true)
  })

  it('stays inside its own loop', () => {
    // A note hanging past the last step overlaps the top of the loop, which
    // is audible as a stumble every eight bars.
    const end = trackSteps(track)
    for (const note of [...track.bass, ...track.lead]) {
      expect(note.step, 'note starts past the loop').toBeLessThan(end)
      expect(note.step + note.length, 'note runs past the loop').toBeLessThanOrEqual(end)
    }
    for (const hit of track.drums) expect(hit.step).toBeLessThan(end)
  })

  it('lands a kick on the downbeat of every bar', () => {
    // What makes the loop join. A seam with no kick on it is heard as a skip.
    const kicks = new Set(track.drums.filter((d) => d.voice === 'kick').map((d) => d.step))
    for (let bar = 0; bar < track.bars; bar++) {
      expect(kicks.has(bar * track.stepsPerBar), `bar ${bar} has no downbeat`).toBe(true)
    }
  })

  it('puts the snare on two and four', () => {
    const snares = track.drums.filter((d) => d.voice === 'snare').map((d) => d.step % 16)
    // The last bar is a blast beat, so it is allowed to break the rule -- but
    // the bars before it are not.
    const backbeat = track.drums
      .filter((d) => d.voice === 'snare' && d.step < (track.bars - 1) * track.stepsPerBar)
      .map((d) => d.step % 16)
    expect(new Set(backbeat)).toEqual(new Set([4, 12]))
    expect(snares.length).toBeGreaterThan(backbeat.length)
  })

  it('ends on a blast beat', () => {
    const last = (track.bars - 1) * track.stepsPerBar
    const inLast = track.drums.filter((d) => d.voice === 'snare' && d.step >= last)
    expect(inLast.length, 'the last bar should stop breathing').toBeGreaterThan(4)
  })

  it('holds the lead back until the riff is established', () => {
    const half = (track.bars / 2) * track.stepsPerBar
    expect(track.lead.length).toBeGreaterThan(0)
    expect(Math.min(...track.lead.map((n) => n.step))).toBeGreaterThanOrEqual(half)
  })

  it('keeps the lead above the bass', () => {
    // Two voices in the same octave on a chip fight rather than stack.
    expect(Math.min(...track.lead.map((n) => n.pitch))).toBeGreaterThan(
      Math.max(...track.bass.map((n) => n.pitch)),
    )
  })

  it('chugs on the root, but does leave it', () => {
    // Both halves, and the second one matters as much. A rhythm guitar that
    // wanders is a lead; one that never moves at all is a metronome, and the
    // one-sided version of this test passed happily for a bass line that was
    // 128 copies of the same note.
    const roots = track.bass.filter((n) => n.pitch === 0).length
    const ratio = roots / track.bass.length
    expect(ratio, 'the riff wanders').toBeGreaterThan(0.6)
    expect(ratio, 'the riff never moves').toBeLessThan(0.95)

    // And the gallop specifically has to stab, not just the walk. The walk
    // only ever plays 3, 1 and 0, so a bass line that never left the root
    // still showed three distinct pitches and a ratio under the bound above --
    // which is exactly how a chugging metronome passed for a riff.
    const beyondTheWalk = track.bass.filter((n) => ![0, 1, 3].includes(n.pitch))
    expect(beyondTheWalk.length, 'every note is the root or the walk').toBeGreaterThan(0)
  })

  it('never plays two bass notes on the same step', () => {
    // One monophonic voice. Two notes at once is a chip channel being asked
    // to do something it cannot, and one of them is silently lost.
    const steps = track.bass.map((n) => n.step)
    expect(new Set(steps).size, 'overlapping bass notes').toBe(steps.length)
  })

  it('is neither silent nor solid', () => {
    const end = trackSteps(track)
    expect(track.bass.length).toBeGreaterThan(end * 0.4)
    expect(track.bass.length).toBeLessThan(end)
  })

  it('scales with the bars it is asked for', () => {
    const short = buildTrack('cellar', 1, 4)
    expect(trackSteps(short)).toBe(4 * short.stepsPerBar)
    expect(Math.max(...short.bass.map((n) => n.step))).toBeLessThan(trackSteps(short))
  })
})

describe('timing', () => {
  it('reads a sixteenth off the tempo', () => {
    // 176bpm is 0.34s a beat, so a sixteenth is a shade over 85ms.
    expect(stepSeconds(track)).toBeCloseTo(60 / 176 / 4, 6)
    expect(stepSeconds({ ...track, bpm: 120 } as Track)).toBeCloseTo(0.125, 6)
  })

  it('is fast enough to be the genre and slow enough to be notes', () => {
    expect(track.bpm).toBeGreaterThan(150)
    expect(stepSeconds(track)).toBeGreaterThan(0.05)
  })
})

describe('midiToHz', () => {
  it('puts A440 where it belongs', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6)
  })

  it('doubles an octave up', () => {
    expect(midiToHz(81)).toBeCloseTo(880, 6)
    expect(midiToHz(57)).toBeCloseTo(220, 6)
  })

  it('puts the root down where a rhythm guitar lives', () => {
    // E1, around 41Hz. Up an octave it stops being felt and starts being a
    // bass line, which is a different instrument.
    expect(midiToHz(track.root)).toBeGreaterThan(35)
    expect(midiToHz(track.root)).toBeLessThan(50)
  })
})
