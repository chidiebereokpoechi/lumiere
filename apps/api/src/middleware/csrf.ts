import type { Context } from 'elysia';
import { CSRF_COOKIE, CSRF_HEADER, csrfMatches } from '../services/csrf';

/**
 * Inline guard for cookie-authenticated mutations. Call at the start of any
 * mutating handler that depends on session cookies (admin POST/PATCH/DELETE,
 * client favorite/download). Returns a 403 response object the handler should
 * return immediately, or `null` if the request passes.
 */
export function checkCsrf(ctx: Pick<Context, 'request' | 'cookie' | 'set'>): { error: string } | null {
  const header = ctx.request.headers.get(CSRF_HEADER) ?? undefined;
  const raw = ctx.cookie[CSRF_COOKIE]?.value;
  const cookieValue = typeof raw === 'string' ? raw : undefined;
  if (!csrfMatches(cookieValue, header)) {
    ctx.set.status = 403;
    return { error: 'csrf_token_invalid' };
  }
  return null;
}
