import { useCallback, useEffect, useRef } from 'react'
import { setupCanvas, clearCanvas } from '../rendering/canvas-utils'

interface UseCanvasRendererOptions {
  /** CSS pixel width */
  width: number
  /** CSS pixel height */
  height: number
  /** Whether the canvas is active (in viewport) */
  isActive: boolean
  /** The render function called each frame */
  render: (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void
}

export function useCanvasRenderer({
  width,
  height,
  isActive,
  render,
}: UseCanvasRendererOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const renderRef = useRef(render)
  renderRef.current = render

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    clearCanvas(ctx, width, height, dpr)
    renderRef.current(ctx, width, height, dpr)
  }, [width, height])

  // Set up canvas dimensions
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setupCanvas(canvas, width, height)
    draw()
  }, [width, height, draw])

  // Animation loop
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const loop = () => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, draw])

  // Redraw on render prop change (e.g., parameter change)
  useEffect(() => {
    if (!isActive) draw() // still draw once even if not animating
  })

  return canvasRef
}
