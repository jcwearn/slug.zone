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

  /** Weapon slots pressed since the last consume, in order. */
  private readonly slotQueue: number[] = []
  /** Net wheel notches since the last consume. */
  private wheelDelta = 0
  /** Set on the press edge of the use key, cleared when consumed. */
  private usePressed = false

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
    window.addEventListener('wheel', this.onWheel, { passive: true })
  }

  get isEngaged() {
    return this.engaged
  }

  isDown(action: Action) {
    return this.held.has(action)
  }

  /**
   * Drop the fire flag without waiting for mouseup.
   *
   * Semi-automatic weapons call this after a shot so holding the button does
   * not autofire. Without it, `isDown('fire')` stays true for as long as the
   * button is held and the only thing limiting the rate is the cooldown --
   * which turns every weapon into a full-auto one.
   */
  releaseFire(): void {
    this.held.delete('fire')
  }

  /** Returns look deltas accumulated since the last call, and resets them. */
  consumeLook(): { yaw: number; pitch: number } {
    const out = { yaw: this.yawDelta, pitch: this.pitchDelta }
    this.yawDelta = 0
    this.pitchDelta = 0
    return out
  }

  /** Weapon slot keys pressed since the last call, oldest first. */
  consumeSlots(): number[] {
    return this.slotQueue.splice(0, this.slotQueue.length)
  }

  /** Net weapon-cycle notches since the last call. */
  consumeWheel(): number {
    const out = this.wheelDelta
    this.wheelDelta = 0
    return out
  }

  /**
   * True once per physical press of the use key.
   *
   * An edge rather than `isDown('use')`, because the OS repeats keydown while
   * a key is held: a level-triggered use would fire sixty times a second at a
   * door, and once secrets are counted that is sixty attempts on the same one.
   */
  consumeUse(): boolean {
    const out = this.usePressed
    this.usePressed = false
    return out
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.engaged) return
    this.wheelDelta += e.deltaY > 0 ? 1 : -1
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Digit1..Digit9 select a weapon slot. Queued rather than held, because a
    // tap between two frames must not be lost.
    const digit = /^Digit([1-9])$/.exec(e.code)
    if (digit) {
      e.preventDefault()
      this.slotQueue.push(Number(digit[1]))
      return
    }

    const action = BINDINGS[e.code]
    if (!action) return
    // Space and the arrows scroll the page otherwise, which fights the canvas.
    e.preventDefault()
    // Latched before the add, so `held` still lacks the action on a genuine
    // first press and already has it on every auto-repeat.
    if (action === 'use' && !this.held.has(action)) this.usePressed = true
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
    this.slotQueue.length = 0
    this.wheelDelta = 0
    this.usePressed = false
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
    if (!nowEngaged) {
      this.held.clear()
      this.usePressed = false
    }
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
    window.removeEventListener('wheel', this.onWheel)
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
