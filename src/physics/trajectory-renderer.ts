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
  departurePts: Array<{ x: number; y: number }>
  flybyPts: Array<{ x: number; y: number }>
  returnPts: Array<{ x: number; y: number }>
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

  const depPts: Array<{ x: number; y: number }> = []
  const flyPts: Array<{ x: number; y: number }> = []
  const retPts: Array<{ x: number; y: number }> = []

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
