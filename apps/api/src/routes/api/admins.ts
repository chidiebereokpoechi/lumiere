// Admin (photographer) management — list / invite / remove other admins.
// Every admin is currently equal: full access, owns the galleries they create,
// and can manage the admin roster. No role/permission split (yet).
import { Elysia } from 'elysia';
import { eq, asc } from 'drizzle-orm';
import { db } from '../../db';
import { photographers, galleries } from '../../db/schema';
import { authContext, requireAuth } from '../../middleware/auth';
import { checkCsrf } from '../../middleware/csrf';
import { hashPassword } from '../../services/auth';
import { newId, now } from '../../lib/ids';
import { log } from '../../lib/logger';

interface AdminListInput {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

export const adminRoutes = new Elysia({ prefix: '/api/admins' })
  .use(authContext)

  // GET /api/admins — list every photographer. No secrets exposed.
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const rows = await db.query.photographers.findMany({
      orderBy: [asc(photographers.createdAt)],
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      brandName: r.brandName,
      createdAt: r.createdAt,
    }));
  })

  // POST /api/admins — create a new admin. Just email + password + optional
  // name. Errors with 409 if the email is already taken.
  .post('/', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const body = (ctx.body ?? {}) as AdminListInput;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim()
      : email.split('@')[0] || 'admin';
    if (!email || !email.includes('@')) {
      ctx.set.status = 400;
      return { error: 'invalid_email' };
    }
    if (password.length < 12) {
      ctx.set.status = 400;
      return { error: 'password_too_short', hint: 'min 12 chars' };
    }
    const existing = await db.query.photographers.findFirst({
      where: eq(photographers.email, email),
    });
    if (existing) {
      ctx.set.status = 409;
      return { error: 'email_taken' };
    }
    const id = newId();
    await db.insert(photographers).values({
      id,
      email,
      name,
      passwordHash: await hashPassword(password),
      createdAt: now(),
    });
    log.info('admin.created', { id, email, by: ctx.currentPhotographer!.id });
    return { id, email, name, brandName: null, createdAt: now() };
  })

  // DELETE /api/admins/:id — remove another admin. Cannot remove yourself
  // (would lock the caller out and cascade-delete their own galleries),
  // and cannot delete the last remaining admin.
  .delete('/:id', async (ctx) => {
    const csrfError = checkCsrf(ctx);
    if (csrfError) return csrfError;
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;
    const targetId = ctx.params.id;
    if (targetId === me.id) {
      ctx.set.status = 400;
      return { error: 'cannot_delete_self' };
    }
    const target = await db.query.photographers.findFirst({
      where: eq(photographers.id, targetId),
    });
    if (!target) {
      ctx.set.status = 404;
      return { error: 'not_found' };
    }
    const count = await db.query.photographers.findMany();
    if (count.length <= 1) {
      ctx.set.status = 400;
      return { error: 'last_admin' };
    }
    // FK cascade: their galleries and everything under them are removed.
    // We surface a count so the UI can warn before the click.
    const owned = await db.query.galleries.findMany({
      where: eq(galleries.photographerId, target.id),
    });
    await db.delete(photographers).where(eq(photographers.id, target.id));
    log.info('admin.deleted', {
      id: target.id, email: target.email,
      galleriesRemoved: owned.length, by: me.id,
    });
    return { ok: true, galleriesRemoved: owned.length };
  });
