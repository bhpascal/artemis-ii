import { useCallback, useMemo, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock, LevelText } from '../components/LevelText'
import { Sidenote } from '../components/Sidenote'
import { useLevel } from '../hooks/useLevel'
import {
  R_EARTH,
  R_MOON,
  D_MOON,
  MISSION_DURATION_DAYS,
} from '../physics/constants'
import {
  computeArtemisTrajectory,
  interpolateTrajectory,
  getMissionPhase,
  formatMET,
  formatCalendarDate,
  MISSION_PHASES,
  MISSION_EVENTS,
} from '../physics/trajectory'
import { ViewTransform, drawLabel, drawLine, drawArrow } from '../rendering/canvas-utils'
import { drawEarth, drawMoon, drawStars } from '../rendering/body-renderer'
import { drawOrbitPath, drawSpacecraft } from '../rendering/orbit-renderer'

import '../styles/timeline.css'

export function RealMissionSection() {
  const { level } = useLevel()
  const [missionHours, setMissionHours] = useState(0)

  const trajectory = useMemo(() => computeArtemisTrajectory(), [])

  const met = missionHours * 3600 // seconds
  const totalTime = MISSION_DURATION_DAYS * 86400
  const currentPoint = interpolateTrajectory(trajectory, met)
  const currentPhase = getMissionPhase(met)

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      transform.viewRadius = D_MOON * 1.4
      transform.centerX = D_MOON * 0.3

      drawStars(ctx, width, height, dpr, 60, 99)

      // Full trajectory as a faded path
      const allPts = trajectory.map((p) => ({ x: p.x, y: p.y }))
      drawOrbitPath(ctx, transform, allPts, 'rgba(150,150,150,0.2)', 1.5)

      // Phase-colored traversed segments
      let lastPhaseKey = ''
      let segPts: Array<{ x: number; y: number }> = []
      for (const p of trajectory) {
        if (p.t > met) break
        if (p.phase !== lastPhaseKey && segPts.length > 0) {
          const phase = MISSION_PHASES.find((ph) => ph.key === lastPhaseKey)
          drawOrbitPath(ctx, transform, segPts, phase?.color ?? '#888', 2.5)
          segPts = [segPts[segPts.length - 1]!] // overlap one point
        }
        segPts.push({ x: p.x, y: p.y })
        lastPhaseKey = p.phase
      }
      if (segPts.length > 0) {
        const phase = MISSION_PHASES.find((ph) => ph.key === lastPhaseKey)
        drawOrbitPath(ctx, transform, segPts, phase?.color ?? '#888', 2.5)
      }

      // Moon's orbit (faint)
      const moonArc: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= 200; i++) {
        const angle = (i / 200) * 2 * Math.PI
        moonArc.push({ x: D_MOON * Math.cos(angle), y: D_MOON * Math.sin(angle) })
      }
      drawOrbitPath(ctx, transform, moonArc, 'rgba(200,200,200,0.2)', 1, [4 * dpr, 4 * dpr])

      // Earth
      drawEarth(ctx, transform, R_EARTH, 8)

      // Moon at current position
      const moonAngularVelocity = 2 * Math.PI / (27.322 * 86400)
      const moonAngle = met * moonAngularVelocity
      const moonX = D_MOON * Math.cos(moonAngle)
      const moonY = D_MOON * Math.sin(moonAngle)
      drawMoon(ctx, transform, moonX, moonY, R_MOON, 5)

      // Spacecraft
      if (currentPoint) {
        // Distance lines to Earth and Moon
        const [sx, sy] = transform.toScreen(currentPoint.x, currentPoint.y)
        const [ex, ey] = transform.toScreen(0, 0)
        const [mx, my] = transform.toScreen(moonX, moonY)

        drawLine(ctx, sx, sy, ex, ey, 'rgba(74,144,217,0.3)', 1 * dpr, [3 * dpr, 3 * dpr])
        drawLine(ctx, sx, sy, mx, my, 'rgba(192,192,192,0.3)', 1 * dpr, [3 * dpr, 3 * dpr])

        // Velocity vector
        if (currentPoint.vx !== 0 || currentPoint.vy !== 0) {
          const vScale = 30000 * dpr // scale factor for visibility
          const vx = currentPoint.vx / currentPoint.speed * vScale
          const vy = -currentPoint.vy / currentPoint.speed * vScale // flip Y
          drawArrow(ctx, sx, sy, sx + vx, sy + vy, '#F39C12', 1.5 * dpr, 6 * dpr)
        }

        // Spacecraft dot (pulsing)
        drawSpacecraft(ctx, transform, currentPoint.x, currentPoint.y, currentPhase.color, 5)

        // Label
        drawLabel(ctx, 'Orion', sx + 14 * dpr, sy - 10 * dpr, '#333', 12 * dpr)
      }

      // Phase label
      const [plx, ply] = transform.toScreen(D_MOON * 0.3, -D_MOON * 1.1)
      drawLabel(ctx, currentPhase.label, plx, ply, currentPhase.color, 14 * dpr, 'center')
    },
    [trajectory, met, currentPoint, currentPhase, level]
  )

  return (
    <section className="section">
      <h2>The Real Artemis II</h2>

      <LevelBlock level={1}>
        <p>
          Now let's fly the actual mission! Drag the slider to scrub
          through all ten days — from liftoff to splashdown.
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          This is the real Artemis II trajectory, computed from the
          actual mission parameters. Use the slider to move through
          the entire 10-day mission.
        </p>
      </LevelBlock>

      <LevelBlock min={3} max={4}>
        <p>
          The complete Artemis II trajectory, computed from mission
          parameters using the patched-conic model. Scrub through
          all ten days and watch the velocity profile — the spacecraft
          slows as it climbs away from Earth, then accelerates as it
          falls back.
          <Sidenote number={7}>
            In practice, 3–4 trajectory correction burns adjust for
            solar perturbation, J2 oblateness, and measurement
            uncertainty. The patched-conic model you see is
            within ~1% of the actual ephemeris.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          The trajectory below uses the patched-conic approximation
          with parameters matched to the Artemis II mission profile.
          Real mission design uses numerical integration of the full
          force model (Earth J2–J6, lunar gravity field, solar gravity,
          solar radiation pressure). The patched-conic model captures
          the qualitative dynamics and is accurate to ~1% for
          Earth-Moon transfers. Scrub the timeline to explore the full
          state evolution.
        </p>
      </LevelBlock>

      <p>
        Mission time:{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMET(met)}
        </strong>
        {' '}<span style={{ color: '#888', fontSize: '0.9em' }}>
          ({formatCalendarDate(met)})
        </span>
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={0}
        max={MISSION_DURATION_DAYS * 24}
        step={0.5}
        value={missionHours}
        onChange={(e) => setMissionHours(Number(e.target.value))}
        style={{ maxWidth: '100%' }}
      />

      <InteractiveFigure height={550} render={render} />

      {/* Data panel */}
      {currentPoint && (
        <div className="data-panel">
          <div className="data-row">
            <span className="data-label">Phase</span>
            <span className="data-value" style={{ color: currentPhase.color }}>
              {currentPhase.label}
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">Distance from Earth</span>
            <span className="data-value">
              {(currentPoint.distEarth / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
              <LevelText min={3}>
                {' '}({(currentPoint.distEarth / 1609.34).toLocaleString(undefined, { maximumFractionDigits: 0 })} mi)
              </LevelText>
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">Distance from Moon</span>
            <span className="data-value">
              {(currentPoint.distMoon / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">
              <LevelText max={2}>Speed</LevelText>
              <LevelText min={3}>Velocity</LevelText>
            </span>
            <span className="data-value">
              {(currentPoint.speed / 1000).toFixed(2)} km/s
              <LevelText min={3}>
                {' '}({(currentPoint.speed * 3.6).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h)
              </LevelText>
            </span>
          </div>
        </div>
      )}

      {/* Timeline bar */}
      <div className="timeline-bar">
        {MISSION_PHASES.map((phase) => {
          const startFrac = phase.startTime / totalTime
          const widthFrac = (phase.endTime - phase.startTime) / totalTime
          return (
            <div
              key={phase.key}
              className="timeline-phase"
              style={{
                left: `${startFrac * 100}%`,
                width: `${widthFrac * 100}%`,
                backgroundColor: phase.color,
              }}
              title={phase.label}
            >
              <span className="timeline-phase-label">{phase.label}</span>
            </div>
          )
        })}
        {/* Current position marker */}
        <div
          className="timeline-marker"
          style={{ left: `${(met / totalTime) * 100}%` }}
        />
        {/* Event markers */}
        {MISSION_EVENTS.map((event, i) => (
          <div
            key={i}
            className="timeline-event"
            style={{ left: `${(event.t / totalTime) * 100}%` }}
            title={event.label}
          />
        ))}
      </div>
    </section>
  )
}
