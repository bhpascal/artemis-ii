import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { DEFAULT_LEVEL, type Level } from '../types'

const STORAGE_KEY = 'artemis-ii-level'

function readStoredLevel(): Level {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const n = Number(stored)
      if (n >= 1 && n <= 5) return n as Level
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_LEVEL
}

interface LevelContextValue {
  level: Level
  setLevel: (level: Level) => void
}

export const LevelContext = createContext<LevelContextValue>({
  level: DEFAULT_LEVEL,
  setLevel: () => {},
})

export function useLevelState() {
  const [level, setLevelRaw] = useState<Level>(readStoredLevel)

  const setLevel = useCallback((newLevel: Level) => {
    setLevelRaw(newLevel)
    try {
      localStorage.setItem(STORAGE_KEY, String(newLevel))
    } catch {
      // localStorage unavailable
    }
    document.dispatchEvent(
      new CustomEvent('levelchange', { detail: { level: newLevel } })
    )
  }, [])

  // Dispatch initial level on mount so canvas controllers can read it
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent('levelchange', { detail: { level } })
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { level, setLevel }
}

export function useLevel(): LevelContextValue {
  return useContext(LevelContext)
}
