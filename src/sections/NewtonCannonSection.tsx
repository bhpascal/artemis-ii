import { useCallback, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock, LevelText } from '../components/LevelText'
import { MathBlock } from '../components/MathBlock'
import { MathFrac } from '../components/MathFrac'
import { ScrubableNumber } from '../components/ScrubableNumber'
import { Sidenote } from '../components/Sidenote'
import { useLevel } from '../hooks/useLevel'
import { R_EARTH, MU_EARTH } from '../physics/constants'
import {
  circularVelocity,
  escapeVelocity,
  semiMajorAxis,
  eccentricityFromPeriapsis,
  ellipsePoints,
  hyperbolaPoints,
  apoapsis,
} from '../physics/orbits'
import { ViewTransform } from '../rendering/canvas-utils'
import { drawEarth, drawMountain, drawCannon } from '../rendering/body-renderer'
import { drawOrbitPathClipped } from '../rendering/orbit-renderer'
import { drawAnnotation, drawVelocityLabel } from '../rendering/annotation-renderer'
import type { Level } from '../types'

const MOUNTAIN_HEIGHT = 200e3 // 200 km — above the atmosphere
const CANNON_R = R_EARTH + MOUNTAIN_HEIGHT
const V_CIRC = circularVelocity(MU_EARTH, CANNON_R)
const V_ESC = escapeVelocity(MU_EARTH, CANNON_R)

/** Orbit color based on velocity regime */
function orbitColor(v: number): string {
  if (v < V_CIRC * 0.998) return '#E74C3C'       // suborbital — red
  if (v < V_CIRC * 1.002) return '#27AE60'       // circular — green
  if (v < V_ESC * 0.999) return '#E67E22'         // elliptical — orange
  if (v < V_ESC * 1.001) return '#2E86C1'         // parabolic — blue
  return '#8E44AD'                                  // hyperbolic — purple
}

