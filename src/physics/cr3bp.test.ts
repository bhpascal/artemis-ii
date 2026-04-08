/**
 * CR3BP physics test suite.
 *
 * Tests the Arenstorf periodic orbit and the LEO injection propagator
 * against known analytical results. These are the "did we break the
 * physics?" tests — run them after any change to cr3bp.ts.
 */

import { describe, it, expect } from 'vitest'
import {
  propagateArenstorf,
  propagate,
  jacobiConstant,
  MU_REAL,
  MU_CR3BP,
} from './cr3bp'
import { D_MOON, R_MOON, R_EARTH } from './constants'

// ── Arenstorf orbit ──

describe('propagateArenstorf', () => {
  // Pre-compute once for all Arenstorf tests
  const result = propagateArenstorf(0, 80000)

  it('integrates successfully', () => {
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.points.length).toBeGreaterThan(100)
  })

  it('produces a closed orbit (end ≈ start)', () => {
    const first = result.points[0]!
    const last = result.points[result.points.length - 1]!

    // The orbit should close to within ~1% of the Earth-Moon distance.
    // RK4 with 80k steps over T≈17 accumulates some drift, but the
    // Arenstorf orbit is a known periodic solution — if the closure
    // error is large, the integrator or initial conditions are wrong.
    const dx = last.x - first.x
    const dy = last.y - first.y
    const closureError = Math.sqrt(dx * dx + dy * dy)

    // Closure within 1% of D_MOON (~3,844 km)
    expect(closureError).toBeLessThan(D_MOON * 0.01)
  })

  it('Jacobi constant is in the expected range for the Arenstorf orbit', () => {
    // The Arenstorf orbit has CJ ≈ 2.99 (between L1 and L2 energy values).
    // We can't easily back-compute CJ at arbitrary trajectory points without
    // velocity output, but verifying the initial CJ guards against changes
    // to the initial conditions or μ. The closure test above is a stronger
    // energy-conservation check — if energy drifted, the orbit wouldn't close.
    const cj0 = jacobiConstant(0.994, 0, 0, -2.00158510637908252240537862224, MU_REAL)
    expect(cj0).toBeGreaterThan(2.5)
    expect(cj0).toBeLessThan(3.5)
  })

  it('flyby altitude is physically reasonable', () => {
    // The Arenstorf orbit passes near the Moon. The flyby should be
    // above the Moon's surface but within a few thousand km.
    expect(result.flybyAltitude).toBeGreaterThan(0) // above surface
    expect(result.flybyAltitude).toBeLessThan(50000e3) // within 50,000 km
  })

  it('max distance is roughly Earth-Moon scale', () => {
    // The orbit loops around Earth, so max distance from Earth center
    // should be somewhere in the Earth-Moon distance range.
    expect(result.maxDistance).toBeGreaterThan(D_MOON * 0.3)
    expect(result.maxDistance).toBeLessThan(D_MOON * 2)
  })

  it('does not crash into Earth or Moon', () => {
    // All points should be outside both body radii
    for (const pt of result.points) {
      const earthDist = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
      const moonDist = Math.sqrt((pt.x - D_MOON) ** 2 + pt.y ** 2)
      expect(earthDist).toBeGreaterThan(R_EARTH)
      expect(moonDist).toBeGreaterThan(R_MOON)
    }
  })

  it('trajectory has the figure-8 shape (crosses Earth-Moon axis)', () => {
    // A figure-8 crosses y=0 multiple times. The Arenstorf orbit should
    // cross the Earth-Moon axis at least twice (start/end near Moon,
    // and at least once during the Earth loop).
    let crossings = 0
    for (let i = 1; i < result.points.length; i++) {
      const prev = result.points[i - 1]!
      const curr = result.points[i]!
      if (prev.y * curr.y < 0) crossings++
    }
    // Expect at least 3 axis crossings (start→Earth loop bottom,
    // Earth loop top→Moon, Moon loop)
    expect(crossings).toBeGreaterThanOrEqual(3)
  })
})

describe('propagateArenstorf with perturbation', () => {
  it('perturbed orbit does NOT close', () => {
    const result = propagateArenstorf(0.01, 50000) // small perturbation
    expect(result.success).toBe(true)

    const first = result.points[0]!
    const last = result.points[result.points.length - 1]!
    const closureError = Math.sqrt(
      (last.x - first.x) ** 2 + (last.y - first.y) ** 2
    )

    // Should NOT close — closure error should be significant
    // (much larger than the unperturbed case)
    expect(closureError).toBeGreaterThan(D_MOON * 0.01)
  })

  it('large perturbation may crash (handled gracefully)', () => {
    const result = propagateArenstorf(0.5, 50000) // big perturbation
    // Should either succeed with a wildly different trajectory,
    // or fail gracefully with an error message
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
    // Should have recorded at least some points before any crash
    expect(result.points.length).toBeGreaterThan(0)
  })
})

// ── LEO injection propagator (legacy, still used by mission section) ──

describe('propagate (LEO injection)', () => {
  it('produces a trajectory at Δv=3060', () => {
    const result = propagate(3060)
    expect(result.success).toBe(true)
    expect(result.points.length).toBeGreaterThan(50)
  })

  it('reaches lunar distance', () => {
    const result = propagate(3060)
    // Max distance should be at least 50% of the way to the Moon
    expect(result.maxDistance).toBeGreaterThan(D_MOON * 0.5)
  })

  it('uses enhanced μ (not real μ)', () => {
    // The LEO propagator uses MU_CR3BP = 0.15, not MU_REAL = 0.012
    // This is a guard against accidentally switching it
    expect(MU_CR3BP).toBeCloseTo(0.15, 2)
    expect(MU_REAL).toBeCloseTo(0.01228, 4)
  })
})

// ── Jacobi constant ──

describe('jacobiConstant', () => {
  it('returns expected value for Arenstorf initial conditions', () => {
    const cj = jacobiConstant(0.994, 0, 0, -2.00158510637908252240537862224, MU_REAL)
    // Known to be ~2.99 for this orbit
    expect(cj).toBeGreaterThan(2.8)
    expect(cj).toBeLessThan(3.2)
  })

  it('is symmetric in y-velocity sign', () => {
    // CJ depends on v², so flipping vy should give the same value
    const cj1 = jacobiConstant(0.5, 0.1, 0.2, 0.3, MU_REAL)
    const cj2 = jacobiConstant(0.5, 0.1, 0.2, -0.3, MU_REAL)
    expect(cj1).toBeCloseTo(cj2, 10)
  })
})
