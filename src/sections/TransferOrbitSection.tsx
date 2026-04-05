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
        // ellipsePoints puts periapsis at +x. We need apoapsis at +x
        // (toward the Moon). Rotate 180° so apoapsis points right.
        const rotated = transferPts.map((p) => ({ x: -p.x, y: -p.y }))
        const color = reachesMoon ? '#27AE60' : '#E67E22'
        drawOrbitPath(ctx, transform, rotated, color, 2)

        // Apoapsis marker (now correctly at +x)
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
          The transfer orbit problem is fundamentally about energy
          budgets. A Hohmann transfer — two tangential burns at
          periapsis and apoapsis — is the minimum-energy two-impulse
          transfer between coplanar circular orbits. But Artemis II
          does not use a Hohmann transfer, because the Moon is not a
          parking orbit to circularize into. The free-return trajectory
          requires slightly higher TLI energy (the excess ensures the
          correct flyby geometry). The multi-burn approach — ICPS
          raises the orbit, then ESM performs TLI — is energetically
          equivalent to a single burn from LEO, but buys the crew time
          for systems checkout in a regime where an abort to Earth is
          still straightforward.
          <Sidenote number={4}>
            Conservation of energy does not care about the delivery
            schedule. The total specific energy at TLI equals what a
            single 3,130 m/s burn from LEO would provide.
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
          max={3500}
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
        max={3500}
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
            Notice the asymmetry: the same Δv produces a much larger
            orbit change when applied at periapsis than at apoapsis.
            This is the Oberth effect. Kinetic energy goes
            as <var>v</var>², so adding 100 m/s to a spacecraft already
            moving at 7,000 m/s adds far more kinetic energy than adding
            100 m/s to one moving at 1,000 m/s. The rocket does not care
            how fast it is already going — it produces the same Δv from
            the same fuel. But the orbit does care, because orbital energy
            depends on <var>v</var>², not <var>v</var>.
          </LevelText>
          <LevelText level={5}>
            The Oberth effect is visible in the vis-viva equation's
            structure: Δε = <var>v</var>·Δ<var>v</var> + Δ<var>v</var>²/2.
            Watch the interactive as the orbit approaches lunar distance:
            the apoapsis becomes increasingly sensitive to small changes
            in Δv. This is also where the patched-conic approximation
            begins to strain — the real trajectory transitions smoothly
            from Earth-dominated to Moon-influenced, but our model
            switches instantaneously at the sphere of influence boundary.
            The discontinuity is small (the Moon's SOI subtends only
            ~17% of the Earth-Moon distance), which is why patched conics
            works — but the error concentrates exactly where the physics
            is most interesting.
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
