/**
 * The score, as data.
 *
 * Pure -- `music.ts` hands this to Tone.js, and nothing here knows that.
 * Keeping the composition out of the synth code is what lets the arrangement
 * be asserted rather than only listened to.
 *
 * This replaces a generator that picked scale degrees at random. It passed
 * every test written for it: the notes were in key, the rhythm galloped, the
 * snare fell on two and four. It also sounded like nothing, because random
 * notes in a key are not a melody -- they are a key. Those tests asserted
 * properties a good tune has, which turns out to say nothing about whether a
 * tune is good.
 *
 * So everything here is written out by hand and arranged by section. No
 * randomness survives, which means no seed either: one track id is one fixed
 * piece of music.
 *
 * The brief is death metal by way of theatrical rock -- galloping eighths, an
 * organ underneath, and a lead that goes somewhere and comes back.
 */

/**
 * E Phrygian with a flattened fifth available, in semitones from the root.
 *
 * Phrygian's b2 is the interval that makes anything sound like it is coming
 * for you. Keeping both the b5 and the natural 5 lets the riff lean on the
 * tritone and still have a fifth to resolve to.
 */
export const SCALE = [0, 1, 3, 5, 6, 7, 8, 10] as const

/** The tritone's offset from the root. The evil one. */
export const TRITONE = 6

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'crash'

export interface Note {
  /** Sixteenths from the start of the piece. */
  step: number
  /** Semitones above the track's root. */
  pitch: number
  /** Length in sixteenths. */
  length: number
  /** 0..1. */
  velocity: number
}

export interface Hit {
  step: number
  voice: DrumVoice
  velocity: number
}

export interface Section {
  name: string
  /** First bar of the section. */
  bar: number
  bars: number
}

export interface Track {
  id: string
  bpm: number
  stepsPerBar: number
  bars: number
  /** MIDI note the pitches are measured from. */
  root: number
  sections: Section[]
  /** Rhythm guitar. Monophonic. */
  bass: Note[]
  /** The tune. Monophonic. */
  lead: Note[]
  /** Organ. Polyphonic -- several notes share a step on purpose. */
  pad: Note[]
  drums: Hit[]
}

const STEPS_PER_BAR = 16

/**
 * A run of music as (pitch, length) pairs laid end to end.
 *
 * `null` is a rest. Writing motifs as a sequence rather than as a grid of
 * sixteenths is what makes a melody legible in source: the rhythm is the
 * second number, and the tune can be read straight off the first.
 */
type Cell = readonly [number | null, number]

/**
 * The verse riff. Two bars of gallop, answered by a descent.
 *
 * The gallop -- an eighth and two sixteenths -- is the reason a riff built out
 * of one repeated note is still a riff. The second bar leaves the root through
 * the tritone, and that is the hook.
 */
const RIFF_VERSE: Cell[] = [
  [0, 2],
  [0, 1],
  [0, 1],
  [0, 2],
  [0, 1],
  [0, 1],
  [0, 2],
  [0, 1],
  [0, 1],
  [3, 2],
  [1, 1],
  [0, 1],
  [0, 2],
  [0, 1],
  [0, 1],
  [0, 2],
  [0, 1],
  [0, 1],
  [TRITONE, 2],
  [5, 1],
  [3, 1],
  [1, 2],
  [0, 1],
  [null, 1],
]

/**
 * The chorus riff. Four bars of held stabs instead of a gallop.
 *
 * Opening the rhythm out is what makes a chorus sound bigger than the verse
 * before it. More notes would make it busier, not bigger.
 */
const RIFF_CHORUS: Cell[] = [
  [0, 4],
  [0, 4],
  [3, 4],
  [3, 4],
  [5, 4],
  [5, 4],
  [1, 4],
  [1, 4],
  [0, 4],
  [0, 4],
  [TRITONE, 4],
  [TRITONE, 4],
  [5, 4],
  [3, 4],
  [1, 4],
  [0, 4],
]

/** Half time, and mostly silence. A breakdown is what it leaves out. */
const RIFF_BREAK: Cell[] = [
  [0, 4],
  [null, 4],
  [0, 2],
  [0, 2],
  [null, 4],
  [1, 4],
  [null, 4],
  [1, 2],
  [0, 2],
  [null, 4],
]

/** The climb, gathering speed into the chorus. */
const RIFF_PRE: Cell[] = [
  [0, 2],
  [0, 2],
  [1, 2],
  [1, 2],
  [3, 2],
  [3, 2],
  [5, 2],
  [5, 2],
  [0, 2],
  [0, 2],
  [3, 2],
  [3, 2],
  [5, 2],
  [5, 2],
  [TRITONE, 2],
  [7, 2],
]

