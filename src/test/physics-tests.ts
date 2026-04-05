/**
 * Physics smoke tests — run via ?test=1 URL parameter.
 * Validates core orbital mechanics against known values.
 */

import { MU_EARTH, R_EARTH } from '../physics/constants'
import {
  circularVelocity,
  escapeVelocity,
  visViva,
  semiMajorAxis,
} from '../physics/orbits'
import { solveKepler, solveKeplerHyperbolic, eccentricToTrue } from '../physics/kepler'

interface TestResult {
  name: string
  passed: boolean
  expected: string
  actual: string
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

export function runPhysicsTests(): TestResult[] {
  const results: TestResult[] = []
  const r_leo = R_EARTH + 200e3

  // Test 1: Circular velocity at 200 km LEO
  {
    const v = circularVelocity(MU_EARTH, r_leo)
    results.push({
      name: 'Circular velocity at 200 km LEO',
      passed: approxEqual(v, 7784, 10),
      expected: '7784 ± 10 m/s',
      actual: `${v.toFixed(1)} m/s`,
    })
  }

  // Test 2: Escape velocity at 200 km LEO
  {
    const v = escapeVelocity(MU_EARTH, r_leo)
    results.push({
      name: 'Escape velocity at 200 km LEO',
      passed: approxEqual(v, 11009, 10),
      expected: '11009 ± 10 m/s',
      actual: `${v.toFixed(1)} m/s`,
    })
  }

  // Test 3: v_esc / v_circ = sqrt(2)
  {
    const ratio = escapeVelocity(MU_EARTH, r_leo) / circularVelocity(MU_EARTH, r_leo)
    results.push({
      name: 'v_esc / v_circ = √2',
      passed: approxEqual(ratio, Math.SQRT2, 0.001),
      expected: `${Math.SQRT2.toFixed(6)}`,
      actual: `${ratio.toFixed(6)}`,
    })
  }

  // Test 4: Kepler equation solver (M=1.0, e=0.5)
  {
    const E = solveKepler(1.0, 0.5)
    results.push({
      name: 'Kepler solver: M=1.0, e=0.5',
      passed: approxEqual(E, 1.4987, 0.001),
      expected: '1.4987 ± 0.001',
      actual: `${E.toFixed(4)}`,
    })
  }

  // Test 5: Kepler solver roundtrip (E - e*sin(E) should equal M)
  {
    const M = 2.5
    const e = 0.7
    const E = solveKepler(M, e)
    const M_check = E - e * Math.sin(E)
    results.push({
      name: 'Kepler solver roundtrip (M=2.5, e=0.7)',
      passed: approxEqual(M_check, M, 1e-10),
      expected: `M = ${M}`,
      actual: `M = ${M_check.toFixed(12)}`,
    })
  }

  // Test 6: Hyperbolic Kepler solver converges
  {
    const H = solveKeplerHyperbolic(1.0, 2.0)
    const M_check = 2.0 * Math.sinh(H) - H
    results.push({
      name: 'Hyperbolic Kepler solver (M=1.0, e=2.0)',
      passed: approxEqual(M_check, 1.0, 1e-10),
      expected: 'M = 1.0',
      actual: `M = ${M_check.toFixed(12)}`,
    })
  }

  // Test 7: Vis-viva consistency: v at periapsis of known ellipse
  {
    const a = 2e7 // 20,000 km semi-major axis
    const e = 0.5
    const r_peri = a * (1 - e)
    const v_visviva = visViva(MU_EARTH, r_peri, a)
    const v_peri = Math.sqrt(MU_EARTH * (1 + e) / (a * (1 - e)))
    results.push({
      name: 'Vis-viva consistency at periapsis',
      passed: approxEqual(v_visviva, v_peri, 0.1),
      expected: `${v_peri.toFixed(1)} m/s`,
      actual: `${v_visviva.toFixed(1)} m/s`,
    })
  }

  // Test 8: Semi-major axis roundtrip
  {
    const r = r_leo
    const v = 8500 // elliptical
    const a = semiMajorAxis(MU_EARTH, r, v)
    const v_check = visViva(MU_EARTH, r, a)
    results.push({
      name: 'Semi-major axis roundtrip',
      passed: approxEqual(v_check, v, 0.01),
      expected: `${v} m/s`,
      actual: `${v_check.toFixed(4)} m/s`,
    })
  }

  // Test 9: Kepler M→E→ν→E→M roundtrip
  {
    const M_orig = 1.5
    const e = 0.3
    const E = solveKepler(M_orig, e)
    const nu = eccentricToTrue(E, e)
    // Back to E from nu
    const E_back = 2 * Math.atan2(
      Math.sqrt(1 - e) * Math.sin(nu / 2),
      Math.sqrt(1 + e) * Math.cos(nu / 2)
    )
    const M_back = E_back - e * Math.sin(E_back)
    results.push({
      name: 'Kepler M→E→ν→E→M roundtrip',
      passed: approxEqual(M_back, M_orig, 1e-10),
      expected: `M = ${M_orig}`,
      actual: `M = ${M_back.toFixed(12)}`,
    })
  }

  // Test 10: Circular orbit — semi-major axis equals radius
  {
    const v_circ = circularVelocity(MU_EARTH, r_leo)
    const a = semiMajorAxis(MU_EARTH, r_leo, v_circ)
    results.push({
      name: 'Circular orbit: a = r',
      passed: approxEqual(a, r_leo, 1),
      expected: `${r_leo.toFixed(0)} m`,
      actual: `${a.toFixed(0)} m`,
    })
  }

  return results
}
