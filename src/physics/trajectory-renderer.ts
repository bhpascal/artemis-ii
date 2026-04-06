/**
 * Trajectory renderer — segments a CR3BP point array into drawable parts.
 *
 * The CR3BP solver outputs points already in the co-rotating frame.
 * This module splits them into departure, flyby, and return segments
 * based on proximity to the Moon.
 */

import { D_MOON, SOI_MOON } from './constants'
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

  // Split points into segments by proximity to Moon's SOI
  const depPts: Array<{ x: number; y: number }> = []
  const flyPts: Array<{ x: number; y: number }> = []
  const retPts: Array<{ x: number; y: number }> = []

  let phase: 'departure' | 'flyby' | 'return' = 'departure'

  for (const pt of result.points) {
    const moonDist = Math.sqrt((pt.x - moonX) ** 2 + (pt.y - moonY) ** 2)

    if (phase === 'departure') {
      depPts.push(pt)
      if (moonDist < SOI_MOON) {
        phase = 'flyby'
        flyPts.push(pt) // overlap point for continuity
      }
    } else if (phase === 'flyby') {
      flyPts.push(pt)
      if (moonDist > SOI_MOON) {
        phase = 'return'
        retPts.push(pt) // overlap point for continuity
      }
    } else {
      retPts.push(pt)
    }
  }

  return {
    departurePts: depPts,
    flybyPts: flyPts,
    returnPts: retPts,
    moonPos: { x: moonX, y: moonY },
  }
}
