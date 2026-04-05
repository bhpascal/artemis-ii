import { type ReactNode, useId } from 'react'

interface SidenoteProps {
  number: number
  children: ReactNode
}

export function Sidenote({ number, children }: SidenoteProps) {
  const id = useId()

  return (
    <span className="sidenote-container">
      <sup className="sidenote-ref">{number}</sup>
      <label className="sidenote-toggle-label" htmlFor={id}>
        {number}
      </label>
      <input type="checkbox" id={id} className="sidenote-toggle" />
      <span className="sidenote">
        <sup className="sidenote-number">{number}</sup>{' '}
        {children}
      </span>
    </span>
  )
}
