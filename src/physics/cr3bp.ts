/**
 * Circular Restricted 3-Body Problem (CR3BP) integrator.
 *
 * Replaces the patched-conic solver. Both Earth's and Moon's gravity
 * act simultaneously — no SOI boundaries, no patching, no targeting loops.
 * Free-return trajectories emerge naturally from the initial conditions.
 *
 * Equations of motion in the co-rotating frame (normalized units):
 *   ẍ =  2ẏ + x - (1-μ)(x+μ)/r₁³ - μ(x-1+μ)/r₂³
 *   ÿ = -2ẋ + y - (1-μ)y/r₁³     - μy/r₂³
 *
 * Normalized units:
 *   Length: D_MOON (Earth-Moon distance)
 *   Time:  T_MOON / (2π)  →  one Moon orbit = 2π time units
 *   Mass:  M_Earth + M_Moon
 */

import { D_MOON, T_MOON, R_EARTH, R_MOON, R_LEO } from './constants'

// ── Constants ──

/**
 * Moon mass parameter — enhanced for 2D visualization.
 *
 * The physical value is 0.0122. We use 0.15 (≈12× enhancement) so that
 * the 2D CR3BP produces visually correct free-return trajectories with
 * tight lunar flybys. The real 3D trajectory achieves this tightness
 * via out-of-plane geometry unavailable in 2D. Same equations, same
 * phenomena — the Moon just pulls harder to compensate for the missing
 * dimension.
 *
 * Retained for the LEO injection propagator. The Arenstorf orbit uses MU_REAL.
 */
export const MU_CR3BP = 0.15

/** Physical Earth-Moon mass ratio */
export const MU_REAL = 0.012277471

// ── Arenstorf orbit constants (Arenstorf 1963) ──

/** Starting x-position (normalized, on Earth-Moon axis past the Moon) */
const ARENSTORF_X0 = 0.994

/** Starting y-velocity — the precise value that produces a periodic orbit */
const ARENSTORF_VY0 = -2.00158510637908252240537862224

/** Orbital period in normalized time units (~74.2 days physical) */
const ARENSTORF_PERIOD = 17.0652165601579625588917206249

/** Length unit (m) */
const L_UNIT = D_MOON

/** Time unit (s) */
const T_UNIT = T_MOON / (2 * Math.PI)

/** Velocity unit (m/s) */
const V_UNIT = L_UNIT / T_UNIT

/** Normalized body radii (for crash detection) */
const R_EARTH_NORM = R_EARTH / L_UNIT
const R_MOON_NORM = R_MOON / L_UNIT

// ── Types ──

interface State {
  x: number
  y: number
  vx: number
  vy: number
}

export interface TrajectoryResult {
  points: Array<{ x: number; y: number; t: number }>  // t = physical seconds since injection
  flybyAltitude: number   // closest Moon surface approach (m)
  returnPerigee: number   // closest Earth surface approach after outbound (m)
  hitsEarth: boolean      // returnPerigee in 0–200 km
  maxDistance: number      // max distance from Earth center (m)
  success: boolean
  error?: string
}

// ── CR3BP dynamics ──

/** Jacobi constant (energy integral of the CR3BP) */
export function jacobiConstant(x: number, y: number, vx: number, vy: number, mu: number = MU_CR3BP): number {
  const r1 = Math.sqrt((x + mu) ** 2 + y ** 2)
  const r2 = Math.sqrt((x - 1 + mu) ** 2 + y ** 2)
  const omega = 0.5 * (x ** 2 + y ** 2) + (1 - mu) / r1 + mu / r2
  return 2 * omega - (vx ** 2 + vy ** 2)
}

/** CR3BP acceleration */
function accel(s: State, mu: number): { ax: number; ay: number } {
  const r1 = Math.sqrt((s.x + mu) ** 2 + s.y ** 2)
  const r2 = Math.sqrt((s.x - 1 + mu) ** 2 + s.y ** 2)
  const r1_3 = r1 * r1 * r1
  const r2_3 = r2 * r2 * r2

  return {
    ax: 2 * s.vy + s.x - (1 - mu) * (s.x + mu) / r1_3 - mu * (s.x - 1 + mu) / r2_3,
    ay: -2 * s.vx + s.y - (1 - mu) * s.y / r1_3 - mu * s.y / r2_3,
  }
}

