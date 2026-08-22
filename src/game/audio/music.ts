import * as Tone from 'tone'
import { buildTrack, midiToHz, stepSeconds, trackSteps, type Track } from './track.ts'

/**
 * The player: hands `track.ts` to Tone.js.
 *
 * Tone owns the timing. Its Transport does the lookahead scheduling a
 * hand-rolled `setInterval` had to fake, and it does it against the audio
 * clock -- so the rhythm section does not lurch when a Grinder blast spawns
 * eight pellets on the same frame.
 *
 * Tone keeps its own AudioContext, separate from the one the sound effects
 * run on, and is started through `Tone.start()` -- the path its documentation
 * describes. Handing it somebody else's context instead is one line shorter
 * and put the whole game behind whether that worked: it runs inside the
 * click-to-play handler, so anything that threw there took pointer lock with
 * it and the button appeared to stop working.
 *
 * Nothing here is unit-tested: it is a synth graph, and this repo verifies
 * those by listening. The composition it plays is in `track.ts`, which is.
 */

interface Voices {
  bass: Tone.PolySynth<Tone.Synth>
  lead: Tone.MonoSynth
  pad: Tone.PolySynth<Tone.Synth>
  kick: Tone.MembraneSynth
  snare: Tone.NoiseSynth
  hat: Tone.NoiseSynth
  crash: Tone.NoiseSynth
  bus: Tone.Gain
}

const tracks = new Map<string, Track>()
let voices: Voices | null = null
let parts: Tone.Part[] = []
let current: Track | null = null
let enabled = true
/** Set once the synth graph has failed, so it is not retried every level. */
let broken = false
/** Bumped by every start, so a slow one cannot schedule over a newer one. */
let generation = 0

function trackFor(id: string): Track {
  let track = tracks.get(id)
  if (!track) {
    track = buildTrack(id)
    tracks.set(id, track)
  }
  return track
}

/**
 * Build the instruments, once.
 *
 * Every voice is a synth rather than a sample, which is the same trade the
 * sound effects make: nothing to host, and it stays in the chip-tune register
 * the rest of the game is drawn in.
 */
function build(): Voices | null {
  if (voices) return voices
  if (broken) return null

  const bus = new Tone.Gain(0.42).toDestination()

  // A compressor across the whole mix so the chorus does not simply clip when
  // six voices land on the same downbeat.
  const glue = new Tone.Compressor({ threshold: -18, ratio: 4, attack: 0.003, release: 0.12 })
  glue.connect(bus)

  // Rhythm guitar: square waves through hard distortion and a lowpass. The
  // filter is what stops distorted squares turning into white noise up top.
  const grind = new Tone.Distortion(0.85)
  const cab = new Tone.Filter({ type: 'lowpass', frequency: 2400, rolloff: -24 })
  const bass = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' },
    // Almost no sustain: that is what a palm mute is, and it leaves room for
    // the next note a sixteenth later.
    envelope: { attack: 0.002, decay: 0.09, sustain: 0.05, release: 0.05 },
  })
  bass.maxPolyphony = 8
  bass.chain(grind, cab, glue)

  // Lead: a single voice with a filter envelope, so each note opens up rather
  // than just appearing.
  const leadDrive = new Tone.Distortion(0.35)
  const leadVerb = new Tone.Reverb({ decay: 2.2, wet: 0.22 })
  const lead = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.65, release: 0.25 },
    filterEnvelope: {
      attack: 0.02,
      decay: 0.25,
      sustain: 0.5,
      release: 0.4,
      baseFrequency: 420,
      octaves: 3,
    },
  })
  lead.chain(leadDrive, leadVerb, glue)

  // Organ: soft triangles, well back in the mix. It is the thing that makes a
  // riff sound like it is in a cellar rather than in a vacuum.
  const padVerb = new Tone.Reverb({ decay: 3.5, wet: 0.4 })
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.12, decay: 0.3, sustain: 0.7, release: 0.8 },
  })
  pad.maxPolyphony = 8
  pad.volume.value = -14
  pad.chain(padVerb, glue)

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.1 },
  })
  kick.connect(glue)

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
  })
  const snareTone = new Tone.Filter({ type: 'highpass', frequency: 1200 })
  snare.chain(snareTone, glue)

  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
  })
  const hatTone = new Tone.Filter({ type: 'highpass', frequency: 8000 })
  hat.volume.value = -18
  hat.chain(hatTone, glue)

  const crash = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 1.4, sustain: 0 },
  })
  const crashTone = new Tone.Filter({ type: 'highpass', frequency: 5000 })
  crash.volume.value = -14
  crash.chain(crashTone, glue)

  voices = { bass, lead, pad, kick, snare, hat, crash, bus }
  return voices
}

