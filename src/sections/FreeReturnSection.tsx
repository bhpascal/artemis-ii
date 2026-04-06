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
  D_MOON,
  SOI_MOON,
} from '../physics/constants'
import { solve } from '../physics/trajectory-solver'
import { renderTrajectory } from '../physics/trajectory-renderer'
import { ViewTransform, drawLabel, drawLine } from '../rendering/canvas-utils'
import { drawEarth, drawMoon, drawStars } from '../rendering/body-renderer'
import { drawOrbitPath } from '../rendering/orbit-renderer'

export function FreeReturnSection() {
  const [injectionDv, setInjectionDv] = useState(3060)
  const [showInertial, setShowInertial] = useState(false)
  const { level } = useLevel()

  // Compute the trajectory (memoized — only recomputes when dv changes)
  const solverResult = useMemo(
    () => solve(injectionDv),
    [injectionDv]
  )

  const flybyAlt = solverResult.flybyAltitude >= 0
    ? Math.round(solverResult.flybyAltitude / 1000)
    : 0

  const trajectory = useMemo(
    () => solverResult.success
      ? renderTrajectory(solverResult, showInertial ? 'inertial' : 'corotating')
      : null,
    [solverResult, showInertial]
  )

  // Main canvas: full Earth-Moon system with 3 trajectory segments
  const renderMain = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      // Frame: Earth left, Moon right, trajectory fills the canvas
      transform.viewRadius = D_MOON * 1.15
      transform.centerX = D_MOON * 0.45

      drawStars(ctx, width, height, dpr, 50, 73)

      if (trajectory) {
        // Points are already in the correct frame (renderer handles the toggle)
        const depPts = trajectory.departurePts
        const flyPts = trajectory.flybyPts
        const retPts = trajectory.returnPts
        const mPos = trajectory.moonPos

        // Trajectory segments
        drawOrbitPath(ctx, transform, depPts, '#2E86C1', 2.5)
        drawOrbitPath(ctx, transform, flyPts, '#E74C3C', 2.5)
        drawOrbitPath(ctx, transform, retPts, '#27AE60', 2.5)

        // Moon
        drawMoon(ctx, transform, mPos.x, mPos.y, R_MOON, 8)

        // Status label — positioned at top center of canvas, not overlapping anything
        const statusY = 24 * dpr
        const statusX = width * dpr / 2
        if (solverResult.hitsEarth) {
          drawLabel(ctx, 'Returns to Earth!', statusX, statusY, '#27AE60', 15 * dpr, 'center')
        } else if (solverResult.returnPerigeeAlt > 200e3) {
          drawLabel(ctx, 'Misses Earth — too shallow', statusX, statusY, '#E67E22', 15 * dpr, 'center')
        } else if (solverResult.returnPerigeeAlt < 0) {
          drawLabel(ctx, 'Too steep — hits the atmosphere', statusX, statusY, '#E74C3C', 15 * dpr, 'center')
        }

        // Turn angle — next to Moon, only at L3+
        if (level >= 3) {
          const [mx, my] = transform.toScreen(mPos.x, mPos.y)
          drawLabel(ctx, `δ = ${(solverResult.turnAngle * 180 / Math.PI).toFixed(1)}°`, mx, my + 20 * dpr, '#E74C3C', 12 * dpr, 'center')
        }
      } else {
        const statusX = width * dpr / 2
        drawLabel(ctx, 'No valid trajectory at these parameters', statusX, height * dpr / 2, '#E74C3C', 15 * dpr, 'center')
      }

      // Earth (on top)
      drawEarth(ctx, transform, R_EARTH, 10)

      // Legend
      if (level >= 3) {
        const lx = 15 * dpr
        let ly = height * dpr - 55 * dpr
        const drawLegendItem = (color: string, label: string) => {
          drawLine(ctx, lx, ly, lx + 20 * dpr, ly, color, 2.5 * dpr)
          drawLabel(ctx, label, lx + 25 * dpr, ly, '#555', 12 * dpr)
          ly += 18 * dpr
        }
        drawLegendItem('#2E86C1', 'Departure')
        drawLegendItem('#E74C3C', 'Lunar flyby')
        drawLegendItem('#27AE60', 'Return')
      }
    },
    [trajectory, level, showInertial]
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
          `turn: ${(solverResult.turnAngle * 180 / Math.PI).toFixed(1)}°`,
          mx - 10 * dpr, my + 24 * dpr,
          '#888', 10 * dpr, 'center'
        )

        // Eccentricity
        if (level >= 4) {
          drawLabel(
            ctx,
            `e = ${solverResult.flybyEccentricity.toFixed(3)}`,
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

      <LevelBlock level={3}>
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

      <LevelBlock level={4}>
        <p>
          Here is the key insight that makes the free return work: in
          the Moon's reference frame, the spacecraft's <em>speed</em> is
          unchanged by the flyby. The Moon's gravity can redirect the
          spacecraft — bend its path by a large angle — but it cannot
          add or remove speed relative to the Moon itself. So what is
          the trick? Changing the <em>direction</em> of the velocity
          vector in the Moon's frame changes its <em>magnitude</em> in
          Earth's frame. The spacecraft approaches from one direction
          and leaves in another; when you transform back to the
          Earth-centered frame, the speed relative to Earth is different.
          This frame transformation is the entire mechanism of the
          gravitational slingshot.
          <Sidenote number={6}>
            In April 1970, an oxygen tank exploded on Apollo 13,
            disabling the main engine. The crew survived because they
            were on a free-return trajectory. The Moon brought them home.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          The free-return trajectory is a three-body phenomenon that
          the patched-conic approximation captures remarkably well.
          The reason is geometric: the Moon's sphere of influence
          (~66,000 km) is small compared to the Earth-Moon distance
          (384,400 km), so the abrupt frame switch at the SOI boundary
          introduces only a small error. The deeper reason this
          trajectory exists at all is that gravity is conservative. The
          spacecraft's total energy is fixed after TLI. The frame
          transformations at the SOI boundaries reshuffle kinetic and
          potential energy between the Earth and Moon contributions but
          preserve the total. The return to Earth is not a fine-tuned
          miracle — it is a consequence of the energy level being high
          enough to reach the Moon but too low to escape.
          <Sidenote number={6}>
            Apollo 13 demonstrated the robustness of free-return
            trajectories. The Jacobi constant of the circular restricted
            three-body problem makes this precise: the energy level that
            permits passage from Earth's vicinity through the L1 neck
            to the Moon's vicinity also permits return. Small
            perturbations cannot close the neck.
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        Injection Δv:{' '}
        <ScrubableNumber
          initial={3060}
          min={2950}
          max={3150}
          step={1}
          sensitivity={3}
          precision={0}
          unit=" m/s"
          value={injectionDv}
          onChange={setInjectionDv}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={2950}
        max={3150}
        step={1}
        value={injectionDv}
        onChange={(e) => setInjectionDv(Number(e.target.value))}
      />

      <LevelBlock min={3}>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Flyby altitude: {flybyAlt > 0 ? flybyAlt.toLocaleString() : '—'} km
        </p>
      </LevelBlock>

      <InteractiveFigure height={550} render={renderMain} />

      <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
        <button
          onClick={() => setShowInertial(!showInertial)}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '0.4rem 1rem',
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            color: '#555',
            cursor: 'pointer',
          }}
        >
          {showInertial ? 'Show co-rotating frame (figure-8)' : 'Show inertial frame (teardrop)'}
        </button>
      </div>

      <LevelBlock min={2}>
        {showInertial ? (
          <p style={{ fontSize: '1.1rem', color: '#777', textAlign: 'center', fontStyle: 'italic' }}>
            <LevelText level={2}>
              This is what the path looks like from far away in space.
              The Moon is moving, so the path is not a figure-8 — it is
              more like a loop.
            </LevelText>
            <LevelText min={3}>
              Inertial frame: the Moon moves ~{'\u200B'}40° during transit.
              The same trajectory that looks like a figure-8 in the
              co-rotating frame looks like a teardrop when the Moon's
              orbital motion is included. Both are the same physics —
              just different perspectives.
            </LevelText>
          </p>
        ) : (
          <p style={{ fontSize: '1.1rem', color: '#777', textAlign: 'center', fontStyle: 'italic' }}>
            <LevelText level={2}>
              This view follows the Earth-Moon system as it moves.
              That is why the path looks like a figure-8.
            </LevelText>
            <LevelText min={3}>
              Co-rotating frame: the Earth-Moon line stays horizontal.
              NASA uses this view because it shows the mission geometry
              clearly — the figure-8 emerges from the flyby redirecting
              the spacecraft to the opposite side of the Earth-Moon line.
            </LevelText>
          </p>
        )}
      </LevelBlock>

      <h3>Flyby Detail</h3>
      <InteractiveFigure height={350} render={renderInset} />

      <LevelBlock min={3}>
        {trajectory ? (
          <p>
            {solverResult.hitsEarth ? (
              <>
                The return trajectory targets Earth with a perigee
                altitude of {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km —
                within the reentry corridor.
                {level >= 4 && <> Turn angle: {(solverResult.turnAngle * 180 / Math.PI).toFixed(1)}°.
                Hyperbolic eccentricity: {solverResult.flybyEccentricity.toFixed(3)}.</>}
              </>
            ) : solverResult.returnPerigeeAlt > 200e3 ? (
              <>
                The return trajectory misses Earth — perigee
                is {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km altitude,
                too high for atmospheric capture. Try a lower flyby altitude.
              </>
            ) : solverResult.returnPerigeeAlt < 0 ? (
              <>
                The return trajectory hits Earth too steeply (perigee
                below surface). The turn angle is too large. Try a higher
                flyby altitude.
              </>
            ) : (
              <>
                The return trajectory skims the atmosphere
                at {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km.
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
            {solverResult.hitsEarth ? (
              <>The spaceship comes back to Earth! That is the sweet spot!</>
            ) : solverResult.returnPerigeeAlt > 200e3 ? (
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
          The turn angle equation captures a competition between two
          effects. A faster approach (larger v<sub>∞</sub>) means the
          spacecraft spends less time in the Moon's gravity well, so it
          gets deflected less: higher speed, less bending. A closer pass
          (smaller r<sub>p</sub>) means stronger gravitational force
          along more of the trajectory: closer, more bending. The
          hyperbolic eccentricity encodes both in a single number.
          When <var>e</var> is close to 1, the turn angle approaches
          180° — a near-U-turn. When <var>e</var> is large, the Moon
          barely deflects the path.
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          In the circular restricted three-body problem, the Jacobi
          constant C<sub>J</sub> is the one quantity conserved in the
          rotating frame — it constrains where the spacecraft <em>can</em> go.
          The zero-velocity curves are the boundaries of the accessible
          region for a given C<sub>J</sub>. At low energy, Earth and
          Moon are surrounded by separate forbidden regions. At a
          critical energy level, the forbidden regions open a narrow
          neck near L1, and transfer becomes possible. The free-return
          trajectory exists just above this threshold: C<sub>J</sub> permits
          passage from Earth's vicinity through the neck to the Moon's
          vicinity and back. This is the deep reason the free return is
          a robust safety feature — it is not a knife-edge trajectory
          but a topological consequence of the energy level connecting
          the two regions.
        </p>
      </LevelBlock>
    </section>
  )
}
