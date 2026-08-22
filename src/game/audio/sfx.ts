/**
 * Sound effects synthesised in the browser. No audio files to host, and every
 * shot can be varied slightly rather than replaying one identical sample.
 *
 * The AudioContext starts suspended until a user gesture -- the same gesture
 * that engages pointer lock -- so `unlock()` is called from the click-to-play
 * handler. Calling any of these before then is a no-op rather than an error,
 * because sound that fails should never take gameplay down with it.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }

  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return

  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)

  // One second of white noise, reused by every noise-based effect. Generating
  // it per shot allocates a buffer inside the audio thread's deadline.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}

export function setSfxVolume(value: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, value))
}

/**
 * Hands back non-null references, or null when audio is not up yet.
 *
 * A `ctx is AudioContext` predicate cannot work here: a type predicate has to
 * name a parameter, and these are module-level. Returning the locals is what
 * actually narrows them.
 */
function audio(): { ac: AudioContext; out: GainNode; now: number } | null {
  if (!ctx || !master) return null
  return { ac: ctx, out: master, now: ctx.currentTime }
}

function noiseSource(ac: AudioContext): AudioBufferSourceNode | null {
  if (!noiseBuffer) return null
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  return src
}

/**
 * The salt shaker: a noise burst through a bandpass that sweeps downward, with
 * a fast decay. The sweep is what makes it read as a scatter of grains rather
 * than a gunshot -- a static filter sounds like a snare hit.
 */
export function playSaltBlast(variation = 0): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  const src = noiseSource(ac)
  if (!src) return

  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.4
  const start = 2600 + variation * 500
  filter.frequency.setValueAtTime(start, now)
  filter.frequency.exponentialRampToValueAtTime(420, now + 0.13)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.7, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)

  src.connect(filter).connect(gain).connect(out)
  src.start(now)
  src.stop(now + 0.18)
}

/** The Grinder: lower, longer, with a bit of body behind the noise. */
export function playGrinderBlast(variation = 0): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  const src = noiseSource(ac)
  if (!src) return

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800 + variation * 300, now)
  filter.frequency.exponentialRampToValueAtTime(220, now + 0.3)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.9, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)

  // A short sine thump under the noise, which is what gives a shotgun weight.
  const thump = ac.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(120, now)
  thump.frequency.exponentialRampToValueAtTime(45, now + 0.16)
  const thumpGain = ac.createGain()
  thumpGain.gain.setValueAtTime(0.5, now)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)

  src.connect(filter).connect(gain).connect(out)
  thump.connect(thumpGain).connect(out)
  src.start(now)
  src.stop(now + 0.36)
  thump.start(now)
  thump.stop(now + 0.22)
}

/** A grain hitting stone: very short, bright, quiet. */
export function playImpact(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  const src = noiseSource(ac)
  if (!src) return

  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 3200

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.22, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

  src.connect(filter).connect(gain).connect(out)
  src.start(now)
  src.stop(now + 0.06)
}

/** Refused shot: a dry click, so an empty weapon is audibly empty. */
export function playDryFire(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  const osc = ac.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(220, now)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.12, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
  osc.connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + 0.05)
}

/** Weapon raise: a short upward chirp. */
export function playSwitch(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  const osc = ac.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.09)
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.14, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
  osc.connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + 0.13)
}

/**
 * A slug taking a hit: an FM-ish squelch. A wobbling lowpass over a detuned
 * pair is what gives it the wet quality -- a plain tone reads as a beep, and a
 * plain noise burst reads as static.
 */
export function playSquelch(variation = 0, big = false): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const carrier = ac.createOscillator()
  carrier.type = 'sawtooth'
  const base = (big ? 90 : 160) + variation * 60
  carrier.frequency.setValueAtTime(base, now)
  carrier.frequency.exponentialRampToValueAtTime(base * 0.45, now + 0.18)

  // Modulating the carrier's frequency is what makes it warble rather than
  // slide.
  const mod = ac.createOscillator()
  mod.type = 'sine'
  mod.frequency.value = 22 + variation * 18
  const modGain = ac.createGain()
  modGain.gain.value = base * 0.4
  mod.connect(modGain).connect(carrier.frequency)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 6
  filter.frequency.setValueAtTime(1400, now)
  filter.frequency.exponentialRampToValueAtTime(260, now + 0.2)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(big ? 0.5 : 0.32, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (big ? 0.32 : 0.22))

  carrier.connect(filter).connect(gain).connect(out)
  carrier.start(now)
  mod.start(now)
  carrier.stop(now + 0.36)
  mod.stop(now + 0.36)
}

/** A wet burst for a gib. Louder, lower, with a noise splatter over it. */
export function playGib(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a
  playSquelch(0.2, true)

  const src = noiseSource(ac)
  if (!src) return
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(900, now)
  filter.frequency.exponentialRampToValueAtTime(180, now + 0.25)
  filter.Q.value = 0.8

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.45, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)

  src.connect(filter).connect(gain).connect(out)
  src.start(now)
  src.stop(now + 0.32)
}

/** Noticed you. A short rising growl, so an alert is audible off-screen. */
export function playAlert(variation = 0): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(70 + variation * 30, now)
  osc.frequency.exponentialRampToValueAtTime(190 + variation * 40, now + 0.16)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)

  osc.connect(filter).connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + 0.28)
}

/** Taking a hit: a short, dull thud with a grunt under it. */
export function playHurt(variation = 0): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(180 + variation * 40, now)
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.14)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1100, now)
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.16)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.42, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

  osc.connect(filter).connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + 0.24)
}

/** Dying: a long descending groan. */
export function playDeath(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(160, now)
  osc.frequency.exponentialRampToValueAtTime(38, now + 1.1)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(900, now)
  filter.frequency.exponentialRampToValueAtTime(160, now + 1.2)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)

  osc.connect(filter).connect(gain).connect(out)
  osc.start(now)
  osc.stop(now + 1.35)
}

/** A Spitter launching: a wet upward hock. */
export function playSpit(variation = 0): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const src = noiseSource(ac)
  if (!src) return
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 3
  filter.frequency.setValueAtTime(400 + variation * 120, now)
  filter.frequency.exponentialRampToValueAtTime(1800, now + 0.14)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.34, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)

  src.connect(filter).connect(gain).connect(out)
  src.start(now)
  src.stop(now + 0.2)
}

/** Acid landing on stone: a short hiss. */
export function playSplat(): void {
  const a = audio()
  if (!a) return
  const { ac, out, now } = a

  const src = noiseSource(ac)
  if (!src) return
  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 2200

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

  src.connect(filter).connect(gain).connect(out)
  src.start(now)
  src.stop(now + 0.24)
}
