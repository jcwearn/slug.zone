import { formatTime, percent, type Session } from '../session.ts'

/**
 * The count-up on the intermission screen.
 *
 * Pure, and separate from the canvas that draws it, because what makes a Doom
 * tally feel like one is entirely in the timing: rows fill one at a time, the
 * numbers climb rather than appear, and every step of the climb clicks.
 */

export interface TallyRow {
  label: string
  /** What is shown right now. */
  value: number
  target: number
  /** Rendered as `${value}%`. Times are drawn from the block below instead. */
  suffix: string
}

export interface Tally {
  rows: TallyRow[]
  /** Which row is currently climbing. */
  active: number
  done: boolean
  /** Seconds since the last row landed, so fire cannot skip the whole screen
   *  on the same click that finished the level. */
  hold: number
  time: string
  par: string
  /** Empty until the level has been finished once. */
  best: string
  /** True when this run set a new best. */
  record: boolean
}

/** Percentage points per second. Fast enough not to be a wait. */
const CLIMB = 55

export function createTally(session: Session, best: number | null, record: boolean): Tally {
  return {
    rows: [
      { label: 'KILLS', value: 0, target: percent(session.kills, session.killsTotal), suffix: '%' },
      { label: 'ITEMS', value: 0, target: percent(session.items, session.itemsTotal), suffix: '%' },
      {
        label: 'SECRETS',
        value: 0,
        target: percent(session.secrets, session.secretsTotal),
        suffix: '%',
      },
    ],
    active: 0,
    done: false,
    hold: 0,
    time: formatTime(session.elapsed),
    par: formatTime(session.par),
    best: best === null ? '' : formatTime(best),
    record,
  }
}

export interface TallyStep {
  /** True on the frames the displayed integer actually changed. */
  ticked: boolean
  /** True on the frame the last row lands. */
  finished: boolean
}

/**
 * Advance one row at a time.
 *
 * `ticked` is what drives the click, and it has to be per-changed-digit rather
 * than per-frame: a click every frame at 60fps is not a tally, it is a buzz.
 */
export function stepTally(tally: Tally, dt: number): TallyStep {
  if (tally.done) {
    tally.hold += dt
    return { ticked: false, finished: false }
  }

  const row = tally.rows[tally.active]
  const before = row.value
  row.value += CLIMB * dt

  if (row.value >= row.target) {
    // The clamp lives here rather than in a Math.min above -- one place that
    // pins the value to its target, not two that have to agree.
    row.value = row.target
    tally.active++
    if (tally.active >= tally.rows.length) {
      tally.done = true
      tally.hold = 0
      return { ticked: true, finished: true }
    }
  }

  return { ticked: Math.floor(row.value) !== Math.floor(before), finished: false }
}

/** Skip to the end. Doom lets the first press do this, and so does this. */
export function snapTally(tally: Tally): void {
  for (const row of tally.rows) row.value = row.target
  tally.active = tally.rows.length
  tally.done = true
  tally.hold = 0
}
