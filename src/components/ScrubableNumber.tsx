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

  const formatted = displayValue.toFixed(precision)

  return (
    <span
      className={`scrubable ${scrubbing ? 'scrubbing' : ''}`}
      {...bind}
    >
      {formatted}{unit ? <span className="scrubable-unit">{unit}</span> : null}
    </span>
  )
}