/**
 * The tune. Eight bars in four two-bar phrases.
 *
 * Built the way a tune is built rather than sampled: phrases one and three
 * open on the same three notes and climb to different peaks, and phrases two
 * and four answer them by falling back to the root. The listener gets the same
 * shape twice, higher the second time. That is the entire trick, and it is the
 * thing the random version had no way to do.
 *
 * An octave above the rhythm guitar, because two voices in one octave fight
 * rather than stack.
 */
const OCT = 12
const HOOK: Cell[] = [
  // Rise to the fifth and hang there.
  [OCT + 0, 2],
  [OCT + 3, 2],
  [OCT + 5, 2],
  [OCT + 7, 6],
  [OCT + 5, 2],
  [OCT + 3, 2],
  [OCT + 5, 4],
  [OCT + 7, 4],
  [null, 8],
  // Answer: fall back and settle on the root.
  [OCT + 5, 2],
  [OCT + 3, 2],
  [OCT + 1, 2],
  [OCT + 0, 6],
  [OCT - 2, 2],
  [OCT + 0, 2],
  [OCT + 1, 4],
  [null, 12],
  // The same opening, higher peak -- the b6, where it stops being a rock tune
  // and starts being an opera.
  [OCT + 0, 2],
  [OCT + 3, 2],
  [OCT + 5, 2],
  [OCT + 8, 6],
  [OCT + 7, 2],
  [OCT + 5, 2],
  [OCT + 7, 4],
  [OCT + 8, 4],
  [null, 8],
  // Fall through the tritone and land.
  [OCT + TRITONE, 2],
  [OCT + 5, 2],
  [OCT + 3, 2],
  [OCT + 1, 6],
  [OCT + 0, 8],
  [null, 2],
  [OCT + 1, 2],
  [OCT + 0, 4],
]

/** The intro states the same tune alone, at half the speed, over an organ. */
const HOOK_BARE: Cell[] = [
  [OCT + 0, 4],
  [OCT + 3, 4],
  [OCT + 5, 4],
  [OCT + 7, 12],
  [OCT + 5, 4],
  [OCT + 3, 4],
  [OCT + 1, 4],
  [OCT + 0, 12],
  [OCT + 0, 4],
  [OCT + 3, 4],
  [OCT + 5, 4],
  [OCT + 8, 12],
  [OCT + 7, 4],
  [OCT + TRITONE, 4],
  [OCT + 5, 4],
  [OCT + 0, 12],
]

/**
 * The chords under the chorus: i - III - iv - bII.
 *
 * The last is a Neapolitan, a major chord built on the flattened second. It is
 * the sound of Phrygian being taken seriously, and the one chord here a
 * straight minor key could not produce.
 */
const CHORDS: number[][] = [
  [0, 3, 7],
  [3, 7, 10],
  [5, 8, 12],
  [1, 5, 8],
]

/** Turn a run of cells into notes starting at `step`. */
function lay(cells: Cell[], step: number, velocity: number): Note[] {
  const notes: Note[] = []
  let at = step
  for (const [pitch, length] of cells) {
    if (pitch !== null) notes.push({ step: at, pitch, length, velocity })
    at += length
  }
  return notes
}

/** Total sixteenths a run of cells occupies. */
const span = (cells: Cell[]): number => cells.reduce((n, [, length]) => n + length, 0)

/** Repeat a run to fill `bars`, starting at `bar`. */
function fill(cells: Cell[], bar: number, bars: number, velocity: number): Note[] {
  const notes: Note[] = []
  const length = span(cells)
  const total = bars * STEPS_PER_BAR
  for (let at = 0; at + length <= total; at += length) {
    notes.push(...lay(cells, bar * STEPS_PER_BAR + at, velocity))
  }
  return notes
}

type Beat = 'none' | 'build' | 'verse' | 'chorus' | 'break'

/** One bar of drums. */
function drumBar(bar: number, style: Beat): Hit[] {
  const base = bar * STEPS_PER_BAR
  const hits: Hit[] = []
  const add = (step: number, voice: DrumVoice, velocity: number) =>
    hits.push({ step: base + step, voice, velocity })

  if (style === 'none') return hits

  if (style === 'break') {
    // Half time: kick and snare twice as far apart, which makes the same tempo
    // feel like it has slowed to a crawl.
    add(0, 'kick', 1)
    add(8, 'snare', 1)
    add(14, 'kick', 0.7)
    for (let s = 0; s < STEPS_PER_BAR; s += 4) add(s, 'hat', 0.3)
    return hits
  }

  if (style === 'build') {
    // Snare on every eighth, getting louder across the bar. The oldest trick
    // there is for making a chorus land.
    for (let s = 0; s < STEPS_PER_BAR; s += 2) {
      add(s, 'snare', 0.45 + (s / STEPS_PER_BAR) * 0.4)
    }
    add(0, 'kick', 1)
    add(8, 'kick', 0.8)
    return hits
  }

  const chorus = style === 'chorus'
  for (let s = 0; s < STEPS_PER_BAR; s++) {
    // Double kick under the gallop, which is what makes it relentless rather
    // than merely fast.
    const gallop = s % 4 === 0 || s % 4 === 2 || s % 4 === 3
    if (chorus ? s % 2 === 0 : gallop) add(s, 'kick', s % 4 === 0 ? 1 : 0.6)
    if (s === 4 || s === 12) add(s, 'snare', 1)
    if (s % 2 === 0) add(s, 'hat', 0.3)
  }
  return hits
}

