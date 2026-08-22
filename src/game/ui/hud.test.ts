import { describe, expect, it } from 'vitest'
import { HUD_HEIGHT, LABEL_Y, VALUE_Y } from './hud.ts'
import { glyphHeight, measureText } from './font.ts'
import { WEAPONS } from '../weapons/definitions.ts'

/**
 * The status bar's layout arithmetic, which is pure even though the drawing
 * is not.
 *
 * This exists because of a bug that shipped: the ammo count was drawn seven
 * pixels above the health and armour figures it sits beside, so its top row
 * ran through the weapon name above it. Nothing showed it while the only
 * weapons were "SALT SHAKER" and an empty pool -- it took a name long enough
 * to reach across the bar before "THE GRINDER" and "27" collided.
 *
 * Importing the module does no drawing: `Hud` only touches the DOM when it is
 * constructed, and nothing here constructs one.
 */

const LABEL_SCALE = 1
const VALUE_SCALE = 2
/** Right-hand column, from `draw()`. */
const RIGHT_MARGIN = 8
const WIDTH = 320
/** Left edge of the keycard pips, which the armour figure must not reach. */
const PIPS_X = 128

describe('status bar layout', () => {
  it('leaves a full glyph between the captions and the figures', () => {
    // The bug, in one line: VALUE_Y was 15 and the caption ends at 16.
    expect(LABEL_Y + glyphHeight(LABEL_SCALE)).toBeLessThanOrEqual(VALUE_Y)
  })

  it('keeps the figures inside the bar', () => {
    expect(VALUE_Y + glyphHeight(VALUE_SCALE)).toBeLessThanOrEqual(HUD_HEIGHT)
  })

  it('fits the longest weapon name and its ammo count without them meeting', () => {
    // Both are right-aligned to the same margin, so the only thing keeping
    // them apart is the row gap above. Checked against the real catalogue so a
    // new weapon with a longer name is caught here rather than on screen.
    for (const weapon of Object.values(WEAPONS)) {
      const name = weapon.name.toUpperCase()
      const nameLeft = WIDTH - RIGHT_MARGIN - measureText(name, LABEL_SCALE)
      expect(nameLeft, `${name} runs off the left of the bar`).toBeGreaterThan(PIPS_X)

      // Three digits is the widest an ammo pool here can print.
      const ammoLeft = WIDTH - RIGHT_MARGIN - measureText('000', VALUE_SCALE)
      const overlaps =
        ammoLeft < nameLeft + measureText(name, LABEL_SCALE) &&
        VALUE_Y < LABEL_Y + glyphHeight(LABEL_SCALE)
      expect(overlaps, `${name} overlaps its ammo count`).toBe(false)
    }
  })

  it('keeps a three-digit armour figure clear of the keycard pips', () => {
    const armour = WIDTH - WIDTH + 70 + measureText('100%', VALUE_SCALE)
    expect(armour).toBeLessThan(PIPS_X)
  })
})
