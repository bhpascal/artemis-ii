/**
 * Pre-computed Artemis II trajectory.
 *
 * Real NASA / JPL Horizons ephemeris data for Orion (ID -1024) transformed
 * into the 2D co-rotating frame where the Moon sits along the +x axis.
 * The ephemeris JSON is generated manually with `npx tsx scripts/fetch-ephemeris.ts`
 * and committed to the repo for build-time reproducibility.
 *
 * The first ~3.4 hours (pre-Horizons) use a synthetic HEO orbit since
 * Horizons doesn't publish data for the early orbit-raising phase.
 */

import {
  LAUNCH_EPOCH,
  MU_EARTH,
  D_MOON,
  HEO_APOGEE,
  HEO_PERIGEE,
  T_MOON,
  MISSION_DURATION_DAYS,
} from './constants'
import { orbitStateAtAnomaly, orbitalPeriod } from './orbits'
import { meanAnomalyToTrue } from './kepler'
import ephemerisData from '../data/orion-trajectory.json'

interface EphemerisPoint {
  t: number
  x: number
  y: number
  speed: number
  distEarth: number
  distMoon: number
  moonX: number
}

const EPHEMERIS: EphemerisPoint[] = ephemerisData.points

export interface TrajectoryPoint {
  /** Mission elapsed time (seconds from launch) */
  t: number
  /** Position in Earth-centered frame (m) */
  x: number
  y: number
  /** Velocity in Earth-centered frame (m/s) */
  vx: number
  vy: number
  /** Distance from Earth center (m) */
  distEarth: number
  /** Distance from Moon center (m) */
  distMoon: number
  /** Speed relative to Earth (m/s) */
  speed: number
  /** Mission phase */
  phase: MissionPhase
}

export type MissionPhase =
  | 'launch'
  | 'orbit-raising'
  | 'tli-coast'
  | 'outbound'
  | 'lunar-flyby'
  | 'return'
  | 'reentry'

export interface PhaseInfo {
  key: MissionPhase
  label: string
  color: string
  startTime: number // seconds from launch
  endTime: number
}

/** Mission phase definitions with timing (seconds from launch) */
export const MISSION_PHASES: PhaseInfo[] = [
  { key: 'launch', label: 'Launch & Orbit', color: '#E74C3C', startTime: 0, endTime: 3600 },
  { key: 'orbit-raising', label: 'Orbit Raising', color: '#E67E22', startTime: 3600, endTime: 24 * 3600 },
  { key: 'tli-coast', label: 'TLI & Coast', color: '#F39C12', startTime: 24 * 3600, endTime: 2 * 86400 },
  { key: 'outbound', label: 'Outbound Transit', color: '#2E86C1', startTime: 2 * 86400, endTime: 5 * 86400 },
  { key: 'lunar-flyby', label: 'Lunar Flyby', color: '#E74C3C', startTime: 5 * 86400, endTime: 6 * 86400 },
  { key: 'return', label: 'Return Transit', color: '#27AE60', startTime: 6 * 86400, endTime: 9.5 * 86400 },
  { key: 'reentry', label: 'Reentry & Splashdown', color: '#8E44AD', startTime: 9.5 * 86400, endTime: 10 * 86400 },
]

/** Key mission events (seconds from launch) */
export const MISSION_EVENTS = [
  { t: 0, label: 'Liftoff' },
  { t: 128, label: 'SRB Sep' },
  { t: 486, label: 'MECO' },
  { t: 2940, label: 'Perigee Raise' },
  { t: 6477, label: 'Apogee Raise' },
  { t: 12255, label: 'ICPS Sep' },
  { t: 25 * 3600 + 14 * 60, label: 'TLI Burn' },
  { t: 5 * 86400, label: 'Lunar SOI' },
  { t: 5.5 * 86400, label: 'Closest Approach' },
  { t: 6 * 86400, label: 'Max Distance' },
  { t: 9.5 * 86400, label: 'CM/SM Sep' },
  { t: 10 * 86400 - 1800, label: 'Entry Interface' },
  { t: 10 * 86400, label: 'Splashdown' },
]

/**
 * Assign a mission phase to a given elapsed time.
 * Used for both the synthetic HEO phase and the real ephemeris phase.
 */
function phaseAtTime(t: number, distMoon: number): MissionPhase {
  const tliTime = 25 * 3600 + 14 * 60 // ~25.2h, matches TLI_EPOCH
  if (t < 3600) return 'launch'
  if (t < tliTime) return 'orbit-raising'
  if (t < tliTime + 3600) return 'tli-coast'
  // Post-TLI: use Moon proximity to detect the flyby, time fraction for the rest
  if (distMoon < 70e6) return 'lunar-flyby' // ~Moon SOI
  if (t < 5 * 86400) return 'outbound'
  if (t > 9.5 * 86400) return 'reentry'
  return 'return'
}

/**
 * Interpolate the Moon's actual distance from Earth at a given mission time.
 * Used by the renderer to place the Moon sprite correctly in the co-rotating
 * frame (the distance varies ~3% over the mission due to lunar orbit eccentricity).
 */
