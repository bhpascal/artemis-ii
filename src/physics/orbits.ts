/**
 * Core orbital mechanics — pure functions, no state.
 * All units SI: meters, seconds, radians.
 */

/** Circular orbit velocity at distance r from a body with gravitational parameter mu */
export function circularVelocity(mu: number, r: number): number {
  return Math.sqrt(mu / r)
}

/** Escape velocity at distance r */
export function escapeVelocity(mu: number, r: number): number {
  return Math.sqrt(2 * mu / r)
}

/** Orbital speed from vis-viva: v = sqrt(mu * (2/r - 1/a)) */
export function visViva(mu: number, r: number, a: number): number {
  return Math.sqrt(mu * (2 / r - 1 / a))
}

/** Semi-major axis from vis-viva: a = 1 / (2/r - v^2/mu) */
export function semiMajorAxis(mu: number, r: number, v: number): number {
  return 1 / (2 / r - (v * v) / mu)
}

/** Orbital period from Kepler's third law (s). Only valid for a > 0 (bound orbits). */
export function orbitalPeriod(mu: number, a: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu)
}

/** Specific orbital energy: epsilon = -mu / (2a) */
export function specificEnergy(mu: number, a: number): number {
  return -mu / (2 * a)
}

/** Eccentricity from semi-major axis and periapsis distance */
export function eccentricityFromPeriapsis(a: number, rPeriapsis: number): number {
  return 1 - rPeriapsis / a
}

/** Apoapsis distance from semi-major axis and eccentricity */
export function apoapsis(a: number, e: number): number {
  return a * (1 + e)
}

/** Periapsis distance from semi-major axis and eccentricity */
export function periapsis(a: number, e: number): number {
  return a * (1 - e)
}

/** Orbital radius at true anomaly nu */
export function radiusAtAnomaly(a: number, e: number, nu: number): number {
  return a * (1 - e * e) / (1 + e * Math.cos(nu))
}

/** Orbit state (position and velocity) at true anomaly in the orbital plane */
export function orbitStateAtAnomaly(
  a: number,
  e: number,
  mu: number,
  nu: number
): { x: number; y: number; vx: number; vy: number } {
  const r = radiusAtAnomaly(a, e, nu)
  const x = r * Math.cos(nu)
  const y = r * Math.sin(nu)

  // Velocity components in perifocal frame
  const p = a * (1 - e * e)
  const h = Math.sqrt(mu * p)
  const vx = -(mu / h) * Math.sin(nu)
  const vy = (mu / h) * (e + Math.cos(nu))

  return { x, y, vx, vy }
}

/**
 * Generate points along an elliptical orbit.
 * Returns an array of {x, y} in the orbital plane, centered on the focus.
 */
export function ellipsePoints(
  a: number,
  e: number,
  nPoints: number = 360
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= nPoints; i++) {
    const nu = (i / nPoints) * 2 * Math.PI
    const r = radiusAtAnomaly(a, e, nu)
    points.push({ x: r * Math.cos(nu), y: r * Math.sin(nu) })
  }
  return points
}

/**
 * Generate points along a hyperbolic orbit arc.
 * nuMax: maximum true anomaly (symmetric about periapsis).
 * For a hyperbola, true anomaly is bounded by arccos(-1/e).
 */
export function hyperbolaPoints(
  a: number,
  e: number,
  nuMax?: number,
  nPoints: number = 200
): Array<{ x: number; y: number }> {
  // Maximum true anomaly for a hyperbola
  const nuLimit = Math.acos(-1 / e) - 0.01 // small margin to avoid infinity
  const nu_max = nuMax !== undefined ? Math.min(nuMax, nuLimit) : nuLimit

  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= nPoints; i++) {
    const nu = -nu_max + (i / nPoints) * 2 * nu_max
    const r = Math.abs(a) * (e * e - 1) / (1 + e * Math.cos(nu))
    if (r > 0 && isFinite(r)) {
      points.push({ x: r * Math.cos(nu), y: r * Math.sin(nu) })
    }
  }
  return points
}

/**
 * Classify orbit type from semi-major axis and velocity.
 * Returns the type and relevant parameters.
 */
export function classifyOrbit(
  mu: number,
  r: number,
  v: number
): {
  type: 'suborbital' | 'circular' | 'elliptical' | 'parabolic' | 'hyperbolic'
  a: number
  e: number
} {
  const vCirc = circularVelocity(mu, r)
  const vEsc = escapeVelocity(mu, r)
  const a = semiMajorAxis(mu, r, v)

  // For injection at this radius (treating it as periapsis)
  const e = Math.abs(1 - r / a)

  if (v >= vEsc * 0.9999 && v <= vEsc * 1.0001) {
    return { type: 'parabolic', a: Infinity, e: 1 }
  }
  if (v > vEsc) {
    // Hyperbolic: a is negative
    return { type: 'hyperbolic', a, e: 1 - r / a }
  }
  if (v >= vCirc * 0.998 && v <= vCirc * 1.002) {
    return { type: 'circular', a, e: 0 }
  }
  if (a > 0 && periapsis(a, e) < r * 0.99) {
    // Periapsis below injection point — suborbital if it hits the surface
    return { type: 'suborbital', a, e }
  }
  return { type: 'elliptical', a, e }
}
