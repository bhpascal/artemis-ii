/**
 * Coordinate transformation between physical space (meters, centered on body)
 * and canvas pixel space. Handles devicePixelRatio for retina displays.
 */
export class ViewTransform {
  /** Center of the view in physical coordinates */
  centerX: number = 0
  centerY: number = 0
  /** Half-width of the view in physical units (meters) */
  viewRadius: number = 1e7
  /** Canvas dimensions in CSS pixels */
  width: number = 740
  height: number = 500
  /** Device pixel ratio */
  dpr: number = 1

  /** Pixels per physical unit */
  get scale(): number {
    return Math.min(this.width, this.height) / (2 * this.viewRadius)
  }

  /** Convert physical coordinates to canvas pixel coordinates */
  toScreen(physX: number, physY: number): [number, number] {
    const s = this.scale
    const px = (physX - this.centerX) * s + this.width / 2
    // Flip Y: physical Y-up → canvas Y-down
    const py = -(physY - this.centerY) * s + this.height / 2
    return [px * this.dpr, py * this.dpr]
  }

  /** Convert canvas pixel coordinates to physical coordinates */
  toPhysical(px: number, py: number): [number, number] {
    const s = this.scale
    const physX = (px / this.dpr - this.width / 2) / s + this.centerX
    const physY = -(py / this.dpr - this.height / 2) / s + this.centerY
    return [physX, physY]
  }

  /** Convert a physical distance to screen pixels (for drawing sizes) */
  toScreenSize(physicalSize: number): number {
    return physicalSize * this.scale * this.dpr
  }
}

/** Set up a canvas for crisp retina rendering */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')!
  return ctx
}

/** Clear the canvas */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number
): void {
  ctx.clearRect(0, 0, width * dpr, height * dpr)
}

/** Draw a filled circle */
export function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/** Draw a line between two points */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number = 1,
  dash?: number[]
): void {
  ctx.beginPath()
  ctx.setLineDash(dash ?? [])
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.setLineDash([])
}

/** Draw an arrow from (x1,y1) to (x2,y2) */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number = 1.5,
  headSize: number = 8
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()

  // Arrowhead
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headSize * Math.cos(angle - Math.PI / 6),
    y2 - headSize * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    x2 - headSize * Math.cos(angle + Math.PI / 6),
    y2 - headSize * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/** Draw text label */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = '#555',
  fontSize: number = 13,
  align: CanvasTextAlign = 'left'
): void {
  ctx.font = `${fontSize}px "ET Book", Palatino, Georgia, serif`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}
