import { Elysia } from 'elysia';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { ListCreateInput, ListPatchInput, ListItemInput } from '@lumiere/types';
import { db } from '../../db';
import { galleries, files, lists, listItems } from '../../db/schema';
import { gallerySessionContext } from '../../middleware/gallery-session';
import { authContext, requireAuth } from '../../middleware/auth';
import { parseBody } from '../../lib/validation';
import { newId, now } from '../../lib/ids';

function isExpired(g: typeof galleries.$inferSelect): boolean {
  if (!g.expiresAt) return false;
  const grace = (g.gracePeriodDays ?? 0) * 86_400;
  return g.expiresAt + grace < now();
}

async function itemsForLists(listIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (listIds.length === 0) return map;
  const rows = await db.query.listItems.findMany({
    where: inArray(listItems.listId, listIds),
    orderBy: [asc(listItems.createdAt)],
  });
  for (const r of rows) {
    const arr = map.get(r.listId) ?? [];
    arr.push(r.fileId);
    map.set(r.listId, arr);
  }
  return map;
}

// ---- Client-facing list CRUD. Lists belong to a gallery session; the client
// must have identified themselves (email on the session) to create or mutate. ----
export const clientListRoutes = new Elysia({ prefix: '/api/gallery' })
  .use(gallerySessionContext)

  // GET /:slug/lists — the current session's lists with their file ids.
  .get('/:slug/lists', async ({ params, gallerySession, set }) => {
    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (gallery.passwordHash && gallerySession?.galleryId !== gallery.id) {
      set.status = 401; return { error: 'locked' };
    }
    if (!gallerySession || gallerySession.galleryId !== gallery.id) {
      return { email: null, lists: [] };
    }

    const rows = await db.query.lists.findMany({
      where: and(eq(lists.galleryId, gallery.id), eq(lists.sessionToken, gallerySession.token)),
      orderBy: [asc(lists.createdAt)],
    });
    const itemMap = await itemsForLists(rows.map((r) => r.id));
    return {
      email: gallerySession.clientEmail ?? null,
      lists: rows.map((l) => ({ id: l.id, name: l.name, fileIds: itemMap.get(l.id) ?? [], createdAt: l.createdAt })),
    };
  })

  // POST /:slug/lists — create a list (requires identified email).
  .post('/:slug/lists', async (ctx) => {
    const { params, gallerySession, set } = ctx;
    const parsed = parseBody(ctx, ListCreateInput);
    if (!parsed.ok) return parsed.error;

    const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, params.slug) });
    if (!gallery) { set.status = 404; return { error: 'not_found' }; }
    if (isExpired(gallery)) { set.status = 410; return { error: 'expired' }; }
    if (!gallerySession?.clientEmail || gallerySession.galleryId !== gallery.id) {
      set.status = 403; return { error: 'email_required' };
    }

    const id = newId();
    await db.insert(lists).values({
      id,
      galleryId: gallery.id,
      sessionToken: gallerySession.token,
      clientEmail: gallerySession.clientEmail,
      name: parsed.data.name,
      createdAt: now(),
    });
    return { id, name: parsed.data.name, fileIds: [], createdAt: now() };
  })

  // PATCH /:slug/lists/:listId — rename (own list only).
  .patch('/:slug/lists/:listId', async (ctx) => {
    const { params, gallerySession, set } = ctx;
    const parsed = parseBody(ctx, ListPatchInput);
    if (!parsed.ok) return parsed.error;
    const list = await ownedList(params.slug, params.listId, gallerySession, set);
    if (!list.ok) return list.error;
    await db.update(lists).set({ name: parsed.data.name }).where(eq(lists.id, list.row.id));
    return { ok: true };
  })

  // DELETE /:slug/lists/:listId
  .delete('/:slug/lists/:listId', async (ctx) => {
    const { params, gallerySession, set } = ctx;
    const list = await ownedList(params.slug, params.listId, gallerySession, set);
    if (!list.ok) return list.error;
    await db.delete(lists).where(eq(lists.id, list.row.id));
    return { ok: true };
  })

  // POST /:slug/lists/:listId/items — add a file (idempotent).
  .post('/:slug/lists/:listId/items', async (ctx) => {
    const { params, gallerySession, set } = ctx;
    const parsed = parseBody(ctx, ListItemInput);
    if (!parsed.ok) return parsed.error;
    const list = await ownedList(params.slug, params.listId, gallerySession, set);
    if (!list.ok) return list.error;

    const file = await db.query.files.findFirst({ where: eq(files.id, parsed.data.fileId) });
    if (!file || file.galleryId !== list.row.galleryId) { set.status = 404; return { error: 'file_not_found' }; }

    const existing = await db.query.listItems.findFirst({
      where: and(eq(listItems.listId, list.row.id), eq(listItems.fileId, parsed.data.fileId)),
    });
    if (!existing) {
      await db.insert(listItems).values({
        id: newId(), listId: list.row.id, fileId: parsed.data.fileId, createdAt: now(),
      });
    }
    return { ok: true };
  })

  // DELETE /:slug/lists/:listId/items/:fileId
  .delete('/:slug/lists/:listId/items/:fileId', async (ctx) => {
    const { params, gallerySession, set } = ctx;
    const list = await ownedList(params.slug, params.listId, gallerySession, set);
    if (!list.ok) return list.error;
    await db.delete(listItems).where(
      and(eq(listItems.listId, list.row.id), eq(listItems.fileId, params.fileId)),
    );
    return { ok: true };
  });

type SetCtx = { status?: number | string };
type OwnedResult =
  | { ok: true; row: typeof lists.$inferSelect }
  | { ok: false; error: { error: string } };

// Loads a list and asserts it belongs to the requesting session.
async function ownedList(
  slug: string,
  listId: string,
  session: { token: string; galleryId: string } | null,
  set: SetCtx,
): Promise<OwnedResult> {
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.slug, slug) });
  if (!gallery) { set.status = 404; return { ok: false, error: { error: 'not_found' } }; }
  if (!session || session.galleryId !== gallery.id) {
    set.status = 403; return { ok: false, error: { error: 'forbidden' } };
  }
  const row = await db.query.lists.findFirst({ where: eq(lists.id, listId) });
  if (!row || row.galleryId !== gallery.id || row.sessionToken !== session.token) {
    set.status = 404; return { ok: false, error: { error: 'list_not_found' } };
  }
  return { ok: true, row };
}

// ---- Admin: read every list in a gallery (with the client's email). ----
export const adminListRoutes = new Elysia({ prefix: '/api/galleries/:galleryId/lists' })
  .use(authContext)
  .get('/', async (ctx) => {
    const auth = requireAuth(ctx);
    if (auth) return auth;
    const me = ctx.currentPhotographer!;

    const gallery = await db.query.galleries.findFirst({
      where: and(eq(galleries.id, ctx.params.galleryId), eq(galleries.photographerId, me.id)),
    });
    if (!gallery) { ctx.set.status = 404; return { error: 'gallery_not_found' }; }

    const rows = await db.query.lists.findMany({
      where: eq(lists.galleryId, gallery.id),
      orderBy: [asc(lists.createdAt)],
    });
    const itemMap = await itemsForLists(rows.map((r) => r.id));
    return rows.map((l) => ({
      id: l.id,
      name: l.name,
      clientEmail: l.clientEmail,
      fileIds: itemMap.get(l.id) ?? [],
      createdAt: l.createdAt,
    }));
  });

// Note: client list mutations are NOT CSRF-protected — gallery clients have no
// CSRF cookie (that's an admin-only primitive). Ownership is enforced via the
// opaque session token instead.
