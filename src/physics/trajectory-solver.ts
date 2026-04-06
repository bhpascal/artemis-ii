/**
 * Trajectory solver — thin adapter over the CR3BP integrator.
 *
 * Maintains the `solve(injectionDv)` API that section components use.
 * The flybyAltitude parameter is ignored — in the CR3BP, flyby altitude
 * is determined by the injection conditions, not a free parameter.
 */

import { propagate, type TrajectoryResult } from './cr3bp'
import { R_MOON } from './constants'

export type { TrajectoryResult }

export interface SolverResult extends TrajectoryResult {
  // Display values for the section UI
  flybyPeriapsis: number     // closest approach to Moon center (m)
  returnPerigeeAlt: number   // altitude above Earth surface (m)
  turnAngle: number          // approximate deflection (rad), for display
  flybyEccentricity: number  // approximate, for display
  turnSign: number           // +1 or -1
}

/**
 * Solve for a free-return trajectory.
 *
 * @param injectionDv — delta-v above LEO circular velocity (m/s).
 *   Note: for backward compat, this accepts the TOTAL injection velocity
 *   (v_circ + dv). The circular velocity (~7789 m/s) is subtracted internally.
 * @param _flybyAltitude — ignored (kept for API compat)
 */
export function solve(injectionDv: number, _flybyAltitude?: number): SolverResult {
  // The section passes injectionV = V_CIRC_LEO + dv, but propagate() wants just the dv.
  // V_CIRC_LEO ≈ 7789 m/s. If injectionDv > 5000, assume it's the total velocity.
  const dv = injectionDv > 5000 ? injectionDv - 7789 : injectionDv

  const result = propagate(dv)

  return {
    ...result,
    flybyPeriapsis: result.flybyAltitude + R_MOON,
    returnPerigeeAlt: result.returnPerigee,
    turnAngle: 0,
    flybyEccentricity: 0,
    turnSign: 1,
  }
}
