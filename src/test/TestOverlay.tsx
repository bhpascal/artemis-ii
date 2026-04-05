import { useEffect, useState } from 'react'
import { runPhysicsTests } from './physics-tests'

interface TestResult {
  name: string
  passed: boolean
  expected: string
  actual: string
}

export function TestOverlay() {
  const [results, setResults] = useState<TestResult[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('test') === '1') {
      setVisible(true)
      setResults(runPhysicsTests())
    }
  }, [])

  if (!visible) return null

  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const allPassed = passed === total

  return (
    <div style={{
      position: 'fixed',
      top: '1rem',
      left: '1rem',
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.92)',
      color: '#eee',
      padding: '1rem 1.25rem',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '12px',
      maxHeight: '80vh',
      overflowY: 'auto',
      maxWidth: '500px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    }}>
      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: allPassed ? '#27AE60' : '#E74C3C' }}>
          Physics Tests: {passed}/{total} passed
        </strong>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none',
            border: '1px solid #555',
            color: '#aaa',
            borderRadius: '4px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          close
        </button>
      </div>
      {results.map((r, i) => (
        <div key={i} style={{ marginBottom: '0.4rem', lineHeight: '1.4' }}>
          <span style={{ color: r.passed ? '#27AE60' : '#E74C3C', marginRight: '0.5em' }}>
            {r.passed ? '✓' : '✗'}
          </span>
          <span>{r.name}</span>
          {!r.passed && (
            <div style={{ marginLeft: '1.5em', color: '#E74C3C', fontSize: '11px' }}>
              Expected: {r.expected} | Got: {r.actual}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
