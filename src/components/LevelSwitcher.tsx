import { useCallback, useRef } from 'react'
import { useLevel } from '../hooks/useLevel'
import { LEVEL_LABELS, LEVEL_SHORT, type Level } from '../types'
import '../styles/level-switcher.css'

const LEVELS: Level[] = [1, 2, 3, 4, 5]

export function LevelSwitcher() {
  const { level, setLevel } = useLevel()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = LEVELS.indexOf(level)
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        if (idx > 0) setLevel(LEVELS[idx - 1]!)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (idx < LEVELS.length - 1) setLevel(LEVELS[idx + 1]!)
      }
    },
    [level, setLevel]
  )

  return (
    <div
      className="level-switcher"
      ref={containerRef}
      role="radiogroup"
      aria-label="Explanation level"
      onKeyDown={handleKeyDown}
    >
      <div className="level-switcher-header">Explanation Level</div>
      {LEVELS.map((l) => (
        <button
          key={l}
          className={`level-switcher-btn ${l === level ? 'active' : ''}`}
          role="radio"
          aria-checked={l === level}
          aria-label={LEVEL_LABELS[l]}
          tabIndex={l === level ? 0 : -1}
          title={LEVEL_LABELS[l]}
          onClick={() => setLevel(l)}
        >
          <span className="level-switcher-indicator" />
          <span className="level-switcher-label">{LEVEL_LABELS[l]}</span>
          <span className="level-switcher-short">{LEVEL_SHORT[l]}</span>
        </button>
      ))}
    </div>
  )
}
