'use client'

import { useEffect, useRef } from 'react'

/**
 * A slowly turning globe with the company's own footprint drawn on it.
 *
 * HA GROUP is incorporated in eight countries and describes itself as working
 * "across Africa", so the ground behind a sign-in screen and a greeting banner
 * is that, rather than a stock photograph of a hard hat. The bright points are
 * the cities the company actually has offices in — Dar es Salaam, Morogoro,
 * Harare, Lusaka, Lilongwe, Tete, Gaborone, Johannesburg, and Southend-on-Sea
 * for the UK arm — and the arcs are drawn between them. It is a real claim,
 * drawn from `offices` in the company profile, not decoration pretending to be
 * data.
 *
 * Latitude and longitude are projected onto a sphere and rotated about the
 * polar axis, so points on the far side genuinely go behind and fade. There is
 * no globe texture and no map image: it is a wireframe of meridians and
 * parallels, which costs nothing to ship and cannot be mistaken for a
 * photograph of somewhere.
 *
 * Everything is deterministic — no random anything — so the server and the
 * client agree and there is nothing to hydrate. Honours prefers-reduced-motion
 * by drawing one static frame, and stops when off-screen so it costs nothing on
 * a phone battery.
 */

/**
 * Where HA GROUP actually is. Degrees, north and east positive.
 *
 * The country is carried alongside the city because that is what somebody
 * recognises at a glance — "Tanzania" lands where "Morogoro" needs a moment —
 * and because the company describes itself by the countries it is incorporated
 * in rather than by its street addresses.
 */
const SITES: Array<{ name: string; country: string; lat: number; lon: number; home?: boolean }> = [
  { name: 'Dar es Salaam', country: 'Tanzania', lat: -6.79, lon: 39.21, home: true },
  { name: 'Morogoro', country: 'Tanzania', lat: -6.82, lon: 37.66, home: true },
  { name: 'Harare', country: 'Zimbabwe', lat: -17.83, lon: 31.05 },
  { name: 'Lusaka', country: 'Zambia', lat: -15.39, lon: 28.32 },
  { name: 'Lilongwe', country: 'Malawi', lat: -13.96, lon: 33.79 },
  { name: 'Tete', country: 'Mozambique', lat: -16.16, lon: 33.59 },
  { name: 'Gaborone', country: 'Botswana', lat: -24.65, lon: 25.91 },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2, lon: 28.05 },
  { name: 'Southend-on-Sea', country: 'United Kingdom', lat: 51.54, lon: 0.71 },
]

/** Every office joins the Tanzanian pair; the two Tanzanian offices join too. */
const LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [0, 8],
  [2, 7],
  [3, 4],
]

