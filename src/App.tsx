import { Article } from './components/Article'
import { LevelSwitcher } from './components/LevelSwitcher'
import { LevelText, LevelBlock } from './components/LevelText'
import { Sidenote } from './components/Sidenote'
import { LevelContext, useLevelState } from './hooks/useLevel'
import { FreeReturnSection } from './sections/FreeReturnSection'
import { NewtonCannonSection } from './sections/NewtonCannonSection'
import { TransferOrbitSection } from './sections/TransferOrbitSection'
import { TestOverlay } from './test/TestOverlay'

export function App() {
  const levelState = useLevelState()

  return (
    <LevelContext.Provider value={levelState}>
      <TestOverlay />
      <LevelSwitcher />
      <Article>
        <h1>Artemis II</h1>
        <p className="subtitle">
          An explorable explanation of the orbital mechanics that bring four
          astronauts to the Moon and back
        </p>

        {/* Section 1: The Hook */}
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

        {/* Section 2: Newton's Cannon */}
        <NewtonCannonSection />

        {/* Section 3: Transfer Orbits */}
        <TransferOrbitSection />

        {/* Section 4: The Free Return */}
        <FreeReturnSection />
      </Article>
    </LevelContext.Provider>
  )
}
