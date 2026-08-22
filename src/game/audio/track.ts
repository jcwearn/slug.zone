import { mulberry32 } from '../engine/math.ts'

/**
 * The music, as data.
 *
 * Pure and seeded, so the same track id produces the same riff on every
 * machine and the composition can be asserted rather than merely listened to.
 * `music.ts` turns this into oscillators; nothing here knows what a
 * WebAudio node is.
 *
 * The brief is death metal played on a sound chip, which is less of a stretch
 * than it sounds: both are built out of a small number of monophonic voices
 * doing something relentless. What carries it is the interval content --
 * a flattened second and a tritone in a scale that is otherwise minor -- and
 * a rhythm that never lets go.
 */

/**
 * E Phrygian with the fifth flattened as well, in semitones from the root.
 *
 * Phrygian's b2 is the interval that makes anything sound like it is coming
 * for you, and keeping BOTH the b5 and the natural 5 means the riff can lean
 * on the tritone without losing the root to resolve to. Everything the
 * generator plays comes from this set, which is what keeps a random riff from
 * turning into an atonal one.
 */
export const SCALE = [0, 1, 3, 5, 6, 7, 8, 10] as const

/** The tritone's offset from the root, in semitones. The evil one. */
export const TRITONE = 6

export type DrumVoice = 'kick' | 'snare' | 'hat'

export interface Note {
  /** Step index from the start of the pattern. */
  step: number
  /** Semitones above the track's root note. */
  pitch: number
  /** Length in steps. */
  length: number
  /** 0..1. */
  velocity: number
}

export interface Hit {
  step: number
  voice: DrumVoice
  velocity: number
}

export interface Track {
  id: string
  bpm: number
  /** Sixteenths. */
  stepsPerBar: number
  bars: number
  /** MIDI note number the pitches are measured from. */
  root: number
  bass: Note[]
  lead: Note[]
  drums: Hit[]
}

const STEPS_PER_BAR = 16

/**
 * The gallop: an eighth followed by two sixteenths, over and over.
 *
 * The single most recognisable rhythm in the genre, and the reason a riff made
 * of one repeated note is still a riff. Written out as steps within a beat
 * rather than generated, because there is nothing random about it.
 */
const GALLOP = [0, 2, 3]

/** Steps within a bar that the gallop lands on. */
const gallopSteps = (): number[] => {
  const steps: number[] = []
  for (let beat = 0; beat < 4; beat++) {
    for (const offset of GALLOP) steps.push(beat * 4 + offset)
  }
  return steps
}

/**
 * Build a track.
 *
 * The shape is fixed and only the note choices are seeded: eight bars, with
 * the lead entering halfway and a blast beat in the last one. A generator free
 * to choose the arrangement as well produces eight bars of unrelated ideas.
 */
export function buildTrack(id: string, seed: number, bars = 8): Track {
  const rng = mulberry32(seed)
  const bass: Note[] = []
  const lead: Note[] = []
  const drums: Hit[] = []

  const pick = (): number => SCALE[Math.floor(rng() * SCALE.length)]
  const gallop = gallopSteps()

  for (let bar = 0; bar < bars; bar++) {
    const base = bar * STEPS_PER_BAR
    // Odd bars answer even ones. Reusing the previous bar's shape is what
    // makes eight bars a riff rather than a list.
    const answering = bar % 2 === 1
    const blast = bar === bars - 1

    // Keyed by step, so the walk below REPLACES the gallop underneath it
    // rather than sounding alongside it. One monophonic channel cannot play
    // two notes at once; it would simply drop one, and which one it dropped
    // would depend on the order they happened to be scheduled in.
    const barBass = new Map<number, Note>()

    for (const step of gallop) {
      // Chug on the root, and lift off it only on the last sixteenth of a
      // beat -- a stab on the offbeat, where it is heard as an accent rather
      // than as the riff changing key.
      const offbeat = step % 4 === 3
      const stab = offbeat && rng() < (answering ? 0.55 : 0.3)
      barBass.set(step, {
        step,
        pitch: stab ? pick() : 0,
        length: 1,
        velocity: step % 4 === 0 ? 1 : 0.72,
      })
    }

    // A walk down into the next bar, resolving onto the root: three notes of
    // pure tension, which is how the genre gets from one riff to the same
    // riff. Down the scale rather than chromatically -- the b2 is already in
    // the scale and does the same job without leaving the key.
    if (answering) {
      const walk = [3, 1, 0]
      walk.forEach((pitch, i) => {
        barBass.set(13 + i, { step: 13 + i, pitch, length: 1, velocity: 0.85 })
      })
    }

    for (const note of [...barBass.values()].sort((a, b) => a.step - b.step)) {
      bass.push({ ...note, step: base + note.step })
    }

    // The lead holds off until the second half, so the riff is established
    // before anything is laid over it.
    if (bar >= bars / 2) {
      const tremolo = bar % 2 === 0
      if (tremolo) {
        // Tremolo picking: one pitch, hammered in sixteenths.
        const pitch = 12 + (rng() < 0.5 ? TRITONE : pick())
        for (let step = 0; step < STEPS_PER_BAR; step += 1) {
          lead.push({ step: base + step, pitch, length: 1, velocity: 0.5 })
        }
      } else {
        // A crooked little melody in eighths against it.
        for (let step = 0; step < STEPS_PER_BAR; step += 2) {
          lead.push({ step: base + step, pitch: 12 + pick(), length: 2, velocity: 0.6 })
        }
      }
    }

    for (let step = 0; step < STEPS_PER_BAR; step++) {
      // Double kick under the gallop, which is what makes it relentless
      // rather than merely fast.
      if (step % 2 === 0 || gallop.includes(step)) {
        drums.push({ step: base + step, voice: 'kick', velocity: step % 4 === 0 ? 1 : 0.6 })
      }
      // Backbeat on two and four, except in the blast bar where the snare
      // takes every other sixteenth and the bar stops breathing.
      const snare = blast ? step % 2 === 1 : step === 4 || step === 12
      if (snare) drums.push({ step: base + step, voice: 'snare', velocity: blast ? 0.7 : 1 })
      if (step % 2 === 0) drums.push({ step: base + step, voice: 'hat', velocity: 0.35 })
    }
  }

  return {
    id,
    // Fast, but not so fast the gallop turns into a buzz at 16th notes.
    bpm: 176,
    stepsPerBar: STEPS_PER_BAR,
    bars,
    // E1, low enough to be felt rather than heard, which is where a rhythm
    // guitar lives.
    root: 28,
    bass,
    lead,
    drums,
  }
}

/** Total steps in the loop. */
export const trackSteps = (track: Track): number => track.bars * track.stepsPerBar

/** Seconds per step, from the tempo. */
export const stepSeconds = (track: Track): number => 60 / track.bpm / 4

/** Equal temperament, A440. */
export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12)
