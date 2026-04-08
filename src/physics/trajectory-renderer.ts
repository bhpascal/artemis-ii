/**
 * Trajectory renderer — segments a CR3BP point array into drawable parts.
 *
 * The CR3BP solver outputs points already in the co-rotating frame.
 * This module splits them into departure, flyby, and return segments
 * based on proximity to the Moon.
 */

import { D_MOON } from './constants'
import type { TrajectoryResult } from './cr3bp'

export interface TrajectoryPoints {
  departurePts: Array<{ x: number; y: number; t: number }>
  flybyPts: Array<{ x: number; y: number; t: number }>
  returnPts: Array<{ x: number; y: number; t: number }>
  moonPos: { x: number; y: number }
}

/**
 * Segment a CR3BP trajectory into departure, flyby, and return arcs.
 *
 * @param result — output from the CR3BP propagator
 * @param _frame — kept for API compat (CR3BP points are always co-rotating)
 */
export function renderTrajectory(
  result: TrajectoryResult,
  _frame: 'corotating' | 'inertial' = 'corotating'
): TrajectoryPoints | null {
  if (!result.success || result.points.length === 0) return null

  const moonX = D_MOON
  const moonY = 0

  // Split points into segments: departure → flyby → return.
  // Use 30% of Earth-Moon distance as the flyby proximity threshold
  // (larger than the formal SOI because the CR3BP doesn't have SOI boundaries).
  const flybyThreshold = D_MOON * 0.3

  const depPts: Array<{ x: number; y: number; t: number }> = []
  const flyPts: Array<{ x: number; y: number; t: number }> = []
  const retPts: Array<{ x: number; y: number; t: number }> = []

  let phase: 'departure' | 'flyby' | 'return' = 'departure'

  for (const pt of result.points) {
    const moonDist = Math.sqrt((pt.x - moonX) ** 2 + (pt.y - moonY) ** 2)

    if (phase === 'departure') {
      depPts.push(pt)
      if (moonDist < flybyThreshold) {
        phase = 'flyby'
        flyPts.push(pt)
      }
    } else if (phase === 'flyby') {
      flyPts.push(pt)
      if (moonDist > flybyThreshold) {
        phase = 'return'
        retPts.push(pt)
      }
    } else {
      retPts.push(pt)
      // Stop after the spacecraft returns near Earth (within ~20,000 km)
      const earthDist = Math.sqrt(pt.x ** 2 + pt.y ** 2)
      if (earthDist < 2e7 && retPts.length > 10) break
    }
  }

  return {
    departurePts: depPts,
    flybyPts: flyPts,
    returnPts: retPts,
    moonPos: { x: moonX, y: moonY },
  }
}

/**
 * Segment an Arenstorf orbit into outbound, flyby, and return arcs.
 *
 * The Arenstorf orbit starts near the Moon, so the segmentation is:
 *   initial flyby → earth loop (outbound + return) → final flyby
 *
 * We combine the initial and final flyby segments into flybyPts,
 * and split the earth loop into departurePts and returnPts at the
 * point farthest from the Moon (the Earth-side apex).
 */
export function renderArenstorfTrajectory(
  result: TrajectoryResult,
): TrajectoryPoints | null {
  if (!result.success || result.points.length === 0) return null

  const moonX = D_MOON
  const moonY = 0
  const flybyThreshold = D_MOON * 0.35

  // Phase 1: Find the three segments
  const initialFlyby: Array<{ x: number; y: number; t: number }> = []
  const earthLoop: Array<{ x: number; y: number; t: number }> = []
  const finalFlyby: Array<{ x: number; y: number; t: number }> = []

  let phase: 'initial' | 'earth' | 'final' = 'initial'

  for (const pt of result.points) {
    const moonDist = Math.sqrt((pt.x - moonX) ** 2 + (pt.y - moonY) ** 2)

    if (phase === 'initial') {
      initialFlyby.push(pt)
      if (moonDist > flybyThreshold) {
        phase = 'earth'
        earthLoop.push(pt)
      }
    } else if (phase === 'earth') {
      earthLoop.push(pt)
      if (moonDist < flybyThreshold) {
        phase = 'final'
        finalFlyby.push(pt)
      }
    } else {
      finalFlyby.push(pt)
    }
  }

  // Phase 2: Split the earth loop at its apex (farthest from Moon)
  let apexIdx = 0
  let maxMoonDist = 0
  for (let i = 0; i < earthLoop.length; i++) {
    const pt = earthLoop[i]!
    const d = Math.sqrt((pt.x - moonX) ** 2 + (pt.y - moonY) ** 2)
    if (d > maxMoonDist) {
      maxMoonDist = d
      apexIdx = i
    }
  }

  const departurePts = earthLoop.slice(0, apexIdx + 1)
  const returnPts = earthLoop.slice(apexIdx)
  const flybyPts = [...finalFlyby, ...initialFlyby]

  return {
    departurePts,
    flybyPts,
    returnPts,
    moonPos: { x: moonX, y: moonY },
  }
}
