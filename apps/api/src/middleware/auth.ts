import { Elysia, type Context } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { photographers } from '../db/schema';
import { verifyAccessToken } from '../services/auth';

export interface CurrentPhotographer {
  id: string;
  email: string;
  name: string;
  brandName: string | null;
  website: string | null;
  instagram: string | null;
}

export const ACCESS_COOKIE = 'lumiere_jwt';
export const REFRESH_COOKIE = 'lumiere_refresh';

export const authContext = new Elysia({ name: 'auth-context' }).derive({ as: 'global' }, async ({ cookie }) => {
  const raw = cookie[ACCESS_COOKIE]?.value;
  const token = typeof raw === 'string' ? raw : undefined;
  if (!token) return { currentPhotographer: null };

  const claims = await verifyAccessToken(token);
  if (!claims) return { currentPhotographer: null };

  const row = await db.query.photographers.findFirst({ where: eq(photographers.id, claims.sub) });
  if (!row) return { currentPhotographer: null };
  return {
    currentPhotographer: {
      id: row.id,
      email: row.email,
      name: row.name,
      brandName: row.brandName,
      website: row.website,
      instagram: row.instagram,
    },
  };
});

/**
 * Inline guard for routes that need an authenticated photographer. Returns a
 * 401 response object the handler should return immediately, or `null` if the
 * request passes. The narrowing assertion lets callers use
 * `ctx.currentPhotographer!` afterwards without re-checking.
 */
export function requireAuth(ctx: {
  currentPhotographer: CurrentPhotographer | null;
  set: Context['set'];
}): { error: string } | null {
  if (!ctx.currentPhotographer) {
    ctx.set.status = 401;
    return { error: 'unauthenticated' };
  }
  return null;
}