/** RK4 integration step */
function rk4Step(s: State, dt: number, mu: number): State {
  function deriv(st: State): [number, number, number, number] {
    const { ax, ay } = accel(st, mu)
    return [st.vx, st.vy, ax, ay]
  }

  const k1 = deriv(s)
  const k2 = deriv({
    x: s.x + 0.5 * dt * k1[0], y: s.y + 0.5 * dt * k1[1],
    vx: s.vx + 0.5 * dt * k1[2], vy: s.vy + 0.5 * dt * k1[3],
  })
  const k3 = deriv({
    x: s.x + 0.5 * dt * k2[0], y: s.y + 0.5 * dt * k2[1],
    vx: s.vx + 0.5 * dt * k2[2], vy: s.vy + 0.5 * dt * k2[3],
  })
  const k4 = deriv({
    x: s.x + dt * k3[0], y: s.y + dt * k3[1],
    vx: s.vx + dt * k3[2], vy: s.vy + dt * k3[3],
  })

  return {
    x: s.x + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    y: s.y + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    vx: s.vx + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    vy: s.vy + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  }
}

// ── Public API ──

/**
 * Propagate a free-return trajectory from LEO injection.
 *
 * @param injectionDv — delta-v above circular velocity (m/s)
 * @param injectionAngle — angle from anti-lunar point (degrees, default 35)
 *   0° = anti-lunar, 35° = leads the Moon (produces correct free-return geometry)
 * @param nSteps — integration steps (default 50000)
 * @param maxTime — max integration time in normalized units (default 4π ≈ 2 Moon orbits)
 */
export function propagate(
  injectionDv: number,
  injectionAngle: number = 50,
  nSteps: number = 15000,
  maxTime: number = 2.0  // ~8.7 days — covers outbound + flyby + return
): TrajectoryResult {
  const mu = MU_CR3BP

  // Injection from LEO at a lead angle ahead of the anti-lunar point.
  // angle=0° is the anti-lunar point; ~36° produces a direct transfer
  // that reaches the Moon in ~3 days with visible gravitational deflection.
  const rLeo = R_LEO / L_UNIT
  const theta = (injectionAngle * Math.PI) / 180
  const x0 = -mu + rLeo * Math.cos(Math.PI + theta)
  const y0 = rLeo * Math.sin(Math.PI + theta)

  // Inertial circular velocity around Earth
  const vCircInertial = Math.sqrt((1 - mu) / rLeo)

  // Tangential direction (prograde, perpendicular to Earth-spacecraft line)
  const tangX = -Math.sin(Math.PI + theta)
  const tangY = Math.cos(Math.PI + theta)

  // Total inertial velocity = circular + Δv, in tangential direction
  const vTotal = vCircInertial + injectionDv / V_UNIT
  const vxInertial = vTotal * tangX
  const vyInertial = vTotal * tangY

  // Convert to rotating frame: v_rot = v_inertial - ω × r  (ω = 1)
  // ω × (x, y) = (-y, x), so v_rot = (vx_i + y, vy_i - x)
  const vx0 = vxInertial + y0
  const vy0 = vyInertial - x0

  let state: State = { x: x0, y: y0, vx: vx0, vy: vy0 }
  const dt = maxTime / nSteps

  const points: Array<{ x: number; y: number; t: number }> = []
  let minMoonDist = Infinity
  let minEarthDist = Infinity
  let maxEarthDist = 0
  const skipReturn = Math.floor(nSteps / 4)

  // Downsample output: integrate at full resolution for accuracy,
  // but only record ~1000 points for rendering
  const sampleEvery = Math.max(1, Math.floor(nSteps / 1000))

  // Skip initial LEO parking orbits — only start recording once the
  // spacecraft is heading outward (r > 3× LEO radius from Earth)
  const departureThreshold = 3 * rLeo
  let departed = false

  for (let i = 0; i <= nSteps; i++) {
    const r1 = Math.sqrt((state.x + mu) ** 2 + state.y ** 2)
    if (r1 > departureThreshold) departed = true

    // Record point at reduced rate, skipping initial LEO orbits.
    // Shift from barycentric (Earth at -μ) to Earth-centered (Earth at 0)
    // so the output matches the canvas convention (Earth at origin, Moon at D_MOON).
    if (departed && i % sampleEvery === 0) {
      points.push({
        x: (state.x + mu) * L_UNIT,
        y: state.y * L_UNIT,
        t: i * dt * T_UNIT,
      })
    }

    const r2 = Math.sqrt((state.x - 1 + mu) ** 2 + state.y ** 2)

    // Track closest Moon approach
    if (r2 < minMoonDist) minMoonDist = r2

    // Track max Earth distance
    if (r1 > maxEarthDist) maxEarthDist = r1

    // Track closest Earth approach (after outbound leg)
    if (i > skipReturn && r1 < minEarthDist) minEarthDist = r1

    // Crash detection
    if (r1 < R_EARTH_NORM) {
      return {
        points,
        flybyAltitude: minMoonDist * L_UNIT - R_MOON,
        returnPerigee: -1,
        hitsEarth: false,
        maxDistance: maxEarthDist * L_UNIT,
        success: false,
        error: 'Crashed into Earth',
      }
    }
    if (r2 < R_MOON_NORM) {
      return {
        points,
        flybyAltitude: -1,
        returnPerigee: -1,
        hitsEarth: false,
        maxDistance: maxEarthDist * L_UNIT,
        success: false,
        error: 'Crashed into Moon',
      }
    }

    // Integrate
    state = rk4Step(state, dt, mu)
  }

  const flybyAltitude = minMoonDist * L_UNIT - R_MOON
  const returnPerigee = minEarthDist === Infinity ? -1 : minEarthDist * L_UNIT - R_EARTH
  const hitsEarth = returnPerigee > 0 && returnPerigee < 200e3

  return {
    points,
    flybyAltitude,
    returnPerigee,
    hitsEarth,
    maxDistance: maxEarthDist * L_UNIT,
    success: true,
  }
}

