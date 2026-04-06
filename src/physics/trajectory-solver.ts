/**
 * Trajectory solver — thin adapter over the CR3BP integrator.
 *
 * Uses a fixed injection angle of 36° from the anti-lunar point.
 * The slider range is tuned to the window where trajectories
 * encounter the Moon (Δv ≈ 3130–3155 m/s from LEO).
 */

import { propagate, type TrajectoryResult } from './cr3bp'
import { R_MOON } from './constants'

export type { TrajectoryResult }

export interface SolverResult extends TrajectoryResult {
  flybyPeriapsis: number
  returnPerigeeAlt: number
  turnAngle: number
  flybyEccentricity: number
  turnSign: number
}

export function solve(injectionDv: number): SolverResult {
  const dv = injectionDv > 5000 ? injectionDv - 7789 : injectionDv
  const result = propagate(dv, 36)

  return {
    ...result,
    flybyPeriapsis: result.flybyAltitude + R_MOON,
    returnPerigeeAlt: result.returnPerigee,
    turnAngle: 0,
    flybyEccentricity: 0,
    turnSign: 1,
  }
}
