import { useCallback, useMemo, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock, LevelText } from '../components/LevelText'
import { MathBlock } from '../components/MathBlock'
import { MathFrac } from '../components/MathFrac'
import { ScrubableNumber } from '../components/ScrubableNumber'
import { Sidenote } from '../components/Sidenote'
import { useLevel } from '../hooks/useLevel'
import {
  R_EARTH,
  R_MOON,
  MU_EARTH,
  D_MOON,
  SOI_MOON,
  R_LEO,
} from '../physics/constants'
import { circularVelocity } from '../physics/orbits'
import { computeFreeReturn } from '../physics/patched-conics'
import { ViewTransform, drawLabel, drawLine } from '../rendering/canvas-utils'
import { drawEarth, drawMoon } from '../rendering/body-renderer'
import { drawOrbitPath } from '../rendering/orbit-renderer'

const V_CIRC_LEO = circularVelocity(MU_EARTH, R_LEO)

export function FreeReturnSection() {
  const [flybyAlt, setFlybyAlt] = useState(6500)
  const [injectionDv, setInjectionDv] = useState(3133)
  const { level } = useLevel()

  const injectionV = V_CIRC_LEO + injectionDv
  const flybyAltMeters = flybyAlt * 1000

  // Compute the trajectory (memoized — only recomputes when params change)
  const trajectory = useMemo(
    () => computeFreeReturn(injectionV, flybyAltMeters),
    [injectionV, flybyAltMeters]
  )

  // Main canvas: full Earth-Moon system with 3 trajectory segments
  const renderMain = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      transform.viewRadius = D_MOON * 1.4
      transform.centerX = D_MOON * 0.3
      transform.centerY = 0

      // Draw Moon's orbital circle (faint reference)
      const nCircle = 200
      const circlePts: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= nCircle; i++) {
        const angle = (i / nCircle) * 2 * Math.PI
        circlePts.push({ x: D_MOON * Math.cos(angle), y: D_MOON * Math.sin(angle) })
      }
      drawOrbitPath(ctx, transform, circlePts, 'rgba(200,200,200,0.3)', 1, [4 * dpr, 4 * dpr])

      if (trajectory) {
        // Departure (blue)
        drawOrbitPath(ctx, transform, trajectory.departurePts, '#2E86C1', 2.5)
        // Flyby (red)
        drawOrbitPath(ctx, transform, trajectory.flybyPts, '#E74C3C', 2.5)
        // Return (green)
        drawOrbitPath(ctx, transform, trajectory.returnPts, '#27AE60', 2.5)

        // Moon's SOI (dashed circle)
        const soiPts: Array<{ x: number; y: number }> = []
        for (let i = 0; i <= 100; i++) {
          const angle = (i / 100) * 2 * Math.PI
          soiPts.push({
            x: trajectory.moonPos.x + SOI_MOON * Math.cos(angle),
            y: trajectory.moonPos.y + SOI_MOON * Math.sin(angle),
          })
        }
        drawOrbitPath(ctx, transform, soiPts, '#CCCCCC', 1, [3 * dpr, 3 * dpr])

        // Draw Moon at its computed position
        drawMoon(ctx, transform, trajectory.moonPos.x, trajectory.moonPos.y, R_MOON, 6)

        // Moon label
        const [mlx, mly] = transform.toScreen(trajectory.moonPos.x, trajectory.moonPos.y)
        drawLabel(ctx, 'Moon', mlx + 10 * dpr, mly - 10 * dpr, '#888', 12 * dpr)

        // Return perigee indicator
        if (trajectory.hitsEarth) {
          // Green: successful return
          const [elx, ely] = transform.toScreen(0, -R_EARTH * 4)
          drawLabel(ctx, 'Returns to Earth!', elx, ely, '#27AE60', 14 * dpr, 'center')
          if (level >= 3) {
            drawLabel(
              ctx,
              `perigee alt: ${(trajectory.returnPerigeeAlt / 1000).toFixed(0)} km`,
              elx, ely + 18 * dpr,
              '#27AE60', 11 * dpr, 'center'
            )
          }
        } else if (trajectory.returnPerigeeAlt > 200e3) {
          const [elx, ely] = transform.toScreen(0, -R_EARTH * 4)
          drawLabel(ctx, 'Misses Earth — too shallow', elx, ely, '#E67E22', 13 * dpr, 'center')
        } else if (trajectory.returnPerigeeAlt < 0) {
          const [elx, ely] = transform.toScreen(0, -R_EARTH * 4)
          drawLabel(ctx, 'Hits the atmosphere too steeply', elx, ely, '#E74C3C', 13 * dpr, 'center')
        }

        // Turn angle annotation
        if (level >= 3) {
          const [mx, my] = transform.toScreen(trajectory.moonPos.x, trajectory.moonPos.y)
          drawLabel(
            ctx,
            `δ = ${(trajectory.turnAngle * 180 / Math.PI).toFixed(1)}°`,
            mx + 10 * dpr, my + 16 * dpr,
            '#E74C3C', 11 * dpr
          )
        }

        // Max distance
        if (level >= 3) {
          const [elx, ely] = transform.toScreen(0, -R_EARTH * 7)
          drawLabel(
            ctx,
            `max distance: ${(trajectory.maxDistance / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`,
            elx, ely,
            '#888', 11 * dpr, 'center'
          )
        }
      } else {
        // No valid trajectory
        const [cx, cy] = transform.toScreen(D_MOON * 0.3, 0)
        drawLabel(ctx, 'No valid trajectory at these parameters', cx, cy, '#E74C3C', 14 * dpr, 'center')
      }

      // Earth (drawn last, on top)
      drawEarth(ctx, transform, R_EARTH, 8)
      const [elx, ely] = transform.toScreen(0, 0)
      drawLabel(ctx, 'Earth', elx + 12 * dpr, ely + 12 * dpr, '#4A90D9', 11 * dpr)

      // Legend
      if (level >= 3) {
        const lx = 15 * dpr
        let ly = height * dpr - 60 * dpr
        const drawLegendItem = (color: string, label: string) => {
          drawLine(ctx, lx, ly, lx + 20 * dpr, ly, color, 2.5 * dpr)
          drawLabel(ctx, label, lx + 25 * dpr, ly, '#555', 10 * dpr)
          ly += 16 * dpr
        }
        drawLegendItem('#2E86C1', 'Departure')
        drawLegendItem('#E74C3C', 'Lunar flyby')
        drawLegendItem('#27AE60', 'Return')
      }
    },
    [trajectory, level]
  )

  // Inset canvas: zoomed flyby view
  const renderInset = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      if (!trajectory) return

      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      transform.viewRadius = SOI_MOON * 1.2
      transform.centerX = trajectory.moonPos.x
      transform.centerY = trajectory.moonPos.y

      // SOI circle
      const soiPts: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= 100; i++) {
        const angle = (i / 100) * 2 * Math.PI
        soiPts.push({
          x: trajectory.moonPos.x + SOI_MOON * Math.cos(angle),
          y: trajectory.moonPos.y + SOI_MOON * Math.sin(angle),
        })
      }
      drawOrbitPath(ctx, transform, soiPts, '#CCCCCC', 1, [3 * dpr, 3 * dpr])

      // Flyby path
      drawOrbitPath(ctx, transform, trajectory.flybyPts, '#E74C3C', 2.5)

      // Entry and exit segments for context
      if (trajectory.departurePts.length > 10) {
        const tail = trajectory.departurePts.slice(-20)
        drawOrbitPath(ctx, transform, tail, '#2E86C1', 1.5, [4 * dpr, 2 * dpr])
      }
      if (trajectory.returnPts.length > 10) {
        const head = trajectory.returnPts.slice(0, 20)
        drawOrbitPath(ctx, transform, head, '#27AE60', 1.5, [4 * dpr, 2 * dpr])
      }

      // Moon
      drawMoon(ctx, transform, trajectory.moonPos.x, trajectory.moonPos.y, R_MOON, 15)

      // Periapsis marker
      // Find the closest point to the Moon in the flyby arc
      let minDist = Infinity
      let periPt = trajectory.flybyPts[0]!
      for (const pt of trajectory.flybyPts) {
        const dx = pt.x - trajectory.moonPos.x
        const dy = pt.y - trajectory.moonPos.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) {
          minDist = d
          periPt = pt
        }
      }
      const [px, py] = transform.toScreen(periPt.x, periPt.y)
      ctx.beginPath()
      ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#E74C3C'
      ctx.fill()

      // Periapsis label
      drawLabel(ctx, 'periapsis', px + 8 * dpr, py - 8 * dpr, '#E74C3C', 11 * dpr)
      if (level >= 3) {
        drawLabel(
          ctx,
          `${(flybyAlt).toLocaleString()} km`,
          px + 8 * dpr, py + 6 * dpr,
          '#E74C3C', 10 * dpr
        )
      }

      // Turn angle arc
      if (level >= 3) {
        const [mx, my] = transform.toScreen(trajectory.moonPos.x, trajectory.moonPos.y)
        drawLabel(
          ctx,
          `turn: ${(trajectory.turnAngle * 180 / Math.PI).toFixed(1)}°`,
          mx - 10 * dpr, my + 24 * dpr,
          '#888', 10 * dpr, 'center'
        )

        // Eccentricity
        if (level >= 4) {
          drawLabel(
            ctx,
            `e = ${trajectory.flybyEccentricity.toFixed(3)}`,
            mx - 10 * dpr, my + 38 * dpr,
            '#888', 10 * dpr, 'center'
          )
        }
      }

      // Title
      drawLabel(ctx, 'Flyby Detail', width * dpr / 2, 14 * dpr, '#555', 12 * dpr, 'center')
    },
    [trajectory, level, flybyAlt]
  )

  return (
    <section className="section">
      <h2>The Free Return</h2>

      <LevelBlock level={1}>
        <p>
          Here is the really cool part. After the rocket gives the
          spaceship one big push, the Moon acts like a giant slingshot!
          If the spaceship flies by at just the right distance, the
          Moon's gravity grabs it, swings it around, and flings it
          right back home. No engine needed!
        </p>
        <p>
          Try changing how close the spaceship passes to the Moon:
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          After the trans-lunar injection burn, the spacecraft coasts
          toward the Moon. When it gets close, the Moon's gravity bends
          its path — like rolling a ball past a heavy bowling ball on a
          trampoline. If the flyby distance is just right, the spacecraft
          swings around and heads straight back to Earth. No engine needed.
        </p>
      </LevelBlock>

      <LevelBlock min={3} max={4}>
        <p>
          Here is the beautiful part. After the trans-lunar injection
          burn, the spacecraft follows a path that loops around the
          Moon's far side and returns to Earth{' '}
          <em>without any additional engine burn</em>. The Moon's gravity
          does all the redirection. This is called a free-return
          trajectory, and it is the ultimate safety feature.
          <Sidenote number={6}>
            In April 1970, an oxygen tank exploded on Apollo 13,
            disabling the main engine. The crew survived because they
            were on a free-return trajectory. The Moon brought them home.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          The free-return trajectory decomposes, within the patched-conic
          framework, into three Keplerian arcs: an Earth-departure
          ellipse, a lunar hyperbolic flyby, and an Earth-return ellipse.
          At each sphere-of-influence boundary, position and velocity
          vectors are "patched" via frame transformation. The critical
          constraint: the return perigee must fall within the atmospheric
          entry corridor (50–200 km altitude). The flyby periapsis
          distance is the single free parameter.
          <Sidenote number={6}>
            Apollo 13 (1970) demonstrated the safety value of free-return
            trajectories. The Jacobi constant of the CR3BP provides a
            deeper understanding: in the rotating frame, the zero-velocity
            curves constrain the accessible region. The free-return
            exploits a trajectory that necessarily returns to the
            Earth's Hill sphere.
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        Flyby altitude:{' '}
        <ScrubableNumber
          initial={6500}
          min={100}
          max={20000}
          step={100}
          sensitivity={2}
          precision={0}
          unit=" km"
          value={flybyAlt}
          onChange={setFlybyAlt}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={100}
        max={20000}
        step={100}
        value={flybyAlt}
        onChange={(e) => setFlybyAlt(Number(e.target.value))}
      />

      <LevelBlock min={4}>
        <p>
          <LevelText level={4}>
            Fine-tune the injection delta-v:{' '}
          </LevelText>
          <LevelText level={5}>
            Injection Δv (from LEO):{' '}
          </LevelText>
          <ScrubableNumber
            initial={3133}
            min={3120}
            max={3220}
            step={1}
            sensitivity={3}
            precision={0}
            unit=" m/s"
            value={injectionDv}
            onChange={setInjectionDv}
          />
        </p>
      </LevelBlock>

      <InteractiveFigure height={550} render={renderMain} />

      <h3>Flyby Detail</h3>
      <InteractiveFigure height={350} render={renderInset} />

      <LevelBlock min={3}>
        {trajectory ? (
          <p>
            {trajectory.hitsEarth ? (
              <>
                The return trajectory targets Earth with a perigee
                altitude of {(trajectory.returnPerigeeAlt / 1000).toFixed(0)} km —
                within the reentry corridor.
                {level >= 4 && <> Turn angle: {(trajectory.turnAngle * 180 / Math.PI).toFixed(1)}°.
                Hyperbolic eccentricity: {trajectory.flybyEccentricity.toFixed(3)}.</>}
              </>
            ) : trajectory.returnPerigeeAlt > 200e3 ? (
              <>
                The return trajectory misses Earth — perigee
                is {(trajectory.returnPerigeeAlt / 1000).toFixed(0)} km altitude,
                too high for atmospheric capture. Try a lower flyby altitude.
              </>
            ) : trajectory.returnPerigeeAlt < 0 ? (
              <>
                The return trajectory hits Earth too steeply (perigee
                below surface). The turn angle is too large. Try a higher
                flyby altitude.
              </>
            ) : (
              <>
                The return trajectory skims the atmosphere
                at {(trajectory.returnPerigeeAlt / 1000).toFixed(0)} km.
                Adjust the flyby altitude to target 50–200 km.
              </>
            )}
          </p>
        ) : (
          <p>No valid trajectory at these parameters. Try adjusting the injection velocity.</p>
        )}
      </LevelBlock>

      <LevelBlock max={2}>
        {trajectory ? (
          <p>
            {trajectory.hitsEarth ? (
              <>The spaceship comes back to Earth! That is the sweet spot!</>
            ) : trajectory.returnPerigeeAlt > 200e3 ? (
              <>The spaceship misses Earth. Try bringing it closer to the Moon.</>
            ) : (
              <>Too close! The spaceship comes in too steep. Move it farther from the Moon.</>
            )}
          </p>
        ) : (
          <p>The orbit is not right. Try different settings.</p>
        )}
      </LevelBlock>

      <LevelBlock min={3}>
        <MathBlock>
          δ = 2 arcsin
          <span style={{ margin: '0 0.15em' }}>(</span>
          <MathFrac num={<>1</>} den={<var>e</var>} />
          <span style={{ margin: '0 0.15em' }}>)</span>
        </MathBlock>
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          The turn angle δ depends on the hyperbolic
          eccentricity: sin(δ/2) = 1/<var>e</var>.
          Since <var>e</var> = 1 + r<sub>p</sub>v<sub>∞</sub>²/μ,
          lowering the flyby altitude (smaller r<sub>p</sub>)
          <em>decreases</em> the eccentricity toward 1. As <var>e</var> → 1,
          1/<var>e</var> → 1, and δ → 180°. So closer flybys produce
          <em>larger</em> turn angles — more bending. The spacecraft
          does a near-U-turn at very low altitudes.
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          In the CR3BP framework, this trajectory approximates a
          heteroclinic connection between the Earth's and Moon's Hill
          spheres. The patched-conic model is accurate to ~1% for
          Earth-Moon transfers. Modern mission design uses full
          numerical integration with solar gravity, Earth's J2
          oblateness, and solar radiation pressure — those perturbations
          are why trajectory correction burns exist. The Artemis II
          trajectory was designed with 3–4 small TCMs on the return leg.
        </p>
      </LevelBlock>
    </section>
  )
}
