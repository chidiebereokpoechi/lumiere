import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { photographers } from '../../db/schema';
import {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../../services/auth';
import { newCsrfToken, CSRF_COOKIE } from '../../services/csrf';
import { ACCESS_COOKIE, REFRESH_COOKIE, authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { clientIp } from '../../middleware/client-ip';
import { checkRateLimit } from '../../middleware/rate-limit';
import { env } from '../../lib/config';
import { log } from '../../lib/logger';

const accessCookieAttrs = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.IS_PROD,
  path: '/',
  maxAge: env.ACCESS_TOKEN_TTL_SECONDS,
} as const;

const refreshCookieAttrs = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.IS_PROD,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
} as const;

const csrfCookieAttrs = {
  httpOnly: false,
  sameSite: 'strict',
  secure: env.IS_PROD,
  path: '/',
  maxAge: 60 * 60 * 24,
} as const;

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(clientIp)
  .use(authContext)

  // GET /api/auth/csrf — issues a CSRF token (cookie + JSON) for double-submit checks.
  .get('/csrf', ({ cookie }) => {
    const token = newCsrfToken();
    cookie[CSRF_COOKIE]!.set({ value: token, ...csrfCookieAttrs });
    return { token };
  })

  // GET /api/auth/me
  .get('/me', ({ currentPhotographer, set }) => {
    if (!currentPhotographer) {
      set.status = 401;
      return { error: 'unauthenticated' };
    }
    return currentPhotographer;
  })

  // PATCH /api/auth/profile — update the public-facing creator info shown on
  // the client gallery landing (name, brand, website, instagram).
  .patch('/profile', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const patch: Partial<{
      name: string;
      brandName: string | null;
      website: string | null;
      instagram: string | null;
    }> = {};
    const trim = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const s = v.trim();
      return s.length === 0 ? null : s;
    };
    if ('name' in body) {
      const next = trim(body.name);
      if (!next) {
        ctx.set.status = 400;
        return { error: 'name_required' };
      }
      patch.name = next;
    }
    if ('brandName' in body) patch.brandName = trim(body.brandName);
    if ('website' in body) patch.website = trim(body.website);
    if ('instagram' in body) {
      const next = trim(body.instagram);
      // Strip a leading @ so storage stays canonical; UI re-adds it if needed.
      patch.instagram = next?.replace(/^@+/, '') ?? null;
    }
    if (Object.keys(patch).length === 0) {
      ctx.set.status = 400;
      return { error: 'no_changes' };
    }
    await db.update(photographers).set(patch).where(eq(photographers.id, me.id));
    const row = await db.query.photographers.findFirst({ where: eq(photographers.id, me.id) });
    return {
      id: row!.id,
      email: row!.email,
      name: row!.name,
      brandName: row!.brandName,
      website: row!.website,
      instagram: row!.instagram,
    };
  })

  // POST /api/auth/login
  .post(
    '/login',
    async ({ body, cookie, set, clientIp }) => {
      const ip = clientIp ?? 'unknown';
      if (!checkRateLimit('login', ip, 5, 15 * 60)) {
        set.status = 429;
        return { error: 'too_many_attempts' };
      }

      const row = await db.query.photographers.findFirst({ where: eq(photographers.email, body.email) });
      if (!row) {
        // Constant-time decoy: hash a throwaway so timing doesn't reveal user existence.
        await hashPassword('decoy');
        set.status = 401;
        return { error: 'invalid_credentials' };
      }

      const ok = await verifyPassword(body.password, row.passwordHash);
      if (!ok) {
        set.status = 401;
        return { error: 'invalid_credentials' };
      }

      const access = await issueAccessToken({ sub: row.id, email: row.email });
      const refresh = await issueRefreshToken(row.id);

      cookie[ACCESS_COOKIE]!.set({ value: access, ...accessCookieAttrs });
      cookie[REFRESH_COOKIE]!.set({ value: refresh.raw, ...refreshCookieAttrs });

      log.info('auth.login', { photographerId: row.id, ip });
      return { id: row.id, email: row.email, name: row.name, brandName: row.brandName };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 1 }),
      }),
    },
  )

  // POST /api/auth/refresh — rotates the refresh token and re-issues an access token.
  .post('/refresh', async ({ cookie, set }) => {
    const rawValue = cookie[REFRESH_COOKIE]?.value;
    const raw = typeof rawValue === 'string' ? rawValue : undefined;
    if (!raw) {
      set.status = 401;
      return { error: 'no_refresh_token' };
    }

    const result = await rotateRefreshToken(raw);
    if (!result.ok) {
      cookie[ACCESS_COOKIE]!.remove();
      cookie[REFRESH_COOKIE]!.remove();
      set.status = 401;
      return { error: result.reason };
    }

    const row = await db.query.photographers.findFirst({ where: eq(photographers.id, result.photographerId) });
    if (!row) {
      set.status = 401;
      return { error: 'photographer_not_found' };
    }

    const access = await issueAccessToken({ sub: row.id, email: row.email });
    cookie[ACCESS_COOKIE]!.set({ value: access, ...accessCookieAttrs });
    cookie[REFRESH_COOKIE]!.set({ value: result.newRaw, ...refreshCookieAttrs });

    return { id: row.id, email: row.email, name: row.name, brandName: row.brandName };
  })

  // POST /api/auth/logout — CSRF-protected; clears cookies and revokes refresh.
  .post('/logout', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;

    const { cookie } = ctx;
    const rawValue = cookie[REFRESH_COOKIE]?.value;
    const raw = typeof rawValue === 'string' ? rawValue : undefined;
    if (raw) await revokeRefreshToken(raw);
    cookie[ACCESS_COOKIE]!.remove();
    cookie[REFRESH_COOKIE]!.remove();
    return { ok: true };
  });
