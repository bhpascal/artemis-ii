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
import {
  computeArtemisTrajectory,
  interpolateTrajectory,
  formatMET,
  formatCalendarDate,
} from '../physics/trajectory'
import { ViewTransform, drawLabel } from '../rendering/canvas-utils'
import { drawEarth, drawMoon } from '../rendering/body-renderer'
import { drawOrbitPath, drawSpacecraft } from '../rendering/orbit-renderer'

export function HookSection() {
  const { level } = useLevel()
  const [now, setNow] = useState(Date.now())

  // Pre-compute trajectory once
  const trajectory = useMemo(() => computeArtemisTrajectory(), [])

  // Real-time tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const met = Math.max(0, (now - LAUNCH_EPOCH) / 1000) // mission elapsed time in seconds
  const missionOver = now > SPLASHDOWN_EPOCH
  const totalMissionTime = MISSION_DURATION_DAYS * 86400

  const currentPoint = interpolateTrajectory(trajectory, Math.min(met, totalMissionTime))

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      transform.viewRadius = D_MOON * 1.3
      transform.centerX = D_MOON * 0.3

      // Draw the full trajectory as a faded path
      const allPts = trajectory.map((p) => ({ x: p.x, y: p.y }))
      drawOrbitPath(ctx, transform, allPts, 'rgba(100,100,100,0.25)', 1.5)

      // Moon's orbital arc (faint)
      const moonArc: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= 200; i++) {
        const angle = (i / 200) * 2 * Math.PI
        moonArc.push({ x: D_MOON * Math.cos(angle), y: D_MOON * Math.sin(angle) })
      }
      drawOrbitPath(ctx, transform, moonArc, 'rgba(200,200,200,0.2)', 1, [4 * dpr, 4 * dpr])

      // Draw the traversed portion more boldly
      if (currentPoint) {
        const traversed = trajectory
          .filter((p) => p.t <= met)
          .map((p) => ({ x: p.x, y: p.y }))
        if (traversed.length > 1) {
          drawOrbitPath(ctx, transform, traversed, '#2E86C1', 2)
        }
      }

      // Earth
      drawEarth(ctx, transform, R_EARTH, 8)

      // Moon at its current approximate position
      const moonAngularVelocity = 2 * Math.PI / (27.322 * 86400)
      const moonAngle = met * moonAngularVelocity
      const moonX = D_MOON * Math.cos(moonAngle)
      const moonY = D_MOON * Math.sin(moonAngle)
      drawMoon(ctx, transform, moonX, moonY, R_MOON, 5)

      // Spacecraft position
      if (currentPoint && !missionOver) {
        drawSpacecraft(ctx, transform, currentPoint.x, currentPoint.y, '#E74C3C', 5)

        // Label
        const [sx, sy] = transform.toScreen(currentPoint.x, currentPoint.y)
        drawLabel(ctx, 'Orion', sx + 12 * dpr, sy - 8 * dpr, '#E74C3C', 12 * dpr)

        // Distance readout at Level 3+
        if (level >= 3 && currentPoint.distEarth > R_EARTH * 2) {
          drawLabel(
            ctx,
            `${(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km from Earth`,
            sx + 12 * dpr, sy + 8 * dpr,
            '#888', 10 * dpr
          )
        }
      }

      if (missionOver) {
        const [cx, cy] = transform.toScreen(D_MOON * 0.3, D_MOON * 0.3)
        drawLabel(ctx, 'Mission Complete', cx, cy, '#27AE60', 16 * dpr, 'center')
      }
    },
    [trajectory, currentPoint, met, missionOver, level]
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

      <LevelBlock min={3} max={4}>
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

      <LevelBlock level={5}>
        <p>
          At {formatMET(met)} MET ({formatCalendarDate(met)}),
          Orion {missionOver ? 'completed' : 'is on'} a free-return
          trajectory with perilune ≈ 6,500 km.
          {currentPoint && (
            <> Current state: r = {(currentPoint.distEarth / 1000).toFixed(0)} km,
            v = {(currentPoint.speed).toFixed(0)} m/s.
            Phase: {currentPoint.phase}.</>
          )}
        </p>
      </LevelBlock>

      <InteractiveFigure height={400} render={render} />

      <p className="mission-clock" style={{
        textAlign: 'center',
        fontSize: '1.2rem',
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
