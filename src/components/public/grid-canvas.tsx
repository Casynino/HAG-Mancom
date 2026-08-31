'use client'

import { useEffect, useRef } from 'react'

/**
 * A live power network behind the hero.
 *
 * Nodes are substations, edges are lines, and the travelling sparks are load
 * moving through them. It is drawn rather than photographed on purpose: this is
 * literally what HA GROUP builds, so the motion says more about the business
 * than a stock photograph of a hard hat would — and it does not claim to be a
 * site the company has actually worked on.
 *
 * Everything is computed from a fixed seed, so the layout is identical on every
 * load and between server and client. Canvas rather than SVG or DOM because a
 * few hundred moving elements per frame would thrash layout; here it is one
 * element and one paint.
 *
 * Honours prefers-reduced-motion by drawing a single static frame, and stops
 * entirely when scrolled out of view so it costs nothing on a phone battery.
 */

interface Node {
  x: number
  y: number
  /** Base radius; substations are larger than junctions. */
  r: number
  phase: number
}

interface Edge {
  a: number
  b: number
  /** Position of the travelling pulse along the edge, 0–1. */
  t: number
  speed: number
}

/** Deterministic PRNG — the same network every time, on server and client. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function GridCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = 1
    let nodes: Node[] = []
    let edges: Edge[] = []
    let frame = 0
    let running = true

    function build() {
      const rand = seeded(20260831)
      // Density is driven by width, not area: a tall narrow phone hero has a
      // large area but very little horizontal room, and scaling by area left it
      // looking like a handful of scattered dots rather than a network.
      const count = Math.max(26, Math.min(64, Math.round(width / 26)))

      nodes = Array.from({ length: count }, () => ({
        x: rand() * width,
        y: rand() * height,
        r: rand() < 0.22 ? 2.6 : 1.4,
        phase: rand() * Math.PI * 2,
      }))

      // Connect each node to its two nearest neighbours: a real distribution
      // network is sparse and local, not a mesh of everything to everything.
      const seen = new Set<string>()
      edges = []
      nodes.forEach((n, i) => {
        const near = nodes
          .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
          .filter((c) => c.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)

        for (const c of near) {
          const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`
          if (seen.has(key)) continue
          seen.add(key)
          edges.push({ a: i, b: c.j, t: rand(), speed: 0.0016 + rand() * 0.0026 })
        }
      })
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height)

      // Lines first, so nodes sit on top of them.
      ctx!.lineWidth = 1
      for (const e of edges) {
        const a = nodes[e.a]!
        const b = nodes[e.b]!
        ctx!.strokeStyle = 'rgba(139, 165, 230, 0.13)'
        ctx!.beginPath()
        ctx!.moveTo(a.x, a.y)
        ctx!.lineTo(b.x, b.y)
        ctx!.stroke()

        // The pulse: load travelling from one node to the next.
        const px = a.x + (b.x - a.x) * e.t
        const py = a.y + (b.y - a.y) * e.t
        const glow = ctx!.createRadialGradient(px, py, 0, px, py, 7)
        glow.addColorStop(0, 'rgba(224, 164, 88, 0.9)')
        glow.addColorStop(1, 'rgba(224, 164, 88, 0)')
        ctx!.fillStyle = glow
        ctx!.beginPath()
        ctx!.arc(px, py, 7, 0, Math.PI * 2)
        ctx!.fill()

        if (!reduced) {
          e.t += e.speed
          if (e.t > 1) e.t = 0
        }
      }

      for (const n of nodes) {
        // Substations breathe slightly; junctions hold steady.
        const pulse = reduced ? 1 : 1 + Math.sin(frame * 0.02 + n.phase) * 0.18
        ctx!.fillStyle = n.r > 2 ? 'rgba(185, 201, 241, 0.85)' : 'rgba(139, 165, 230, 0.45)'
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2)
        ctx!.fill()
      }

      frame += 1
    }

    let raf = 0
    function loop() {
      if (!running) return
      draw()
      raf = requestAnimationFrame(loop)
    }

    resize()

    if (reduced) {
      draw()
    } else {
      loop()
    }

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    // Stop the loop when the hero scrolls away — no reason to burn a phone
    // battery animating something nobody is looking at.
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? false
        if (visible && !running && !reduced) {
          running = true
          loop()
        } else if (!visible) {
          running = false
          cancelAnimationFrame(raf)
        }
      },
      { threshold: 0 },
    )
    observer.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