/**
 * Propagate the Arenstorf periodic orbit.
 *
 * Uses the exact initial conditions discovered by Arenstorf (1963) that
 * produce a closed figure-8 in the CR3BP at the real Earth-Moon mass ratio.
 * No mass enhancement needed.
 *
 * @param vyPerturbation — velocity perturbation in normalized units (0 = exact periodic orbit)
 * @param nSteps — integration steps (default 50000 for accuracy over the long period)
 */
export function propagateArenstorf(
  vyPerturbation: number = 0,
  nSteps: number = 50000,
): TrajectoryResult {
  const mu = MU_REAL

  let state: State = {
    x: ARENSTORF_X0,
    y: 0,
    vx: 0,
    vy: ARENSTORF_VY0 + vyPerturbation,
  }

  const maxTime = ARENSTORF_PERIOD
  const dt = maxTime / nSteps

  const points: Array<{ x: number; y: number; t: number }> = []
  let minMoonDist = Infinity
  let minEarthDist = Infinity
  let maxEarthDist = 0

  const sampleEvery = Math.max(1, Math.floor(nSteps / 1500))

  for (let i = 0; i <= nSteps; i++) {
    const r1 = Math.sqrt((state.x + mu) ** 2 + state.y ** 2)
    const r2 = Math.sqrt((state.x - 1 + mu) ** 2 + state.y ** 2)

    if (i % sampleEvery === 0) {
      points.push({
        x: (state.x + mu) * L_UNIT,
        y: state.y * L_UNIT,
        t: i * dt * T_UNIT,
      })
    }

    if (r2 < minMoonDist) minMoonDist = r2
    if (r1 > maxEarthDist) maxEarthDist = r1
    if (r1 < minEarthDist) minEarthDist = r1

    // Crash detection
    if (r1 < R_EARTH_NORM) {
      return {
        points,
        flybyAltitude: minMoonDist * L_UNIT - R_MOON,
        returnPerigee: -1,
        hitsEarth: false,
        maxDistance: maxEarthDist * L_UNIT,
        success: false,
        error: 'Crashed into Earth',
      }
    }
    if (r2 < R_MOON_NORM) {
      return {
        points,
        flybyAltitude: -1,
        returnPerigee: -1,
        hitsEarth: false,
        maxDistance: maxEarthDist * L_UNIT,
        success: false,
        error: 'Crashed into Moon',
      }
    }

    state = rk4Step(state, dt, mu)
  }

  return {
    points,
    flybyAltitude: minMoonDist * L_UNIT - R_MOON,
    returnPerigee: minEarthDist * L_UNIT - R_EARTH,
    hitsEarth: false,
    maxDistance: maxEarthDist * L_UNIT,
    success: true,
  }
}
