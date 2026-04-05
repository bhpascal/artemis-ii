import { useCallback, useState } from 'react'
import { InteractiveFigure } from '../components/InteractiveFigure'
import { LevelBlock, LevelText } from '../components/LevelText'
import { MathBlock } from '../components/MathBlock'
import { ScrubableNumber } from '../components/ScrubableNumber'
import { Sidenote } from '../components/Sidenote'
import { useLevel } from '../hooks/useLevel'
import {
  R_EARTH,
  MU_EARTH,
  D_MOON,
  R_MOON,
  R_LEO,
} from '../physics/constants'
import {
  circularVelocity,
  semiMajorAxis,
  eccentricityFromPeriapsis,
  ellipsePoints,
  apoapsis as computeApoapsis,
  orbitalPeriod,
} from '../physics/orbits'
import { ViewTransform, drawLabel } from '../rendering/canvas-utils'
import { drawEarth, drawMoon } from '../rendering/body-renderer'
import { drawOrbitPath } from '../rendering/orbit-renderer'

const V_CIRC_LEO = circularVelocity(MU_EARTH, R_LEO)

function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 10000) return `${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
  return `${(km / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k km`
}

function formatTime(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 48) return `${hours.toFixed(1)} hours`
  const days = hours / 24
  return `${days.toFixed(1)} days`
}

export function TransferOrbitSection() {
  const [deltaV, setDeltaV] = useState(0)
  const { level } = useLevel()

  const v = V_CIRC_LEO + deltaV
  const a = semiMajorAxis(MU_EARTH, R_LEO, v)
  const e = a > 0 ? Math.abs(eccentricityFromPeriapsis(a, R_LEO)) : 0
  const apoapsisR = a > 0 ? computeApoapsis(a, e) : Infinity
  const reachesMoon = apoapsisR >= D_MOON && isFinite(apoapsisR)
  const period = a > 0 && isFinite(a) ? orbitalPeriod(MU_EARTH, a) : Infinity
  const transferTime = period / 2 // half-period to reach apoapsis

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      const transform = new ViewTransform()
      transform.dpr = dpr
      transform.width = width
      transform.height = height
      transform.viewRadius = D_MOON * 1.3
      // Center slightly left so the orbit stretches rightward
      transform.centerX = D_MOON * 0.1

      // Moon's orbit as a dashed gray circle
      const moonOrbitPts = ellipsePoints(D_MOON, 0, 200)
      drawOrbitPath(ctx, transform, moonOrbitPts, '#CCCCCC', 1, [6 * dpr, 6 * dpr])

      // LEO circle (tiny at this scale, but shows as a ring around Earth)
      const leoPts = ellipsePoints(R_LEO, 0, 100)
      drawOrbitPath(ctx, transform, leoPts, '#666', 1)

      // Transfer orbit
      if (deltaV > 0 && a > 0 && isFinite(a) && e < 1) {
        const transferPts = ellipsePoints(a, e, 600)
        // Rotate so periapsis (at LEO) is on the left side (+x → right)
        // Actually periapsis is at nu=0 which is +x. We want it at the
        // Earth's position. Since Earth is at the focus (origin), and
        // periapsis at +x, the orbit extends rightward. That works.
        const color = reachesMoon ? '#27AE60' : '#E67E22'
        drawOrbitPath(ctx, transform, transferPts, color, 2)

        // Apoapsis marker
        if (isFinite(apoapsisR)) {
          const [apoX, apoY] = transform.toScreen(apoapsisR, 0)
          ctx.beginPath()
          ctx.arc(apoX, apoY, 4 * dpr, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()

          // Apoapsis label
          if (level >= 2) {
            const labelText = level >= 4
              ? `apoapsis: ${(apoapsisR / 1000).toFixed(0)} km`
              : `apoapsis: ${formatDistance(apoapsisR)}`
            drawLabel(ctx, labelText, apoX + 10 * dpr, apoY - 10 * dpr, color, 12 * dpr)
          }
          if (level <= 1 && reachesMoon) {
            drawLabel(ctx, 'Reaches the Moon!', apoX + 10 * dpr, apoY - 10 * dpr, '#27AE60', 13 * dpr)
          }
        }
      }

      // Draw Earth (will be tiny at this scale, min pixel radius kicks in)
      drawEarth(ctx, transform, R_EARTH, 8)

      // Draw Moon at the right side of its orbit
      drawMoon(ctx, transform, D_MOON, 0, R_MOON, 6)

      // Moon label
      const [moonLabelX, moonLabelY] = transform.toScreen(D_MOON, 0)
      drawLabel(ctx, 'Moon', moonLabelX + 10 * dpr, moonLabelY, '#888', 12 * dpr)

      // Earth label
      const [earthLabelX, earthLabelY] = transform.toScreen(0, 0)
      drawLabel(ctx, 'Earth', earthLabelX + 12 * dpr, earthLabelY + 12 * dpr, '#4A90D9', 12 * dpr)

      // Distance scale
      if (level >= 3) {
        const [scaleX1, scaleY] = transform.toScreen(0, -D_MOON * 0.95)
        const [scaleX2] = transform.toScreen(D_MOON, -D_MOON * 0.95)
        ctx.beginPath()
        ctx.setLineDash([3 * dpr, 3 * dpr])
        ctx.moveTo(scaleX1, scaleY)
        ctx.lineTo(scaleX2, scaleY)
        ctx.strokeStyle = '#aaa'
        ctx.lineWidth = 1 * dpr
        ctx.stroke()
        ctx.setLineDash([])
        drawLabel(ctx, '384,400 km', (scaleX1 + scaleX2) / 2, scaleY - 8 * dpr, '#aaa', 11 * dpr, 'center')
      }

      // "Reaches the Moon!" celebration annotation
      if (reachesMoon && level >= 2) {
        const [cx, cy] = transform.toScreen(D_MOON * 0.5, D_MOON * 0.6)
        drawLabel(ctx, 'Your orbit reaches the Moon!', cx, cy, '#27AE60', 14 * dpr, 'center')
      }
    },
    [deltaV, a, e, apoapsisR, reachesMoon, level]
  )

  return (
    <section className="section">
      <h2>Reaching the Moon</h2>

      <LevelBlock level={1}>
        <p>
          Now you have a spacecraft going around Earth in a circle. To
          reach the Moon, you fire the engine to go faster. The orbit
          stretches from a circle into an oval. The faster you go, the
          farther the oval reaches — like stretching a rubber band.
        </p>
      </LevelBlock>

      <LevelBlock level={2}>
        <p>
          A spacecraft in low Earth orbit is moving at about 7,800 m/s.
          To reach the Moon, 384,400 km away, the spacecraft speeds up.
          The orbit stretches from a circle into an ellipse — an oval
          shape. The more speed you add, the farther the ellipse reaches.
        </p>
      </LevelBlock>

      <LevelBlock min={3} max={4}>
        <p>
          A spacecraft in low Earth orbit at 200 km altitude moves
          at {V_CIRC_LEO.toFixed(0)} m/s — fast enough to circle the
          planet in 90 minutes. To reach the Moon, 384,400 km away, the
          spacecraft fires its engine to increase velocity. The orbit
          stretches from a circle into an ellipse whose apoapsis climbs
          with each additional m/s.
          <Sidenote number={4}>
            The ICPS upper stage first raised Orion's orbit to
            1,500 × 46,000 miles. The ESM then added just 388 m/s for
            the final push to lunar distance. Same total energy, different
            delivery schedule.
          </Sidenote>
        </p>
      </LevelBlock>

      <LevelBlock level={5}>
        <p>
          From LEO at r = {(R_LEO / 1000).toFixed(0)} km,
          v<sub>circ</sub> = {V_CIRC_LEO.toFixed(1)} m/s. The vis-viva
          equation gives us a direct map from Δv to apoapsis: after
          adding Δv at periapsis, the new semi-major
          axis <var>a</var> = 1/(2/<var>r</var> − <var>v</var>²/<var>μ</var>),
          and the apoapsis r<sub>a</sub> = 2<var>a</var> − <var>r</var>.
          Reaching lunar distance (384,400 km) requires
          Δv ≈ 3,130 m/s from LEO. Artemis II started from a
          higher orbit, needing only 388 m/s from the ESM.
          <Sidenote number={4}>
            The energy budget is path-independent: the total specific
            energy at TLI equals what a single 3,130 m/s burn from LEO
            would provide. The multi-burn strategy buys crew checkout
            time without spending extra propellant (the Oberth effect
            makes low-altitude burns slightly more efficient, but the
            difference is small for these orbit energies).
          </Sidenote>
        </p>
      </LevelBlock>

      <p>
        <LevelText max={2}>
          Drag to add speed and stretch the orbit toward the Moon:
        </LevelText>
        <LevelText min={3}>
          Add delta-v at periapsis and watch the transfer orbit grow:
        </LevelText>
      </p>

      <p>
        Delta-v:{' '}
        <ScrubableNumber
          initial={0}
          min={0}
          max={4000}
          step={10}
          sensitivity={3}
          precision={0}
          unit=" m/s"
          value={deltaV}
          onChange={setDeltaV}
        />
      </p>

      <input
        type="range"
        className="scrub-slider"
        min={0}
        max={4000}
        step={10}
        value={deltaV}
        onChange={(e) => setDeltaV(Number(e.target.value))}
      />

      <InteractiveFigure height={500} render={render} />

      <LevelBlock min={3}>
        <p>
          {deltaV === 0 ? (
            <>Drag the slider to add velocity. The orbit will stretch.</>
          ) : isFinite(apoapsisR) && !reachesMoon ? (
            <>
              Transfer orbit apoapsis: {formatDistance(apoapsisR)}.
              {level >= 3 && <> Transfer time to apoapsis: {formatTime(transferTime)}.</>}
              {' '}Keep adding delta-v to reach the Moon.
            </>
          ) : reachesMoon ? (
            <>
              Your orbit reaches {formatDistance(apoapsisR)} — past the
              Moon's distance of 384,400 km.
              {level >= 3 && <> The Hohmann transfer Δv from LEO is about 3,130 m/s.</>}
            </>
          ) : (
            <>Escape trajectory — the orbit is no longer bound to Earth.</>
          )}
        </p>
      </LevelBlock>

      <LevelBlock max={2}>
        <p>
          {deltaV === 0 ? (
            <>Drag the slider to stretch the orbit!</>
          ) : reachesMoon ? (
            <>The orbit reaches the Moon! That is how far you need to push.</>
          ) : (
            <>Keep going — the Moon is still far away!</>
          )}
        </p>
      </LevelBlock>

      <LevelBlock min={3}>
        <MathBlock>
          <var>r</var><sub>apoapsis</sub> = 2<var>a</var> − <var>r</var> ={' '}
          {isFinite(apoapsisR)
            ? `${(apoapsisR / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
            : '∞'}
        </MathBlock>
      </LevelBlock>

      <LevelBlock min={4}>
        <p>
          <LevelText level={4}>
            Notice that doubling the delta-v more than doubles the apoapsis.
            This is because the orbital energy scales as v², so each
            additional m/s contributes more energy at higher velocities —
            a consequence of the Oberth effect.
          </LevelText>
          <LevelText level={5}>
            The Oberth effect: Δε = v·Δv + Δv²/2. The first term
            dominates when v ≫ Δv. Burning at periapsis (high v)
            extracts more orbital energy per unit of propellant than
            burning at apoapsis (low v). This is why all major burns
            in mission design happen at periapsis. It is also why the
            Hohmann transfer is minimum-energy: it uses exactly two
            periapsis burns.
          </LevelText>
        </p>
      </LevelBlock>

      <p>
        <LevelText max={1}>
          We've been pretending the Moon just sits there and doesn't
          pull on us. But when the spacecraft gets close to the Moon,
          the Moon's gravity takes over. That is what happens next!
        </LevelText>
        <LevelText min={2}>
          <Sidenote number={5}>
            We've been pretending the Moon's gravity doesn't exist.
            That approximation breaks down at the Moon's sphere of
            influence — about 66,000 km from the Moon's center. What
            happens when we stop ignoring it is the subject of the
            next section.
          </Sidenote>
        </LevelText>
      </p>
    </section>
  )
}
