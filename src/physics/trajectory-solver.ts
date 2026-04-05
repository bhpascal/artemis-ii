/**
 * Clean two-body patched-conic trajectory solver.
 *
 * Pure physics: computes orbital elements and state vectors at key waypoints.
 * No render points, no frame rotations, no UI concerns.
 *
 * Three-segment trajectory:
 * 1. Earth-departure ellipse (injection to Moon's SOI)
 * 2. Lunar hyperbolic flyby (inside Moon's SOI)
 * 3. Earth-return ellipse (Moon's SOI back to Earth)
 */

import {
  MU_EARTH,
  MU_MOON,
  R_EARTH,
  R_MOON,
  D_MOON,
  SOI_MOON,
  V_MOON,
  T_MOON,
  R_LEO,
} from './constants'
import {
  semiMajorAxis,
  eccentricityFromPeriapsis,
  orbitStateAtAnomaly,
  radiusAtAnomaly,
  apoapsis,
  periapsis,
} from './orbits'
import { trueToMeanAnomaly } from './kepler'

// ── Types ──

export interface Vec2 {
  x: number
  y: number
}

export interface StateVector {
  pos: Vec2
  vel: Vec2
}

export interface OrbitElements {
  a: number        // semi-major axis (m)
  e: number        // eccentricity
  omega: number    // argument of periapsis (radians)
}

export interface SolverResult {
  success: boolean
  error?: string

  // Departure
  departure: OrbitElements
  moonAngle: number          // Moon's angular position at SOI crossing (rad)

  // SOI entry
  soiEntry: StateVector      // Earth-centered inertial frame
  soiEntryNu: number         // true anomaly on departure orbit
  transitTime: number        // seconds from injection to SOI entry

  // Flyby
  vInfinity: number          // approach speed relative to Moon (m/s)
  flybyEccentricity: number  // hyperbolic eccentricity (>1)
  turnAngle: number          // deflection angle (radians)
  turnSign: number           // +1 counterclockwise, -1 clockwise
  flybyPeriapsis: number     // closest approach to Moon center (m)

  // SOI exit
  soiExit: StateVector       // Earth-centered inertial frame

  // Return orbit
  returnOrbit: OrbitElements
  returnPerigeeAlt: number   // altitude above Earth surface (m)
  hitsEarth: boolean         // perigee within reentry corridor (0–200 km)
}

// ── Internal: rotation helpers ──

function rotateVec(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

/** Get state on an orbit at true anomaly nu, rotated by omega */
function orbitState(a: number, e: number, omega: number, mu: number, nu: number): StateVector {
  const perifocal = orbitStateAtAnomaly(a, e, mu, nu)
  const pos = rotateVec({ x: perifocal.x, y: perifocal.y }, omega)
  const vel = rotateVec({ x: perifocal.vx, y: perifocal.vy }, omega)
  return { pos, vel }
}

// ── Internal: SOI intersection finder ──

/**
 * Find where the departure ellipse crosses the Moon's sphere of influence.
 * Scans true anomaly from 0 to pi, refines with bisection.
 */
function findSOIEntry(
  a: number, e: number, omega: number,
  moonX: number, moonY: number
): { nu: number; transitTime: number } | null {
  const nSteps = 500

  // Scan for the true anomaly where distance to Moon equals SOI_MOON
  let bestNu = -1
  let bestErr = Infinity

  for (let i = 0; i <= nSteps; i++) {
    const nu = (i / nSteps) * Math.PI
    const r = radiusAtAnomaly(a, e, nu)
    if (!isFinite(r) || r <= 0) continue

    const x = r * Math.cos(nu + omega)
    const y = r * Math.sin(nu + omega)
    const dist = Math.sqrt((x - moonX) ** 2 + (y - moonY) ** 2)
    const err = Math.abs(dist - SOI_MOON)

    if (err < bestErr) {
      bestErr = err
      bestNu = nu
    }
  }

  if (bestNu < 0 || bestErr > SOI_MOON * 0.2) return null

  // Bisection refinement
  let lo = Math.max(0, bestNu - Math.PI / nSteps * 2)
  let hi = Math.min(Math.PI, bestNu + Math.PI / nSteps * 2)

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const r = radiusAtAnomaly(a, e, mid)
    const x = r * Math.cos(mid + omega)
    const y = r * Math.sin(mid + omega)
    const dist = Math.sqrt((x - moonX) ** 2 + (y - moonY) ** 2)

    if (dist < SOI_MOON) hi = mid
    else lo = mid

    if (Math.abs(dist - SOI_MOON) < 1000) break // 1 km
  }

  const nu = (lo + hi) / 2

  // Transit time from periapsis
  const M = trueToMeanAnomaly(nu, e)
  const n = Math.sqrt(MU_EARTH / (a ** 3))
  const transitTime = M / n

  return { nu, transitTime }
}

