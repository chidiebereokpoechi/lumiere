import { Elysia } from 'elysia';
import { env } from '../lib/config';

/**
 * Trusted-proxy XFF parsing per v1.2 §14. The leftmost XFF entry is
 * client-supplied and spoofable. We trust exactly TRUSTED_PROXY_HOPS proxies
 * in front of us and take the entry that many hops back from the right.
 *
 * Example: TRUSTED_PROXY_HOPS=1, XFF="1.2.3.4, 9.9.9.9"
 *   → 9.9.9.9 is the (untrusted) edge proxy, 1.2.3.4 is the real client.
 *   With hops=1, we take XFF[len - 1 - 1] = XFF[0] = "1.2.3.4". ✓
 */
export function pickClientIp(xff: string | null, remote: string | undefined): string | undefined {
  if (!xff) return remote;
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
  const idx = parts.length - 1 - env.TRUSTED_PROXY_HOPS;
  if (idx >= 0 && idx < parts.length) return parts[idx];
  return remote;
}

export const clientIp = new Elysia({ name: 'client-ip' }).derive({ as: 'global' }, ({ request, server }) => {
  const xff = request.headers.get('x-forwarded-for');
  const remote = server?.requestIP(request)?.address;
  return { clientIp: pickClientIp(xff, remote) };
});
