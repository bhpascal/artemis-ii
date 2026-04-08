/**
 * Trajectory renderer tests — verify segmentation logic.
 */

import { describe, it, expect } from 'vitest'
import { renderArenstorfTrajectory, renderTrajectory } from './trajectory-renderer'
import { propagateArenstorf, propagate } from './cr3bp'
import { D_MOON } from './constants'

describe('renderArenstorfTrajectory', () => {
  const result = propagateArenstorf(0, 50000)
  const rendered = renderArenstorfTrajectory(result)

  it('produces non-null output for a valid orbit', () => {
    expect(rendered).not.toBeNull()
  })

  it('has all three segments with points', () => {
    expect(rendered!.departurePts.length).toBeGreaterThan(0)
    expect(rendered!.flybyPts.length).toBeGreaterThan(0)
    expect(rendered!.returnPts.length).toBeGreaterThan(0)
  })

  it('total points across segments covers most of the trajectory', () => {
    const total =
      rendered!.departurePts.length +
      rendered!.flybyPts.length +
      rendered!.returnPts.length
    // Some points are shared at segment boundaries, but total should
    // be close to the original count
    expect(total).toBeGreaterThan(result.points.length * 0.8)
  })

  it('moon position is at D_MOON on the x-axis', () => {
    expect(rendered!.moonPos.x).toBeCloseTo(D_MOON, -3)
    expect(rendered!.moonPos.y).toBe(0)
  })

  it('flyby points are near the Moon', () => {
    const moonX = rendered!.moonPos.x
    for (const pt of rendered!.flybyPts) {
      const dist = Math.sqrt((pt.x - moonX) ** 2 + pt.y ** 2)
      // Flyby points should be within 40% of D_MOON from the Moon
      expect(dist).toBeLessThan(D_MOON * 0.4)
    }
  })

  it('departure points include the Earth-side apex', () => {
    // The departure segment should contain the point farthest from Moon
    // (the apex of the Earth loop)
    let maxMoonDist = 0
    for (const pt of rendered!.departurePts) {
      const dist = Math.sqrt((pt.x - D_MOON) ** 2 + pt.y ** 2)
      if (dist > maxMoonDist) maxMoonDist = dist
    }
    // The apex should be far from the Moon (at least 60% of D_MOON)
    expect(maxMoonDist).toBeGreaterThan(D_MOON * 0.6)
  })
})

describe('renderTrajectory (LEO injection)', () => {
  const result = propagate(3060)
  const rendered = renderTrajectory(result)

  it('produces non-null output', () => {
    expect(rendered).not.toBeNull()
  })

  it('departure starts near Earth', () => {
    const first = rendered!.departurePts[0]!
    const earthDist = Math.sqrt(first.x ** 2 + first.y ** 2)
    // Should start within 10% of D_MOON from Earth
    expect(earthDist).toBeLessThan(D_MOON * 0.1)
  })
})
