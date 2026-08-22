import { describe, expect, it } from 'vitest'
import {
  buildTrack,
  midiToHz,
  SCALE,
  stepSeconds,
  trackSeconds,
  trackSteps,
  TRITONE,
  type Note,
  type Track,
} from './track.ts'

/**
 * The arrangement, asserted.
 *
 * The previous version of this file tested that the notes were in key and that
 * the snare fell on two and four. Both were true of a piece that sounded like
 * nothing, because those are properties a good tune HAS rather than properties
 * that MAKE one. What is worth holding is the structure -- that the piece is
 * long, that its sections differ from each other, and that the tune is a shape
 * that returns -- because that is what was actually missing.
 *
 * Whether it is any good is still not something a test can tell you.
 */

const track = buildTrack('cellar')
const inScale = (pitch: number) =>
  SCALE.includes((((pitch % 12) + 12) % 12) as (typeof SCALE)[number])

/** Notes of a channel falling inside a named section. */
function inSection(source: Track, notes: Note[], name: string): Note[] {
  const section = source.sections.find((s) => s.name === name)
  if (!section) throw new Error(`no section ${name}`)
  const from = section.bar * source.stepsPerBar
  const to = from + section.bars * source.stepsPerBar
  return notes.filter((n) => n.step >= from && n.step < to)
}

describe('the arrangement', () => {
  it('runs long enough that the loop is not the point', () => {
    // The complaint that produced this rewrite: the old track came round every
    // 10.9 seconds, which is short enough to hear as a loop rather than as
    // music. Anything under a minute is back in that territory.
    expect(trackSeconds(track)).toBeGreaterThan(90)
  })

  it('is the same piece every time', () => {
    // Nothing is seeded any more, so this is a statement about there being no
    // randomness left rather than about a seed working.
    expect(buildTrack('cellar')).toEqual(buildTrack('cellar'))
  })

  it('covers every bar with a section, back to back and in order', () => {
    // A gap would be a bar of unexplained near-silence; an overlap would be two
    // sections writing over each other.
    let bar = 0
    for (const section of track.sections) {
      expect(section.bar, `${section.name} does not follow the last`).toBe(bar)
      bar += section.bars
    }
    expect(bar, 'sections do not add up to the whole piece').toBe(track.bars)
  })

  it('gives the chorus a different riff from the verse', () => {
    // The whole reason for having sections. Same notes in both and this is an
    // eight-bar loop wearing a longer coat.
    const shape = (notes: Note[]) =>
      notes
        .slice(0, 16)
        .map((n) => `${n.pitch}:${n.length}`)
        .join(' ')
    expect(shape(inSection(track, track.bass, 'verse'))).not.toBe(
      shape(inSection(track, track.bass, 'chorus')),
    )
  })

  it('opens the rhythm out for the chorus rather than just playing more', () => {
    // A chorus is bigger because the notes are longer, not because there are
    // more of them.
    const verse = inSection(track, track.bass, 'verse')
    const chorus = inSection(track, track.bass, 'chorus')
    const mean = (notes: Note[]) => notes.reduce((n, x) => n + x.length, 0) / notes.length
    expect(mean(chorus)).toBeGreaterThan(mean(verse))
    expect(chorus.length).toBeLessThan(verse.length)
  })

  it('leaves the intro and the breakdown quieter than the choruses', () => {
    const density = (name: string) => {
      const section = track.sections.find((s) => s.name === name)!
      return inSection(track, track.bass, name).length / section.bars
    }
    expect(density('intro'), 'the intro has no rhythm guitar at all').toBe(0)
    expect(density('break')).toBeLessThan(density('chorus'))
  })

  it('holds the lead back and brings it in for the choruses', () => {
    expect(inSection(track, track.lead, 'pre'), 'the climb should be riff alone').toHaveLength(0)
    expect(inSection(track, track.lead, 'break'), 'a breakdown breaks down').toHaveLength(0)
    expect(inSection(track, track.lead, 'chorus').length).toBeGreaterThan(0)
    expect(inSection(track, track.lead, 'final').length).toBeGreaterThan(0)
  })
})

describe('the tune', () => {
  const hook = inSection(track, track.lead, 'chorus')

  it('is a shape rather than a scatter of notes', () => {
    // The old lead picked scale degrees at random, which produced a set of
    // pitches with no contour. A tune has a peak, and it is not at either end.
    const pitches = hook.map((n) => n.pitch)
    const peak = pitches.indexOf(Math.max(...pitches))
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThan(pitches.length - 1)
  })

  it('comes back to where it started', () => {
    // A melody that ends somewhere else is a fragment.
    expect(hook[hook.length - 1].pitch % 12).toBe(0)
  })

  it('repeats its opening phrase, which is what makes it memorable', () => {
    // Phrases one and three open on the same three notes. Nothing random can
    // do this, and it is the single biggest difference between the two
    // versions of this file.
    //
    // Scoped to ONE statement of the tune. Across the whole chorus the opening
    // trivially recurs, because the chorus plays the tune twice -- so the
    // unscoped version of this passed for a melody whose phrases had nothing
    // to do with each other.
    const chorus = track.sections.find((s) => s.name === 'chorus')!
    const statement = hook
      .filter((n) => n.step < (chorus.bar + 8) * track.stepsPerBar)
      .map((n) => n.pitch)

    const opening = statement.slice(0, 3)
    const rest = statement.slice(3)
    const repeats = rest.some((_, i) => opening.every((pitch, j) => rest[i + j] === pitch))
    expect(repeats, 'the tune never states its opening twice').toBe(true)
  })

  it('climbs higher the second time it opens', () => {
    // Within ONE statement of the tune, not across the chorus: the chorus
    // plays the whole eight-bar tune twice, so halving it compares two
    // identical copies and would pass for a melody that never moved at all.
    const chorus = track.sections.find((s) => s.name === 'chorus')!
    const statement = hook.filter((n) => n.step < (chorus.bar + 8) * track.stepsPerBar)
    const half = Math.floor(statement.length / 2)
    const peakOf = (notes: Note[]) => Math.max(...notes.map((n) => n.pitch))

    expect(statement.length, 'the tune should fill eight bars').toBeGreaterThan(8)
    expect(peakOf(statement.slice(half))).toBeGreaterThan(peakOf(statement.slice(0, half)))
  })

  it('sits clear of the rhythm guitar', () => {
    // Two voices in one octave fight rather than stack.
    expect(Math.min(...hook.map((n) => n.pitch))).toBeGreaterThan(
      Math.max(...track.bass.map((n) => n.pitch)),
    )
  })
})