// ── Internal: Lunar flyby ──

function computeFlyby(
  entryState: StateVector,
  moonPos: Vec2,
  moonVel: Vec2,
  rPeriapsis: number
): {
  turnAngle: number
  eHyp: number
  turnSign: number
  exitState: StateVector
} | null {
  // Relative state in Moon-centered frame
  const relVx = entryState.vel.x - moonVel.x
  const relVy = entryState.vel.y - moonVel.y
  const relX = entryState.pos.x - moonPos.x
  const relY = entryState.pos.y - moonPos.y

  const vInf = Math.sqrt(relVx ** 2 + relVy ** 2)
  if (vInf < 50) return null

  // Hyperbolic elements
  const aHyp = -MU_MOON / (vInf ** 2)
  const eHyp = 1 - rPeriapsis / aHyp  // > 1 since aHyp < 0
  if (eHyp <= 1) return null

  const sinHalfDelta = 1 / eHyp
  if (sinHalfDelta > 1) return null
  const turnAngle = 2 * Math.asin(sinHalfDelta)

  // Turn direction from angular momentum of the approach
  const L = relX * relVy - relY * relVx
  const turnSign = L > 0 ? +1 : -1

  // Exit velocity: same magnitude, rotated by turn angle
  const approachAngle = Math.atan2(relVy, relVx)
  const exitAngle = approachAngle + turnSign * turnAngle

  const exitVx = vInf * Math.cos(exitAngle) + moonVel.x
  const exitVy = vInf * Math.sin(exitAngle) + moonVel.y

  // Exit position on SOI boundary
  const p = Math.abs(aHyp) * (eHyp ** 2 - 1)
  let cosNuSOI = (p / SOI_MOON - 1) / eHyp
  cosNuSOI = Math.max(-1, Math.min(1, cosNuSOI))
  const nuSOI = Math.acos(cosNuSOI)

  const entryAngle = Math.atan2(relY, relX)
  const exitPosAngle = entryAngle + turnSign * 2 * nuSOI

  const exitPos: Vec2 = {
    x: moonPos.x + SOI_MOON * Math.cos(exitPosAngle),
    y: moonPos.y + SOI_MOON * Math.sin(exitPosAngle),
  }

  return {
    turnAngle,
    eHyp,
    turnSign,
    exitState: { pos: exitPos, vel: { x: exitVx, y: exitVy } },
  }
}

// ── Internal: Return orbit from exit state ──

function computeReturnOrbit(exitState: StateVector): {
  orbit: OrbitElements
  perigeeAlt: number
} {
  const { pos, vel } = exitState
  const r = Math.sqrt(pos.x ** 2 + pos.y ** 2)
  const v = Math.sqrt(vel.x ** 2 + vel.y ** 2)

  const a = semiMajorAxis(MU_EARTH, r, v)

  // Eccentricity vector
  const rdotv = pos.x * vel.x + pos.y * vel.y
  const evx = (1 / MU_EARTH) * ((v ** 2 - MU_EARTH / r) * pos.x - rdotv * vel.x)
  const evy = (1 / MU_EARTH) * ((v ** 2 - MU_EARTH / r) * pos.y - rdotv * vel.y)
  const e = Math.sqrt(evx ** 2 + evy ** 2)
  const omega = Math.atan2(evy, evx)

  const perigee = a > 0 && e < 1 ? periapsis(a, e) : -R_EARTH
  const perigeeAlt = perigee - R_EARTH

  return { orbit: { a, e, omega }, perigeeAlt }
}

