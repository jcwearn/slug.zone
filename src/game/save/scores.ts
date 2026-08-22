/**
 * Best completion time per level.
 *
 * The storage adapter is injected rather than reached for, which is what lets
 * a Map-backed fake cover this under `environment: 'node'` instead of dragging
 * jsdom in to test seven lines of JSON handling.
 *
 * Nothing here throws. Reading is best-effort and writing is best-effort:
 * localStorage is absent under `file://`, throws on read in some privacy
 * modes, and throws on write when the quota is full. None of that is a reason
 * for the level-complete screen to take the game down with it.
 */

export const STORAGE_KEY = 'slugzone.records.v1'

/** Just the two methods, so a fake is four lines. */
export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface Records {
  version: 1
  /** Level id to best completion time, in seconds. */
  best: Record<string, number>
}

const empty = (): Records => ({ version: 1, best: {} })

export function loadRecords(store: StorageAdapter): Records {
  let raw: string | null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch {
    return empty()
  }
  if (!raw) return empty()

  try {
    // Validated rather than trusted. This is user-editable text on a machine
    // we do not control, and it is read at the one moment the player has just
    // won -- so a crash here replaces the reward screen with a blank canvas.
    //
    // Two checks do all the work. The version rejects anything not written by
    // this exact shape, and the per-entry filter rejects anything that is not
    // a real time. A `null`, an array or a bare string trips one or the other,
    // or throws on the way and lands in the catch.
    const record = JSON.parse(raw) as Partial<Records>
    if (record?.version !== 1) return empty()

    const best: Record<string, number> = {}
    for (const [id, time] of Object.entries(record.best ?? {})) {
      if (typeof time === 'number' && Number.isFinite(time) && time > 0) best[id] = time
    }
    return { version: 1, best }
  } catch {
    return empty()
  }
}

export function saveRecords(store: StorageAdapter, records: Records): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Quota, or a privacy mode that refuses writes. Losing a best time is not
    // worth an exception on the intermission screen.
  }
}

export interface RecordResult {
  improved: boolean
  /** The best time now standing for this level. */
  best: number
  /** What it was before, or null if this is the first completion. */
  previous: number | null
}

/** Records `seconds` if it beats what is there. Mutates `records`. */
export function recordTime(records: Records, levelId: string, seconds: number): RecordResult {
  const previous = records.best[levelId] ?? null
  if (previous !== null && previous <= seconds) {
    return { improved: false, best: previous, previous }
  }
  records.best[levelId] = seconds
  return { improved: true, best: seconds, previous }
}

/** localStorage where it works, and a black hole where it does not. */
export function browserStorage(): StorageAdapter {
  try {
    const storage = globalThis.localStorage
    if (storage) return storage
  } catch {
    // Accessing the property itself throws when site data is blocked.
  }
  return {
    getItem: () => null,
    setItem: () => {},
  }
}
