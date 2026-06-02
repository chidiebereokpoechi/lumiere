import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { files } from '../db/schema';
import { abortMultipartUpload } from './storage';
import { now } from '../lib/ids';
import { log } from '../lib/logger';

// Multipart uploads that never complete (tab closed, network died) leave a
// 'uploading' files row + incomplete S3 parts that cost storage. Periodically
// abort and delete those older than `staleAfterMs`.
export function startUploadReaper(opts: { intervalMs: number; staleAfterMs: number }): void {
  const tick = async () => {
    const cutoff = now() - Math.floor(opts.staleAfterMs / 1000);
    const stale = await db.query.files.findMany({
      where: and(eq(files.uploadStatus, 'uploading'), lt(files.createdAt, cutoff)),
    });
    for (const f of stale) {
      if (f.s3UploadId && f.s3KeyOriginal) {
        await abortMultipartUpload(f.s3KeyOriginal, f.s3UploadId).catch(() => { /* best-effort */ });
      }
      await db.delete(files).where(eq(files.id, f.id));
    }
    if (stale.length > 0) log.warn('upload reaper cleaned orphaned uploads', { count: stale.length });
  };
  setInterval(() => { void tick(); }, opts.intervalMs);
}
