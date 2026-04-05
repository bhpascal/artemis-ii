import { ViewTransform, drawCircle } from './canvas-utils'

/**
 * Draw Earth as a blue circle with a subtle radial gradient.
 * Enforces a minimum pixel radius so it is visible at any zoom level.
 */
export function drawEarth(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  physicalRadius: number,
  minPixelRadius: number = 6
): void {
  const [cx, cy] = transform.toScreen(0, 0)
  const dpr = transform.dpr
  let r = transform.toScreenSize(physicalRadius)
  if (r < minPixelRadius * dpr) r = minPixelRadius * dpr

  // Radial gradient: lighter center, deeper blue at edge
  const gradient = ctx.createRadialGradient(
    cx - r * 0.2, cy - r * 0.2, r * 0.1,
    cx, cy, r
  )
  gradient.addColorStop(0, '#6BB3E0')
  gradient.addColorStop(0.7, '#4A90D9')
  gradient.addColorStop(1, '#2E6AB0')

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
}

/**
 * Draw the Moon as a gray circle with subtle shading.
 */
export function drawMoon(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  physX: number,
  physY: number,
  physicalRadius: number,
  minPixelRadius: number = 4
): void {
  const [cx, cy] = transform.toScreen(physX, physY)
  const dpr = transform.dpr
  let r = transform.toScreenSize(physicalRadius)
  if (r < minPixelRadius * dpr) r = minPixelRadius * dpr

  const gradient = ctx.createRadialGradient(
    cx - r * 0.2, cy - r * 0.2, r * 0.1,
    cx, cy, r
  )
  gradient.addColorStop(0, '#D8D8D8')
  gradient.addColorStop(0.8, '#C0C0C0')
  gradient.addColorStop(1, '#A0A0A0')

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
}

/**
 * Draw a simple mountain peak on Earth's surface at the top.
 * Used in the Newton's Cannon visualization.
 */
export function drawMountain(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  earthRadius: number,
  mountainHeight: number
): void {
  const topY = earthRadius + mountainHeight
  const baseWidth = mountainHeight * 1.5

  const [peakX, peakY] = transform.toScreen(0, topY)
  const [leftX, leftY] = transform.toScreen(-baseWidth, earthRadius)
  const [rightX, rightY] = transform.toScreen(baseWidth, earthRadius)

  ctx.beginPath()
  ctx.moveTo(leftX, leftY)
  ctx.lineTo(peakX, peakY)
  ctx.lineTo(rightX, rightY)
  ctx.fillStyle = '#8B7355'
  ctx.fill()

  // Snow cap
  const snowFraction = 0.3
  const snowBaseY = earthRadius + mountainHeight * (1 - snowFraction)
  const snowWidth = baseWidth * snowFraction
  const [snowLeftX, snowLeftY] = transform.toScreen(-snowWidth, snowBaseY)
  const [snowRightX, snowRightY] = transform.toScreen(snowWidth, snowBaseY)

  ctx.beginPath()
  ctx.moveTo(snowLeftX, snowLeftY)
  ctx.lineTo(peakX, peakY)
  ctx.lineTo(snowRightX, snowRightY)
  ctx.fillStyle = '#F0EDE5'
  ctx.fill()
}

/**
 * Draw a cannon on top of the mountain, pointing right.
 */
export function drawCannon(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  earthRadius: number,
  mountainHeight: number
): void {
  const cannonY = earthRadius + mountainHeight
  const barrelLength = mountainHeight * 0.8
  const barrelWidth = mountainHeight * 0.15

  const [x1, y1] = transform.toScreen(0, cannonY + barrelWidth / 2)
  const [x2, y2] = transform.toScreen(barrelLength, cannonY + barrelWidth / 2)
  const [x3, y3] = transform.toScreen(barrelLength, cannonY - barrelWidth / 2)
  const [x4, y4] = transform.toScreen(0, cannonY - barrelWidth / 2)

  // Barrel
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fillStyle = '#444'
  ctx.fill()

  // Base circle
  const [baseX, baseY] = transform.toScreen(0, cannonY)
  const baseR = transform.toScreenSize(barrelWidth * 0.7)
  drawCircle(ctx, baseX, baseY, Math.max(baseR, 3 * transform.dpr), '#333')
}
