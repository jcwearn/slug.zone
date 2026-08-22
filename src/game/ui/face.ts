/**
 * The HUD portrait: a 32x32 pixel-art face, hand-drawn as a character grid.
 *
 * Stored the way levels are, as rows of legend characters, because that is the
 * only representation anyone can edit afterwards. A face assembled from
 * fillRect calls is write-once -- nobody moves an eyebrow by adjusting rect
 * coordinates -- whereas this can be nudged a pixel at a time by eye.
 *
 * What makes a Doom or Duke-era portrait read as a specific person is SHADING,
 * not resolution. The first version of this had one skin tone and one hair
 * tone and looked like a generic person at any size. This one sculpts with
 * four skin values plus a deep shadow, three hair values, and a separate
 * stubble tone, so the brow ridge, cheekbones, nose and jaw all have form.
 *
 * The likeness is drawn from a reference photo's features: heavy swept-back
 * dark hair greying at one temple, thick asymmetric brows, a full moustache
 * over a stubbled jaw, blue shirt. No image data is embedded here or anywhere
 * else in this repository -- the grid below is characters.
 */

export const FACE_WIDTH = 32
export const FACE_HEIGHT = 32

/**
 * Legend:
 *   ' ' transparent   O outline
 *   1 hair dark       2 hair mid      3 hair highlight   g grey streak
 *   B brow            b brow edge
 *   d skin deep shadow  s skin shadow   m skin mid   h skin light
 *   W eye white       p pupil
 *   M moustache       u stubble        U stubble heavy
 *   T teeth           K mouth dark
 *   C shirt           L shirt highlight
 */
const BASE: string[] = [
  '                                ',
  '                                ',
  '            OOOOOOO             ',
  '         OOO1111111OOO          ',
  '       OO111112222211OO         ',
  '      O11111222223322g1O        ',
  '     O1111222233333222g1O       ',
  '     O111222233333322gg1O       ',
  '    O11122OOOOOOOOOO22gg1O      ',
  '    O112OhhhhhhhhhhhhO2g1O      ',
  '    O11OhhhhhmmmmhhhhhO211O     ',
  '    O1OhhBBBBhhhhhhhhhhO11O     ',
  '    O1ObBBBBBhhhhBBBBbhO11O     ',
  '    O1OhmmmmmhhhhhBBBBBhO1O     ',
  '    OuOhWWpmhhssshhWWpmhO1O     ',
  '    OuOhWWWmhhsssshWWWmhO1O     ',
  '    OuOhmmmmhhssshhmmmmhO1O     ',
  '    OuOhhhhhhhsssshhhhhhOuO     ',
  '    OuuOhhhhhhsssshhhhhhOuO     ',
  '     OuOhhhhhdsssdhhhhhhOuO     ',
  '     OuOhhhhOdddddOhhhhhOuO     ',
  '     OuuOhhOMMMMMMMOhhhOuuO     ',
  '      OuOhMMMMMMMMMMMhOuuO      ',
  '      OuuOMMMMMMMMMMMOuuO       ',
  '      OuuOTTTTTTTTTTTOuuO       ',
  '       OuOKKKKKKKKKKKOuO        ',
  '       OuuUuuuuuuuuuuUuO        ',
  '        OuuUUUUUUUUUuuO         ',
  '         OOuuuUUUUuuOO          ',
  '           OOOssssOO            ',
  '        OCCCCCCCCCCCCCO         ',
  '      OCCCCLLCCCCCCLLCCCO       ',
]

const PALETTE: Record<string, string> = {
  O: '#1a1008',
  '1': '#2b1d12',
  '2': '#412c1b',
  '3': '#5a3d26',
  g: '#8b8078',
  B: '#241609',
  b: '#33200e',
  d: '#7a4526',
  s: '#9c5c34',
  m: '#b87446',
  h: '#d1905c',
  W: '#f2ece0',
  p: '#160d06',
  M: '#2a1a0e',
  u: '#7d5334',
  U: '#5f3d26',
  T: '#e6dcc4',
  K: '#38160f',
  C: '#3f7fb5',
  L: '#5c9ed4',
}

