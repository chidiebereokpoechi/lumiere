import archiver from 'archiver';
import type { Archiver } from 'archiver';
import { getObjectStream } from './storage';
import { log } from '../lib/logger';

export interface ZipEntry {
  key: string;        // S3 key
  filename: string;   // name inside the archive
}

/**
 * Build a streaming ZIP from S3 objects (v1.2 §9). Uses store (level 0) —
 * derivatives are already-compressed JPEG/WebP, so deflate is pure CPU cost
 * for ~0% size gain.
 *
 * Returns the archiver Readable AND a promise that resolves once all entries
 * have been appended and `.finalize()` called. The caller pipes the archive
 * straight to the HTTP response; entries are pulled on demand as the consumer
 * drains the stream.
 */
export function buildZipStream(entries: ZipEntry[]): { archive: Archiver; done: Promise<void> } {
  const archive = archiver('zip', { store: true });
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') log.warn('archiver warning', { msg: err.message });
    else throw err;
  });
  archive.on('error', (err) => {
    log.error('archiver error', { msg: err.message });
  });

  const done = (async () => {
    // Track filenames to dedupe collisions (multiple uploads with the same
    // original filename inside one gallery — common with "IMG_0001.jpg").
    const used = new Map<string, number>();
    for (const entry of entries) {
      let name = entry.filename;
      const seen = used.get(name);
      if (seen !== undefined) {
        const next = seen + 1;
        used.set(name, next);
        const dot = name.lastIndexOf('.');
        name = dot > 0
          ? `${name.slice(0, dot)} (${next})${name.slice(dot)}`
          : `${name} (${next})`;
      } else {
        used.set(name, 0);
      }
      const stream = await getObjectStream(entry.key);
      archive.append(stream, { name });
    }
    await archive.finalize();
  })();

  // Don't let an unhandled rejection escape — the route layer will see it via
  // the response stream being aborted.
  done.catch((err) => log.error('zip builder failed', { msg: err instanceof Error ? err.message : String(err) }));

  return { archive, done };
}
