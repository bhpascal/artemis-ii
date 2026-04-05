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
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ marginTop: '1rem' }}>Artemis II</h1>
            <p className="subtitle">
              An explorable explanation of the orbital mechanics that bring four
              astronauts to the Moon and back
            </p>
          </div>
          <img
            src="/artemis-ii-patch.png"
            alt="Artemis II mission patch"
            style={{
              width: '120px',
              height: 'auto',
              marginTop: '1.5rem',
              opacity: 0.9,
              flexShrink: 0,
            }}
          />
        </header>

        <p style={{ fontSize: '1.1rem', color: '#888', fontStyle: 'italic', marginBottom: '2rem' }}>
          Use the panel on the right to switch between five explanation levels,
          from <em>Curious Kid</em> to <em>B.S. Physics</em>. Every number
          with a <span style={{ color: '#2E86C1', borderBottom: '1.5px dotted #2E86C1' }}>dotted underline</span> can
          be dragged to change its value.
        </p>

        <HookSection />
        <NewtonCannonSection />
        <TransferOrbitSection />
        <FreeReturnSection />
        <RealMissionSection />

        <footer className="section" style={{ marginTop: '4rem', borderTop: '1px solid #ddd', paddingTop: '2rem' }}>
          <p style={{ fontSize: '1.1rem', color: '#888' }}>
            An explorable explanation inspired by{' '}
            <a href="https://worrydream.com/LadderOfAbstraction/" target="_blank" rel="noopener noreferrer">
              Bret Victor
            </a>{' '}
            and{' '}
            <a href="https://explorabl.es" target="_blank" rel="noopener noreferrer">
              Nicky Case
            </a>.
            Orbital mechanics computed from first principles using the
            patched-conic approximation. Mission data from{' '}
            <a href="https://www.nasa.gov/artemis-ii-press-kit/" target="_blank" rel="noopener noreferrer">
              NASA's Artemis II press kit
            </a>.
          </p>
          <p style={{ fontSize: '0.95rem', color: '#aaa', marginTop: '0.5rem' }}>
            Every number you can drag is real physics. Every orbit is computed,
            not drawn. If you find an error, the equations are in the source.
          </p>
        </footer>
      </Article>
    </LevelContext.Provider>
  )
}
