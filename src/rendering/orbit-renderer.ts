import { ViewTransform } from './canvas-utils'

/**
 * Draw an orbit path from an array of physical-coordinate points.
 * Handles both closed (ellipse) and open (hyperbola) paths.
 */
export function drawOrbitPath(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  points: ReadonlyArray<{ x: number; y: number }>,
  color: string,
  lineWidth: number = 2,
  dash?: number[]
): void {
  if (points.length < 2) return

  ctx.beginPath()
  ctx.setLineDash(dash ?? [])
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth * transform.dpr

  const [sx, sy] = transform.toScreen(points[0]!.x, points[0]!.y)
  ctx.moveTo(sx, sy)

  for (let i = 1; i < points.length; i++) {
    const [px, py] = transform.toScreen(points[i]!.x, points[i]!.y)
    ctx.lineTo(px, py)
  }

  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * Draw an orbit path, clipping segments that are below a certain radius
 * (i.e., inside a body like Earth). Used for suborbital trajectories.
 */
export function drawOrbitPathClipped(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  points: ReadonlyArray<{ x: number; y: number }>,
  minRadius: number,
  color: string,
  lineWidth: number = 2
): void {
  if (points.length < 2) return

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth * transform.dpr
  ctx.setLineDash([])

  let drawing = false

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!
    const r = Math.sqrt(pt.x * pt.x + pt.y * pt.y)

    if (r >= minRadius) {
      const [px, py] = transform.toScreen(pt.x, pt.y)
      if (!drawing) {
        ctx.beginPath()
        ctx.moveTo(px, py)
        drawing = true
      } else {
        ctx.lineTo(px, py)
      }
    } else {
      if (drawing) {
        ctx.stroke()
        drawing = false
      }
    }
  }

  if (drawing) {
    ctx.stroke()
  }
}

/**
 * Draw a small dot (spacecraft marker) at a physical position.
 */
export function drawSpacecraft(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  physX: number,
  physY: number,
  color: string = '#E74C3C',
  radius: number = 4
): void {
  const [sx, sy] = transform.toScreen(physX, physY)
  const r = radius * transform.dpr

  ctx.beginPath()
  ctx.arc(sx, sy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // Subtle glow
  ctx.beginPath()
  ctx.arc(sx, sy, r * 2, 0, Math.PI * 2)
  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba')
  ctx.fill()
}
