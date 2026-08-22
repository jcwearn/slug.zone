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
  '          1121121121            ',
  '       1121121121121121         ',
  '      112112332112112112        ',
  '     12112332112332112112       ',
  '    1121123321123321121121      ',
  '    1123321123321123321121      ',
  '    112hhhhhhhhhhhhhhhh2112     ',
  '    11hhhhhhhhhhhhhhhhhh211     ',
  '    11hhhhhhhhhhhhhhhhhh211     ',
  '    11hBBBBhhhhhhBBBBhh211      ',
  '    11BBBBBBhhhhBBBBBBh211      ',
  '    11hFFFFFhhhhFFFFFhh211      ',
  '    1FFGGGGGFFFFGGGGGFF211      ',
  '    1FGGWpGGFFFFGGWpGGF211      ',
  '    1FGGWWGGhhhhGGWWGGF211      ',
  '    11FFFFFhhssshhFFFFF211      ',
  '    11hhhhhhhsssshhhhhh211      ',
  '    11hhhhhhhsssshhhhhh211      ',
  '     1hhhhhhhdsssdhhhhhh21      ',
  '     1hhhhhhddsssddhhhhh21      ',
  '     1hhhhMMMMhhMMMMhhhh21      ',
  '     1hhMMMMMMMMMMMMMMhh21      ',
  '     1hhMMMMMMMMMMMMMMhh21      ',
  '     1uhhhKKKKKKKKKKhhhu21      ',
  '     1uhhhhTTTTTTTThhhhu21      ',
  '      uhhhhhhhhhhhhhhhhu2       ',
  '      uuhhhhhhhhhhhhhhuu2       ',
  '       uuhhhhhhhhhhhhuu         ',
  '        uuuhhhhhhhhuuu          ',
  '          usssssssssu           ',
  '         ssssssssssss           ',
  '       CCCCCCCCCCCCCCCC         ',
]

const PALETTE: Record<string, string> = {
  '1': '#3d2116',
  '2': '#5c3421',
  '3': '#7d4a2c',
  B: '#301a10',
  F: '#8a7a54',
  G: '#b9b2a6',
  W: '#f0e9dc',
  p: '#1b1009',
  M: '#4a2a18',
  K: '#42180f',
  T: '#a85f47',
  C: '#3f7fb5',
}

/**
 * Skin and beard ramps per damage bucket, healthy through dead.
 *
 * The whole ramp shifts together rather than one tone. Moving a single value
 * leaves the face patchy -- a drained cheek beside an undrained jaw -- which
 * reads as a rendering fault rather than as injury.
 */
const RAMPS: Record<string, string[]> = {
  d: ['#8a4a2c', '#834327', '#7a3c23', '#6d341e', '#5c2b19', '#4a4038'],
  s: ['#a85e38', '#a15733', '#964e2d', '#874428', '#733921', '#5d5148'],
  m: ['#c47a4c', '#bc7044', '#b0653c', '#a05834', '#8a4a2c', '#6f625a'],
  h: ['#dda06a', '#d5945e', '#c98654', '#b8754a', '#9e613c', '#847870'],
  u: ['#8a5c3e', '#835538', '#7a4d32', '#6d442c', '#5c3824', '#4e463e'],
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
