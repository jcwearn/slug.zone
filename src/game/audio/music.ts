import { musicNodes, sharedNoise } from './sfx.ts'
import { buildTrack, midiToHz, stepSeconds, trackSteps, type Track } from './track.ts'

/**
 * The player: turns a `Track` into oscillators.
 *
 * Scheduled ahead rather than on a timer. A `setInterval` firing a note the
 * instant it is due is at the mercy of whatever else the main thread is doing,
 * and a rhythm section that lurches whenever a Grinder blast spawns eight
 * pellets is worse than no rhythm section. Instead a slow-ish timer wakes up
 * and queues every note falling inside the next fraction of a second at its
 * exact `AudioContext` time, which the audio thread then honours regardless of
 * what the renderer is doing.
 *
 * Nothing here is unit-tested -- it is an audio graph, and this repo verifies
 * those by listening. The composition it plays is in `track.ts`, which is.
 */

/** How far ahead notes are queued, in seconds. */
const LOOKAHEAD = 0.15
/** How often the scheduler wakes, in milliseconds. Comfortably under the above. */
const TICK_MS = 40

const tracks = new Map<string, Track>()

let current: Track | null = null
let timer: ReturnType<typeof setInterval> | null = null
/** Absolute AudioContext time the next step falls on. */
let nextTime = 0
let nextStep = 0
let enabled = true

/**
 * Tracks are built once and cached.
 *
 * The seed is derived from the id, so `cellar` is the same riff on every
 * machine and in every session -- a level's music being different each time
 * you load it is a bug you cannot reproduce.
 */
function trackFor(id: string): Track {
  let track = tracks.get(id)
  if (!track) {
    let hash = 2166136261
    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
    }
    track = buildTrack(id, hash >>> 0)
    tracks.set(id, track)
  }
  return track
}

/** The rhythm guitar: a square chug with the life choked out of it. */
function playBass(ac: AudioContext, out: GainNode, at: number, hz: number, velocity: number): void {
  const osc = ac.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(hz, at)

  // A lowpass slammed shut over 60ms is what a palm mute is: all attack, no
  // sustain, and almost no note left by the time the next one lands.
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 6
  filter.frequency.setValueAtTime(2200, at)
  filter.frequency.exponentialRampToValueAtTime(320, at + 0.06)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.42 * velocity, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.075)

  osc.connect(filter).connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.09)
}

/** The lead: a thinner voice an octave up, with a little wobble. */
function playLead(
  ac: AudioContext,
  out: GainNode,
  at: number,
  hz: number,
  velocity: number,
  seconds: number,
): void {
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(hz, at)

  // A slow detune against itself. Two cents of drift is the difference
  // between a chip lead and a test tone.
  const drift = ac.createOscillator()
  drift.type = 'sine'
  drift.frequency.value = 5.5
  const driftAmount = ac.createGain()
  driftAmount.gain.value = hz * 0.006
  drift.connect(driftAmount).connect(osc.frequency)

  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = hz * 2.2
  filter.Q.value = 1.4

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.13 * velocity, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)

  osc.connect(filter).connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + seconds + 0.02)
  drift.start(at)
  drift.stop(at + seconds + 0.02)
}

function playKick(ac: AudioContext, out: GainNode, at: number, velocity: number): void {
  const osc = ac.createOscillator()
  osc.type = 'sine'
  // The pitch drop IS the kick. A steady tone at 50Hz is a hum.
  osc.frequency.setValueAtTime(150, at)
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.055)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.7 * velocity, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)

  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + 0.11)
}

function playSnare(ac: AudioContext, out: GainNode, at: number, velocity: number): void {
  const noise = sharedNoise(ac)
  if (!noise) return
  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1400

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.34 * velocity, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)

  noise.connect(filter).connect(gain).connect(out)
  noise.start(at)
  noise.stop(at + 0.12)

  // A little body under the hiss, or it reads as a cymbal rather than a drum.
  const body = ac.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(220, at)
  body.frequency.exponentialRampToValueAtTime(150, at + 0.06)
  const bodyGain = ac.createGain()
  bodyGain.gain.setValueAtTime(0.16 * velocity, at)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07)
  body.connect(bodyGain).connect(out)
  body.start(at)
  body.stop(at + 0.08)
}

function playHat(ac: AudioContext, out: GainNode, at: number, velocity: number): void {
  const noise = sharedNoise(ac)
  if (!noise) return
  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 7000

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.14 * velocity, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035)

  noise.connect(filter).connect(gain).connect(out)
  noise.start(at)
  noise.stop(at + 0.045)
}

/** Queue everything falling inside the lookahead window. */
function schedule(): void {
  const nodes = musicNodes()
  if (!nodes || !current) return
  const { ac, out, now } = nodes

  const track = current
  const seconds = stepSeconds(track)
  const total = trackSteps(track)

  while (nextTime < now + LOOKAHEAD) {
    // A step's worth of every voice at once. Iterating the whole track per
    // step is fine at these sizes and keeps the loop obvious; a track long
    // enough for that to matter would want an index.
    for (const note of track.bass) {
      if (note.step === nextStep) {
        playBass(ac, out, nextTime, midiToHz(track.root + note.pitch), note.velocity)
      }
    }
    for (const note of track.lead) {
      if (note.step === nextStep) {
        playLead(
          ac,
          out,
          nextTime,
          midiToHz(track.root + note.pitch),
          note.velocity,
          note.length * seconds,
        )
      }
    }
    for (const hit of track.drums) {
      if (hit.step !== nextStep) continue
      if (hit.voice === 'kick') playKick(ac, out, nextTime, hit.velocity)
      else if (hit.voice === 'snare') playSnare(ac, out, nextTime, hit.velocity)
      else playHat(ac, out, nextTime, hit.velocity)
    }

    nextTime += seconds
    nextStep = (nextStep + 1) % total
  }
}

/**
 * Start a track, or switch to another one.
 *
 * A no-op before the audio context exists, like everything else in here --
 * sound that fails must never take gameplay down with it. Call it from the
 * same gesture that unlocks audio.
 */
export function startMusic(id: string): void {
  const nodes = musicNodes()
  if (!nodes) return
  if (current?.id === id && timer !== null) return

  stopMusic()
  current = trackFor(id)
  if (!enabled) return

  nextStep = 0
  // A beat of headroom before the first note, so the opening downbeat is not
  // scheduled in the past and dropped.
  nextTime = nodes.now + 0.12
  schedule()
  timer = setInterval(schedule, TICK_MS)
}

/**
 * Stop the scheduler.
 *
 * Notes already queued play out over the next fraction of a second -- there is
 * no way to unschedule them and no reason to want one.
 */
export function stopMusic(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

export const isMusicOn = (): boolean => enabled

/** Toggle, and return whether it is now on. */
export function toggleMusic(): boolean {
  enabled = !enabled
  if (enabled) {
    const id = current?.id
    current = null
    if (id) startMusic(id)
  } else {
    stopMusic()
  }
  return enabled
}
