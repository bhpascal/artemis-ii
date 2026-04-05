/**
 * Patched conic trajectory solver for free-return lunar trajectories.
 *
 * Three segments:
 * 1. Earth-departure ellipse (TLI to Moon's SOI)
 * 2. Lunar hyperbolic flyby (inside Moon's SOI)
 * 3. Earth-return ellipse (Moon's SOI to Earth)
 *
 * At each SOI boundary, position and velocity are "patched" by converting
 * between Earth-centered and Moon-centered reference frames.
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
  orbitalPeriod,
} from './orbits'
import { trueToMeanAnomaly } from './kepler'

export interface StateVector {
  x: number
  y: number
  vx: number
  vy: number
}

export interface FreeReturnResult {
  departurePts: Array<{ x: number; y: number }>
  flybyPts: Array<{ x: number; y: number }>
  returnPts: Array<{ x: number; y: number }>
  moonPos: { x: number; y: number }
  moonAngle: number
  flybyPeriapsis: number
  turnAngle: number
  flybyEccentricity: number
  maxDistance: number
  returnPerigeeAlt: number
  /** Return perigee within reentry corridor (0–200 km altitude) */
  hitsEarth: boolean
  transitTime: number
  soiEntryState: StateVector
  soiExitState: StateVector
}

/**
 * Find where the departure ellipse crosses the Moon's SOI.
 *
 * The departure orbit has periapsis at the injection point and is rotated
 * by `omega` so that apoapsis roughly faces the Moon's position.
 * We scan true anomaly from 0 to pi and bisect to find the SOI crossing.
 */
function findSOIIntersection(
  a: number,
  e: number,
  omega: number,
  moonX: number,
  moonY: number
): { nu: number; state: StateVector; transitTime: number } | null {
  // Scan true anomaly from 0 (periapsis) to pi (apoapsis)
  const nSteps = 500
  let bestNu = -1
  let bestDist = Infinity

  for (let i = 0; i <= nSteps; i++) {
    const nu = (i / nSteps) * Math.PI
    const r = radiusAtAnomaly(a, e, nu)
    if (!isFinite(r) || r < 0) continue

    // Position in the rotated frame
    const x = r * Math.cos(nu + omega)
    const y = r * Math.sin(nu + omega)

    const dx = x - moonX
    const dy = y - moonY
    const distToMoon = Math.sqrt(dx * dx + dy * dy)
    const err = Math.abs(distToMoon - SOI_MOON)

    if (err < bestDist) {
      bestDist = err
      bestNu = nu
    }
  }

  if (bestNu < 0 || bestDist > SOI_MOON * 0.2) return null

  // Refine with bisection
  let nuLow = Math.max(0, bestNu - Math.PI / nSteps * 2)
  let nuHigh = Math.min(Math.PI, bestNu + Math.PI / nSteps * 2)

  for (let iter = 0; iter < 50; iter++) {
    const nuMid = (nuLow + nuHigh) / 2
    const r = radiusAtAnomaly(a, e, nuMid)
    const x = r * Math.cos(nuMid + omega)
    const y = r * Math.sin(nuMid + omega)
    const dx = x - moonX
    const dy = y - moonY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < SOI_MOON) {
      nuHigh = nuMid
    } else {
      nuLow = nuMid
    }

    if (Math.abs(dist - SOI_MOON) < 1e3) break // 1 km precision
  }

  const nu = (nuLow + nuHigh) / 2

  // Get state in perifocal frame, then rotate by omega
  const perifocal = orbitStateAtAnomaly(a, e, MU_EARTH, nu)
  const cosO = Math.cos(omega)
  const sinO = Math.sin(omega)
  const state: StateVector = {
    x: perifocal.x * cosO - perifocal.y * sinO,
    y: perifocal.x * sinO + perifocal.y * cosO,
    vx: perifocal.vx * cosO - perifocal.vy * sinO,
    vy: perifocal.vx * sinO + perifocal.vy * cosO,
  }

  // Transit time from periapsis
  const M = trueToMeanAnomaly(nu, e)
  const n = Math.sqrt(MU_EARTH / (a * a * a))
  const transitTime = M / n

  return { nu, state, transitTime }
}

