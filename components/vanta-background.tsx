"use client"

import { useEffect, useRef } from "react"

/**
 * Animated Vanta "topology" backdrop. Renders a fixed, full-bleed canvas
 * behind whatever it wraps. Topology requires p5.js (loaded dynamically so it
 * never runs on the server) and is initialised once on mount.
 */
export function VantaBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let effect: { destroy?: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const p5 = (await import("p5")).default
      // Vanta's topology effect reads p5 off the global scope.
      ;(window as unknown as { p5: unknown }).p5 = p5
      const TOPOLOGY = (await import("vanta/dist/vanta.topology.min")).default

      if (cancelled || !ref.current) return

      effect = TOPOLOGY({
        el: ref.current,
        p5,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x00d46a, // brand green
        backgroundColor: 0x0d0d0d, // app dark background
      })
    })()

    return () => {
      cancelled = true
      effect?.destroy?.()
    }
  }, [])

  return <div ref={ref} aria-hidden className={className} />
}
