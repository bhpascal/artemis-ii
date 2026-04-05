/** Explanation levels from "Curious Kid" (1) to "B.S. Physics" (5) */
export type Level = 1 | 2 | 3 | 4 | 5

export const LEVEL_LABELS: Record<Level, string> = {
  1: 'Curious Kid',
  2: 'Middle School',
  3: 'HS Physics',
  4: 'Undergrad Physics',
  5: 'B.S. Physics',
}

export const DEFAULT_LEVEL: Level = 3

export interface ScrubableConfig {
  min: number
  max: number
  step: number
  /** Pixels of horizontal drag per one step increment */
  sensitivity: number
  /** Decimal places to display */
  precision: number
  /** Unit suffix to display after the number */
  unit?: string
}
