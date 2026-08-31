import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'HA GROUP AI Operations',
    template: '%s · HA GROUP AI Operations',
  },
  description: 'Engineering operations and documentation platform for HA GROUP TZ LTD.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Engineers work outdoors on phones; pinch-zoom must stay available.
  maximumScale: 5,
  themeColor: '#1b3fa0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