describe('the notes themselves', () => {
  it('stay in the scale', () => {
    const strays = [...track.bass, ...track.lead, ...track.pad].filter((n) => !inScale(n.pitch))
    expect(
      strays.map((n) => `${n.pitch}@${n.step}`),
      'pitches outside the scale',
    ).toEqual([])
  })

  it('lean on the tritone, which is what makes it sound like this', () => {
    expect(
      track.bass.filter((n) => n.pitch % 12 === TRITONE).length,
      'the riff never touches it',
    ).toBeGreaterThan(0)
    expect(
      track.lead.filter((n) => n.pitch % 12 === TRITONE).length,
      'the tune never touches it',
    ).toBeGreaterThan(0)
  })

  it('never asks a monophonic voice for two notes at once', () => {
    // The bass and the lead are single voices. Two notes on one step is one of
    // them being silently dropped, and which one depends on scheduling order.
    for (const channel of ['bass', 'lead'] as const) {
      const steps = track[channel].map((n) => n.step)
      expect(new Set(steps).size, `overlapping ${channel} notes`).toBe(steps.length)
    }
  })

  it('never lets a monophonic note run into the next one', () => {
    // A note longer than the gap before the next is a voice cut off
    // mid-envelope, which reads as a stutter rather than as legato.
    for (const channel of ['bass', 'lead'] as const) {
      const notes = [...track[channel]].sort((a, b) => a.step - b.step)
      for (let i = 1; i < notes.length; i++) {
        expect(
          notes[i - 1].step + notes[i - 1].length,
          `${channel} note at ${notes[i - 1].step} overruns the next`,
        ).toBeLessThanOrEqual(notes[i].step)
      }
    }
  })

  it('does let the organ play chords, because that is what it is for', () => {
    const steps = track.pad.map((n) => n.step)
    expect(new Set(steps).size, 'the pad is playing one note at a time').toBeLessThan(steps.length)
  })

  it('stays inside its own length', () => {
    const end = trackSteps(track)
    for (const note of [...track.bass, ...track.lead, ...track.pad]) {
      expect(note.step + note.length, 'note runs past the end').toBeLessThanOrEqual(end)
    }
    for (const hit of track.drums) expect(hit.step).toBeLessThan(end)
  })
})

describe('the drums', () => {
  it('leave the first bar empty so the intro is an intro', () => {
    expect(track.drums.filter((d) => d.step < track.stepsPerBar)).toHaveLength(0)
  })

  it('crash on the downbeat of the sections that arrive', () => {
    const crashes = new Set(track.drums.filter((d) => d.voice === 'crash').map((d) => d.step))
    for (const name of ['verse', 'chorus', 'final']) {
      const section = track.sections.find((s) => s.name === name)!
      expect(crashes.has(section.bar * track.stepsPerBar), `${name} arrives without one`).toBe(true)
    }
  })

  it('put the backbeat on two and four through the verse', () => {
    const verse = track.sections.find((s) => s.name === 'verse')!
    const snares = track.drums
      .filter(
        (d) =>
          d.voice === 'snare' &&
          d.step >= verse.bar * track.stepsPerBar &&
          d.step < (verse.bar + verse.bars) * track.stepsPerBar,
      )
      .map((d) => d.step % track.stepsPerBar)
    expect(new Set(snares)).toEqual(new Set([4, 12]))
  })

  it('build into the chorus', () => {
    // The bars before a chorus carry more snare than an ordinary bar, or the
    // chorus simply starts rather than arriving.
    const snaresIn = (bar: number) =>
      track.drums.filter(
        (d) =>
          d.voice === 'snare' &&
          d.step >= bar * track.stepsPerBar &&
          d.step < (bar + 1) * track.stepsPerBar,
      ).length
    expect(snaresIn(31), 'the bar before the chorus').toBeGreaterThan(snaresIn(24))
  })
})

describe('timing', () => {
  it('reads a sixteenth off the tempo', () => {
    expect(stepSeconds(track)).toBeCloseTo(60 / 168 / 4, 6)
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

  it('puts the root where a rhythm guitar lives', () => {
    expect(midiToHz(track.root)).toBeGreaterThan(70)
    expect(midiToHz(track.root)).toBeLessThan(100)
  })
})
