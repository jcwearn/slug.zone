/**
 * The HUD portrait: a 24x26 pixel-art face, hand-drawn as a character grid.
 *
 * Stored the same way levels are, as rows of legend characters, for the same
 * reason: it is the only representation you can actually edit afterwards. A
 * face built from fillRect calls is write-once -- nobody moves an eyebrow in
 * it -- whereas this can be nudged a pixel at a time by eye.
 *
 * Likeness is hand-drawn from a photo's features: heavy swept-back dark hair
 * greying at one temple, very thick brows, a full moustache over a stubbled
 * jaw, and a blue shirt. No image data is embedded here or anywhere in the
 * repo.
 */

export const FACE_WIDTH = 24
export const FACE_HEIGHT = 26

/**
 * Legend:
 *   ' ' transparent   K hair        k hair grey    B brow
 *   S skin            s skin shade  H skin light   N nose shade
 *   E eye white       P pupil       M moustache    b stubble
 *   T teeth           m mouth dark  C shirt        c shirt shade
 */
const BASE: string[] = [
  '        KK   KK         ',
  '      KKKKK KKKKk       ',
  '    KKKKKKKKKKKKKk      ',
  '   KKKKKKKKKKKKKKKk     ',
  '  KKKKKKKKKKKKKKKKKk    ',
  '  KKKKKKKKKKKKKKKKKKk   ',
  '  KKKSSSSSSSSSSSSKKKk   ',
  '  KKSSSSSSSSSSSSSSKKk   ',
  '  KSBBBBSSSSSSSSSSSKk   ',
  '  KSBBBBBSSSSBBBBBSKk   ',
  '  KSSSSSSSSSBBBBBSSKk   ',
  '  bSSEEPSSSSSSEEPSSbk   ',
  '  bSSEEESSNNSSEEESSbk   ',
  '  bSSSSSSSNNSSSSSSSbk   ',
  '  bSSSSSSNNNNSSSSSSbk   ',
  '  bSSSSSsNNNNsSSSSSbk   ',
  '  bSSSSSSNNNNSSSSSSbk   ',
  '  bSSMMMMMMMMMMMMSSbk   ',
  '  bSMMMMMMMMMMMMMMSbk   ',
  '  bbSSTTTTTTTTTTSSbbk   ',
  '  bbSmmmmmmmmmmmmSbbk   ',
  '   bbbSSSSSSSSSSbbbb    ',
  '    bbbbSSSSSSbbbbb     ',
  '     bbbbbbbbbbbb       ',
  '       CCCCCCCC         ',
  '    CCCCCCCCCCCCCC      ',
]

const PALETTE: Record<string, string> = {
  K: '#2e2016',
  k: '#7d7268',
  B: '#211610',
  S: '#c98d63',
  s: '#a97049',
  H: '#e0a87c',
  N: '#a2683f',
  E: '#efe7d8',
  P: '#1a1109',
  M: '#2a1c12',
  b: '#6a4a34',
  T: '#e8e0cc',
  m: '#3a1a12',
  C: '#3f7fb5',
  c: '#2e6390',
}

/** Skin tones per damage bucket: healthy through drained and grey. */
const SKIN_BY_BUCKET = ['#c98d63', '#c68256', '#bd744a', '#ac6440', '#95553a', '#6d5c52']
const SHADE_BY_BUCKET = ['#a97049', '#a2673f', '#985c36', '#8a4f2e', '#733f27', '#544942']

export interface FacePixel {
  x: number
  y: number
  colour: string
}

/**
 * Pixels for one damage bucket, 0 (unhurt) through 5 (dead).
 *
 * Returned as data rather than drawn directly so the whole thing can be
 * asserted in a test -- pixel counts, palette coverage, that the eyes change
 * on death -- without needing a canvas.
 */
export function facePixels(bucket: number): FacePixel[] {
  const clamped = Math.max(0, Math.min(5, Math.floor(bucket)))
  const dead = clamped >= 5
  const pixels: FacePixel[] = []

  const skin = SKIN_BY_BUCKET[clamped]
  const shade = SHADE_BY_BUCKET[clamped]

  for (let y = 0; y < FACE_HEIGHT; y++) {
    const row = BASE[y]
    for (let x = 0; x < FACE_WIDTH; x++) {
      const ch = row[x]
      if (ch === ' ') continue

      let colour = PALETTE[ch]
      if (ch === 'S') colour = skin
      else if (ch === 's') colour = shade
      else if (ch === 'N') colour = shade

      // Eyes: squint from bucket 3, cross out when dead.
      if ((ch === 'E' || ch === 'P') && dead) continue
      if (ch === 'E' && clamped >= 3) colour = skin
      if (ch === 'P' && clamped >= 3) colour = PALETTE.P

      // Mouth: the smirk opens into a grimace as it gets worse, and hangs
      // slack when dead.
      if (ch === 'T' && clamped >= 4 && !dead) colour = PALETTE.m
      if (ch === 'T' && dead) colour = PALETTE.m

      pixels.push({ x, y, colour })
    }
  }

  if (dead) {
    // Crossed-out eyes, drawn over where the eyes were.
    for (const cx of [5, 14]) {
      for (let i = 0; i < 3; i++) {
        pixels.push({ x: cx + i, y: 11 + i, colour: PALETTE.P })
        pixels.push({ x: cx + 2 - i, y: 11 + i, colour: PALETTE.P })
      }
    }
  }

  // Blood, appearing from bucket 2 and spreading down the face.
  if (clamped >= 2 && !dead) {
    for (let i = 0; i < clamped + 1; i++) {
      pixels.push({ x: 4, y: 8 + i, colour: '#a51f14' })
    }
  }
  if (clamped >= 3) {
    for (let i = 0; i < clamped; i++) {
      pixels.push({ x: 19, y: 10 + i, colour: '#a51f14' })
    }
  }
  if (clamped >= 4) {
    for (let i = 0; i < 4; i++) {
      pixels.push({ x: 8 + i, y: 21, colour: '#8e1a11' })
    }
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
