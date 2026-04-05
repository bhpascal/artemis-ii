import { type ReactNode } from 'react'
import '../styles/interactive.css'

interface MathBlockProps {
  children: ReactNode
}

/** Centered equation display — like a displayed math environment */
export function MathBlock({ children }: MathBlockProps) {
  return (
    <div className="math-block" role="math">
      {children}
    </div>
  )
}
