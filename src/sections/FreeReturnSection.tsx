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
import { solveArenstorf } from '../physics/trajectory-solver'
import { renderArenstorfTrajectory } from '../physics/trajectory-renderer'
import { ViewTransform, drawLabel, drawLine } from '../rendering/canvas-utils'
import { drawEarth, drawMoon, drawStars } from '../rendering/body-renderer'
import { drawOrbitPath } from '../rendering/orbit-renderer'

export function FreeReturnSection() {
  const [perturbation, setPerturbation] = useState(0)
  const { level } = useLevel()

  const solverResult = useMemo(
    () => solveArenstorf(perturbation),
    [perturbation]
  )

  const flybyAlt = solverResult.flybyAltitude >= 0
    ? Math.round(solverResult.flybyAltitude / 1000)
    : 0

  const isPerfect = perturbation === 0

  const trajectory = useMemo(
    () => solverResult.success
      ? renderArenstorfTrajectory(solverResult)
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
      // Frame: center the Arenstorf figure-8 (extends ~1.2 D_MOON past Earth)
      transform.viewRadius = D_MOON * 1.35
      transform.centerX = -D_MOON * 0.1

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
        if (isPerfect) {
          drawLabel(ctx, 'Periodic orbit \u2014 perfect figure-eight', statusX, statusY, '#27AE60', 15 * dpr, 'center')
        } else if (solverResult.success) {
          drawLabel(ctx, 'Perturbed \u2014 orbit no longer closes', statusX, statusY, '#E67E22', 15 * dpr, 'center')
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
        drawLegendItem('#2E86C1', 'Outbound')
        drawLegendItem('#E74C3C', 'Lunar flyby')
        drawLegendItem('#27AE60', 'Return')
      }
    },
    [trajectory, level, isPerfect]
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
          This is a perfect figure-eight! A spaceship loops around
          the Earth, swings past the Moon, and comes right back —
          over and over, forever. The Moon's gravity does all the
          steering. No engine needed!
        </p>
        <p>
          Try nudging the speed to see what happens when it is
          not exactly right:
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          When the speed is exactly right, the spacecraft traces a
          perfect figure-eight, looping around Earth and Moon forever.
          This shape is called a free-return trajectory — the same
          kind of path that saved the Apollo 13 crew when their engine
          failed. Try changing the speed. Even a tiny change breaks
          the pattern!
        </p>
      </LevelBlock>

      <LevelBlock level={3}>
        <p>
          In 1963, mathematician Richard Arenstorf discovered that the
          three-body problem has exact periodic solutions — trajectories
          where a spacecraft traces a perfect figure-eight around the
          Earth and Moon, returning to its exact starting point. This
          free-return shape is the foundation of the Artemis II
          trajectory.
          <Sidenote number={6}>
            In April 1970, an oxygen tank exploded on Apollo 13,
            disabling the main engine. The crew survived because they
            were on a free-return trajectory. The Moon brought them home.
          </Sidenote>
        </p>
        <p>
          Try perturbing the velocity to see how sensitive this orbit
          is to initial conditions:
        </p>
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          The Arenstorf orbit is an exact periodic solution to the
          circular restricted three-body problem at the real Earth-Moon
          mass ratio {'\u03BC'} = 0.0123. Unlike the two-body problem, where
          all bound orbits are periodic, periodic orbits in the
          three-body problem are rare and fragile. This figure-eight
          closes after {'\u223C'}74 days. The slightest perturbation to the
          initial velocity breaks the periodicity — the trajectory
          diverges, never exactly repeating. This sensitivity is
          characteristic of chaotic dynamics in the three-body problem.
          <Sidenote number={6}>
            Apollo 13 exploited the robustness of the free-return
            shape even though it is not periodic from LEO. The
            Arenstorf orbit is the idealized version — the Platonic
            form of the free return.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          The Arenstorf orbit belongs to a family of periodic solutions
          in the CR3BP, discovered by numerical continuation from the
          two-body limit. It is a fixed point of the Poincar{'\u00E9'} return
          map on a surface of section crossing the Earth-Moon axis.
          The Jacobi constant C<sub>J</sub> constrains the accessible
          region but does not guarantee periodicity — that requires the
          orbit to satisfy the boundary-value problem of exact return.
          The perturbation slider lets you explore the neighborhood of
          this fixed point: small deviations grow, demonstrating the
          fundamental instability of three-body periodic orbits. The
          free-return trajectory used by Artemis II is not itself
          periodic (it starts from LEO), but it shadows this Arenstorf
          orbit during the critical translunar and flyby phases.
          <Sidenote number={6}>
            The Jacobi constant of this orbit sits just above the
            L1 threshold, permitting passage through the neck between
            Earth and Moon vicinities. This is the topological reason
            the free return works as a safety feature — the energy
            level that allows outbound passage also allows return.
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        Velocity perturbation:{' '}
        <ScrubableNumber
          initial={0}
          min={-30}
          max={30}
          step={0.5}
          sensitivity={3}
          precision={1}
          unit=" m/s"
          value={perturbation}
          onChange={setPerturbation}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={-30}
        max={30}
        step={0.5}
        value={perturbation}
        onChange={(e) => setPerturbation(Number(e.target.value))}
      />

      <LevelBlock min={3}>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Flyby altitude: {flybyAlt > 0 ? flybyAlt.toLocaleString() : '\u2014'} km
          {isPerfect && ' (periodic)'}
        </p>
      </LevelBlock>

      <InteractiveFigure height={550} render={renderMain} />

      {/* TODO: inertial frame toggle — needs CR3BP→inertial coordinate rotation */}

      <h3>Flyby Detail</h3>
      <InteractiveFigure height={350} render={renderInset} />

      <LevelBlock min={3}>
        {trajectory ? (
          <p>
            {isPerfect ? (
              <>
                At zero perturbation, this is the exact Arenstorf periodic
                orbit. The spacecraft returns to its starting point after
                one period — a perfect closed loop at the real Earth-Moon
                mass ratio. No mass enhancement, no approximations.
              </>
            ) : (
              <>
                The orbit no longer closes. A perturbation
                of {Math.abs(perturbation).toFixed(1)} m/s shifts the
                trajectory enough that it misses the starting point after
                one period. In the three-body problem, this sensitivity
                is the rule, not the exception.
              </>
            )}
          </p>
        ) : (
          <p>No valid trajectory at these parameters. Try a smaller perturbation.</p>
        )}
      </LevelBlock>

      <LevelBlock max={2}>
        {trajectory ? (
          <p>
            {isPerfect ? (
              <>The spaceship traces a perfect figure-eight! It comes back to exactly where it started.</>
            ) : (
              <>The path is not quite right anymore. See how even a tiny change messes up the orbit?</>
            )}
          </p>
        ) : (
          <p>The orbit crashed! Try a smaller change.</p>
        )}
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          The Arenstorf orbit demonstrates a deep feature of the
          three-body problem: periodic orbits are isolated and unstable.
          Unlike the two-body problem, where any initial condition on a
          bound orbit is periodic, here the slightest deviation from
          the exact initial conditions causes the trajectory to diverge.
          The figure-eight exists at a single precise velocity — it is
          a measure-zero set in the space of initial conditions.
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
