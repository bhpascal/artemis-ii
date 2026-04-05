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
  R_LEO,
  R_EARTH,
  MU_EARTH,
  D_MOON,
  FLYBY_ALTITUDE,
  HEO_APOGEE,
  HEO_PERIGEE,
  T_MOON,
  MISSION_DURATION_DAYS,
} from './constants'
import { circularVelocity, orbitStateAtAnomaly, orbitalPeriod } from './orbits'
import { meanAnomalyToTrue } from './kepler'
import { computeFreeReturn } from './patched-conics'

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

  // Use the patched-conic solver to get the free-return trajectory
  const vCircLEO = circularVelocity(MU_EARTH, R_LEO)
  const injectionDv = 3170 // m/s from LEO — tuned for valid free-return
  const injectionV = vCircLEO + injectionDv

  const freeReturn = computeFreeReturn(injectionV, FLYBY_ALTITUDE)

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

  // Phase 2: Post-TLI — use the free-return trajectory
  if (freeReturn) {
    // Map the free-return trajectory points to mission time
    // The free-return solver gives us spatial points but not time-stamped.
    // We'll distribute the departure leg over the outbound transit time,
    // the flyby over ~1 day, and the return over the remaining time.
    const outboundDuration = 3 * 86400 // ~3 days outbound
    const flybyDuration = 1 * 86400 // ~1 day around Moon
    const returnDuration = 3.5 * 86400 // ~3.5 days return

    const depPts = freeReturn.departurePts
    const flyPts = freeReturn.flybyPts
    const retPts = freeReturn.returnPts

    // Departure (TLI to SOI entry)
    for (let t = tliTime; t < tliTime + outboundDuration; t += sampleInterval) {
      const frac = (t - tliTime) / outboundDuration
      const idx = Math.min(Math.floor(frac * depPts.length), depPts.length - 1)
      const pt = depPts[idx]
      if (!pt) continue

      // Estimate velocity from adjacent points
      const nextIdx = Math.min(idx + 1, depPts.length - 1)
      const nextPt = depPts[nextIdx]!
      const dt = sampleInterval
      const vx = nextIdx > idx ? (nextPt.x - pt.x) / dt * (depPts.length / outboundDuration * sampleInterval) : 0
      const vy = nextIdx > idx ? (nextPt.y - pt.y) / dt * (depPts.length / outboundDuration * sampleInterval) : 0

      const distEarth = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
      const moonPos = getMoonPosition(t)
      const distMoon = Math.sqrt((pt.x - moonPos.x) ** 2 + (pt.y - moonPos.y) ** 2)
      const speed = Math.sqrt(vx * vx + vy * vy) || distEarth * 0.00001 // fallback

      points.push({
        t, x: pt.x, y: pt.y, vx, vy,
        distEarth, distMoon, speed,
        phase: 'outbound',
      })
    }

    // Flyby
    const flybyStart = tliTime + outboundDuration
    for (let t = flybyStart; t < flybyStart + flybyDuration; t += sampleInterval) {
      const frac = (t - flybyStart) / flybyDuration
      const idx = Math.min(Math.floor(frac * flyPts.length), flyPts.length - 1)
      const pt = flyPts[idx]
      if (!pt) continue

      const distEarth = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
      const moonPos = getMoonPosition(t)
      const distMoon = Math.sqrt((pt.x - moonPos.x) ** 2 + (pt.y - moonPos.y) ** 2)

      points.push({
        t, x: pt.x, y: pt.y, vx: 0, vy: 0,
        distEarth, distMoon, speed: 1000, // approximate
        phase: 'lunar-flyby',
      })
    }

    // Return
    const returnStart = flybyStart + flybyDuration
    for (let t = returnStart; t < totalTime; t += sampleInterval) {
      const frac = (t - returnStart) / returnDuration
      if (frac > 1) {
        // Reentry phase — close to Earth
        points.push({
          t, x: R_EARTH * 1.01, y: 0, vx: 0, vy: -11000,
          distEarth: R_EARTH * 1.01, distMoon: D_MOON,
          speed: 11000, phase: 'reentry',
        })
        continue
      }
      const idx = Math.min(Math.floor(frac * retPts.length), retPts.length - 1)
      const pt = retPts[idx]
      if (!pt) continue

      const distEarth = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
      const moonPos = getMoonPosition(t)
      const distMoon = Math.sqrt((pt.x - moonPos.x) ** 2 + (pt.y - moonPos.y) ** 2)

      points.push({
        t, x: pt.x, y: pt.y, vx: 0, vy: 0,
        distEarth, distMoon,
        speed: Math.sqrt(MU_EARTH * (2 / distEarth - 1 / (distEarth * 0.6))), // vis-viva estimate
        phase: t > totalTime - 0.5 * 86400 ? 'reentry' : 'return',
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
