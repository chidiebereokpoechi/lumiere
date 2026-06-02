import { eq, and, gte } from 'drizzle-orm';
import { db, rawDb } from '../db';
import { gallerySessions } from '../db/schema';
import { newId, now } from '../lib/ids';

const TTL_SECONDS = 72 * 60 * 60; // v1.2 §14: 72h

export const GALLERY_SESSION_COOKIE = 'lumiere_gs';

export interface GallerySession {
  token: string;
  galleryId: string;
  expiresAt: number;
  clientEmail?: string | null;
}

/**
 * Issue a new gallery session token (32-byte hex opaque, v1.2 §14). The token
 * is stored raw — the schema's `gallery_sessions.token` column is the PK and
 * the spec keeps it un-hashed. Compare with `refresh_tokens.token_hash`,
 * which IS hashed; the asymmetry is deliberate per v1.2.
 */
export function createGallerySession(galleryId: string, clientIp: string | undefined): GallerySession {
  const token = newId(64); // 64 chars in our base-56 alphabet ≈ 372 bits of entropy
  const expiresAt = now() + TTL_SECONDS;
  db.insert(gallerySessions).values({
    token,
    galleryId,
    clientIp: clientIp ?? null,
    createdAt: now(),
    expiresAt,
  }).run();
  return { token, galleryId, expiresAt };
}

export async function findValidGallerySession(token: string): Promise<GallerySession | null> {
  const row = await db.query.gallerySessions.findFirst({
    where: and(eq(gallerySessions.token, token), gte(gallerySessions.expiresAt, now())),
  });
  if (!row) return null;
  return { token: row.token, galleryId: row.galleryId, expiresAt: row.expiresAt, clientEmail: row.clientEmail };
}

/** Attach the client's email to a session (one-time, on first favorite/list). */
export function setGallerySessionEmail(token: string, email: string): void {
  db.update(gallerySessions).set({ clientEmail: email }).where(eq(gallerySessions.token, token)).run();
}

export function pruneExpiredGallerySessions(): number {
  const result = rawDb.run('DELETE FROM gallery_sessions WHERE expires_at < ?', [now()]);
  return result.changes;
}