/** Sixteenths to Tone's bars:beats:sixteenths. */
const at = (step: number): string =>
  `${Math.floor(step / 16)}:${Math.floor((step % 16) / 4)}:${step % 4}`

function schedule(track: Track, v: Voices): void {
  const seconds = stepSeconds(track)
  const hz = (pitch: number) => midiToHz(track.root + pitch)

  const notePart = <T extends { step: number }>(
    items: T[],
    play: (time: number, item: T) => void,
  ) => {
    const part = new Tone.Part(
      (time, item) => play(time, item as T),
      items.map((item) => [at(item.step), item] as [string, T]),
    )
    part.loop = true
    part.loopEnd = at(trackSteps(track))
    part.start(0)
    parts.push(part)
  }

  notePart(track.bass, (time, note) => {
    v.bass.triggerAttackRelease(hz(note.pitch), note.length * seconds * 0.9, time, note.velocity)
  })
  notePart(track.lead, (time, note) => {
    v.lead.triggerAttackRelease(hz(note.pitch), note.length * seconds * 0.95, time, note.velocity)
  })
  notePart(track.pad, (time, note) => {
    v.pad.triggerAttackRelease(hz(note.pitch), note.length * seconds * 0.98, time, note.velocity)
  })
  notePart(track.drums, (time, hit) => {
    if (hit.voice === 'kick') v.kick.triggerAttackRelease('C1', '8n', time, hit.velocity)
    else if (hit.voice === 'snare') v.snare.triggerAttackRelease('16n', time, hit.velocity)
    else if (hit.voice === 'hat') v.hat.triggerAttackRelease('32n', time, hit.velocity)
    else v.crash.triggerAttackRelease('1n', time, hit.velocity)
  })
}

/**
 * Start a track, or switch to another one.
 *
 * A no-op before the audio context exists, like everything else in here --
 * sound that fails must never take gameplay down with it. Call it from the
 * same gesture that unlocks audio.
 */
/** Give up on music, loudly enough to be reported and quietly enough to play on. */
function fail(error: unknown): void {
  // Logged rather than swallowed: silence with no explanation is the hardest
  // kind of bug to report.
  console.error('music failed; continuing without it', error)
  broken = true
  stopMusic()
}

/**
 * Start a track, or switch to another one.
 *
 * Nothing here may throw. It runs inside the click-to-play handler, and a
 * soundtrack that cannot start is not a reason for the game not to.
 */
export function startMusic(id: string): void {
  if (broken) return
  try {
    if (current?.id === id && parts.length > 0) return
    stopMusic()
    current = trackFor(id)
    if (!enabled) return

    const track = current
    const mine = ++generation
    // Resuming is asynchronous, so the rest hangs off it. `Tone.start()` has
    // to be called from a user gesture, which the click that took pointer lock
    // is -- the same gesture the sound effects are unlocked by.
    void Tone.start()
      .then(() => {
        if (mine !== generation) return
        begin(track)
      })
      .catch(fail)
  } catch (error) {
    fail(error)
  }
}

function begin(track: Track): void {
  try {
    const v = build()
    if (!v) return
    const transport = Tone.getTransport()
    transport.bpm.value = track.bpm
    transport.position = 0
    schedule(track, v)
    transport.start('+0.1')
  } catch (error) {
    fail(error)
  }
}

/** Stop, and throw away the scheduled parts. Also never throws. */
export function stopMusic(): void {
  generation++
  try {
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
  } catch {
    // The transport belongs to a context that may never have come up.
  }
  for (const part of parts) {
    try {
      part.dispose()
    } catch {
      // Already gone.
    }
  }
  parts = []
}

export const isMusicOn = (): boolean => enabled

/** Toggle, and return whether it is now on. */
export function toggleMusic(): boolean {
  if (broken) return false
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

/** 0..1. */
export function setMusicVolume(value: number): void {
  if (voices) voices.bus.gain.value = Math.max(0, Math.min(1, value))
}
