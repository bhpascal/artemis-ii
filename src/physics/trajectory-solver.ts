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

  // Flyby — display values
  vInfinity: number          // true v_infinity (from energy, not SOI speed) (m/s)
  flybyEccentricity: number  // hyperbolic eccentricity (>1)
  turnAngle: number          // asymptotic deflection angle (radians)
  turnSign: number           // +1 counterclockwise, -1 clockwise
  flybyPeriapsis: number     // actual closest approach to Moon center (m)

  // Flyby — orbit elements for renderer
  flybyA: number             // hyperbolic semi-major axis (negative, m)
  flybyOmega: number         // periapsis direction in Moon-centered frame (rad)
  flybyEntryNu: number       // true anomaly at SOI entry
  flybyExitNu: number        // true anomaly at SOI exit

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

/**
 * Correct flyby computation using exact orbit propagation.
 *
 * Instead of the approximate "rotate v_infinity by turn angle" approach,
 * this computes the actual hyperbolic orbit from the state vector at
 * SOI entry and propagates to the symmetric exit point.
 *
 * Fixes three bugs in the old implementation:
 * 1. v_at_SOI != v_infinity (energy correction via vis-viva)
 * 2. Asymptotic turn angle doesn't apply at finite SOI distance
 * 3. Exit speed must equal entry speed (energy conservation), not v_infinity
 */
