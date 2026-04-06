/**
 * Pre-computed Artemis II trajectory.
 *
 * Uses the patched-conic solver with actual mission parameters to produce
 * a time-stamped trajectory, then provides interpolation for smooth
 * scrubbing across the 10-day mission.
 */

import {
  LAUNCH_EPOCH,
  TLI_EPOCH,
  MU_EARTH,
  D_MOON,
  HEO_APOGEE,
  HEO_PERIGEE,
  T_MOON,
  MISSION_DURATION_DAYS,
} from './constants'
import { orbitStateAtAnomaly, orbitalPeriod } from './orbits'
import { meanAnomalyToTrue } from './kepler'
import { propagate } from './cr3bp'

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

function getMoonPosition(t: number): { x: number; y: number } {
  const moonAngularVelocity = 2 * Math.PI / T_MOON
  // Moon's angle at launch (arbitrary reference — we'll align with the trajectory)
  const moonAngle = moonAngularVelocity * t
  return {
    x: D_MOON * Math.cos(moonAngle),
    y: D_MOON * Math.sin(moonAngle),
  }
}

/**
 * Compute the full Artemis II trajectory, sampled every `sampleInterval` seconds.
 * This runs once at page load (~50ms).
 */
export function computeArtemisTrajectory(
  sampleInterval: number = 600 // 10 minutes
): TrajectoryPoint[] {
  const totalTime = MISSION_DURATION_DAYS * 86400
  const points: TrajectoryPoint[] = []

  // Use the CR3BP integrator for the free-return trajectory
  // Points are time-ordered in the co-rotating frame
  const cr3bpResult = propagate(3143, 36, 80000)

  // Time boundaries (seconds from launch)
  const tliTime = (TLI_EPOCH - LAUNCH_EPOCH) / 1000 // ~25.2 hours

  // Phase 1: Launch through orbit raising (0 to TLI)
  // Simplified: spacecraft is in an elliptical orbit around Earth
  // After apogee raise: HEO orbit (2,414 km × 74,030 km altitude)
  const aHEO = (HEO_PERIGEE + HEO_APOGEE) / 2
  const eHEO = (HEO_APOGEE - HEO_PERIGEE) / (HEO_APOGEE + HEO_PERIGEE)
  const periodHEO = orbitalPeriod(MU_EARTH, aHEO)

  for (let t = 0; t < tliTime; t += sampleInterval) {
    // During orbit raising, model as a single HEO orbit for simplicity
    // (the actual sequence of burns is more complex)
    const fracOfOrbit = ((t % periodHEO) / periodHEO) * 2 * Math.PI
    const nu = meanAnomalyToTrue(fracOfOrbit, eHEO)
    const state = orbitStateAtAnomaly(aHEO, eHEO, MU_EARTH, nu)

    const distEarth = Math.sqrt(state.x * state.x + state.y * state.y)
    const moonPos = getMoonPosition(t)
    const distMoon = Math.sqrt(
      (state.x - moonPos.x) ** 2 + (state.y - moonPos.y) ** 2
    )
    const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy)

    const phase: MissionPhase = t < 3600 ? 'launch' : t < tliTime - 3600 ? 'orbit-raising' : 'tli-coast'

    points.push({
      t, x: state.x, y: state.y,
      vx: state.vx, vy: state.vy,
      distEarth, distMoon, speed, phase,
    })
  }

  // Phase 2: Post-TLI — use CR3BP trajectory points (already time-ordered)
  if (cr3bpResult.success && cr3bpResult.points.length > 0) {
    // CR3BP integration covers 4π normalized time ≈ 54.6 days with 80000 steps
    // Post-TLI mission phase is ~7.5 days. Map CR3BP time to mission time.
    const cr3bpTotalTime = (4 * Math.PI * T_MOON) / (2 * Math.PI) // physical seconds
    const postTliDuration = totalTime - tliTime
    const cr3bpPts = cr3bpResult.points

    // Moon position in co-rotating frame (fixed at +x)
    const moonXCorot = D_MOON

    for (let t = tliTime; t < totalTime; t += sampleInterval) {
      const missionFrac = (t - tliTime) / postTliDuration
      // Map to CR3BP index — use fraction of the post-TLI mission duration
      // Scale so 7.5 days maps to the relevant portion of the CR3BP integration
      const cr3bpFrac = missionFrac * (postTliDuration / cr3bpTotalTime)
      if (cr3bpFrac >= 1) break
      const idx = Math.min(Math.floor(cr3bpFrac * cr3bpPts.length), cr3bpPts.length - 1)
      const pt = cr3bpPts[idx]
      if (!pt) continue

      // Velocity from adjacent points
      const nextIdx = Math.min(idx + 1, cr3bpPts.length - 1)
      const nextPt = cr3bpPts[nextIdx]!
      const cr3bpDt = cr3bpTotalTime / cr3bpPts.length
      const vx = nextIdx > idx ? (nextPt.x - pt.x) / cr3bpDt : 0
      const vy = nextIdx > idx ? (nextPt.y - pt.y) / cr3bpDt : 0

      const distEarth = Math.sqrt(pt.x ** 2 + pt.y ** 2)
      const distMoon = Math.sqrt((pt.x - moonXCorot) ** 2 + pt.y ** 2)
      const speed = Math.sqrt(vx ** 2 + vy ** 2)

      // Determine phase from distances
      let phase: MissionPhase
      if (distMoon < 1e8) phase = 'lunar-flyby'
      else if (missionFrac < 0.4) phase = 'outbound'
      else if (missionFrac > 0.9) phase = 'reentry'
      else phase = 'return'

      points.push({
        t, x: pt.x, y: pt.y, vx, vy,
        distEarth, distMoon, speed, phase,
      })
    }
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
