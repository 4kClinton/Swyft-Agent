"use client"

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"

/**
 * Lightweight scroll-reveal. Fades + lifts its children into place the first
 * time they enter the viewport. Zero dependencies, and it fully respects
 * `prefers-reduced-motion` (no transform/opacity animation when reduced).
 */
export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
  y = 16,
}: {
  children: ReactNode
  as?: ElementType
  className?: string
  /** stagger delay in ms */
  delay?: number
  /** distance to travel up, in px */
  y?: number
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            observer.disconnect()
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transition: `opacity 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  )
}
