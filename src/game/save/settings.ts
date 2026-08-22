import type { StorageAdapter } from './scores.ts'

/**
 * Player settings that outlive a session.
 *
 * Shares the injected storage adapter with `scores.ts`, so this is testable
 * under `environment: 'node'` and, like the scores, cannot throw: a browser
 * that refuses to store anything is a reason to lose a preference, not a
 * reason for the game not to start.
 */

export const SETTINGS_KEY = 'slugzone.settings.v1'

/**
 * How loud the music sits when nobody has said otherwise.
 *
 * Well down. The first number here was chosen against the sound effects in
 * isolation and turned out to be loud enough that the soundtrack was the
 * loudest thing in the game -- which is the wrong way round for a shooter,
 * where a shot you cannot hear land is information you have lost.
 *
 * On the step grid on purpose. A default sitting between two notches makes the
 * very first press snap instead of step, so the control feels broken at the
 * one moment everybody tries it.
 */
export const DEFAULT_MUSIC_VOLUME = 0.3

/**
 * What a setting of 1 actually means at the mixer.
 *
 * Headroom: six voices landing on the same downbeat through a compressor still
 * has to fit inside 0..1, so "100%" is deliberately not unity gain.
 */
export const MUSIC_MAX_GAIN = 0.5

/** Volume moves in tenths, so a held key lands exactly on 0 and on 1. */
export const VOLUME_STEP = 0.1

export interface Settings {
  version: 1
  /** 0..1, before `MUSIC_MAX_GAIN` is applied. */
  musicVolume: number
}

const clampVolume = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_MUSIC_VOLUME
  return Math.min(1, Math.max(0, value))
}

const defaults = (): Settings => ({ version: 1, musicVolume: DEFAULT_MUSIC_VOLUME })

/**
 * Move the volume one notch.
 *
 * Snapped to the step grid rather than added to, so a value that arrived from
 * storage half way between notches does not keep every later press off the
 * grid -- and so holding the key reaches silence exactly rather than stopping
 * at 0.04 of it.
 */
export function stepVolume(current: number, direction: -1 | 1): number {
  const notch = Math.round(clampVolume(current) / VOLUME_STEP)
  const moved = (notch + direction) * VOLUME_STEP
  // Rounded because a tenth is not exact in binary and the errors accumulate
  // over a dozen presses into a percentage that reads as 39 rather than 40.
  return clampVolume(Math.round(moved * 100) / 100)
}

/** For the on-screen readout. */
export const volumePercent = (value: number): number => Math.round(clampVolume(value) * 100)

export function loadSettings(store: StorageAdapter): Settings {
  let raw: string | null
  try {
    raw = store.getItem(SETTINGS_KEY)
  } catch {
    return defaults()
  }
  if (!raw) return defaults()

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    if (parsed?.version !== 1) return defaults()
    return {
      version: 1,
      musicVolume:
        typeof parsed.musicVolume === 'number'
          ? clampVolume(parsed.musicVolume)
          : DEFAULT_MUSIC_VOLUME,
    }
  } catch {
    return defaults()
  }
}

export function saveSettings(store: StorageAdapter, settings: Settings): void {
  try {
    store.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...settings, musicVolume: clampVolume(settings.musicVolume) }),
    )
  } catch {
    // Quota, or a privacy mode that refuses writes.
  }
}
