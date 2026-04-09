import { useCallback, useMemo, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock } from '../components/LevelText'
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
  const [injectionDv, setInjectionDv] = useState(3142.5)
  const { level } = useLevel()

  const solverResult = useMemo(
    () => solve(injectionDv),
    [injectionDv]
  )

  const flybyAlt = solverResult.flybyAltitude >= 0
    ? Math.round(solverResult.flybyAltitude / 1000)
    : 0

  const trajectory = useMemo(
    () => solverResult.success
      ? renderTrajectory(solverResult)
      : null,
    [solverResult]
  )

  // Main canvas: full Earth-Moon system with 3 trajectory segments
  const renderMain = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      // Frame: Earth on the left, trajectory extends past the Moon
      transform.viewRadius = D_MOON * 1.1
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

        // Status label
        const statusY = 24 * dpr
        const statusX = width * dpr / 2
        if (solverResult.hitsEarth) {
          drawLabel(ctx, 'Returns to Earth!', statusX, statusY, '#27AE60', 15 * dpr, 'center')
        } else if (solverResult.returnPerigeeAlt > 200e3) {
          drawLabel(ctx, 'Misses Earth \u2014 too shallow', statusX, statusY, '#E67E22', 15 * dpr, 'center')
        } else if (solverResult.returnPerigeeAlt < 0) {
          drawLabel(ctx, 'Too steep \u2014 hits the atmosphere', statusX, statusY, '#E74C3C', 15 * dpr, 'center')
        }
      } else {
        const statusX = width * dpr / 2
        const msg = solverResult.error === 'Crashed into Earth'
          ? 'Too steep \u2014 crashes into Earth'
          : solverResult.error === 'Crashed into Moon'
          ? 'Direct hit on the Moon'
          : 'No valid trajectory at these parameters'
        drawLabel(ctx, msg, statusX, height * dpr / 2, '#E74C3C', 15 * dpr, 'center')
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
    [trajectory, level, solverResult]
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
          Try changing how fast the spaceship is launched:
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          After the trans-lunar injection burn, the spacecraft coasts
          toward the Moon. When it gets close, the Moon's gravity bends
          its path — like rolling a ball past a heavy bowling ball on a
          trampoline. If the launch speed is exactly right, the spacecraft
          swings around the Moon and heads straight back to Earth. No
          engine needed.
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
        <p>
          The trajectory below is computed from the circular restricted
          three-body problem at the real Earth-Moon mass ratio. The
          flyby altitude is wider than the real Artemis II (~6,500 km)
          because we are forcing the motion to lie in a single plane —
          the real mission uses a slightly inclined trans-lunar injection
          to tighten the geometry.
        </p>
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          The key insight behind the free return: in the Moon's reference
          frame, the spacecraft's <em>speed</em> is unchanged by the
          flyby. The Moon's gravity can redirect the spacecraft — bend
          its path by a large angle — but it cannot add or remove speed
          relative to the Moon itself. So what is the trick? Changing
          the <em>direction</em> of the velocity vector in the Moon's
          frame changes its <em>magnitude</em> in Earth's frame. The
          spacecraft approaches from one direction and leaves in another;
          when you transform back to the Earth-centered frame, the speed
          relative to Earth is different. This frame transformation is
          the entire mechanism of the gravitational slingshot.
          <Sidenote number={6}>
            In April 1970, an oxygen tank exploded on Apollo 13,
            disabling the main engine. The crew survived because they
            were on a free-return trajectory. The Moon brought them home.
          </Sidenote>
        </p>
        <p>
          The trajectory is integrated directly from Newton's laws in
          the circular restricted three-body problem — both Earth and
          Moon gravity act simultaneously, no patched-conic
          approximation. The only simplification is that the motion is
          constrained to a plane.
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
          <Sidenote number={6}>
            A note on dimensionality: a 2D planar CR3BP at the real
            mass ratio admits free-return solutions, but the flyby
            altitude is wider than Apollo or Artemis flew in reality.
            The missions exploit a slight out-of-plane component at
            TLI to sharpen the flyby geometry. Here we keep the motion
            strictly planar to make the mechanism visible.
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        Injection Δv:{' '}
        <ScrubableNumber
          initial={3142.5}
          min={3138}
          max={3143}
          step={0.1}
          sensitivity={8}
          precision={1}
          unit=" m/s"
          value={injectionDv}
          onChange={setInjectionDv}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={3138}
        max={3143}
        step={0.1}
        value={injectionDv}
        onChange={(e) => setInjectionDv(Number(e.target.value))}
      />

      <LevelBlock min={3}>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Flyby altitude: {flybyAlt > 0 ? flybyAlt.toLocaleString() : '\u2014'} km
        </p>
      </LevelBlock>

      <InteractiveFigure height={550} render={renderMain} />

      {/* TODO: inertial frame toggle — needs CR3BP→inertial coordinate rotation */}

      <h3>Flyby Detail</h3>
      <InteractiveFigure height={350} render={renderInset} />

      <LevelBlock min={3}>
        {trajectory ? (
          <p>
            {solverResult.hitsEarth ? (
              <>
                The return trajectory targets Earth with a perigee
                altitude of {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km —
                within the reentry corridor. Every meter per second of
                injection velocity shifts the return perigee by roughly
                100 km.
              </>
            ) : solverResult.returnPerigeeAlt > 200e3 ? (
              <>
                The return trajectory misses Earth — perigee
                is {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km altitude,
                too high for atmospheric capture. Try a different Δv.
              </>
            ) : solverResult.returnPerigeeAlt < 0 ? (
              <>
                The return trajectory hits Earth too steeply (perigee
                below the surface). The flyby geometry is wrong. Try
                a slightly different Δv.
              </>
            ) : (
              <>
                The return trajectory skims the atmosphere
                at {(solverResult.returnPerigeeAlt / 1000).toFixed(0)} km.
                Fine-tune Δv to target 50–200 km.
              </>
            )}
          </p>
        ) : (
          <p>
            {solverResult.error === 'Crashed into Earth'
              ? 'Too steep — the return trajectory crashes into Earth before it can establish a stable reentry. Back off the Δv a hair.'
              : 'No valid trajectory at these parameters. Try a different Δv.'}
          </p>
        )}
      </LevelBlock>

      <LevelBlock max={2}>
        {trajectory ? (
          <p>
            {solverResult.hitsEarth ? (
              <>The spaceship comes back to Earth! That is the sweet spot!</>
            ) : solverResult.returnPerigeeAlt > 200e3 ? (
              <>The spaceship misses Earth. Try a different launch speed.</>
            ) : (
              <>Too steep! The spaceship comes in too fast. Try a different launch speed.</>
            )}
          </p>
        ) : (
          <p>The orbit is not right. Try different settings.</p>
        )}
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          The free-return sensitivity is striking: a change of just a
          few meters per second in the injection velocity shifts the
          return perigee by hundreds of kilometers. This is why
          navigation precision at TLI matters more than propulsion
          precision — a small velocity error, left uncorrected for
          several days of coasting, accumulates into a large position
          error at reentry. Real missions budget a handful of small
          mid-course correction burns to tighten the return.
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
