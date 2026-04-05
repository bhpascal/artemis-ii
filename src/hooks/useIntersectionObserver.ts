import { useEffect, useRef, useState } from 'react'

/**
 * Returns whether the referenced element is in the viewport.
 * Used to activate/deactivate canvas renderers for performance.
 */
export function useIntersectionObserver(
  threshold: number = 0.1
): { ref: React.RefObject<HTMLDivElement | null>; isInView: boolean } {
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsInView(entry.isIntersecting)
      },
      { threshold }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isInView }
}
