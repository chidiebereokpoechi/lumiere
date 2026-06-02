import type { NextConfig } from 'next';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3200';

const config: NextConfig = {
  // The Bun/Elysia backend at /api, /events, and /img is a separate process in
  // dev (port 3200). In production nginx fronts both at the same origin; in
  // dev we proxy via Next rewrites so the browser sees one origin and cookies
  // work without CORS gymnastics.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/events/:path*', destination: `${API_ORIGIN}/events/:path*` },
      { source: '/events', destination: `${API_ORIGIN}/events` },
      { source: '/img/:path*', destination: `${API_ORIGIN}/img/:path*` },
      { source: '/health', destination: `${API_ORIGIN}/health` },
    ];
  },

  // We never let next/image fetch/re-encode our images — the Bun backend
  // already serves short-lived presigned redirects. See lib/image-loader.ts.
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    remotePatterns: [
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },

  reactStrictMode: true,
};

export default config;
