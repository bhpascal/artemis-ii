/**
 * Trajectory renderer — generates drawable point arrays from solver output.
 *
 * Takes orbital elements and state vectors from the solver and produces
 * smooth curves in the requested reference frame. Completely separate
 * from the physics computation.
 */

import { D_MOON } from './constants'
import { radiusAtAnomaly } from './orbits'
import type { SolverResult } from './trajectory-solver'

export interface TrajectoryPoints {
  departurePts: Array<{ x: number; y: number }>
  flybyPts: Array<{ x: number; y: number }>
  returnPts: Array<{ x: number; y: number }>
  moonPos: { x: number; y: number }
}

/**
 * Generate trajectory points from a solver result.
 *
 * @param result — output from the trajectory solver
 * @param frame — 'corotating' puts Moon at +x (figure-8); 'inertial' keeps original orientation
 * @param nPoints — points per segment
 */
export function renderTrajectory(
  result: SolverResult,
  frame: 'corotating' | 'inertial' = 'corotating',
  nPoints: number = 200
): TrajectoryPoints | null {
  if (!result.success) return null

  const { departure, moonAngle, soiEntryNu, soiExit, returnOrbit,
    flybyEccentricity, flybyA, flybyOmega, flybyEntryNu, flybyExitNu } = result

  // Rotation for co-rotating frame
  const frameAngle = frame === 'corotating' ? -moonAngle : 0
  const cosF = Math.cos(frameAngle)
  const sinF = Math.sin(frameAngle)
  const rotate = (x: number, y: number) => ({
    x: x * cosF - y * sinF,
    y: x * sinF + y * cosF,
  })

  // Moon position
  const moonX = D_MOON * Math.cos(moonAngle)
  const moonY = D_MOON * Math.sin(moonAngle)
  const moonPos = rotate(moonX, moonY)

  // ── Departure arc ──
  // Sample the departure ellipse from nu=0 to nu=soiEntryNu
  const depPts: Array<{ x: number; y: number }> = []
  const { a: aD, e: eD, omega: omD } = departure
  const cosOD = Math.cos(omD), sinOD = Math.sin(omD)

  for (let i = 0; i <= nPoints; i++) {
    const nu = (i / nPoints) * soiEntryNu
    const r = radiusAtAnomaly(aD, eD, nu)
    if (!isFinite(r) || r <= 0) continue
    const px = r * Math.cos(nu)
    const py = r * Math.sin(nu)
    // Rotate by omega (perifocal → inertial)
    const ix = px * cosOD - py * sinOD
    const iy = px * sinOD + py * cosOD
    // Rotate to frame
    depPts.push(rotate(ix, iy))
  }

  // ── Flyby arc ──
  // Use exact hyperbolic orbit elements from the solver
  const flybyPts: Array<{ x: number; y: number }> = []

  const eHyp = flybyEccentricity
  const aHyp = flybyA
  const p = Math.abs(aHyp) * (eHyp ** 2 - 1)

  // Periapsis direction in Moon-centered frame (from eccentricity vector)
  // Offset by moonAngle since flybyOmega is in Moon-centered inertial coords
  const periapsisAngle = flybyOmega

  // Sweep from entry to exit true anomaly (entry is negative, exit is positive)
  const nuStart = flybyEntryNu
  const nuEnd = flybyExitNu

  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints
    const nu = nuStart + t * (nuEnd - nuStart)
    const r = p / (1 + eHyp * Math.cos(nu))
    if (!isFinite(r) || r < 0) continue

    // Perifocal position
    const localX = r * Math.cos(nu)
    const localY = r * Math.sin(nu)

    // Rotate by periapsis angle to Moon-centered frame, then offset to Earth frame
    const cosP = Math.cos(periapsisAngle)
    const sinP = Math.sin(periapsisAngle)
    const ix = moonX + localX * cosP - localY * sinP
    const iy = moonY + localX * sinP + localY * cosP

    flybyPts.push(rotate(ix, iy))
  }

  // ── Return arc ──
  // Sample the return ellipse from the exit true anomaly back to periapsis
  const retPts: Array<{ x: number; y: number }> = []
  const { a: aR, e: eR, omega: omR } = returnOrbit

  if (aR > 0 && eR < 1) {
    const rExit = Math.sqrt(soiExit.pos.x ** 2 + soiExit.pos.y ** 2)
    const pR = aR * (1 - eR * eR)

    let cosNuExit = (pR / rExit - 1) / eR
    cosNuExit = Math.max(-1, Math.min(1, cosNuExit))
    let nuExit = Math.acos(cosNuExit)

    // Sign check: if approaching periapsis (rdotv < 0), nu is in (pi, 2pi)
    const rdotv = soiExit.pos.x * soiExit.vel.x + soiExit.pos.y * soiExit.vel.y
    if (rdotv < 0) {
      nuExit = 2 * Math.PI - nuExit
    }

    const nuSpan = (2 * Math.PI - nuExit) % (2 * Math.PI)
    if (nuSpan <= 0) return { departurePts: depPts, flybyPts, returnPts: [], moonPos }

    const cosOR = Math.cos(omR), sinOR = Math.sin(omR)
    for (let i = 0; i <= nPoints; i++) {
      const nu = nuExit + (i / nPoints) * nuSpan
      const r = radiusAtAnomaly(aR, eR, nu)
      if (!isFinite(r) || r <= 0 || r > D_MOON * 2) continue
      const px = r * Math.cos(nu)
      const py = r * Math.sin(nu)
      const ix = px * cosOR - py * sinOR
      const iy = px * sinOR + py * cosOR
      retPts.push(rotate(ix, iy))
    }
  }

  return { departurePts: depPts, flybyPts, returnPts: retPts, moonPos }
}