export function getMoonDistanceAtTime(t: number): number {
  if (EPHEMERIS.length === 0) return D_MOON
  if (t <= EPHEMERIS[0]!.t) return EPHEMERIS[0]!.moonX
  if (t >= EPHEMERIS[EPHEMERIS.length - 1]!.t) return EPHEMERIS[EPHEMERIS.length - 1]!.moonX

  let lo = 0
  let hi = EPHEMERIS.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (EPHEMERIS[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = EPHEMERIS[lo]!
  const b = EPHEMERIS[hi]!
  const frac = (t - a.t) / (b.t - a.t)
  return a.moonX + (b.moonX - a.moonX) * frac
}

/**
 * Build the full Artemis II trajectory:
 *   0 to T+3.4h     — synthetic HEO orbit (Horizons has no data here)
 *   T+3.4h to end   — real JPL Horizons ephemeris
 */
export function computeArtemisTrajectory(
  sampleInterval: number = 600 // 10 minutes
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = []
  const firstEphemerisTime = EPHEMERIS[0]!.t

  // Phase 1: Pre-Horizons HEO approximation (0 to ~3.4 hours)
  const aHEO = (HEO_PERIGEE + HEO_APOGEE) / 2
  const eHEO = (HEO_APOGEE - HEO_PERIGEE) / (HEO_APOGEE + HEO_PERIGEE)
  const periodHEO = orbitalPeriod(MU_EARTH, aHEO)

  for (let t = 0; t < firstEphemerisTime; t += sampleInterval) {
    const fracOfOrbit = ((t % periodHEO) / periodHEO) * 2 * Math.PI
    const nu = meanAnomalyToTrue(fracOfOrbit, eHEO)
    const state = orbitStateAtAnomaly(aHEO, eHEO, MU_EARTH, nu)

    // Moon's approximate position during this early phase (uses mean motion)
    const moonAngle = (2 * Math.PI / T_MOON) * t
    const moonX = D_MOON * Math.cos(moonAngle)
    const moonY = D_MOON * Math.sin(moonAngle)

    const distEarth = Math.sqrt(state.x * state.x + state.y * state.y)
    const distMoon = Math.sqrt((state.x - moonX) ** 2 + (state.y - moonY) ** 2)
    const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy)

    points.push({
      t,
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      distEarth,
      distMoon,
      speed,
      phase: phaseAtTime(t, distMoon),
    })
  }

  // Phase 2: Real ephemeris data. Resample to sampleInterval via linear
  // interpolation so the scrubber gets a consistent time grid, and derive
  // velocity components from position deltas for the velocity arrow.
  const lastEphemerisTime = EPHEMERIS[EPHEMERIS.length - 1]!.t
  const totalTime = MISSION_DURATION_DAYS * 86400

  for (let t = firstEphemerisTime; t < Math.min(lastEphemerisTime, totalTime); t += sampleInterval) {
    // Binary search for bracketing ephemeris samples
    let lo = 0
    let hi = EPHEMERIS.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (EPHEMERIS[mid]!.t <= t) lo = mid
      else hi = mid
    }
    const a = EPHEMERIS[lo]!
    const b = EPHEMERIS[hi]!
    const frac = (b.t - a.t) > 0 ? (t - a.t) / (b.t - a.t) : 0

    const x = a.x + (b.x - a.x) * frac
    const y = a.y + (b.y - a.y) * frac
    const distEarth = a.distEarth + (b.distEarth - a.distEarth) * frac
    const distMoon = a.distMoon + (b.distMoon - a.distMoon) * frac
    const speed = a.speed + (b.speed - a.speed) * frac

    // Velocity components from position delta (co-rotating frame).
    // This is what the velocity arrow needs — it's not the inertial
    // velocity but the velocity AS SEEN in the co-rotating frame.
    const vx = (b.x - a.x) / (b.t - a.t || 1)
    const vy = (b.y - a.y) / (b.t - a.t || 1)

    points.push({
      t,
      x,
      y,
      vx,
      vy,
      distEarth,
      distMoon,
      speed,
      phase: phaseAtTime(t, distMoon),
    })
  }

  return points
}

/**
 * Interpolate the trajectory at an arbitrary mission elapsed time.
 */
export function interpolateTrajectory(
  trajectory: TrajectoryPoint[],
  t: number
): TrajectoryPoint | null {
  if (trajectory.length === 0) return null
  if (t <= trajectory[0]!.t) return trajectory[0]!
  if (t >= trajectory[trajectory.length - 1]!.t) return trajectory[trajectory.length - 1]!

  // Binary search for the bracketing interval
  let lo = 0
  let hi = trajectory.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (trajectory[mid]!.t <= t) lo = mid
    else hi = mid
  }

  const a = trajectory[lo]!
  const b = trajectory[hi]!
  const frac = (t - a.t) / (b.t - a.t)

  return {
    t,
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
    vx: a.vx + (b.vx - a.vx) * frac,
    vy: a.vy + (b.vy - a.vy) * frac,
    distEarth: a.distEarth + (b.distEarth - a.distEarth) * frac,
    distMoon: a.distMoon + (b.distMoon - a.distMoon) * frac,
    speed: a.speed + (b.speed - a.speed) * frac,
    phase: frac < 0.5 ? a.phase : b.phase,
  }
}

/** Get phase info for a mission elapsed time */
export function getMissionPhase(t: number): PhaseInfo {
  for (let i = MISSION_PHASES.length - 1; i >= 0; i--) {
    if (t >= MISSION_PHASES[i]!.startTime) return MISSION_PHASES[i]!
  }
  return MISSION_PHASES[0]!
}

/** Format mission elapsed time as days:hours:minutes */
export function formatMET(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `T+${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `T+${hours}h ${minutes}m`
  return `T+${minutes}m`
}

/** Format a timestamp as calendar date (EDT) */
export function formatCalendarDate(metSeconds: number): string {
  const date = new Date(LAUNCH_EPOCH + metSeconds * 1000)
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
