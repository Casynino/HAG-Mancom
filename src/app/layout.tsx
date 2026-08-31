import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Sans } from 'next/font/google'
import { THEME_SCRIPT } from '@/components/theme-toggle'
import './globals.css'

/*
 * Two faces, loaded once for the whole application.
 *
 * Archivo is a tight industrial grotesque — it holds up at display sizes on the
 * public site without the softness of the usual UI sans. IBM Plex Sans carries
 * the running text: it was drawn for technical documentation, has real tabular
 * figures, and does not read as a default.
 *
 * The signed-in application deliberately keeps the system font stack. It is a
 * tool used all day on site phones, where the system face renders fastest and
 * most familiarly; the public site is where typography does persuasive work.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'HA GROUP — Turnkey electrical engineering across Africa',
    template: '%s · HA GROUP',
  },
  description:
    'HA GROUP designs, constructs, refurbishes and maintains power and ' +
    'electro-mechanical systems for mining, manufacturing, industrial and commercial ' +
    'clients across Africa.',
  // The public pages are meant to be found. Every signed-in route sets
  // robots: noindex in its own metadata, so nothing internal is exposed here.
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Engineers work outdoors on phones; pinch-zoom must stay available.
  maximumScale: 5,
  // Two values so the browser chrome matches the page in both themes.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e131b' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${archivo.variable} ${plex.variable}`}>
      <head>
        {/*
          Blocking on purpose. It must run before the first paint, or every page
          load flashes light before hydration restores the chosen theme.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