/**
 * Compute the hyperbolic flyby around the Moon.
 */
function computeLunarFlyby(
  stateEarth: StateVector,
  moonX: number,
  moonY: number,
  moonVx: number,
  moonVy: number,
  flybyPeriapsis: number
): {
  turnAngle: number
  eHyp: number
  exitState: StateVector
  flybyPts: Array<{ x: number; y: number }>
} | null {
  // Convert to Moon-centered frame
  const relVx = stateEarth.vx - moonVx
  const relVy = stateEarth.vy - moonVy

  // Approach velocity (v-infinity)
  const vInf = Math.sqrt(relVx * relVx + relVy * relVy)
  if (vInf < 100) return null // too slow for meaningful flyby

  // Hyperbolic orbit elements
  const aHyp = -MU_MOON / (vInf * vInf) // negative for hyperbola
  const eHyp = 1 - flybyPeriapsis / aHyp // > 1 since aHyp < 0

  if (eHyp <= 1) return null // not a valid hyperbola

  // Turn angle
  const sinHalfDelta = 1 / eHyp
  if (sinHalfDelta > 1) return null
  const turnAngle = 2 * Math.asin(sinHalfDelta)

  // Approach direction
  const approachAngle = Math.atan2(relVy, relVx)

  // Determine turn direction: we want the flyby to bend the trajectory
  // back toward Earth. Use cross product of approach velocity with
  // Moon-to-Earth vector.
  const moonToEarthX = -moonX
  const moonToEarthY = -moonY
  const cross = relVx * moonToEarthY - relVy * moonToEarthX
  const turnSign = cross > 0 ? -1 : 1

  // Exit velocity: same magnitude, rotated by turn angle
  const exitAngle = approachAngle + turnSign * turnAngle
  const exitVx = vInf * Math.cos(exitAngle) + moonVx
  const exitVy = vInf * Math.sin(exitAngle) + moonVy

  // Exit position on SOI: compute from hyperbolic orbit geometry.
  // True anomaly at SOI boundary: cos(nu) = (p/r - 1)/e where p = |a|(e²-1)
  const p = Math.abs(aHyp) * (eHyp * eHyp - 1)
  let cosNuSOI = (p / SOI_MOON - 1) / eHyp
  cosNuSOI = Math.max(-1, Math.min(1, cosNuSOI))
  const nuSOI = Math.acos(cosNuSOI)

  // Entry position angle (relative to Moon, from SOI entry point)
  const relX = stateEarth.x - moonX
  const relY = stateEarth.y - moonY
  const entryAngle = Math.atan2(relY, relX)

  // Exit position: rotated by 2*nuSOI (angular span on the SOI boundary)
  // in the turn direction
  const exitPosAngle = entryAngle + turnSign * 2 * nuSOI
  const exitRelX = SOI_MOON * Math.cos(exitPosAngle)
  const exitRelY = SOI_MOON * Math.sin(exitPosAngle)

  const exitState: StateVector = {
    x: moonX + exitRelX,
    y: moonY + exitRelY,
    vx: exitVx,
    vy: exitVy,
  }

  // Generate flyby points using actual hyperbolic orbit geometry
  // in Moon-centered frame, then transform to Earth frame
  const flybyPts: Array<{ x: number; y: number }> = []
  const nPts = 120

  // The hyperbola periapsis direction: midway between entry and exit,
  // pointing inward. The periapsis is at nu=0 in the perifocal frame.
  // Entry is at nu=-nuSOI, exit at nu=+nuSOI.
  // We need to orient the perifocal frame: periapsis direction is
  // the bisector of the angular span.
  const periapsisAngle = entryAngle + turnSign * nuSOI

  for (let i = 0; i <= nPts; i++) {
    const t = i / nPts
    // True anomaly from -nuSOI to +nuSOI
    const nu = -nuSOI + t * 2 * nuSOI
    const r = p / (1 + eHyp * Math.cos(nu))
    if (!isFinite(r) || r < 0) continue

    // Position in perifocal frame (periapsis at nu=0)
    const localX = r * Math.cos(nu)
    const localY = r * Math.sin(nu)

    // Rotate to the correct orientation:
    // periapsis direction in the Earth frame is `periapsisAngle`
    // but we also need to account for the turn direction
    const cosP = Math.cos(periapsisAngle)
    const sinP = Math.sin(periapsisAngle)
    // Apply turn direction: if turnSign < 0, flip y
    const fy = turnSign * localY
    const earthX = moonX + localX * cosP - fy * sinP
    const earthY = moonY + localX * sinP + fy * cosP

    flybyPts.push({ x: earthX, y: earthY })
  }

  return { turnAngle, eHyp, exitState, flybyPts }
}

