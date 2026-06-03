// `process_media` job — best-effort thumbnail extraction for video/audio via
// ffmpeg. Video: a frame ~1s in. Audio: embedded cover art (the attached
// picture stream). The frame is piped to Sharp → webp thumb + preview, stored
// like image derivatives so /img/:gid/:pid/thumb serves it.
//
// Fire-and-forget: the file is already `ready` and usable; if extraction fails
// (no cover art, unsupported codec, ffmpeg missing) we just leave no thumbnail
// and the client falls back to its type icon.
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { files } from '../db/schema';
import { uploadObject, presignGet } from './storage';
import { log } from '../lib/logger';
import type { JobRow } from './queue';

const THUMB_WIDTH = 600;
const PREVIEW_WIDTH = 1600;

async function extractFrame(url: string, isVideo: boolean): Promise<Buffer | null> {
  // For video, seek ~1s in for a representative frame; for audio the cover art
  // is the single video frame at 0. mjpeg to stdout, then Sharp re-encodes.
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...(isVideo ? ['-ss', '1'] : []),
    '-i', url,
    '-an', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1',
  ];
  try {
    const proc = Bun.spawn(['ffmpeg', ...args], { stdout: 'pipe', stderr: 'ignore' });
    const buf = Buffer.from(await new Response(proc.stdout).arrayBuffer());
    await proc.exited;
    if (proc.exitCode !== 0 || buf.length === 0) return null;
    return buf;
  } catch (err) {
    log.warn('ffmpeg.spawn_failed', { msg: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

interface Payload { photoId: string; galleryId: string; kind: 'video' | 'audio' }
function narrow(p: Record<string, unknown>): Payload {
  const { photoId, galleryId, kind } = p;
  if (typeof photoId !== 'string' || typeof galleryId !== 'string' || (kind !== 'video' && kind !== 'audio')) {
    throw new Error('invalid process_media payload');
  }
  return { photoId, galleryId, kind };
}

export async function handleProcessMedia(rawPayload: Record<string, unknown>, _job: JobRow): Promise<void> {
  const { photoId, galleryId, kind } = narrow(rawPayload);
  const photo = await db.query.files.findFirst({ where: eq(files.id, photoId) });
  if (!photo?.s3KeyOriginal) return;

  const url = await presignGet(photo.s3KeyOriginal, 600);
  const frame = await extractFrame(url, kind === 'video');
  if (!frame) {
    log.info('process_media.no_thumbnail', { photoId, kind });
    return;
  }

  const meta = await sharp(frame).metadata();
  const thumb = await sharp(frame).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const preview = await sharp(frame).resize({ width: PREVIEW_WIDTH, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const thumbKey = `thumbnails/${galleryId}/${photoId}.webp`;
  const previewKey = `previews/${galleryId}/${photoId}.webp`;
  await uploadObject(thumbKey, thumb, 'image/webp');
  await uploadObject(previewKey, preview, 'image/webp');

  await db.update(files).set({
    s3KeyThumbnail: thumbKey,
    s3KeyPreview: previewKey,
    width: meta.width ?? photo.width,
    height: meta.height ?? photo.height,
  }).where(eq(files.id, photoId));
  log.info('process_media.done', { photoId, kind });
}
