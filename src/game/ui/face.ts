/**
 * The HUD portrait: a 32x32 pixel-art face, hand-drawn as a character grid.
 *
 * Stored the way levels are, as rows of legend characters, because that is the
 * only representation anyone can edit afterwards. A face assembled from
 * fillRect calls is write-once -- nobody moves an eyebrow by adjusting rect
 * coordinates -- whereas this can be nudged a pixel at a time by eye.
 *
 * Three things carry the likeness, and earlier versions got all three wrong:
 *
 *  - NO outline. The hair is the silhouette. Ringing the head in near-black
 *    flattens it into a sticker, which is what the first two attempts did.
 *  - Curly hair, drawn with three auburn values scattered rather than a solid
 *    block with a highlight edge.
 *  - Round wire glasses, which are the single most identifying feature and
 *    were missing entirely.
 *
 * Form comes from the tonal ramp, not the resolution: five skin values, three
 * hair values, and a separate beard tone, so the brow ridge, nose and jaw are
 * modelled rather than outlined.
 *
 * The likeness is drawn from reference imagery's features. No image data is
 * embedded here or anywhere else in this repository -- the grid is characters.
 */

export const FACE_WIDTH = 32
export const FACE_HEIGHT = 32

/**
 * Legend:
 *   ' ' transparent
 *   1 hair dark    2 hair mid    3 hair highlight
 *   B brow
 *   d skin deep shadow   s skin shadow   m skin mid   h skin light
 *   F glasses frame   G lens   W eye white   p pupil
 *   M moustache    u beard    K mouth    T lower lip
 *   C shirt
 */
const BASE: string[] = [
  '          111211121111          ',
  '       111211112111211121       ',
  '     1121112111211112111211     ',
  '    112111211121112111211121    ',
  '   11211121112111211121112111   ',
  '   11121112111211121112111211   ',
  '   111hhhhhhhhhhhhhhhhhhhh111   ',
  '   11hhhhhhhhhhhhhhhhhhhhhh11   ',
  '   11hhhhhhhhhhhhhhhhhhhhhh11   ',
  '   11hBBBBBhhhhhhhhBBBBBhhh11   ',
  '   11hBBBBBhhhhhhhhBBBBBhhh11   ',
  '   11hhFFFFhhhhhhhhFFFFhhhh11   ',
  '   11hFGGGGFhFFFFhFGGGGFhhh11   ',
  '   11hFGpGGFhhhhhhFGpGGFhhh11   ',
  '   11hFGGGGFhhsshhFGGGGFhhh11   ',
  '   11hhFFFFhhhsshhhFFFFhhhh11   ',
  '   11hhhhhhhhhssshhhhhhhhhh11   ',
  '   11hhhhhhhhdssssdhhhhhhhh11   ',
  '   11hhhhhhhddssssddhhhhhhh11   ',
  '   11hhhhhhhhddddddhhhhhhhh11   ',
  '   11hhhhMMMMMMMMMMMMMMhhhh11   ',
  '   11hhhMMMMMMMMMMMMMMMMhhh11   ',
  '   11hhhhMMMMMMMMMMMMMMhhhh11   ',
  '   11hhhhhhhKKKKKKKKhhhhhhh11   ',
  '   11hhhhhhhhTTTTTThhhhhhhh11   ',
  '    1hhhhhhhhhhhhhhhhhhhhhh1    ',
  '    1uhhhhhhhhhhhhhhhhhhhhu1    ',
  '     1uuhhhhhhhhhhhhhhhhuu1     ',
  '      uuuhhhhhhhhhhhhhhuuu      ',
  '       uuuuhhhhhhhhhhuuuu       ',
  '           ssssssssss           ',
  '      CCCCCCCCCCCCCCCCCCCC      ',
]

const PALETTE: Record<string, string> = {
  '1': '#3a2418',
  '2': '#4f3222',
  '3': '#66432c',
  B: '#2c1b11',
  F: '#8d7f5e',
  G: '#c2bcae',
  W: '#efe9dc',
  p: '#1d1209',
  M: '#4b2f1d',
  K: '#3b1a11',
  T: '#94573f',
  C: '#4a7fae',
}

/**
 * Skin and beard ramps per damage bucket, healthy through dead.
 *
 * The whole ramp shifts together rather than one tone. Moving a single value
 * leaves the face patchy -- a drained cheek beside an undrained jaw -- which
 * reads as a rendering fault rather than as injury.
 */
const RAMPS: Record<string, string[]> = {
  d: ['#6f4229', '#693c25', '#613621', '#57301d', '#492818', '#463c33'],
  s: ['#8a5638', '#845033', '#7b492e', '#6f4029', '#5e3522', '#554b41'],
  m: ['#a06a48', '#996342', '#8f5b3c', '#835136', '#70452d', '#655a50'],
  h: ['#b98460', '#b17b58', '#a67150', '#986545', '#82563b', '#796d62'],
  u: ['#6a4a33', '#65452f', '#5e3f2b', '#553826', '#482e1f', '#474038'],
}

export interface FacePixel {
  x: number
  y: number
  colour: string
}

const BLOOD = '#a81e12'
const BLOOD_DARK = '#6d1108'

/**
 * Pixels for one damage bucket, 0 (unhurt) through 5 (dead).
 *
 * Returned as data rather than drawn, so the portrait can be asserted in a
 * test -- bounds, no holes, tonal range, each bucket distinguishable, eyes
 * closing on death -- with no canvas involved.
 */
export function facePixels(bucket: number): FacePixel[] {
  const clamped = Math.max(0, Math.min(5, Math.floor(bucket)))
  const dead = clamped >= 5
  const pixels: FacePixel[] = []

  for (let y = 0; y < FACE_HEIGHT; y++) {
    const row = BASE[y]
    for (let x = 0; x < FACE_WIDTH; x++) {
      const ch = row[x]
      if (ch === ' ') continue

      // Behind the lenses the eyes go dark when dead. Removing them would
      // leave holes in the head, which is a worse expression entirely.
      if (dead && (ch === 'W' || ch === 'p')) {
        pixels.push({ x, y, colour: PALETTE.B })
        continue
      }

      const ramp = RAMPS[ch]
      pixels.push({ x, y, colour: ramp ? ramp[clamped] : PALETTE[ch] })
    }
  }

  // Blood runs from the hairline down the face, further with each bucket.
  if (clamped >= 2) {
    for (let i = 0; i < 4 + clamped * 2; i++) {
      pixels.push({ x: 8, y: 7 + i, colour: i > 4 ? BLOOD_DARK : BLOOD })
    }
    pixels.push({ x: 9, y: 7, colour: BLOOD })
  }
  if (clamped >= 3) {
    for (let i = 0; i < clamped * 2; i++) {
      pixels.push({ x: 21, y: 8 + i, colour: i > 3 ? BLOOD_DARK : BLOOD })
    }
    pixels.push({ x: 20, y: 8, colour: BLOOD })
  }
  if (clamped >= 4) {
    for (let i = 0; i < 6; i++) pixels.push({ x: 12 + i, y: 25, colour: BLOOD_DARK })
    for (let i = 0; i < 4; i++) pixels.push({ x: 13 + i, y: 26, colour: BLOOD })
  }

  return pixels
}

/** Draw the portrait with its top-left at (x, y), each pixel `scale` square. */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  bucket: number,
  x: number,
  y: number,
  scale = 1,
): void {
  for (const pixel of facePixels(bucket)) {
    ctx.fillStyle = pixel.colour
    ctx.fillRect(x + pixel.x * scale, y + pixel.y * scale, scale, scale)
  }
}
