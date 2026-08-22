/**
 * Fixed-timestep update with a decoupled render.
 *
 * Gameplay must not depend on frame rate: with a variable dt, collision
 * resolution lets a fast-moving body tunnel through a wall on a slow frame,
 * and the seeded RNG stops being reproducible because the number of update
 * ticks varies per machine. Both are the kind of bug that only shows up on
 * someone else's hardware.
 *
 * The accumulator is clamped to MAX_FRAME. Without it, a tab backgrounded for
 * a minute returns a 60-second delta and the loop tries to run 3600 updates in
 * one frame -- freezing the page, which then produces an even larger delta.
 */

const STEP_MS = 1000 / 60
const MAX_FRAME_MS = 250

export interface LoopHandlers {
  /** Fixed 1/60s step. All gameplay goes here. */
  update(stepSeconds: number): void
  /** Called once per animation frame. `alpha` is 0..1 through the current step. */
  render(alpha: number): void
}

export class Loop {
  private raf = 0
  private last = 0
  private accumulator = 0
  private running = false

  constructor(private readonly handlers: LoopHandlers) {}

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.accumulator = 0
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private tick = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)

    this.accumulator += Math.min(now - this.last, MAX_FRAME_MS)
    this.last = now

    while (this.accumulator >= STEP_MS) {
      this.handlers.update(STEP_MS / 1000)
      this.accumulator -= STEP_MS
    }

    this.handlers.render(this.accumulator / STEP_MS)
  }
}

/**
 * How many fixed steps a frame of `elapsedMs` should run, and what remains in
 * the accumulator afterwards. Extracted so the clamp is testable -- the
 * backgrounded-tab case is the one that matters and it is miserable to
 * reproduce by hand.
 */
export function stepsFor(
  accumulatorMs: number,
  elapsedMs: number,
): { steps: number; remainderMs: number } {
  const total = accumulatorMs + Math.min(elapsedMs, MAX_FRAME_MS)
  const steps = Math.floor(total / STEP_MS)
  return { steps, remainderMs: total - steps * STEP_MS }
}

export { STEP_MS, MAX_FRAME_MS }
