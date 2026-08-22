/**
 * Keyboard + pointer-lock mouse look, behind a click-to-play gate.
 *
 * The gate is not decoration. Both requestPointerLock and AudioContext need a
 * user gesture, and a page that calls either on load gets a console warning
 * and silence -- so the same click that starts the game is what unlocks sound
 * later. Anything that needs a gesture hangs off `onEngage`.
 *
 * Key state is tracked by KeyboardEvent.code, not .key: code is the physical
 * key, so WASD keeps working on AZERTY and Dvorak instead of turning into
 * ZQSD.
 */

export type Action = 'forward' | 'back' | 'left' | 'right' | 'use' | 'fire' | 'run'

const BINDINGS: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyE: 'use',
  Space: 'use',
  ShiftLeft: 'run',
  ShiftRight: 'run',
}

export class Input {
  private readonly held = new Set<Action>()
  /** Mouse movement accumulated since the last consume(), in radians. */
  private yawDelta = 0
  private pitchDelta = 0
  private engaged = false

  /** Radians of look per pixel of mouse movement. */
  sensitivity = 0.0022

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onEngage?: () => void,
  ) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    // On window, not the canvas. The click-to-play overlay covers the canvas
    // with inset:0, so a canvas-bound listener never sees the very click that
    // is supposed to engage pointer lock.
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  get isEngaged() {
    return this.engaged
  }

  isDown(action: Action) {
    return this.held.has(action)
  }

  /** Returns look deltas accumulated since the last call, and resets them. */
  consumeLook(): { yaw: number; pitch: number } {
    const out = { yaw: this.yawDelta, pitch: this.pitchDelta }
    this.yawDelta = 0
    this.pitchDelta = 0
    return out
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code]
    if (!action) return
    // Space and the arrows scroll the page otherwise, which fights the canvas.
    e.preventDefault()
    this.held.add(action)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code]
    if (action) this.held.delete(action)
  }

  /**
   * Alt-tabbing away mid-strafe otherwise leaves that key stuck down: the
   * keyup fires on whatever window has focus, never on this one, and the
   * player returns to a character walking into a wall on their own.
   */
  private onBlur = () => {
    this.held.clear()
  }

  private onMouseDown = () => {
    if (!this.engaged) {
      void this.canvas.requestPointerLock()
      return
    }
    this.held.add('fire')
  }

  private onMouseUp = () => {
    this.held.delete('fire')
  }

  private onLockChange = () => {
    const nowEngaged = document.pointerLockElement === this.canvas
    if (nowEngaged && !this.engaged) this.onEngage?.()
    this.engaged = nowEngaged
    if (!nowEngaged) this.held.clear()
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.engaged) return
    this.yawDelta -= e.movementX * this.sensitivity
    this.pitchDelta -= e.movementY * this.sensitivity
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
  }
}

/**
 * Movement intent as a normalised vector in local space (x = strafe right,
 * z = forward). Pure so the diagonal case is a test: without normalising,
 * holding forward+strafe moves you 1.41x faster than forward alone, which is
 * the original Quake strafe-running bug and trivial to reintroduce.
 */
export function moveVector(held: (a: Action) => boolean): { x: number; z: number } {
  let x = (held('right') ? 1 : 0) - (held('left') ? 1 : 0)
  let z = (held('forward') ? 1 : 0) - (held('back') ? 1 : 0)
  const len = Math.hypot(x, z)
  if (len > 1) {
    x /= len
    z /= len
  }
  return { x, z }
}
