'use client'

import { useState } from 'react'
import { offices } from '@/lib/company/profile'

/**
 * HA GROUP's offices, plotted where they actually are.
 *
 * Every point is the real latitude and longitude of a city HA GROUP publishes
 * an address for, drawn with a plain equirectangular projection. There is no
 * country outline: a constellation of real sites joined to the head office
 * carries the reach more honestly — and more legibly at this size — than a
 * traced map would, and it cannot be wrong about a border.
 *
 * Southend-on-Sea sits far north of the African offices. Rather than distort
 * the projection to fit, the UK is shown as its own marker above the frame,
 * labelled — the gap is the point.
 */

const COORDS: Record<string, { lat: number; lon: number }> = {
  Johannesburg: { lat: -26.2, lon: 28.05 },
  'Dar es Salaam': { lat: -6.79, lon: 39.21 },
  Morogoro: { lat: -6.82, lon: 37.66 },
  Harare: { lat: -17.83, lon: 31.05 },
  Lusaka: { lat: -15.42, lon: 28.28 },
  Lilongwe: { lat: -13.98, lon: 33.79 },
  Tete: { lat: -16.16, lon: 33.59 },
  Gaborone: { lat: -24.65, lon: 25.91 },
  'Southend-on-Sea': { lat: 51.54, lon: 0.71 },
}

// Bounds cover southern and eastern Africa with margin. The UK is outside them
// on purpose and is drawn separately.
const BOUNDS = { minLon: 21, maxLon: 44, minLat: -30, maxLat: -3 }
const W = 620
const H = 700

function project(lat: number, lon: number) {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * W
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H
  return { x, y }
}

export function NetworkMap() {
  const [active, setActive] = useState<string | null>(null)

  const african = offices.filter((o) => o.country !== 'United Kingdom')
  const uk = offices.find((o) => o.country === 'United Kingdom')
  const hub = african.find((o) => o.isHeadOffice) ?? african[0]!
  const hubPoint = project(COORDS[hub.city]!.lat, COORDS[hub.city]!.lon)

  const shown = offices.find((o) => o.city === active)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Map of HA GROUP offices in ${[...new Set(offices.map((o) => o.country))].join(', ')}`}
      >
        <defs>
          <radialGradient id="nm-glow">
            <stop offset="0%" stopColor="#e0a458" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e0a458" stopOpacity="0" />
          </radialGradient>
          <pattern id="nm-grid" width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M52 0H0V52" fill="none" stroke="currentColor" strokeOpacity="0.07" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#nm-grid)" className="text-ink-500" />

        {/* Routes from the head office to every other African site. */}
        {african.map((o) => {
          if (o.city === hub.city) return null
          const p = project(COORDS[o.city]!.lat, COORDS[o.city]!.lon)
          const mx = (hubPoint.x + p.x) / 2
          const my = (hubPoint.y + p.y) / 2 - 42
          return (
            <path
              key={`route-${o.city}`}
              d={`M${hubPoint.x} ${hubPoint.y} Q${mx} ${my} ${p.x} ${p.y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={active === o.city ? 1.8 : 1}
              className={active === o.city ? 'text-live-400' : 'text-brand-400'}
              strokeOpacity={active === o.city ? 0.9 : 0.35}
            />
          )
        })}

        {african.map((o) => {
          const p = project(COORDS[o.city]!.lat, COORDS[o.city]!.lon)
          const isHub = o.isHeadOffice
          const on = active === o.city
          return (
            <g
              key={`${o.country}-${o.city}`}
              onMouseEnter={() => setActive(o.city)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(o.city)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="button"
              aria-label={`${o.city}, ${o.country}`}
              className="cursor-pointer focus:outline-none"
            >
              {(isHub || on) && <circle cx={p.x} cy={p.y} r={34} fill="url(#nm-glow)" />}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHub ? 7 : 4.5}
                className={isHub || on ? 'fill-live-400' : 'fill-brand-300'}
              />
              {/* A generous invisible target: these are tapped on phones. */}
              <circle cx={p.x} cy={p.y} r={22} fill="transparent" />
              <text
                x={p.x + (isHub ? 14 : 11)}
                y={p.y + 4}
                className={`font-body text-[13px] ${on || isHub ? 'fill-ink-900' : 'fill-ink-500'}`}
              >
                {o.city}
              </text>
            </g>
          )
        })}
      </svg>

      {uk ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
          <span className="size-2 rounded-full bg-brand-300" aria-hidden="true" />
          Also {uk.city}, {uk.country} — outside the frame above.
        </p>
      ) : null}

      <div className="mt-6 min-h-24 rounded border border-ink-200 bg-panel p-5">
        {shown ? (
          <>
            <p className="text-xs font-semibold tracking-[0.14em] text-live-700 uppercase">
              {shown.isHeadOffice ? 'Head office' : shown.country}
            </p>
            <p className="font-display mt-1.5 text-lg font-semibold text-ink-950">{shown.city}</p>
            <p className="mt-1 text-sm text-ink-600">{shown.address}</p>
            <p className="mt-1 text-sm text-brand-700 tabular">{shown.phones[0]}</p>
          </>
        ) : (
          <p className="text-sm text-ink-500">
            Hover or tap a site to see its address and direct number.
          </p>
        )}
      </div>
    </div>
  )
}
