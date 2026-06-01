// `send_email` job handler. Runs in the worker; the request handlers just
// enqueue a row + a notification.
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { sendEmail, type EmailTemplate } from './email';
import { now } from '../lib/ids';
import { log } from '../lib/logger';
import type { JobRow } from './queue';

interface SendEmailPayload {
  notificationId: string;
  template: EmailTemplate;
  to: string;
  data: Record<string, unknown>;
}

function narrow(payload: Record<string, unknown>): SendEmailPayload {
  const { notificationId, template, to, data } = payload;
  if (
    typeof notificationId !== 'string' ||
    (template !== 'gallery_viewed' && template !== 'download' && template !== 'favorites_received') ||
    typeof to !== 'string' ||
    !data || typeof data !== 'object'
  ) {
    throw new Error('invalid send_email payload');
  }
  return { notificationId, template, to, data: data as Record<string, unknown> };
}

export async function handleSendEmail(rawPayload: Record<string, unknown>, _job: JobRow): Promise<void> {
  const { notificationId, template, to, data } = narrow(rawPayload);
  try {
    const result = await sendEmail(template, to, data);
    await db.update(notifications)
      .set({ status: 'sent', sentAt: now() })
      .where(eq(notifications.id, notificationId));
    log.info('email.sent', { notificationId, template, to, messageId: result.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('email.failed', { notificationId, template, to, msg });
    await db.update(notifications)
      .set({ status: 'error' })
      .where(eq(notifications.id, notificationId));
    throw err;
  }
}
