// Placeholder. The renderer, loop, and input modules land in the game-shell
// phase; this exists so the /game/ route is a real Vite entry from the first
// deploy rather than a 404 the landing page links into.
const canvas = document.querySelector<HTMLCanvasElement>('#viewport')

if (canvas) {
  const ctx = canvas.getContext('2d')
  canvas.width = 320
  canvas.height = 200
  if (ctx) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 320, 200)
    ctx.fillStyle = '#54e508'
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SALT SHAKER', 160, 96)
    ctx.fillText('LOADING...', 160, 112)
  }
}