/**
 * Build the track.
 *
 * The arrangement is the point. Six sections across seventy-two bars, so what
 * comes round again comes round after a minute and three quarters rather than
 * after ten seconds.
 */
export function buildTrack(id: string): Track {
  const sections: Section[] = [
    { name: 'intro', bar: 0, bars: 8 },
    { name: 'verse', bar: 8, bars: 16 },
    { name: 'pre', bar: 24, bars: 8 },
    { name: 'chorus', bar: 32, bars: 16 },
    { name: 'break', bar: 48, bars: 8 },
    { name: 'final', bar: 56, bars: 16 },
  ]

  const bass: Note[] = []
  const lead: Note[] = []
  const pad: Note[] = []
  const drums: Hit[] = []

  /** Chords a bar at a time, cycling the progression. */
  const chordBars = (bar: number, bars: number, velocity: number) => {
    for (let i = 0; i < bars; i++) {
      for (const pitch of CHORDS[i % CHORDS.length]) {
        pad.push({ step: (bar + i) * STEPS_PER_BAR, pitch, length: STEPS_PER_BAR, velocity })
      }
    }
  }

  // Intro: the tune alone over an organ, drums crashing in halfway.
  lead.push(...lay(HOOK_BARE, 0, 0.55))
  chordBars(0, 8, 0.3)
  for (let bar = 0; bar < 8; bar++) drums.push(...drumBar(bar, bar < 4 ? 'none' : 'break'))
  drums.push({ step: 4 * STEPS_PER_BAR, voice: 'crash', velocity: 0.8 })

  // Verse: the riff, with the tune answering across the second half.
  bass.push(...fill(RIFF_VERSE, 8, 16, 0.9))
  lead.push(...lay(HOOK, 16 * STEPS_PER_BAR, 0.45))
  for (let bar = 8; bar < 24; bar++) drums.push(...drumBar(bar, 'verse'))
  drums.push({ step: 8 * STEPS_PER_BAR, voice: 'crash', velocity: 1 })

  // Pre-chorus: the climb.
  bass.push(...fill(RIFF_PRE, 24, 8, 0.95))
  chordBars(24, 8, 0.35)
  for (let bar = 24; bar < 32; bar++) drums.push(...drumBar(bar, bar >= 30 ? 'build' : 'verse'))

  // Chorus: the tune over the open riff, twice.
  bass.push(...fill(RIFF_CHORUS, 32, 16, 1))
  lead.push(...lay(HOOK, 32 * STEPS_PER_BAR, 0.7))
  lead.push(...lay(HOOK, 40 * STEPS_PER_BAR, 0.7))
  chordBars(32, 16, 0.42)
  for (let bar = 32; bar < 48; bar++) drums.push(...drumBar(bar, 'chorus'))
  drums.push({ step: 32 * STEPS_PER_BAR, voice: 'crash', velocity: 1 })

  // Breakdown: half time, no lead, room to breathe before it all comes back.
  bass.push(...fill(RIFF_BREAK, 48, 8, 0.8))
  for (let bar = 48; bar < 56; bar++) drums.push(...drumBar(bar, bar >= 54 ? 'build' : 'break'))

  // Final chorus.
  bass.push(...fill(RIFF_CHORUS, 56, 16, 1))
  lead.push(...lay(HOOK, 56 * STEPS_PER_BAR, 0.8))
  lead.push(...lay(HOOK, 64 * STEPS_PER_BAR, 0.8))
  chordBars(56, 16, 0.45)
  for (let bar = 56; bar < 72; bar++) drums.push(...drumBar(bar, 'chorus'))
  drums.push({ step: 56 * STEPS_PER_BAR, voice: 'crash', velocity: 1 })

  return {
    id,
    // Fast enough to gallop, slow enough that a sixteenth is still a note.
    bpm: 168,
    stepsPerBar: STEPS_PER_BAR,
    bars: 72,
    // E2: low enough to be felt, high enough that a synth still has a waveform
    // rather than a rumble.
    root: 40,
    sections,
    bass,
    lead,
    pad,
    drums,
  }
}

/** Total sixteenths in the piece. */
export const trackSteps = (track: Track): number => track.bars * track.stepsPerBar

/** Seconds per sixteenth, from the tempo. */
export const stepSeconds = (track: Track): number => 60 / track.bpm / 4

/** How long the whole thing runs, in seconds. */
export const trackSeconds = (track: Track): number => trackSteps(track) * stepSeconds(track)

/** Equal temperament, A440. */
export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12)