/** Orbit type label */
function orbitLabel(v: number, level: Level): string {
  if (v < V_CIRC * 0.998) {
    if (level <= 2) return 'Crashes back to Earth!'
    return 'Suborbital — hits the surface'
  }
  if (v < V_CIRC * 1.002) {
    if (level <= 2) return 'Perfect circle! An orbit!'
    return 'Circular orbit'
  }
  if (v < V_ESC * 0.999) {
    const a = semiMajorAxis(MU_EARTH, CANNON_R, v)
    const e = eccentricityFromPeriapsis(a, CANNON_R)
    const apoKm = apoapsis(a, e) / 1000
    if (level <= 2) return `Oval orbit — reaches ${(apoKm / 1000).toFixed(0)}k km out`
    if (level >= 4) return `Elliptical: a = ${(a / 1000).toFixed(0)} km, e = ${e.toFixed(3)}`
    return `Elliptical orbit — apoapsis ${apoKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
  }
  if (v < V_ESC * 1.001) {
    if (level <= 2) return 'Just barely escapes!'
    return 'Escape velocity — parabolic trajectory'
  }
  if (level <= 2) return 'Gone forever!'
  return 'Hyperbolic escape'
}

export function NewtonCannonSection() {
  const [velocity, setVelocity] = useState(7784)
  const { level } = useLevel()

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height

      // Position Earth at center-bottom: offset center downward
      const viewRadius = R_EARTH * 2.2
      transform.viewRadius = viewRadius
      transform.centerY = -R_EARTH * 0.6

      // Compute orbit
      const v = velocity
      const color = orbitColor(v)

      if (v > V_ESC * 1.001) {
        // Hyperbolic — cannon is at periapsis, rotate periapsis to top (+y)
        const a = semiMajorAxis(MU_EARTH, CANNON_R, v)
        const e = 1 - CANNON_R / a // a is negative for hyperbola, e > 1
        const pts = hyperbolaPoints(a, e, undefined, 300)
        // Rotate so periapsis (nu=0, +x) goes to +y (top)
        const rotated = pts.map((p) => ({ x: -p.y, y: p.x }))
        drawOrbitPathClipped(ctx, transform, rotated, R_EARTH, color, 2)
      } else if (v > V_CIRC * 0.5) {
        const a = semiMajorAxis(MU_EARTH, CANNON_R, v)
        const e = Math.abs(eccentricityFromPeriapsis(a, CANNON_R))
        const pts = ellipsePoints(a, e, 600)

        // For v >= v_circ: cannon is at periapsis → rotate periapsis to +y (top)
        // For v < v_circ: cannon is at apoapsis → rotate apoapsis to +y (top)
        const rotated = v >= V_CIRC
          ? pts.map((p) => ({ x: -p.y, y: p.x }))   // periapsis to +y
          : pts.map((p) => ({ x: p.y, y: -p.x }))    // apoapsis to +y

        drawOrbitPathClipped(ctx, transform, rotated, R_EARTH, color, 2)
      }

      // Draw Earth on top of trajectory
      drawEarth(ctx, transform, R_EARTH, 40)

      // Mountain and cannon
      drawMountain(ctx, transform, R_EARTH, MOUNTAIN_HEIGHT)
      drawCannon(ctx, transform, R_EARTH, MOUNTAIN_HEIGHT)

      // Cannonball at launch position
      const [ballX, ballY] = transform.toScreen(MOUNTAIN_HEIGHT * 0.8, CANNON_R)
      ctx.beginPath()
      ctx.arc(ballX, ballY, 3 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#333'
      ctx.fill()

      // Annotations
      const label = orbitLabel(v, level)
      drawAnnotation(ctx, transform, 0, R_EARTH * 1.8, {
        1: label,
        2: label,
        3: label,
        4: label,
        5: label,
      }, level, { align: 'center', offsetX: 0, offsetY: 0, fontSize: 14, color: color })

      // Velocity readout at Level 3+
      if (level >= 3) {
        drawVelocityLabel(ctx, transform, MOUNTAIN_HEIGHT * 0.8, CANNON_R, v, level)
      }

      // Reference velocity markers
      if (level >= 3) {
        const markerY = -R_EARTH * 1.3
        drawAnnotation(ctx, transform, -R_EARTH * 1.2, markerY, {
          3: `v_circ = ${V_CIRC.toFixed(0)} m/s`,
          4: `v_circular = ${V_CIRC.toFixed(1)} m/s`,
          5: `v_c = √(μ/r) = ${V_CIRC.toFixed(1)} m/s`,
        }, level, { fontSize: 11, color: '#27AE60' })

        drawAnnotation(ctx, transform, -R_EARTH * 1.2, markerY - R_EARTH * 0.15, {
          3: `v_esc = ${V_ESC.toFixed(0)} m/s`,
          4: `v_escape = ${V_ESC.toFixed(1)} m/s`,
          5: `v_e = √(2μ/r) = ${V_ESC.toFixed(1)} m/s`,
        }, level, { fontSize: 11, color: '#2E86C1' })
      }
    },
    [velocity, level]
  )

  return (
    <section className="section">
      <h2>Orbits from First Principles</h2>

      <LevelBlock level={1}>
        <p>
          Imagine you are standing on a really, really tall mountain — so
          tall it pokes above all the air. You throw a ball sideways. It
          curves down and hits the ground. Throw harder — it goes farther.
          Now throw it <em>so hard</em> that the ground curves away
          underneath it as fast as the ball falls. Your ball is in orbit!
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          Isaac Newton imagined a cannon on a very high mountain. If you
          fire the cannonball slowly, it falls and hits the ground. Fire
          it faster, and it goes farther before landing. At about 7,800
          meters per second, the cannonball falls at the same rate the
          Earth curves away — and it never lands. That is a circular orbit.
        </p>
      </LevelBlock>

      <LevelBlock min={3} max={4}>
        <p>
          In 1687, Isaac Newton proposed a thought experiment. Imagine a
          cannon on a very tall mountain, high above the atmosphere. Fire
          the cannonball horizontally. At low speed, it arcs to the ground.
          Fire faster — it travels farther before hitting. Fire fast enough,
          and the Earth curves away beneath it as fast as it falls. The
          cannonball is in orbit.
          <Sidenote number={2}>
            Newton imagined this in the <em>Principia</em>. It took 270
            years to actually do it.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          Newton's cannon is the canonical introduction, but the deeper
          insight is variational: the orbit emerges from the
          Lagrangian <var>L</var> = <var>T</var> − <var>V</var> in polar
          coordinates. The cyclic coordinate θ immediately yields angular
          momentum conservation; the radial equation gives the orbit
          equation via the Binet substitution. We take the energy approach
          instead — it leads directly to the vis-viva equation.
          <Sidenote number={2}>
            Newton's <em>Principia</em> (1687) used geometric arguments.
            The Lagrangian formulation came a century later with Euler and
            Lagrange. Both arrive at the same orbits.
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        <LevelText max={2}>
          Drag the number to change how fast the cannon fires:
        </LevelText>
        <LevelText min={3}>
          The launch speed determines the orbit. Drag the velocity:
        </LevelText>
      </p>

      <p>
        Cannonball velocity:{' '}
        <ScrubableNumber
          initial={7784}
          min={5000}
          max={12000}
          step={50}
          sensitivity={5}
          precision={0}
          unit=" m/s"
          value={velocity}
          onChange={setVelocity}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={5000}
        max={12000}
        step={50}
        value={velocity}
        onChange={(e) => setVelocity(Number(e.target.value))}
      />

      <InteractiveFigure height={500} render={render} />

      <LevelBlock min={3}>
        <p>
          <LevelText min={3} max={3}>
            This relationship between speed and orbit shape is the vis-viva
            equation — the fundamental equation of orbital mechanics:
          </LevelText>
          <LevelText level={4}>
            The vis-viva equation follows directly from conservation of
            energy. Total specific energy (kinetic + potential) is constant
            along any Keplerian orbit:
          </LevelText>
          <LevelText level={5}>
            Vis-viva is the first integral of the two-body problem. From
            the specific energy ε = v²/2 − μ/r = −μ/(2a), we get:
          </LevelText>
        </p>

        <MathBlock>
          <var>v</var><sup>2</sup> = <var>μ</var>
          <span style={{ margin: '0 0.15em' }}>(</span>
          <MathFrac num={<>2</>} den={<var>r</var>} />
          <span> − </span>
          <MathFrac num={<>1</>} den={<var>a</var>} />
          <span style={{ margin: '0 0.15em' }}>)</span>
        </MathBlock>
      </LevelBlock>

      <LevelBlock level={4}>
        <p>
          Where <var>a</var> is the semi-major axis. For a circular
          orbit, <var>r</var> = <var>a</var>, so <var>v</var> = √(<var>μ</var>/<var>r</var>).
          For escape, <var>a</var> → ∞,
          so <var>v</var> = √(2<var>μ</var>/<var>r</var>) — exactly √2
          times the circular velocity.
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          The ratio <var>v</var><sub>esc</sub>/<var>v</var><sub>circ</sub> = √2
          is geometry-independent: it holds at any altitude, for any central
          body. It is a consequence of the virial theorem for 1/r² forces.
          The factor √2 also appears as the ratio of the escape energy
          to the circular orbit energy, connecting to the
          Tisserand parameter used in three-body dynamics.
        </p>
      </LevelBlock>
    </section>
  )
}
