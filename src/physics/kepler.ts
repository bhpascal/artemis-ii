/**
 * Kepler equation solvers — Newton-Raphson iteration.
 * All angles in radians.
 */

/**
 * Solve Kepler's equation for elliptical orbits: M = E - e*sin(E)
 * Returns eccentric anomaly E given mean anomaly M and eccentricity e.
 */
export function solveKepler(M: number, e: number, tol: number = 1e-12): number {
  // Initial guess
  let E = M + e * Math.sin(M)

  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < tol) break
  }

  return E
}

/**
 * Solve the hyperbolic Kepler equation: M = e*sinh(H) - H
 * Returns hyperbolic anomaly H given mean anomaly M and eccentricity e.
 */
export function solveKeplerHyperbolic(M: number, e: number, tol: number = 1e-12): number {
  // Robust initial guess: H₀ = M works for modest e, but diverges at
  // high eccentricities. This estimate handles the full range.
  const absM = Math.abs(M)
  let H = Math.sign(M) * Math.log(2 * absM / e + 1.8)

  for (let i = 0; i < 50; i++) {
    const sinhH = Math.sinh(H)
    const coshH = Math.cosh(H)
    const dH = (e * sinhH - H - M) / (e * coshH - 1)
    H -= dH
    if (Math.abs(dH) < tol) break
  }

  return H
}

/**
 * Convert eccentric anomaly to true anomaly (elliptical orbit).
 */
export function eccentricToTrue(E: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  )
}

/**
 * Convert true anomaly to eccentric anomaly (elliptical orbit).
 */
export function trueToEccentric(nu: number, e: number): number {
  return 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(nu / 2),
    Math.sqrt(1 + e) * Math.cos(nu / 2)
  )
}

/**
 * Convert mean anomaly to true anomaly (full pipeline).
 * For elliptical orbits only (0 <= e < 1).
 */
export function meanAnomalyToTrue(M: number, e: number): number {
  const E = solveKepler(M, e)
  return eccentricToTrue(E, e)
}

/**
 * Convert true anomaly to mean anomaly (reverse pipeline).
 * For elliptical orbits only (0 <= e < 1).
 */
export function trueToMeanAnomaly(nu: number, e: number): number {
  const E = trueToEccentric(nu, e)
  return E - e * Math.sin(E)
}
