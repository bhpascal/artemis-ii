import { type ReactNode } from 'react'
import { useLevel } from '../hooks/useLevel'
import type { Level } from '../types'

interface LevelTextProps {
  /** Show only at this exact level */
  level?: Level
  /** Show at this level and above */
  min?: Level
  /** Show at this level and below */
  max?: Level
  children: ReactNode
}

/**
 * Conditionally renders children based on the active explanation level.
 * All variants stay in the DOM for instant switching — CSS handles visibility.
 */
export function LevelText({ level: exactLevel, min, max, children }: LevelTextProps) {
  const { level: activeLevel } = useLevel()

  let visible = true
  if (exactLevel !== undefined) {
    visible = activeLevel === exactLevel
  } else {
    if (min !== undefined) visible = visible && activeLevel >= min
    if (max !== undefined) visible = visible && activeLevel <= max
  }

  return (
    <span
      className={`level-text ${visible ? 'level-text-visible' : 'level-text-hidden'}`}
      aria-hidden={!visible}
    >
      {children}
    </span>
  )
}

/**
 * Block-level version for paragraphs and equation blocks.
 */
export function LevelBlock({ level: exactLevel, min, max, children }: LevelTextProps) {
  const { level: activeLevel } = useLevel()

  let visible = true
  if (exactLevel !== undefined) {
    visible = activeLevel === exactLevel
  } else {
    if (min !== undefined) visible = visible && activeLevel >= min
    if (max !== undefined) visible = visible && activeLevel <= max
  }

  return (
    <div
      className={`level-block ${visible ? 'level-block-visible' : 'level-block-hidden'}`}
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}
