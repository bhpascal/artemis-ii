import { type ReactNode } from 'react'
import '../styles/interactive.css'

interface MathFracProps {
  num: ReactNode
  den: ReactNode
}

/** Inline fraction using flex layout — numerator over denominator with a thin rule */
export function MathFrac({ num, den }: MathFracProps) {
  return (
    <span className="math-frac">
      <span className="math-frac-num">{num}</span>
      <span className="math-frac-den">{den}</span>
    </span>
  )
}
