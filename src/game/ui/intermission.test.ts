import { describe, expect, it } from 'vitest'
import { measureText } from './font.ts'
import { LEVELS } from '../world/levels/index.ts'

/**
 * Every line the intermission can draw, and whether it fits.
 *
 * The screen is 320 pixels wide and `centred` does not wrap -- it works out a
 * left edge and draws, so a line that is too long runs off both sides at once
 * and the middle of it is all you get. That is invisible until someone reaches
 * the screen that draws it, and the end-of-episode screen is by definition the
 * last one anybody sees.
 *
 * The `ENTERING` line is built from a level NAME, so it is measured against
 * the longest one actually shipped rather than against a guess.
 */

const WIDTH = 320

const lines: [string, number][] = [
  ['LEVEL COMPLETE', 2],
  ['THE CELLAR IS CLEAR', 2],
  ['CLICK TO CONTINUE', 1],
  ['EVERY SLUG IN THE HOUSE ACCOUNTED FOR', 1],
  ['CLICK TO GO ROUND AGAIN', 1],
  ['CLICK TO PLAY AGAIN', 1],
  ['KILLS', 1],
  ['SECRETS', 1],
  ['RECORD', 1],
]

describe('what the intermission can draw', () => {
  it.each(lines)('%s fits across the screen', (text, scale) => {
    expect(measureText(text, scale)).toBeLessThanOrEqual(WIDTH)
  })

  it.each(LEVELS.map((l) => [l.name] as const))(
    'can announce %s without running off the screen',
    (name) => {
      expect(measureText(`ENTERING ${name.toUpperCase()}`, 1)).toBeLessThanOrEqual(WIDTH)
      expect(measureText(name.toUpperCase(), 1)).toBeLessThanOrEqual(WIDTH)
    },
  )
})
