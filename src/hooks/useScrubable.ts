import { useCallback, useRef, useState } from 'react'
import type { ScrubableConfig } from '../types'

interface UseScrubableOptions extends ScrubableConfig {
  initial: number
  onChange?: (value: number) => void
}

interface ScrubableBindings {
  onPointerDown: (e: React.PointerEvent) => void
  style: React.CSSProperties
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function snap(value: number, step: number, min: number): number {
  return Math.round((value - min) / step) * step + min
}

export function useScrubable(options: UseScrubableOptions): {
  value: number
  setValue: (v: number) => void
  bind: ScrubableBindings
  scrubbing: boolean
} {
  const { min, max, step, sensitivity, initial, onChange } = options
  const [value, setValueRaw] = useState(initial)
  const [scrubbing, setScrubbing] = useState(false)

  const startX = useRef(0)
  const startValue = useRef(0)

  const setValue = useCallback(
    (v: number) => {
      const clamped = clamp(snap(v, step, min), min, max)
      setValueRaw(clamped)
      onChange?.(clamped)
    },
    [min, max, step, onChange]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const dx = e.clientX - startX.current
      const steps = dx / sensitivity
      const newValue = startValue.current + steps * step
      const clamped = clamp(snap(newValue, step, min), min, max)
      setValueRaw(clamped)
      onChange?.(clamped)
    },
    [min, max, step, sensitivity, onChange]
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const target = e.target as Element | null
      target?.releasePointerCapture(e.pointerId)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      setScrubbing(false)
    },
    [handlePointerMove]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      startX.current = e.clientX
      startValue.current = value
      setScrubbing(true)
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [value, handlePointerMove, handlePointerUp]
  )

  return {
    value,
    setValue,
    bind: {
      onPointerDown,
      style: { cursor: 'col-resize', touchAction: 'none' },
    },
    scrubbing,
  }
}