/**
 * Skin ramps per damage bucket, darkest to lightest.
 *
 * The whole ramp shifts rather than one tone, so the face drains as a unit
 * instead of developing patches. Bucket 5 is grey -- the blood has gone.
 */
const RAMPS: Record<string, string[]> = {
  d: ['#7a4526', '#744021', '#6d3a1e', '#63321a', '#552a17', '#43392f'],
  s: ['#9c5c34', '#96552f', '#8d4d2a', '#7f4324', '#6d381f', '#584c41'],
  m: ['#b87446', '#b06a3e', '#a55f36', '#96522e', '#814527', '#6b5e52'],
  h: ['#d1905c', '#c98551', '#bd7847', '#ac683d', '#945634', '#7e7064'],
  u: ['#7d5334', '#764c2f', '#6d442a', '#613a24', '#52301e', '#464038'],
  U: ['#5f3d26', '#593722', '#52311e', '#492a1a', '#3d2215', '#39342d'],
}

export interface FacePixel {
  x: number
  y: number
  colour: string
}

const BLOOD = '#a81e12'
const BLOOD_DARK = '#7d1409'

/**
 * Pixels for one damage bucket, 0 (unhurt) through 5 (dead).
 *
 * Returned as data rather than drawn, so the whole portrait can be asserted in
 * a test -- bounds, palette coverage, that each bucket is distinguishable,
 * that the eyes close on death -- with no canvas involved.
 */
export function facePixels(bucket: number): FacePixel[] {
  const clamped = Math.max(0, Math.min(5, Math.floor(bucket)))
  const dead = clamped >= 5
  const hurt = clamped >= 3
  const pixels: FacePixel[] = []

  for (let y = 0; y < FACE_HEIGHT; y++) {
    const row = BASE[y]
    for (let x = 0; x < FACE_WIDTH; x++) {
      const ch = row[x]
      if (ch === ' ') continue

      // Eyes shut when dead. Drawn as a lid in the skin tone rather than
      // simply omitted, or the sockets become holes in the head.
      if (dead && (ch === 'W' || ch === 'p')) {
        pixels.push({ x, y, colour: RAMPS.s[clamped] })
        continue
      }

      // Squinting: the whites narrow to a slit on the lower row.
      if (hurt && !dead && ch === 'W' && y === 15) {
        pixels.push({ x, y, colour: RAMPS.m[clamped] })
        continue
      }

      const ramp = RAMPS[ch]
      pixels.push({ x, y, colour: ramp ? ramp[clamped] : PALETTE[ch] })
    }
  }

  if (dead) {
    // A closed lid line across each eye.
    for (const ex of [8, 19]) {
      for (let i = 0; i < 5; i++) pixels.push({ x: ex + i, y: 15, colour: PALETTE.B })
    }
  }

  // Blood, from bucket 2, spreading further down the face each step.
  if (clamped >= 2) {
    for (let i = 0; i < 3 + clamped * 2; i++) {
      pixels.push({ x: 9, y: 9 + i, colour: i > 3 ? BLOOD_DARK : BLOOD })
    }
  }
  if (clamped >= 3) {
    for (let i = 0; i < clamped * 2; i++) {
      pixels.push({ x: 22, y: 11 + i, colour: i > 2 ? BLOOD_DARK : BLOOD })
    }
    pixels.push({ x: 23, y: 11, colour: BLOOD })
  }
  if (clamped >= 4) {
    for (let i = 0; i < 6; i++) pixels.push({ x: 12 + i, y: 26, colour: BLOOD_DARK })
    for (let i = 0; i < 4; i++) pixels.push({ x: 14 + i, y: 27, colour: BLOOD })
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
