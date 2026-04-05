import type { Level } from '../types'
import { ViewTransform, drawLabel, drawLine } from './canvas-utils'

/**
 * Draw a level-aware annotation at a physical position.
 * Shows different text depending on the current explanation level.
 */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  physX: number,
  physY: number,
  texts: Partial<Record<Level, string>>,
  currentLevel: Level,
  options: {
    color?: string
    fontSize?: number
    align?: CanvasTextAlign
    offsetX?: number
    offsetY?: number
  } = {}
): void {
  // Find the best text: exact match, or closest lower level
  let text: string | undefined
  for (let l = currentLevel; l >= 1; l--) {
    if (texts[l as Level]) {
      text = texts[l as Level]
      break
    }
  }
  if (!text) return

  const {
    color = '#555',
    fontSize = 13,
    align = 'left',
    offsetX = 10,
    offsetY = 0,
  } = options

  const [sx, sy] = transform.toScreen(physX, physY)
  const dpr = transform.dpr

  drawLabel(
    ctx,
    text,
    sx + offsetX * dpr,
    sy + offsetY * dpr,
    color,
    fontSize * dpr,
    align
  )
}

/**
 * Draw a dimension line with a label — shows a distance measurement.
 */
export function drawDimensionLine(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  label: string,
  color: string = '#888'
): void {
  const [sx1, sy1] = transform.toScreen(fromX, fromY)
  const [sx2, sy2] = transform.toScreen(toX, toY)
  const dpr = transform.dpr

  drawLine(ctx, sx1, sy1, sx2, sy2, color, 1 * dpr, [4 * dpr, 4 * dpr])

  // Label at midpoint
  const mx = (sx1 + sx2) / 2
  const my = (sy1 + sy2) / 2
  drawLabel(ctx, label, mx, my - 8 * dpr, color, 11 * dpr, 'center')
}

/**
 * Draw a velocity annotation as a text label.
 */
export function drawVelocityLabel(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  physX: number,
  physY: number,
  velocity: number,
  currentLevel: Level
): void {
  if (currentLevel < 3) return

  const label = currentLevel >= 4
    ? `v = ${velocity.toFixed(1)} m/s`
    : `${(velocity / 1000).toFixed(1)} km/s`

  const [sx, sy] = transform.toScreen(physX, physY)
  const dpr = transform.dpr
  drawLabel(ctx, label, sx + 12 * dpr, sy - 12 * dpr, '#F39C12', 12 * dpr)
}
