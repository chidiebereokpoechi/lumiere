import type { NextConfig } from 'next';

// In dev, the Bun/Elysia backend is a separate process on :3200 and we proxy
// /api, /events, /img, /health through Next so the browser sees one origin
// (cookies/CSRF work without CORS gymnastics). In production NPM/nginx fronts
// both services at the same origin and routes those paths to the api container
// directly — Next never sees them.
const DEV_API_ORIGIN = process.env.INTERNAL_API_URL ?? 'http://localhost:3200';

const config: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      { source: '/api/:path*', destination: `${DEV_API_ORIGIN}/api/:path*` },
      { source: '/events/:path*', destination: `${DEV_API_ORIGIN}/events/:path*` },
      { source: '/events', destination: `${DEV_API_ORIGIN}/events` },
      { source: '/img/:path*', destination: `${DEV_API_ORIGIN}/img/:path*` },
      { source: '/health', destination: `${DEV_API_ORIGIN}/health` },
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
