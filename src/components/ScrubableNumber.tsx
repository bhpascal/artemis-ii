import { useCallback } from 'react'
import { useScrubable } from '../hooks/useScrubable'
import type { ScrubableConfig } from '../types'
import '../styles/interactive.css'

interface ScrubableNumberProps extends ScrubableConfig {
  initial: number
  onChange?: (value: number) => void
  /** External value for bidirectional sync (e.g., from a linked slider) */
  value?: number
}

export function ScrubableNumber({
  initial,
  min,
  max,
  step,
  sensitivity,
  precision,
  unit,
  onChange,
  value: externalValue,
}: ScrubableNumberProps) {
  const { value, setValue, bind, scrubbing } = useScrubable({
    initial,
    min,
    max,
    step,
    sensitivity,
    precision,
    onChange: (v) => {
      onChange?.(v)
    },
  })

  // If external value is provided (e.g., from a slider), use it
  const displayValue = externalValue ?? value

  // Sync external value changes back into the hook
  if (externalValue !== undefined && externalValue !== value) {
    setValue(externalValue)
  }

  // Keyboard support: arrow keys to increment/decrement
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const newVal = Math.min(max, displayValue + step)
      setValue(newVal)
      onChange?.(newVal)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const newVal = Math.max(min, displayValue - step)
      setValue(newVal)
      onChange?.(newVal)
    }
  }, [displayValue, min, max, step, setValue, onChange])

  const formatted = displayValue.toFixed(precision)

  return (
    <span
      className={`scrubable ${scrubbing ? 'scrubbing' : ''}`}
      tabIndex={0}
      role="slider"
      aria-valuenow={displayValue}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={`${formatted}${unit ?? ''}`}
      onKeyDown={handleKeyDown}
      {...bind}
    >
      {formatted}{unit ? <span className="scrubable-unit">{unit}</span> : null}
    </span>
  )
}
