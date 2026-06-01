import { NextResponse, type NextRequest } from 'next/server';

/**
 * Lightweight admin gate. The real authoritative check happens in Elysia on
 * every API call; this just keeps un-authenticated requests off the admin
 * pages and bounces them to the login screen.
 *
 * We only look for cookie *presence*, not validity — the backend rejects
 * stale tokens on the actual API hit. That's the v1.2 §14 model: proxy is
 * a first gate, not the security boundary.
 *
 * Next 16 renamed the `middleware.ts` convention to `proxy.ts` (same edge
 * runtime, same shape) — the exported function must be named `proxy`.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    if (!req.cookies.get('lumiere_jwt')) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
