'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scroll choreography, without a library.
 *
 * Two primitives cover everything the public site needs: reveal a block when it
 * enters the viewport, and count a figure up once. Both honour
 * prefers-reduced-motion by rendering the finished state immediately — motion
 * here is emphasis, never the only way to reach information.
 *
 * Both start visible and only hide themselves after mount. If JavaScript never
 * runs, the page reads exactly as it should rather than staying blank, which is
 * the failure mode of most reveal-on-scroll implementations.
 */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const [armed, setArmed] = useState(false)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      setShown(true)
      return
    }
    setArmed(true)

    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)

    /*
     * A hard deadline, and the most important line in this file.
     *
     * IntersectionObserver callbacks are throttled — sometimes indefinitely —
     * in a background or hidden tab, and some embedded webviews deliver them
     * late or not at all. Without this, content that is merely *decorated* by
     * an animation would stay permanently invisible, which is a far worse
     * failure than an un-animated page. After a second, everything shows
     * regardless of whether the observer ever spoke.
     */
    const failsafe = window.setTimeout(() => setShown(true), 1000)

    return () => {
      io.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [reduced])

  const hidden = armed && !shown

  return (
    <div
      ref={ref}
      className={`${className} ${
        armed ? 'transition-[opacity,transform] duration-700 ease-out' : ''
      } ${hidden ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}
      style={hidden ? undefined : { transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(to)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return

    const el = ref.current
    if (!el) return

    let raf = 0
    let deadline = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()

        /*
         * The count starts here, inside the callback, and NOT in the effect
         * body. Zeroing up front would mean that a browser which throttles or
         * never delivers IntersectionObserver — a background tab, some embedded
         * webviews — leaves a nought on screen where a real figure belongs.
         * A wrong number on a company's public site is worse than a number that
         * simply did not animate, so the true value stands until the moment we
         * know we can animate it.
         */
        const start = performance.now()
        const duration = 1100
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1)
          // Ease-out cubic: fast to begin, settling rather than stopping dead.
          setValue(Math.round(to * (1 - Math.pow(1 - p, 3))))
          if (p < 1) raf = requestAnimationFrame(tick)
          else setValue(to)
        }
        setValue(0)
        raf = requestAnimationFrame(tick)

        /*
         * And a deadline on the animation itself. requestAnimationFrame is
         * throttled to a crawl — or paused outright — in a background tab, so a
         * count that has begun can stall part-way and leave a number that is
         * simply false. Well past the animation's own duration, we snap to the
         * truth regardless of how far the frames got.
         */
        deadline = window.setTimeout(() => {
          cancelAnimationFrame(raf)
          setValue(to)
        }, duration + 600)
      },
      { threshold: 0.4 },
    )
    io.observe(el)

    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(deadline)
    }
  }, [to, reduced])

  return (
    <span ref={ref} className="tabular">
      {value}
      {suffix}
    </span>
  )
}