/**
 * Compute the full free-return trajectory.
 *
 * @param injectionV — total velocity at injection (LEO altitude)
 * @param flybyAltitude — altitude above Moon's surface (m)
 */
export function computeFreeReturn(
  injectionV: number,
  flybyAltitude: number
): FreeReturnResult | null {
  const flybyPeriapsis = flybyAltitude + R_MOON

  // 1. Departure orbit elements
  const a = semiMajorAxis(MU_EARTH, R_LEO, injectionV)
  if (a <= 0) return null // escape orbit
  const e = eccentricityFromPeriapsis(a, R_LEO)
  if (e >= 1) return null

  // Check if departure orbit reaches Moon's SOI
  const apoR = apoapsis(a, e)
  if (apoR < D_MOON - SOI_MOON) return null

  // 2. Iteratively find Moon's position at SOI crossing time
  const moonAngularVelocity = 2 * Math.PI / T_MOON

  // First estimate: assume Moon angle is 0, orient orbit toward it
  let moonAngle = 0
  let omega = moonAngle - Math.PI // apoapsis toward Moon

  let soiResult = findSOIIntersection(a, e, omega, D_MOON, 0)
  if (!soiResult) return null

  // Correct Moon position with transit time
  for (let iter = 0; iter < 5; iter++) {
    moonAngle = soiResult.transitTime * moonAngularVelocity
    omega = moonAngle - Math.PI // re-orient apoapsis toward corrected Moon position
    const moonX = D_MOON * Math.cos(moonAngle)
    const moonY = D_MOON * Math.sin(moonAngle)
    soiResult = findSOIIntersection(a, e, omega, moonX, moonY)
    if (!soiResult) return null
  }

  const moonX = D_MOON * Math.cos(moonAngle)
  const moonY = D_MOON * Math.sin(moonAngle)
  const moonVx = -V_MOON * Math.sin(moonAngle)
  const moonVy = V_MOON * Math.cos(moonAngle)

  // 3. Lunar flyby
  const flyby = computeLunarFlyby(
    soiResult.state,
    moonX, moonY,
    moonVx, moonVy,
    flybyPeriapsis
  )
  if (!flyby) return null

  // 4. Return orbit from exit state
  const exitState = flyby.exitState
  const rExit = Math.sqrt(exitState.x * exitState.x + exitState.y * exitState.y)
  const vExit = Math.sqrt(exitState.vx * exitState.vx + exitState.vy * exitState.vy)
  const aReturn = semiMajorAxis(MU_EARTH, rExit, vExit)

  // Eccentricity vector
  const rdotv = exitState.x * exitState.vx + exitState.y * exitState.vy
  const evx = (1 / MU_EARTH) * ((vExit * vExit - MU_EARTH / rExit) * exitState.x - rdotv * exitState.vx)
  const evy = (1 / MU_EARTH) * ((vExit * vExit - MU_EARTH / rExit) * exitState.y - rdotv * exitState.vy)
  const eReturn = Math.sqrt(evx * evx + evy * evy)
  const omegaReturn = Math.atan2(evy, evx)

  // Return perigee
  const returnPerigee = aReturn > 0 && eReturn < 1 ? periapsis(aReturn, eReturn) : -R_EARTH
  const returnPerigeeAlt = returnPerigee - R_EARTH
  const hitsEarth = returnPerigeeAlt > 0 && returnPerigeeAlt < 200e3

  // 5. Generate trajectory points

  // Departure: from periapsis (nu=0) to SOI crossing (nu=soiResult.nu)
  const depPts: Array<{ x: number; y: number }> = []
  const cosO = Math.cos(omega)
  const sinO = Math.sin(omega)
  const nDep = 200
  for (let i = 0; i <= nDep; i++) {
    const nu = (i / nDep) * soiResult.nu
    const r = radiusAtAnomaly(a, e, nu)
    if (!isFinite(r) || r <= 0) continue
    // Perifocal → rotated by omega
    const px = r * Math.cos(nu)
    const py = r * Math.sin(nu)
    depPts.push({
      x: px * cosO - py * sinO,
      y: px * sinO + py * cosO,
    })
  }

  // Return: from SOI exit to perigee
  const retPts: Array<{ x: number; y: number }> = []
  if (aReturn > 0 && eReturn < 1) {
    const nRet = 200
    const p = aReturn * (1 - eReturn * eReturn)
    let cosNuExit = (p / rExit - 1) / eReturn
    cosNuExit = Math.max(-1, Math.min(1, cosNuExit))
    let nuExit = Math.acos(cosNuExit)

    // Sign check: if spacecraft is approaching periapsis (rdotv < 0),
    // true anomaly is in (pi, 2*pi)
    if (rdotv < 0) {
      nuExit = 2 * Math.PI - nuExit
    }

    // Draw from exit true anomaly through 2*pi back to 0 (periapsis)
    const nuSpan = (2 * Math.PI - nuExit) % (2 * Math.PI)
    const cosR = Math.cos(omegaReturn)
    const sinR = Math.sin(omegaReturn)
    for (let i = 0; i <= nRet; i++) {
      const nu = nuExit + (i / nRet) * nuSpan
      const r = radiusAtAnomaly(aReturn, eReturn, nu)
      if (!isFinite(r) || r <= 0 || r > D_MOON * 2) continue
      const px = r * Math.cos(nu)
      const py = r * Math.sin(nu)
      retPts.push({
        x: px * cosR - py * sinR,
        y: px * sinR + py * cosR,
      })
    }
  }

  // Rotate everything into the co-rotating frame where the Moon sits at +x.
  // This produces the classic figure-8 shape seen in NASA diagrams.
  const cosM = Math.cos(-moonAngle)
  const sinM = Math.sin(-moonAngle)
  const rotate = (pts: Array<{ x: number; y: number }>) =>
    pts.map(({ x: px, y: py }) => ({
      x: px * cosM - py * sinM,
      y: px * sinM + py * cosM,
    }))

  const rotDepPts = rotate(depPts)
  const rotFlyPts = rotate(flyby.flybyPts)
  const rotRetPts = rotate(retPts)

  // Max distance
  const allPts = [...rotDepPts, ...rotFlyPts, ...rotRetPts]
  let maxDistance = 0
  for (const pt of allPts) {
    const d = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
    if (d > maxDistance) maxDistance = d
  }

  // Transit time
  const returnTime = aReturn > 0 ? orbitalPeriod(MU_EARTH, aReturn) / 2 : 0
  const transitTime = soiResult.transitTime + returnTime

  return {
    departurePts: rotDepPts,
    flybyPts: rotFlyPts,
    returnPts: rotRetPts,
    moonPos: { x: D_MOON, y: 0 }, // Moon at +x in the rotating frame
    moonAngle: 0,
    flybyPeriapsis,
    turnAngle: flyby.turnAngle,
    flybyEccentricity: flyby.eHyp,
    maxDistance,
    returnPerigeeAlt,
    hitsEarth,
    transitTime,
    soiEntryState: soiResult.state,
    soiExitState: flyby.exitState,
  }
}
