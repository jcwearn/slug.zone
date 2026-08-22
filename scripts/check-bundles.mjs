// Post-build guard on the one thing the two-entry Vite setup exists to protect:
// the landing page must never pull in three.js.
//
// This is not hypothetical. A single shared import -- a palette constant, a
// type, a helper that happens to live beside engine code -- is enough for
// Rollup to hoist a common chunk, and the landing page would start pulling
// ~525 kB of WebGL to draw a border and an image. Nothing about the page would
// look different, so nobody would notice.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const LIMIT_BYTES = 16 * 1024

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const failures = []

// 1. The landing page references no JavaScript at all.
const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
if (scripts.length > 0) {
  failures.push(`landing page references ${scripts.length} script(s): ${scripts.join(', ')}`)
}

// 2. Nothing it does reference is anywhere near three.js sized.
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
for (const asset of assets) {
  const bytes = readFileSync(join(DIST, asset)).byteLength
  if (bytes > LIMIT_BYTES) {
    failures.push(`landing asset ${asset} is ${bytes} bytes, over the ${LIMIT_BYTES} limit`)
  }
}

// 3. Both entries actually emitted. A broken rollupOptions.input silently
//    drops one rather than failing the build.
for (const required of ['index.html', join('game', 'index.html'), 'slug.png', 'favicon.ico']) {
  try {
    readFileSync(join(DIST, required))
  } catch {
    failures.push(`missing from the build output: ${required}`)
  }
}

// 4. three.js did land in the game bundle -- proving check 2 means something
//    rather than passing because the build produced nothing.
const gameAssets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
const totalGameJs = gameAssets.reduce(
  (n, f) => n + readFileSync(join(DIST, 'assets', f)).byteLength,
  0,
)
if (totalGameJs < 100 * 1024) {
  failures.push(
    `expected the game bundle to contain three.js but total JS is only ${totalGameJs} bytes ` +
      `-- check 2 may be passing vacuously`,
  )
}

if (failures.length > 0) {
  console.error('bundle check failed:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `bundle check ok: landing page ships 0 JS, game JS is ${(totalGameJs / 1024).toFixed(0)} kB`,
)
