// Sharp pipeline per v1.2 §9. Reads the original from S3, generates
// thumbnail/preview/(optionally watermarked) WebP derivatives, strips EXIF GPS,
// extracts a dominant-colour palette via Sharp's .stats(), and writes
// everything back to S3.
import sharp from 'sharp';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { WatermarkConfig } from '@lumiere/types';
import { db } from '../db';
import { files, galleries, watermarkPresets } from '../db/schema';
import { uploadObject } from './storage';
import { applyWatermark } from './watermark';
import { env } from '../lib/config';
import { log } from '../lib/logger';
import { emit } from './events';
import type { JobRow } from './queue';

const THUMB_WIDTH = 600;
const PREVIEW_WIDTH = 2400;
const THUMB_QUALITY = 82;
const PREVIEW_QUALITY = 88;

const s3Internal = new S3Client({
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  endpoint: env.S3_ENDPOINT_INTERNAL,
});

async function fetchOriginal(key: string): Promise<Buffer> {
  const res = await s3Internal.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`empty body for ${key}`);
  const chunks: Uint8Array[] = [];
  // @ts-expect-error — Body is a Node Readable in this context
  for await (const chunk of res.Body) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}

interface ProcessPhotoPayload {
  photoId: string;
  galleryId: string;
  batchId: string;
  s3KeyOriginal: string;
  filename: string;
}

async function maybeBuildWatermarked(galleryId: string, photoId: string, previewBuf: Buffer): Promise<string | null> {
  const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, galleryId) });
  if (!gallery?.watermarkPresetId) return null;

  const preset = await db.query.watermarkPresets.findFirst({
    where: eq(watermarkPresets.id, gallery.watermarkPresetId),
  });
  if (!preset) return null;

  const cfgParsed = WatermarkConfig.safeParse(JSON.parse(preset.config));
  if (!cfgParsed.success) {
    log.warn('watermark preset has invalid config', { presetId: preset.id, issues: cfgParsed.error.issues });
    return null;
  }

  const watermarkedBuf = await applyWatermark(previewBuf, cfgParsed.data);
  const watermarkedKey = `watermarked/${galleryId}/${photoId}.webp`;
  await uploadObject(watermarkedKey, watermarkedBuf, 'image/webp');
  return watermarkedKey;
}

function narrow(payload: Record<string, unknown>): ProcessPhotoPayload {
  const { photoId, galleryId, batchId, s3KeyOriginal, filename } = payload;
  if (
    typeof photoId !== 'string' || typeof galleryId !== 'string' ||
    typeof batchId !== 'string' || typeof s3KeyOriginal !== 'string' ||
    typeof filename !== 'string'
  ) {
    throw new Error('invalid process_photo payload');
  }
  return { photoId, galleryId, batchId, s3KeyOriginal, filename };
}

export async function handleProcessPhoto(rawPayload: Record<string, unknown>, _job: JobRow): Promise<void> {
  const { photoId, galleryId, batchId, s3KeyOriginal, filename } = narrow(rawPayload);

  emit(batchId, { type: 'processing', photoId, filename });

  try {
    const original = await fetchOriginal(s3KeyOriginal);

    // Auto-rotate by EXIF, then drop EXIF (including GPS) from derivatives.
    const pipeline = sharp(original, { failOn: 'error' }).rotate();
    const metadata = await pipeline.metadata();

    const width = metadata.width ?? null;
    const height = metadata.height ?? null;

    // Palette: 3-channel stats give us per-channel dominant; we collapse to one hex.
    const stats = await sharp(original).rotate().stats();
    const dominant = stats.dominant;
    const paletteHex = `#${[dominant.r, dominant.g, dominant.b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')}`;
    const palette = [paletteHex];

    const thumbBuf = await sharp(original)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    const thumbKey = `thumbnails/${galleryId}/${photoId}.webp`;
    await uploadObject(thumbKey, thumbBuf, 'image/webp');

    const previewBuf = await sharp(original)
      .rotate()
      .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer();
    const previewKey = `previews/${galleryId}/${photoId}.webp`;
    await uploadObject(previewKey, previewBuf, 'image/webp');

    // Watermarked derivative — only produced when the gallery has a preset
    // assigned. Composited on top of the preview so it matches what the client
    // sees in the lightbox.
    const watermarkedKey = await maybeBuildWatermarked(galleryId, photoId, previewBuf);

    await db.update(files).set({
      s3KeyThumbnail: thumbKey,
      s3KeyPreview: previewKey,
      s3KeyWatermarked: watermarkedKey,
      width,
      height,
      fileSize: original.byteLength,
      colorPalette: JSON.stringify(palette),
      uploadStatus: 'ready',
    }).where(eq(files.id, photoId));

    emit(batchId, {
      type: 'ready',
      photoId,
      filename,
      thumbnailUrl: `/img/${galleryId}/${photoId}/thumb`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('process_photo failed', { photoId, msg });
    await db.update(files).set({
      uploadStatus: 'error',
      errorMessage: msg,
    }).where(eq(files.id, photoId));
    emit(batchId, { type: 'error', photoId, filename, reason: msg });
    throw err;
  }
}
