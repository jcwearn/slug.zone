import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// `root: 'src'` rather than the repo root, so the two entries sit next to the
// code they load and `public/` stays a sibling of src rather than nesting
// inside it.
//
// outDir is ../dist because that is what cloudflare-infra's pages.tf declares
// as destination_dir and what wrangler.jsonc points at. Changing it means
// changing both.
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      // Two separate entries, deliberately. The landing page is six words and
      // must never pull in three.js -- one shared chunk would put ~600 KB of
      // WebGL behind a page that draws a border and an image.
      input: { main: r('./src/index.html'), game: r('./src/game/index.html') },
    },
  },
})