// ── Public: Main solver ──

export function solve(
  injectionV: number,
  flybyAltitude: number
): SolverResult {
  const flybyPeriapsis = flybyAltitude + R_MOON

  // 1. Departure orbit
  const a = semiMajorAxis(MU_EARTH, R_LEO, injectionV)
  if (a <= 0) return fail('Escape orbit — semi-major axis negative')
  const e = eccentricityFromPeriapsis(a, R_LEO)
  if (e >= 1) return fail('Escape orbit — eccentricity >= 1')

  const apoR = apoapsis(a, e)
  if (apoR < D_MOON - SOI_MOON) return fail('Orbit does not reach the Moon')

  // 2. Iterative Moon position + orbit orientation
  const moonOmega = 2 * Math.PI / T_MOON

  let moonAngle = 0
  let omega = -Math.PI  // apoapsis toward +x initially

  let soiFind = findSOIEntry(a, e, omega, D_MOON, 0)
  if (!soiFind) return fail('SOI intersection not found (initial)')

  // Iterate: transit time → Moon position → re-orient orbit → re-find SOI
  for (let iter = 0; iter < 8; iter++) {
    moonAngle = soiFind.transitTime * moonOmega
    omega = moonAngle - Math.PI
    const mx = D_MOON * Math.cos(moonAngle)
    const my = D_MOON * Math.sin(moonAngle)
    soiFind = findSOIEntry(a, e, omega, mx, my)
    if (!soiFind) return fail(`SOI intersection lost at iteration ${iter}`)
  }

  const moonPos: Vec2 = {
    x: D_MOON * Math.cos(moonAngle),
    y: D_MOON * Math.sin(moonAngle),
  }
  const moonVel: Vec2 = {
    x: -V_MOON * Math.sin(moonAngle),
    y: V_MOON * Math.cos(moonAngle),
  }

  // Get spacecraft state at SOI entry
  const entryState = orbitState(a, e, omega, MU_EARTH, soiFind.nu)

  // 3. Flyby
  const flyby = computeFlyby(entryState, moonPos, moonVel, flybyPeriapsis)
  if (!flyby) return fail('Flyby computation failed')

  // 4. Return orbit
  const ret = computeReturnOrbit(flyby.exitState)
  const hitsEarth = ret.perigeeAlt > 0 && ret.perigeeAlt < 200e3

  return {
    success: true,
    departure: { a, e, omega },
    moonAngle,
    soiEntry: entryState,
    soiEntryNu: soiFind.nu,
    transitTime: soiFind.transitTime,
    vInfinity: Math.sqrt(
      (entryState.vel.x - moonVel.x) ** 2 +
      (entryState.vel.y - moonVel.y) ** 2
    ),
    flybyEccentricity: flyby.eHyp,
    turnAngle: flyby.turnAngle,
    turnSign: flyby.turnSign,
    flybyPeriapsis,
    soiExit: flyby.exitState,
    returnOrbit: ret.orbit,
    returnPerigeeAlt: ret.perigeeAlt,
    hitsEarth,
  }
}

function fail(error: string): SolverResult {
  return {
    success: false,
    error,
    departure: { a: 0, e: 0, omega: 0 },
    moonAngle: 0,
    soiEntry: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    soiEntryNu: 0,
    transitTime: 0,
    vInfinity: 0,
    flybyEccentricity: 0,
    turnAngle: 0,
    turnSign: 0,
    flybyPeriapsis: 0,
    soiExit: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    returnOrbit: { a: 0, e: 0, omega: 0 },
    returnPerigeeAlt: 0,
    hitsEarth: false,
  }
}
