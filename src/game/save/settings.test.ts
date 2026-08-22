import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MUSIC_VOLUME,
  loadSettings,
  MUSIC_MAX_GAIN,
  saveSettings,
  SETTINGS_KEY,
  stepVolume,
  VOLUME_STEP,
  volumePercent,
} from './settings.ts'
import type { StorageAdapter } from './scores.ts'

const fake = (initial?: string): StorageAdapter & { raw: () => string | null } => {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(SETTINGS_KEY, initial)
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    // What actually landed in storage. Reading it back through loadSettings
    // cannot tell a write-side clamp from a read-side one, because that clamps
    // too -- so the test that tried to went green either way.
    raw: () => map.get(SETTINGS_KEY) ?? null,
  }
}

const hostile = (): StorageAdapter => ({
  getItem: () => {
    throw new Error('site data blocked')
  },
  setItem: () => {
    throw new Error('quota exceeded')
  },
})

describe('stepVolume', () => {
  it('moves one notch at a time, and lands on a round number', () => {
    // Exact equality, not closeness. A tenth is not exact in binary, so
    // without rounding this comes back 0.6000000000000001 -- which works
    // perfectly as a gain and looks like a bug in the saved settings.
    expect(stepVolume(0.5, 1)).toBe(0.6)
    expect(stepVolume(0.5, -1)).toBe(0.4)
    expect(stepVolume(0.2, 1)).toBe(0.3)
    expect(stepVolume(0.7, 1)).toBe(0.8)
  })

  it('reaches silence exactly, and stops there', () => {
    // Repeated subtraction of a tenth in binary lands on 0.04 rather than 0,
    // and a music control that will not quite turn off is worse than one that
    // is simply missing.
    let volume = 1
    for (let i = 0; i < 20; i++) volume = stepVolume(volume, -1)
    expect(volume).toBe(0)
  })

  it('reaches full exactly, and stops there', () => {
    let volume = 0
    for (let i = 0; i < 20; i++) volume = stepVolume(volume, 1)
    expect(volume).toBe(1)
  })

  it('snaps a value that arrived off the grid back onto it', () => {
    // A number out of storage need not be a multiple of the step. Adding to it
    // would keep every later press off the grid for good.
    expect(stepVolume(0.37, 1)).toBeCloseTo(0.5, 6)
    expect(stepVolume(0.37, -1)).toBeCloseTo(0.3, 6)
  })

  it('survives nonsense rather than propagating it', () => {
    expect(stepVolume(Number.NaN, 1)).toBeCloseTo(DEFAULT_MUSIC_VOLUME + VOLUME_STEP, 6)
    expect(stepVolume(Number.POSITIVE_INFINITY, -1)).toBeLessThanOrEqual(1)
  })

  it('starts on the grid, so the first press steps rather than snapping', () => {
    // A default between two notches makes the control feel broken at the one
    // moment everybody tries it: press up, and it moves by half a step.
    expect(DEFAULT_MUSIC_VOLUME / VOLUME_STEP).toBeCloseTo(
      Math.round(DEFAULT_MUSIC_VOLUME / VOLUME_STEP),
      6,
    )
    expect(stepVolume(DEFAULT_MUSIC_VOLUME, 1)).toBeCloseTo(DEFAULT_MUSIC_VOLUME + VOLUME_STEP, 6)
    expect(stepVolume(DEFAULT_MUSIC_VOLUME, -1)).toBeCloseTo(DEFAULT_MUSIC_VOLUME - VOLUME_STEP, 6)
  })

  it('walks the whole range in a sane number of presses', () => {
    // Ten notches: enough to be fine, few enough to cross quickly.
    let volume = 0
    let presses = 0
    while (volume < 1 && presses < 100) {
      volume = stepVolume(volume, 1)
      presses++
    }
    expect(presses).toBe(10)
  })
})

describe('volumePercent', () => {
  it('reads as whole percent', () => {
    expect(volumePercent(0)).toBe(0)
    expect(volumePercent(0.35)).toBe(35)
    expect(volumePercent(1)).toBe(100)
  })

  it('never shows something outside 0 to 100', () => {
    expect(volumePercent(-3)).toBe(0)
    expect(volumePercent(9)).toBe(100)
  })
})

describe('the default', () => {
  it('leaves the music under the sound effects', () => {
    // The complaint that produced this: a soundtrack louder than the shooting.
    // Both halves matter -- audible, but not the loudest thing in the game.
    expect(DEFAULT_MUSIC_VOLUME).toBeGreaterThan(0)
    expect(DEFAULT_MUSIC_VOLUME).toBeLessThan(0.5)
  })

  it('keeps headroom at full, so 100% is not unity gain', () => {
    // Six voices on one downbeat still has to fit inside 0..1.
    expect(MUSIC_MAX_GAIN).toBeLessThan(1)
    expect(DEFAULT_MUSIC_VOLUME * MUSIC_MAX_GAIN).toBeLessThan(0.25)
  })
})

describe('loadSettings', () => {
  it('starts at the default when nothing is stored', () => {
    expect(loadSettings(fake()).musicVolume).toBe(DEFAULT_MUSIC_VOLUME)
  })

  it('reads back what was written', () => {
    const store = fake()
    saveSettings(store, { version: 1, musicVolume: 0.7 })
    expect(loadSettings(store).musicVolume).toBeCloseTo(0.7, 6)
  })

  it('remembers silence rather than treating it as unset', () => {
    // Zero is falsy, and someone who turned the music off must not find it on
    // again next time.
    const store = fake()
    saveSettings(store, { version: 1, musicVolume: 0 })
    expect(loadSettings(store).musicVolume).toBe(0)
  })

  it('survives malformed JSON and the wrong shape', () => {
    for (const raw of ['{not json', 'null', '[]', '"x"', '42', '{"version":2,"musicVolume":0.9}']) {
      expect(loadSettings(fake(raw)).musicVolume, raw).toBe(DEFAULT_MUSIC_VOLUME)
    }
  })

  it('clamps a volume that was edited by hand', () => {
    expect(loadSettings(fake('{"version":1,"musicVolume":40}')).musicVolume).toBe(1)
    expect(loadSettings(fake('{"version":1,"musicVolume":-2}')).musicVolume).toBe(0)
  })

  it('falls back for a volume that is not a number at all', () => {
    expect(loadSettings(fake('{"version":1,"musicVolume":"loud"}')).musicVolume).toBe(
      DEFAULT_MUSIC_VOLUME,
    )
  })

  it('degrades when the store itself throws', () => {
    expect(loadSettings(hostile()).musicVolume).toBe(DEFAULT_MUSIC_VOLUME)
  })
})

describe('saveSettings', () => {
  it('swallows a store that refuses to write', () => {
    expect(() => saveSettings(hostile(), { version: 1, musicVolume: 0.5 })).not.toThrow()
  })

  it('clamps on the way out too, so bad data never reaches storage', () => {
    const store = fake()
    saveSettings(store, { version: 1, musicVolume: 12 })
    expect(JSON.parse(store.raw()!).musicVolume, 'what was actually written').toBe(1)
  })
})
