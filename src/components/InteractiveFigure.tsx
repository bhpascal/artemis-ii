import { useCallback, useEffect, useState } from 'react'
import { useCanvasRenderer } from '../hooks/useCanvasRenderer'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'

interface InteractiveFigureProps {
  /** CSS pixel height */
  height?: number
  /** Render function called each frame */
  render: (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void
  /** Optional className for the wrapper */
  className?: string
  /** Accessible description of the visualization */
  ariaLabel?: string
}

/**
 * Canvas wrapper that spans into the sidenote margin.
 * Manages IntersectionObserver for viewport-based activation.
 */
export function InteractiveFigure({
  height = 500,
  render,
  className,
  ariaLabel,
}: InteractiveFigureProps) {
  const { ref: observerRef, isInView } = useIntersectionObserver(0.05)
  const [width, setWidth] = useState(740)

  // Measure the available width
  const measureWidth = useCallback(() => {
    const el = observerRef.current
    if (el) {
      setWidth(el.clientWidth)
    }
  }, [observerRef])

  useEffect(() => {
    measureWidth()
    window.addEventListener('resize', measureWidth)
    return () => window.removeEventListener('resize', measureWidth)
  }, [measureWidth])

  const canvasRef = useCanvasRenderer({
    width,
    height,
    isActive: isInView,
    render,
  })

  return (
    <div
      ref={observerRef}
      className={`full-width-figure ${className ?? ''}`}
      style={{ position: 'relative', height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        role="img"
        aria-label={ariaLabel ?? 'Interactive orbital mechanics visualization'}
      />
    </div>
  )
}