export function AfricaNetwork({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let running = true
    let w = 0
    let h = 0
    let cx = 0
    let cy = 0
    let R = 0
    let labels = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // The globe sits to the right and is deliberately larger than the frame,
      // so the banner shows a slice of a sphere rather than a small ball in a
      // corner competing with the greeting.
      // Sized to the shorter edge so the whole sphere fits, and pushed right so
      // the type has the left. Larger than this and every office falls off the
      // frame, which was the first attempt: a grid of meridians and no company.
      R = Math.min(w, h) * 0.42
      cx = w > 900 ? w * 0.72 : w * 0.5
      cy = h * 0.5
      // Names need room beside the sphere. On a phone there is none.
      labels = w >= 900 && h >= 480
    }

    /** Lat/lon to screen, plus how far towards the viewer the point faces. */
    const project = (lat: number, lon: number, spin: number) => {
      const phi = (lat * Math.PI) / 180
      const lambda = ((lon + spin) * Math.PI) / 180
      // Tilt so the southern hemisphere, where the company is, faces the viewer.
      const tilt = 0.42
      const x = Math.cos(phi) * Math.sin(lambda)
      const yr = Math.sin(phi)
      const zr = Math.cos(phi) * Math.cos(lambda)
      const y = yr * Math.cos(tilt) - zr * Math.sin(tilt)
      const z = yr * Math.sin(tilt) + zr * Math.cos(tilt)
      return { x: cx + x * R, y: cy - y * R, z }
    }

    const draw = (t: number) => {
      /*
       * A slow sway around Africa rather than a full rotation.
       *
       * Spinning the globe took HA GROUP's own offices behind it for most of
       * every minute, which is an odd thing for a company's sign-in screen to
       * do — the one region that should always be visible was the one that kept
       * leaving. It rocks about twenty degrees either side of the African
       * meridian now, so the cluster is always facing the viewer and the labels
       * stay legible, while the movement still says the thing is alive.
       */
      const spin = reduced ? -32 : -32 + Math.sin(t / 7000) * 20

      ctx.clearRect(0, 0, w, h)

      // Meridians and parallels. Only the near half is drawn, so the sphere
      // reads as solid without any fill.
      ctx.lineWidth = 1
      for (let lon = -180; lon < 180; lon += 20) {
        ctx.beginPath()
        let started = false
        for (let lat = -90; lat <= 90; lat += 4) {
          const p = project(lat, lon, spin)
          if (p.z <= 0.02) {
            started = false
            continue
          }
          if (!started) {
            ctx.moveTo(p.x, p.y)
            started = true
          } else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = 'rgba(148, 176, 235, 0.20)'
        ctx.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 20) {
        ctx.beginPath()
        let started = false
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = project(lat, lon, spin)
          if (p.z <= 0.02) {
            started = false
            continue
          }
          if (!started) {
            ctx.moveTo(p.x, p.y)
            started = true
          } else ctx.lineTo(p.x, p.y)
        }
        ctx.strokeStyle = 'rgba(148, 176, 235, 0.16)'
        ctx.stroke()
      }

      const pts = SITES.map((s) => project(s.lat, s.lon, spin))

      /*
       * Labels already placed this frame, so the next one can be skipped if it
       * would land on top. Seven of the nine offices sit within a few hundred
       * miles of each other in southern Africa, so at this scale their names
       * pile into an unreadable smear — which is worse than showing fewer.
       * Nearest-to-the-viewer wins, because that is the one the eye is on.
       */
      const placed: Array<{ x: number; y: number; w: number; h: number }> = []
      const order = SITES.map((_, i) => i).sort((a, b) => pts[b]!.z - pts[a]!.z)
      const labelled = new Set<number>()
      if (labels) {
        ctx.font =
          '500 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        for (const i of order) {
          const p = pts[i]!
          if (p.z <= 0.55) continue
          const text = SITES[i]!.country
          const box = {
            x: p.x + 10,
            y: p.y - 8,
            w: ctx.measureText(text).width + 6,
            h: 26,
          }
          const clash = placed.some(
            (q) =>
              box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y,
          )
          if (clash) continue
          placed.push(box)
          labelled.add(i)
        }
      }

      // Links, faded by whichever end faces further away.
      for (const [a, b] of LINKS) {
        const pa = pts[a]!
        const pb = pts[b]!
        const face = Math.min(pa.z, pb.z)
        if (face <= 0.02) continue
        // Bowed towards the viewer so a link reads as an arc over the surface.
        const mx = (pa.x + pb.x) / 2
        const my = (pa.y + pb.y) / 2
        const bow = 0.18
        const qx = cx + (mx - cx) * (1 + bow)
        const qy = cy + (my - cy) * (1 + bow)

        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.quadraticCurveTo(qx, qy, pb.x, pb.y)
        ctx.strokeStyle = `rgba(226, 178, 96, ${0.1 + face * 0.3})`
        ctx.lineWidth = 1.4
        ctx.stroke()
      }

      // The offices themselves.
      SITES.forEach((site, i) => {
        const p = pts[i]!
        if (p.z <= 0.02) return
        const near = p.z
        const r = site.home ? 3 : 2.2

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6)
        glow.addColorStop(0, `rgba(226, 178, 96, ${0.3 * near})`)
        glow.addColorStop(1, 'rgba(226, 178, 96, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = site.home
          ? `rgba(240, 200, 130, ${0.5 + near * 0.5})`
          : `rgba(180, 205, 245, ${0.35 + near * 0.45})`
        ctx.fill()

        /*
         * The country, written beside the point — but only where the point is
         * genuinely facing the viewer. Labels on the limb of a sphere sit on
         * top of the meridians and read as noise, and a name on the far side is
         * a lie about where it is. Suppressed entirely on a narrow canvas,
         * where there is no room for them beside a globe that small.
         */
        if (labelled.has(i)) {
          const alpha = Math.min(1, (near - 0.55) / 0.25)
          ctx.font =
            '500 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = `rgba(255, 255, 255, ${0.62 * alpha})`
          ctx.fillText(site.country, p.x + r + 8, p.y)
          ctx.font = '400 9px ui-sans-serif, system-ui, sans-serif'
          ctx.fillStyle = `rgba(226, 178, 96, ${0.55 * alpha})`
          ctx.fillText(site.name.toUpperCase(), p.x + r + 8, p.y + 12)
        }
      })
    }

    const frame = (t: number) => {
      if (!running) return
      draw(t)
      if (!reduced) raf = requestAnimationFrame(frame)
    }

    resize()
    frame(0)

    const onResize = () => {
      resize()
      if (reduced) draw(0)
    }
    window.addEventListener('resize', onResize)

    // Stop entirely when scrolled away.
    const io = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? true
      if (visible && !running && !reduced) {
        running = true
        raf = requestAnimationFrame(frame)
      } else if (!visible) {
        running = false
        cancelAnimationFrame(raf)
      }
    })
    io.observe(canvas)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      io.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
