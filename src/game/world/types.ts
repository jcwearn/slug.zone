/** What a single legend character means. Exactly one field should be set. */
export interface CellSpec {
  /** Solid wall with this texture key. */
  wall?: string
  /** Open, walkable floor. */
  floor?: true
  /** Looks like a wall, opens when used. `key` gates it on a keycard. */
  door?: { key: string | null }
  /** Looks like a wall; counts toward the level's secret total when opened. */
  secretWall?: string
  /** Walkable, and touching it ends the level. */
  exit?: true
  /** Nothing -- outside the map. Solid, never drawn. */
  void?: true
}

export interface EntitySpec {
  type: string
  x: number
  z: number
  /** Radians. Only meaningful for the player start. */
  angle?: number
  /** For `type: 'pickup'`. */
  item?: string
}

export interface LevelSource {
  id: string
  name: string
  music: string
  /** World units per grid cell. */
  cellSize: number
  wallHeight: number
  floorTex: string
  ceilingTex: string
  /** THREE.Fog density hint; higher is thicker. */
  fog: number
  legend: Record<string, CellSpec>
  /** Rows of legend characters. Row 0 is z = 0. */
  grid: string[]
  entities: EntitySpec[]
  /** Par time in milliseconds. */
  par: number
}
