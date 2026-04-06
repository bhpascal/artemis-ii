import { useCallback, useEffect, useMemo, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock, LevelText } from '../components/LevelText'
import { Sidenote } from '../components/Sidenote'
import { useLevel } from '../hooks/useLevel'
import {
  LAUNCH_EPOCH,
  SPLASHDOWN_EPOCH,
  R_EARTH,
  R_MOON,
  D_MOON,
  MISSION_DURATION_DAYS,
} from '../physics/constants'
import { solve } from '../physics/trajectory-solver'
import { renderTrajectory } from '../physics/trajectory-renderer'
import {
  computeArtemisTrajectory,
  interpolateTrajectory,
  formatMET,
  formatCalendarDate,
} from '../physics/trajectory'
import { ViewTransform, drawLabel } from '../rendering/canvas-utils'
import { drawEarth, drawMoon, drawStars } from '../rendering/body-renderer'
import { drawOrbitPath, drawSpacecraft } from '../rendering/orbit-renderer'

export function HookSection() {
  const { level } = useLevel()
  const [now, setNow] = useState(Date.now())

  // Pre-compute the smooth spatial trajectory (for the background path)
  const freeReturn = useMemo(() => {
    const result = solve(3060)
    return result.success ? renderTrajectory(result) : null
  }, [])

  // Pre-compute the time-sampled trajectory (for spacecraft position)
  const trajectory = useMemo(() => computeArtemisTrajectory(), [])

  // Real-time tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const met = Math.max(0, (now - LAUNCH_EPOCH) / 1000)
  const missionOver = now > SPLASHDOWN_EPOCH
  const totalMissionTime = MISSION_DURATION_DAYS * 86400
  const currentPoint = interpolateTrajectory(trajectory, Math.min(met, totalMissionTime))

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      // Frame so Earth is near the left edge, Moon near the right
      transform.viewRadius = D_MOON * 0.7
      transform.centerX = D_MOON * 0.5

      drawStars(ctx, width, height, dpr, 35, 17)

      // Draw the smooth free-return trajectory as a faded background path
      if (freeReturn) {
        const allPts = [
          ...freeReturn.departurePts,
          ...freeReturn.flybyPts,
          ...freeReturn.returnPts,
        ]
        drawOrbitPath(ctx, transform, allPts, 'rgba(100,100,100,0.15)', 1.5)
      }

      // Draw the traversed portion (from the time-sampled trajectory, post-TLI only)
      if (currentPoint) {
        const tliTime = 25 * 3600 // approximate TLI time
        const traversed = trajectory
          .filter((p) => p.t >= tliTime && p.t <= met)
          .map((p) => ({ x: p.x, y: p.y }))
        if (traversed.length > 1) {
          drawOrbitPath(ctx, transform, traversed, '#2E86C1', 2.5)
        }
      }

      // Earth
      drawEarth(ctx, transform, R_EARTH, 8)

      // Moon at +x (co-rotating frame, consistent with trajectory)
      drawMoon(ctx, transform, D_MOON, 0, R_MOON, 5)

      // Spacecraft position
      if (currentPoint && !missionOver) {
        drawSpacecraft(ctx, transform, currentPoint.x, currentPoint.y, '#E74C3C', 4)

        const [sx, sy] = transform.toScreen(currentPoint.x, currentPoint.y)
        drawLabel(ctx, 'Orion', sx + 10 * dpr, sy - 10 * dpr, '#E74C3C', 11 * dpr)

        if (level >= 3 && currentPoint.distEarth > R_EARTH * 2) {
          drawLabel(
            ctx,
            `${(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km from Earth`,
            sx + 10 * dpr, sy + 6 * dpr,
            '#888', 9 * dpr
          )
        }
      }

      if (missionOver) {
        const [cx, cy] = transform.toScreen(D_MOON * 0.3, D_MOON * 0.3)
        drawLabel(ctx, 'Mission Complete', cx, cy, '#27AE60', 16 * dpr, 'center')
      }
    },
    [freeReturn, trajectory, currentPoint, met, missionOver, level]
  )

  return (
    <section className="section">
      <LevelBlock level={1}>
        <p>
          Right now, four people are on the longest road trip in
          history — to the Moon and back! They left Earth
          {' '}{formatMET(met)} ago on a giant rocket, and they are going
          to swing around the far side of the Moon without even stopping.
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          Right now, four astronauts are traveling toward the Moon
          aboard the Orion spacecraft. They launched on April 1, 2026,
          and are currently {formatMET(met)} into their mission.
        </p>
      </LevelBlock>

      <LevelBlock level={3}>
        <p>
          Right now, as you read this, four astronauts are falling toward
          the Moon. They left Earth on April 1, 2026, aboard the Orion
          spacecraft, riding atop the most powerful rocket ever flown.
          {currentPoint && currentPoint.distEarth > R_EARTH * 2 && (
            <> They are currently{' '}
            {(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
            from Earth, moving
            at {(currentPoint.speed / 1000).toFixed(1)} km/s.</>
          )}
        </p>
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          Right now, four astronauts are coasting through cislunar
          space on a free-return trajectory — decelerating the entire
          way out as Earth's gravity claws back the kinetic energy their
          trans-lunar injection burn gave them.
          {currentPoint && currentPoint.distEarth > R_EARTH * 2 && (
            <> At {(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
            from Earth, moving
            at {(currentPoint.speed / 1000).toFixed(1)} km/s — exactly
            what the vis-viva equation predicts for their current distance
            on an orbit with this semi-major axis.</>
          )}
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          At {formatMET(met)} MET, Orion is in the transition between
          two gravitational regimes. Earth still dominates, but the
          Moon's tidal influence is growing — and the patched-conic
          approximation is at its least accurate right here in the gap
          between domains.
          {currentPoint && currentPoint.distEarth > R_EARTH * 2 && (
            <> The spacecraft is near its velocity minimum on the
            outbound leg, trading the last of its kinetic energy for
            gravitational potential
            — {(currentPoint.speed / 1000).toFixed(1)} km/s
            at {(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km.</>
          )}
        </p>
      </LevelBlock>

      <InteractiveFigure
        height={400}
        render={render}
        ariaLabel="Artemis II current position — spacecraft traveling from Earth toward the Moon on a free-return trajectory"
      />

      <p style={{
        textAlign: 'center',
        fontSize: '1.1rem',
        color: '#555',
        marginTop: '0.5rem',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <LevelText max={2}>
          Mission time: {formatMET(met)}
        </LevelText>
        <LevelText min={3}>
          MET: {formatMET(met)} — {formatCalendarDate(met)}
        </LevelText>
      </p>

      <p>
        How does NASA know this path will bring them home?{' '}
        <LevelText max={2}>That is what we are going to explore!</LevelText>
        <LevelText min={3}>That is what this page is about.</LevelText>
        <Sidenote number={1}>
          The crew — Reid Wiseman, Victor Glover, Christina Koch, and
          Jeremy Hansen — are the first humans to leave Earth orbit
          since Apollo 17 in December 1972. A 53-year gap.
        </Sidenote>
      </p>
    </section>
  )
}
