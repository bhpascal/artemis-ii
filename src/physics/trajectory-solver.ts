/**
 * Trajectory solver — thin adapter over the CR3BP integrator.
 *
 * Provides two modes:
 *   solve()          — LEO injection with enhanced μ (legacy, used by mission section)
 *   solveArenstorf() — Arenstorf periodic orbit at real μ (primary interactive)
 */

import { propagate, propagateArenstorf, type TrajectoryResult } from './cr3bp'
import { R_MOON, D_MOON } from './constants'

export type { TrajectoryResult }

/** Velocity unit for converting perturbation from m/s to normalized */
const V_UNIT = D_MOON / (27.322 * 86400 / (2 * Math.PI))

export interface SolverResult extends TrajectoryResult {
  flybyPeriapsis: number
  returnPerigeeAlt: number
  turnAngle: number
  flybyEccentricity: number
  turnSign: number
}

export function solve(injectionDv: number): SolverResult {
  const result = propagate(injectionDv)

  return {
    ...result,
    flybyPeriapsis: result.flybyAltitude + R_MOON,
    returnPerigeeAlt: result.returnPerigee,
    turnAngle: 0,
    flybyEccentricity: 0,
    turnSign: 1,
  }
}

/**
 * Solve the Arenstorf orbit with an optional velocity perturbation.
 *
 * @param perturbationMs — velocity perturbation in m/s (0 = exact periodic orbit)
 */
export function solveArenstorf(perturbationMs: number = 0): SolverResult {
  const vyPerturbation = perturbationMs / V_UNIT
  const result = propagateArenstorf(vyPerturbation)

  return {
    ...result,
    flybyPeriapsis: result.flybyAltitude + R_MOON,
    returnPerigeeAlt: result.returnPerigee,
    turnAngle: 0,
    flybyEccentricity: 0,
    turnSign: 1,
  }
}
