// Helper that wraps "create notification row + enqueue send_email job" so the
// hook points stay short and don't duplicate the gallery → photographer →
// notification → job dance.

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { galleries, photographers, notifications } from '../db/schema';
import { enqueue } from './queue';
import type { EmailTemplate } from './email';
import { env } from '../lib/config';
import { newId } from '../lib/ids';
import { log } from '../lib/logger';

export interface NotifyData {
  /** Extra template data, merged on top of the gallery defaults */
  [k: string]: unknown;
}

/**
 * Look up the gallery and its photographer, write a `notifications` row, and
 * enqueue a `send_email` job. Returns the notification id, or null if there's
 * no one to send to (no photographer email).
 *
 * Each template gets these gallery defaults injected for free:
 *   - galleryTitle, gallerySlug, galleryUrl
 * Callers add anything else (clientName, photoCount, etc) via `data`.
 */
export async function notifyPhotographer(
  galleryId: string,
  template: EmailTemplate,
  data: NotifyData = {},
): Promise<string | null> {
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery) return null;
  const photographer = await db.query.photographers.findFirst({
    where: eq(photographers.id, gallery.photographerId),
  });
  if (!photographer?.email) {
    log.warn('notify skipped: no photographer email', { galleryId, template });
    return null;
  }

  const notificationId = newId();
  await db.insert(notifications).values({
    id: notificationId,
    galleryId,
    type: template,
    recipient: photographer.email,
    status: 'pending',
  });

  await enqueue('send_email', {
    notificationId,
    template,
    to: photographer.email,
    data: {
      galleryTitle: gallery.title,
      gallerySlug: gallery.slug,
      galleryUrl: `${env.BASE_URL}/g/${gallery.slug}`,
      baseUrl: env.BASE_URL,
      ...data,
    },
  }, galleryId);

  return notificationId;
}
