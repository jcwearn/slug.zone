import { describe, expect, it } from 'vitest'
import {
  browserStorage,
  loadRecords,
  recordTime,
  saveRecords,
  STORAGE_KEY,
  type StorageAdapter,
} from './scores.ts'

/**
 * The storage adapter is injected precisely so this needs no DOM: a Map-backed
 * fake covers every path in four lines, and `environment: 'node'` stays.
 *
 * The failure this file is really guarding is the crash. Every read here runs
 * at the exact moment the player has just finished a level, so anything that
 * throws replaces the reward screen with a blank canvas.
 */

const fake = (initial?: string): StorageAdapter & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(STORAGE_KEY, initial)
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
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

describe('loadRecords', () => {
  it('starts empty when nothing has been stored', () => {
    expect(loadRecords(fake())).toEqual({ version: 1, best: {} })
  })

  it('reads back what was written', () => {
    const store = fake()
    saveRecords(store, { version: 1, best: { e1m1: 61.5 } })
    expect(loadRecords(store).best.e1m1).toBe(61.5)
  })

  it('survives malformed JSON', () => {
    // This is user-editable text on a machine we do not control.
    expect(loadRecords(fake('{not json at all'))).toEqual({ version: 1, best: {} })
  })

  it('survives a payload of the wrong shape', () => {
    for (const raw of [
      'null',
      '[]',
      '"a string"',
      '42',
      '{"version":1}',
      '{"version":1,"best":[]}',
    ])
      expect(loadRecords(fake(raw)), raw).toEqual({ version: 1, best: {} })
  })

  it('discards a future or missing version rather than guessing at it', () => {
    expect(loadRecords(fake('{"version":2,"best":{"e1m1":10}}')).best).toEqual({})
    expect(loadRecords(fake('{"best":{"e1m1":10}}')).best).toEqual({})
  })

  it('drops individual entries that are not sane times', () => {
    const raw = '{"version":1,"best":{"ok":12,"str":"9","neg":-3,"nan":null,"inf":1e999}}'
    expect(loadRecords(fake(raw)).best).toEqual({ ok: 12 })
  })

  it('degrades to empty when the store itself throws', () => {
    expect(loadRecords(hostile())).toEqual({ version: 1, best: {} })
  })
})

describe('saveRecords', () => {
  it('swallows a store that refuses to write', () => {
    // Private browsing and a full quota both throw here, and losing a best
    // time is not worth an exception on the screen that says you won.
    expect(() => saveRecords(hostile(), { version: 1, best: { e1m1: 1 } })).not.toThrow()
  })
})

describe('recordTime', () => {
  it('records the first completion of a level', () => {
    const records = loadRecords(fake())
    expect(recordTime(records, 'e1m1', 74)).toEqual({ improved: true, best: 74, previous: null })
    expect(records.best.e1m1).toBe(74)
  })

  it('keeps the faster of the two', () => {
    const records = loadRecords(fake('{"version":1,"best":{"e1m1":74}}'))
    expect(recordTime(records, 'e1m1', 61)).toEqual({ improved: true, best: 61, previous: 74 })
    expect(records.best.e1m1).toBe(61)
  })

  it('does not overwrite with a slower time', () => {
    // A `>` here instead of `<=` makes the stored "best" your most recent run,
    // and after a bad one your record is gone.
    const records = loadRecords(fake('{"version":1,"best":{"e1m1":61}}'))
    expect(recordTime(records, 'e1m1', 90)).toEqual({ improved: false, best: 61, previous: 61 })
    expect(records.best.e1m1).toBe(61)
  })

  it('does not count matching the record as beating it', () => {
    const records = loadRecords(fake('{"version":1,"best":{"e1m1":61}}'))
    expect(recordTime(records, 'e1m1', 61).improved).toBe(false)
  })

  it('keeps levels apart', () => {
    const records = loadRecords(fake())
    recordTime(records, 'e1m1', 40)
    expect(recordTime(records, 'e1m2', 90).previous).toBeNull()
    expect(records.best.e1m1).toBe(40)
  })
})

describe('browserStorage', () => {
  it('hands back a working no-op when localStorage is absent', () => {
    // Which is the case under file://, and in this very test run.
    const store = browserStorage()
    expect(() => store.setItem(STORAGE_KEY, 'x')).not.toThrow()
    expect(() => store.getItem(STORAGE_KEY)).not.toThrow()
    expect(loadRecords(store)).toEqual({ version: 1, best: {} })
  })
})
