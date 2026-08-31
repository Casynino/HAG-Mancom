import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  experimental: {
    // Enables forbidden() and unauthorized(), so an authorisation refusal
    // returns a real 403 with its own page instead of a 200 carrying a
    // client-side redirect. Streaming commits the status before a page
    // component runs, so this is the only way to get the status right without
    // moving role checks into middleware and a database round-trip per request.
    authInterrupts: true,
    // Attachment uploads are streamed through Server Actions; the cap here is a
    // backstop only. The authoritative per-kind limits live in src/lib/storage/limits.ts
    // and are enforced server-side before a byte is persisted.
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        ],
      },
    ]
  },
}

export default nextConfig