function computeFlyby(
  entryState: StateVector,
  moonPos: Vec2,
  moonVel: Vec2,
): {
  aHyp: number
  eHyp: number
  omegaHyp: number
  nuEntry: number
  nuExit: number
  actualPeriapsis: number
  turnAngle: number
  turnSign: number
  exitState: StateVector
} | null {
  // 1. Moon-centered relative state
  const relX = entryState.pos.x - moonPos.x
  const relY = entryState.pos.y - moonPos.y
  const relVx = entryState.vel.x - moonVel.x
  const relVy = entryState.vel.y - moonVel.y

  const rSOI = Math.sqrt(relX ** 2 + relY ** 2)
  const vSOI = Math.sqrt(relVx ** 2 + relVy ** 2)

  if (vSOI < 50) return null

  // 2. Hyperbolic orbit from vis-viva (uses actual speed at actual distance)
  const aHyp = 1 / (2 / rSOI - vSOI ** 2 / MU_MOON) // negative for hyperbola
  if (aHyp >= 0) return null

  // Eccentricity vector — points from focus to periapsis
  const rdotv = relX * relVx + relY * relVy
  const evx = (1 / MU_MOON) * ((vSOI ** 2 - MU_MOON / rSOI) * relX - rdotv * relVx)
  const evy = (1 / MU_MOON) * ((vSOI ** 2 - MU_MOON / rSOI) * relY - rdotv * relVy)
  const eHyp = Math.sqrt(evx ** 2 + evy ** 2)

  if (eHyp <= 1) return null

  const omegaHyp = Math.atan2(evy, evx) // periapsis direction

  // Actual periapsis distance
  const actualPeriapsis = Math.abs(aHyp) * (eHyp - 1)

  // 3. True anomaly at SOI entry
  const p = Math.abs(aHyp) * (eHyp ** 2 - 1)
  let cosNu = (p / rSOI - 1) / eHyp
  cosNu = Math.max(-1, Math.min(1, cosNu))
  let nuEntry = Math.acos(cosNu)

  // Approaching periapsis (rdotv < 0) means nu < 0
  if (rdotv < 0) nuEntry = -nuEntry

  // 4. Symmetric exit: opposite side of periapsis
  const nuExit = -nuEntry

  // 5. Exit state in perifocal frame via exact orbital mechanics
  const exitPerifocal = orbitStateAtAnomaly(aHyp, eHyp, MU_MOON, nuExit)

  // 6. Rotate perifocal → Moon-centered by omegaHyp
  const cosO = Math.cos(omegaHyp)
  const sinO = Math.sin(omegaHyp)
  const exitRelPos: Vec2 = {
    x: exitPerifocal.x * cosO - exitPerifocal.y * sinO,
    y: exitPerifocal.x * sinO + exitPerifocal.y * cosO,
  }
  const exitRelVel: Vec2 = {
    x: exitPerifocal.vx * cosO - exitPerifocal.vy * sinO,
    y: exitPerifocal.vx * sinO + exitPerifocal.vy * cosO,
  }

  // 7. Back to Earth-centered frame
  const exitState: StateVector = {
    pos: { x: exitRelPos.x + moonPos.x, y: exitRelPos.y + moonPos.y },
    vel: { x: exitRelVel.x + moonVel.x, y: exitRelVel.y + moonVel.y },
  }

  // Asymptotic turn angle and direction (for display)
  const turnAngle = 2 * Math.asin(1 / eHyp)
  const L = relX * relVy - relY * relVx
  const turnSign = L > 0 ? +1 : -1

  return {
    aHyp, eHyp, omegaHyp,
    nuEntry, nuExit,
    actualPeriapsis,
    turnAngle, turnSign,
    exitState,
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

/**
 * Converge Moon angle and SOI entry for a given departure orbit and omega offset.
 * Returns the converged state or null if SOI intersection is lost.
 */
function convergeMoonSOI(
  a: number, e: number, omegaOffset: number
): {
  moonAngle: number
  omega: number
  soiNu: number
  transitTime: number
} | null {
  const moonOmega = 2 * Math.PI / T_MOON

  let moonAngle = 0
  let omega = -Math.PI + omegaOffset

  let soiFind = findSOIEntry(a, e, omega, D_MOON, 0)
  if (!soiFind) return null

  for (let iter = 0; iter < 8; iter++) {
    moonAngle = soiFind.transitTime * moonOmega
    omega = moonAngle - Math.PI + omegaOffset
    const mx = D_MOON * Math.cos(moonAngle)
    const my = D_MOON * Math.sin(moonAngle)
    soiFind = findSOIEntry(a, e, omega, mx, my)
    if (!soiFind) return null
  }

  return { moonAngle, omega, soiNu: soiFind.nu, transitTime: soiFind.transitTime }
}

/**
 * Compute the flyby periapsis for a given omega offset.
 * Used by the targeting bisection loop.
 */
function flybyPeriapsisForOffset(
  a: number, e: number, omegaOffset: number
): number | null {
  const conv = convergeMoonSOI(a, e, omegaOffset)
  if (!conv) return null

  const moonPos: Vec2 = {
    x: D_MOON * Math.cos(conv.moonAngle),
    y: D_MOON * Math.sin(conv.moonAngle),
  }
  const moonVel: Vec2 = {
    x: -V_MOON * Math.sin(conv.moonAngle),
    y: V_MOON * Math.cos(conv.moonAngle),
  }

  const entryState = orbitState(a, e, conv.omega, MU_EARTH, conv.soiNu)
  const flyby = computeFlyby(entryState, moonPos, moonVel)
  if (!flyby) return null

  return flyby.actualPeriapsis
}

export function solve(
  injectionV: number,
  flybyAltitude: number
): SolverResult {
  const targetPeriapsis = flybyAltitude + R_MOON

  // 1. Departure orbit
  const a = semiMajorAxis(MU_EARTH, R_LEO, injectionV)
  if (a <= 0) return fail('Escape orbit — semi-major axis negative')
  const e = eccentricityFromPeriapsis(a, R_LEO)
  if (e >= 1) return fail('Escape orbit — eccentricity >= 1')

  const apoR = apoapsis(a, e)
  if (apoR < D_MOON - SOI_MOON) return fail('Orbit does not reach the Moon')

  // 2. Targeting loop: scan for bracket, then bisect to hit desired flyby periapsis.
  //    The relationship between omega_offset and periapsis is smooth but not monotonic
  //    (peaks near 0°, drops on both sides). Scan at 1° intervals to find where the
  //    target periapsis is bracketed, then bisect within that interval.
  const DEG = Math.PI / 180
  const SCAN_RANGE = 15 // degrees
  const SCAN_STEP = 1   // degrees

  // Coarse scan
  const samples: Array<{ offset: number; peri: number }> = []
  for (let d = -SCAN_RANGE; d <= SCAN_RANGE; d += SCAN_STEP) {
    const peri = flybyPeriapsisForOffset(a, e, d * DEG)
    if (peri !== null && peri > 0) {
      samples.push({ offset: d * DEG, peri })
    }
  }

  let omegaOffset = 0 // fallback: no offset

  // Find adjacent pair that brackets the target, prefer closest to offset=0
  let bestBracket: { lo: number; hi: number } | null = null
  let bestDist = Infinity

  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i]!
    const s1 = samples[i + 1]!
    if ((s0.peri <= targetPeriapsis && targetPeriapsis <= s1.peri) ||
        (s1.peri <= targetPeriapsis && targetPeriapsis <= s0.peri)) {
      const midOffset = (s0.offset + s1.offset) / 2
      const dist = Math.abs(midOffset)
      if (dist < bestDist) {
        bestDist = dist
        bestBracket = { lo: s0.offset, hi: s1.offset }
      }
    }
  }

  if (bestBracket) {
    let lo = bestBracket.lo
    let hi = bestBracket.hi
    const periLo = flybyPeriapsisForOffset(a, e, lo)!
    const increasing = periLo < targetPeriapsis

    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2
      const periMid = flybyPeriapsisForOffset(a, e, mid)
      if (periMid === null) { lo = mid; continue }

      if (Math.abs(periMid - targetPeriapsis) < 1000) {
        omegaOffset = mid
        break
      }

      if (increasing ? (periMid < targetPeriapsis) : (periMid > targetPeriapsis)) {
        lo = mid
      } else {
        hi = mid
      }
      omegaOffset = mid
    }
  }

  // 3. Converge with final offset
  const conv = convergeMoonSOI(a, e, omegaOffset)
  if (!conv) return fail('SOI intersection not found')

  const moonAngle = conv.moonAngle
  const omega = conv.omega

  const moonPos: Vec2 = {
    x: D_MOON * Math.cos(moonAngle),
    y: D_MOON * Math.sin(moonAngle),
  }
  const moonVel: Vec2 = {
    x: -V_MOON * Math.sin(moonAngle),
    y: V_MOON * Math.cos(moonAngle),
  }

  const entryState = orbitState(a, e, omega, MU_EARTH, conv.soiNu)

  // 4. Flyby
  const flyby = computeFlyby(entryState, moonPos, moonVel)
  if (!flyby) return fail('Flyby computation failed')

  // 5. True v_infinity from energy: v_inf = sqrt(v_SOI² - 2μ/r_SOI)
  const relVx = entryState.vel.x - moonVel.x
  const relVy = entryState.vel.y - moonVel.y
  const vSOI = Math.sqrt(relVx ** 2 + relVy ** 2)
  const vInfSq = vSOI ** 2 - 2 * MU_MOON / SOI_MOON
  const vInfinity = vInfSq > 0 ? Math.sqrt(vInfSq) : 0

  // 6. Return orbit
  const ret = computeReturnOrbit(flyby.exitState)
  const hitsEarth = ret.perigeeAlt > 0 && ret.perigeeAlt < 200e3

  return {
    success: true,
    departure: { a, e, omega },
    moonAngle,
    soiEntry: entryState,
    soiEntryNu: conv.soiNu,
    transitTime: conv.transitTime,
    vInfinity,
    flybyEccentricity: flyby.eHyp,
    turnAngle: flyby.turnAngle,
    turnSign: flyby.turnSign,
    flybyPeriapsis: flyby.actualPeriapsis,
    flybyA: flyby.aHyp,
    flybyOmega: flyby.omegaHyp,
    flybyEntryNu: flyby.nuEntry,
    flybyExitNu: flyby.nuExit,
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
    flybyA: 0,
    flybyOmega: 0,
    flybyEntryNu: 0,
    flybyExitNu: 0,
    soiExit: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    returnOrbit: { a: 0, e: 0, omega: 0 },
    returnPerigeeAlt: 0,
    hitsEarth: false,
  }
}
