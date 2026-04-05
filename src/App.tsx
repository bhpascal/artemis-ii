import { Article } from './components/Article'
import { LevelSwitcher } from './components/LevelSwitcher'
import { LevelContext, useLevelState } from './hooks/useLevel'
import { HookSection } from './sections/HookSection'
import { NewtonCannonSection } from './sections/NewtonCannonSection'
import { TransferOrbitSection } from './sections/TransferOrbitSection'
import { FreeReturnSection } from './sections/FreeReturnSection'
import { RealMissionSection } from './sections/RealMissionSection'
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

        {/* Section 1: The Hook — real-time mission position */}
        <HookSection />

        {/* Section 2: Orbits from first principles */}
        <NewtonCannonSection />

        {/* Section 3: Reaching the Moon */}
        <TransferOrbitSection />

        {/* Section 4: The Free Return (centerpiece) */}
        <FreeReturnSection />

        {/* Section 5: The Real Artemis II */}
        <RealMissionSection />
      </Article>
    </LevelContext.Provider>
  )
}
