import { Elysia } from 'elysia';
import { GALLERY_SESSION_COOKIE, findValidGallerySession } from '../services/gallery-session';

/**
 * Derives `gallerySession` (the current client's gallery session, if any) from
 * the `lumiere_gs` cookie. Does NOT itself enforce access — that's the job of
 * the route, since each gallery has its own ID and we need to verify the
 * session is scoped to the gallery the request is targeting.
 */
export const gallerySessionContext = new Elysia({ name: 'gallery-session-context' }).derive(
  { as: 'global' },
  async ({ cookie }) => {
    const raw = cookie[GALLERY_SESSION_COOKIE]?.value;
    const token = typeof raw === 'string' ? raw : undefined;
    if (!token) return { gallerySession: null };
    const session = await findValidGallerySession(token);
    return { gallerySession: session };
  },
);
