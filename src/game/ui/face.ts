/**
 * The HUD portrait, sampled from a sprite sheet.
 *
 * Previously this was a hand-drawn character grid. Three attempts at that
 * never got past "generic person with a moustache" -- at 32x32 with a
 * hand-picked ramp there is simply not enough fidelity to look like anyone in
 * particular. The sheet is the artwork itself, downsampled to 36x41 per frame
 * and quantised to a 48-colour palette shared across all frames, so the face
 * cannot shift hue between damage states.
 *
 * Sheet layout, 6 columns by 6 rows of 36x41 frames:
 *
 *   col 0 neutral   col 1 snarl   col 2 hurt
 *   col 3 look left col 4 look right
 *   rows 0-4 are increasing damage; row 5 col 2 is the death frame.
 */

export const FRAME_WIDTH = 36
export const FRAME_HEIGHT = 41
const SHEET_COLS = 6

export type Expression = 'neutral' | 'snarl' | 'hurt' | 'left' | 'right'

const COLUMN: Record<Expression, number> = {
  neutral: 0,
  snarl: 1,
  hurt: 2,
  left: 3,
  right: 4,
}

/** Where the death frame lives; row 5 only has three frames. */
const DEAD = { col: 2, row: 5 }

/** Top-left of a frame within the sheet, in pixels. */
export function frameOffset(bucket: number, expression: Expression): { x: number; y: number } {
  if (bucket >= 5) {
    return { x: DEAD.col * FRAME_WIDTH, y: DEAD.row * FRAME_HEIGHT }
  }
  const row = Math.max(0, Math.min(4, Math.floor(bucket)))
  const col = COLUMN[expression] ?? 0
  return { x: col * FRAME_WIDTH, y: row * FRAME_HEIGHT }
}

export const sheetWidth = SHEET_COLS * FRAME_WIDTH

/**
 * Loads the sheet once and reports when it is ready.
 *
 * The HUD draws on frame one, well before an image can decode, so callers have
 * to cope with `image` being null and redraw when `onReady` fires. Drawing a
 * blank rather than blocking is the right trade: a missing portrait for two
 * frames is invisible, and waiting on the network before the first render is
 * not.
 */
export class FaceSheet {
  image: HTMLImageElement | null = null
  private readonly listeners: (() => void)[] = []

  constructor(src = '/faces.png') {
    const img = new Image()
    img.onload = () => {
      this.image = img
      for (const fn of this.listeners) fn()
    }
    // A portrait that fails to load must not take the HUD with it.
    img.onerror = () => {
      this.image = null
    }
    img.src = src
  }

  onReady(fn: () => void): void {
    if (this.image) fn()
    else this.listeners.push(fn)
  }
}
