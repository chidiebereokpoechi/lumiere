// `apply_watermark` job handler. Re-runs ONLY the watermark composition step
// for an existing photo (the preview is already on S3, so we read that rather
// than the original — same visual result as the upload pipeline, faster, and
// no need to re-extract EXIF/palette).
//
// Used by the "reprocess on watermark preset change" flow in galleries.ts.
import { eq } from 'drizzle-orm';
import { WatermarkConfig } from '@lumiere/types';
import { db } from '../db';
import { photos, galleries, watermarkPresets } from '../db/schema';
import { uploadObject, getObjectStream, deleteObject } from './storage';
import { applyWatermark } from './watermark';
import { log } from '../lib/logger';
import type { JobRow } from './queue';

interface ApplyWatermarkPayload {
  photoId: string;
  galleryId: string;
}

function narrow(payload: Record<string, unknown>): ApplyWatermarkPayload {
  const { photoId, galleryId } = payload;
  if (typeof photoId !== 'string' || typeof galleryId !== 'string') {
    throw new Error('invalid apply_watermark payload');
  }
  return { photoId, galleryId };
}

async function bufferOf(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}

export async function handleApplyWatermark(rawPayload: Record<string, unknown>, _job: JobRow): Promise<void> {
  const { photoId, galleryId } = narrow(rawPayload);

  const photo = await db.query.photos.findFirst({ where: eq(photos.id, photoId) });
  if (!photo || photo.galleryId !== galleryId) {
    log.warn('apply_watermark: photo not found', { photoId, galleryId });
    return;
  }
  if (!photo.s3KeyPreview) {
    log.warn('apply_watermark: no preview yet, skipping', { photoId });
    return;
  }

  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery) return;

  // No preset attached → drop the watermarked derivative entirely.
  if (!gallery.watermarkPresetId) {
    if (photo.s3KeyWatermarked) {
      await deleteObject(photo.s3KeyWatermarked).catch(() => { /* best-effort */ });
      await db.update(photos).set({ s3KeyWatermarked: null }).where(eq(photos.id, photoId));
    }
    return;
  }

  const preset = await db.query.watermarkPresets.findFirst({
    where: eq(watermarkPresets.id, gallery.watermarkPresetId),
  });
  if (!preset) return;
  const cfg = WatermarkConfig.safeParse(JSON.parse(preset.config));
  if (!cfg.success) {
    log.warn('apply_watermark: invalid preset config', { presetId: preset.id });
    return;
  }

  const preview = await bufferOf(photo.s3KeyPreview);
  const watermarked = await applyWatermark(preview, cfg.data);
  const key = `watermarked/${galleryId}/${photoId}.webp`;
  await uploadObject(key, watermarked, 'image/webp');
  await db.update(photos).set({ s3KeyWatermarked: key }).where(eq(photos.id, photoId));
  log.info('apply_watermark.done', { photoId });
}
