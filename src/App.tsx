import { useState } from 'react'
import { Article } from './components/Article'
import { LevelSwitcher } from './components/LevelSwitcher'
import { LevelText, LevelBlock } from './components/LevelText'
import { MathBlock } from './components/MathBlock'
import { MathFrac } from './components/MathFrac'
import { ScrubableNumber } from './components/ScrubableNumber'
import { Sidenote } from './components/Sidenote'
import { LevelContext, useLevelState } from './hooks/useLevel'

export function App() {
  const levelState = useLevelState()
  const [velocity, setVelocity] = useState(7784)

  // Derived: semi-major axis from vis-viva (simplified, circular orbit at LEO)
  const mu = 3.986e14 // m^3/s^2
  const r = 6.571e6 // m (200 km altitude)
  const a = 1 / (2 / r - (velocity * velocity) / mu)
  const apoapsis = a > 0 ? (2 * a - r) / 1000 : Infinity // km

  return (
    <LevelContext.Provider value={levelState}>
      <LevelSwitcher />
      <Article>
        <h1>Artemis II</h1>
        <p className="subtitle">
          An explorable explanation of the orbital mechanics that bring four
          astronauts to the Moon and back
        </p>

        <section className="section">
          <LevelBlock level={1}>
            <p>
              Right now, four people are on the longest road trip in
              history — to the Moon and back! They left Earth three days
              ago on a giant rocket, and they are going to swing around
              the far side of the Moon without even stopping.
            </p>
          </LevelBlock>

          <LevelBlock level={2}>
            <p>
              Right now, four astronauts are traveling toward the Moon
              aboard the Orion spacecraft. They launched on April 1, 2026,
              and will fly around the Moon and return to Earth in about
              ten days total — using the Moon's gravity to come back home.
            </p>
          </LevelBlock>

          <LevelBlock min={3} max={4}>
            <p>
              Right now, as you read this, four astronauts are falling toward
              the Moon. They left Earth on April 1, 2026, aboard the Orion
              spacecraft, riding atop the most powerful rocket ever flown. In
              ten days, they will loop around the far side of the Moon and
              return home — without firing their engine once after the initial
              push.
            </p>
          </LevelBlock>

          <LevelBlock level={5}>
            <p>
              Right now, as you read this, four astronauts are falling toward
              the Moon on a free-return trajectory with a perilune of
              approximately 6,500 km. They left Earth on April 1, 2026,
              aboard Orion (CM-003), boosted by SLS Block 1 from LC-39B.
              After TLI via the ESM's AJ10 engine (Δv ≈ 388 m/s from the
              raised orbit), no further propulsive maneuvers are required
              for Earth return — the trajectory is energetically closed
              within the patched-conic approximation.
            </p>
          </LevelBlock>

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

        <section className="section">
          <h2>Orbits from First Principles</h2>

          <LevelBlock level={1}>
            <p>
              Imagine you are standing on a really, really tall mountain — so
              tall it pokes above all the air. You throw a ball sideways. It
              curves down and hits the ground. Throw harder — it goes farther.
              Now throw it <em>so hard</em> that the ground curves away
              underneath it as fast as the ball falls. Congratulations: your
              ball is in orbit!
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
              Newton's cannon is the canonical introduction to orbital
              mechanics, but the real insight is variational: the orbit
              emerges as a geodesic of the Lagrangian <var>L</var> = <var>T</var> − <var>V</var> in
              a central force field. In polar coordinates, the cyclic
              coordinate θ immediately yields conservation of angular
              momentum, and the radial equation gives the orbit equation
              directly via the Binet substitution. We will take the energy
              approach instead — it is more intuitive and leads to the
              vis-viva equation in one step.
              <Sidenote number={2}>
                Newton imagined this in the <em>Principia</em>. It took 270
                years to actually do it. The Lagrangian formulation came a
                century later.
              </Sidenote>
            </p>
          </LevelBlock>

          <p>
            <LevelText max={2}>
              The speed you throw the ball determines everything about its
              path. Try it — drag the number below to change the launch speed:
            </LevelText>
            <LevelText min={3}>
              The speed you start at determines the entire shape of your orbit.
              This single idea — that velocity dictates geometry — is captured
              by the vis-viva equation:
            </LevelText>
          </p>

          <LevelBlock min={3}>
            <MathBlock>
              <var>v</var><sup>2</sup> = <var>μ</var>
              <span style={{ margin: '0 0.2em' }}>(</span>
              <MathFrac num={<>2</>} den={<var>r</var>} />
              <span> − </span>
              <MathFrac num={<>1</>} den={<var>a</var>} />
              <span style={{ margin: '0 0.2em' }}>)</span>
            </MathBlock>
          </LevelBlock>

          <p>
            Launch velocity:{' '}
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

          <LevelBlock min={3}>
            <p>
              {velocity < 7784 ? (
                <>At this speed, the orbit intersects Earth's surface — suborbital.</>
              ) : velocity < 7834 ? (
                <>Nearly circular orbit — the cannonball circles the Earth.</>
              ) : velocity < 11009 ? (
                <>Elliptical orbit. Apoapsis: {apoapsis < 1e8 ? apoapsis.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '∞'} km from Earth's center.</>
              ) : (
                <>Escape velocity exceeded — the cannonball leaves Earth forever.</>
              )}
            </p>
          </LevelBlock>

          <LevelBlock max={2}>
            <p>
              {velocity < 7784 ? (
                <>The ball crashes back to Earth. Not fast enough!</>
              ) : velocity < 7834 ? (
                <>The ball goes all the way around! That is an orbit!</>
              ) : velocity < 11009 ? (
                <>The orbit is stretched into an oval shape — an ellipse.</>
              ) : (
                <>So fast it escapes Earth entirely! Goodbye, ball!</>
              )}
            </p>
          </LevelBlock>
        </section>

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
          </LevelBlock>

          <LevelBlock min={2} max={4}>
            <p>
              Here is the beautiful part. After the trans-lunar injection
              burn, the spacecraft follows a path that loops around the
              Moon's far side and returns to Earth{' '}
              <em>without any additional engine burn</em>. The Moon's gravity
              does all the redirection. This is called a free-return
              trajectory, and it is the ultimate safety feature.
            </p>
          </LevelBlock>

          <LevelBlock level={5}>
            <p>
              The free-return trajectory is a restricted three-body orbit
              that, within the patched-conic framework, decomposes into
              an Earth-departure ellipse, a lunar hyperbolic flyby, and
              an Earth-return ellipse. The critical constraint is that the
              return perigee falls within the atmospheric entry corridor
              (roughly 50–100 km altitude). The flyby altitude is the
              single free parameter that satisfies this constraint, given
              a fixed TLI state.
            </p>
          </LevelBlock>

          <p>
            <LevelText max={1}>
              The distance the spaceship flies past the Moon is the magic
              number. Too close, and it bends too much. Too far, and it
              does not bend enough.
            </LevelText>
            <LevelText min={2}>
              The flyby altitude is the critical parameter. Fly too close,
              and the Moon bends your path too much — you miss Earth on the
              return. Fly too far, and there is not enough bending.
            </LevelText>
            <Sidenote number={3}>
              In April 1970, an oxygen tank exploded on Apollo 13, disabling
              the main engine. The crew survived because they were on a
              free-return trajectory. The Moon brought them home.
            </Sidenote>
          </p>
        </section>

        <section className="section">
          <h3>What comes next</h3>
          <p>
            <LevelText max={2}>
              Below, you will build this whole trip from scratch! You will
              throw cannonballs, stretch orbits, sling around the Moon, and
              fly the real mission.
            </LevelText>
            <LevelText min={3}>
              Below, you will build this trajectory from scratch. You will
              start with Newton's cannon, learn why speed determines orbit
              shape, stretch an orbit to reach the Moon, watch the Moon's
              gravity bend a spacecraft's path, and finally scrub through
              the actual Artemis II mission timeline — ten days compressed
              into a slider.
            </LevelText>
          </p>
          <p>
            Every number you see{' '}
            <span className="scrubable" style={{ cursor: 'default', borderBottom: '1.5px dotted #2E86C1', color: '#2E86C1' }}>
              underlined like this
            </span>{' '}
            can be dragged to change its value. The visualizations update
            in real time. The panel on the right lets you switch between
            five levels of explanation.
          </p>
        </section>
      </Article>
    </LevelContext.Provider>
  )
}
