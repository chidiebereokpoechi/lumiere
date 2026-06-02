import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { galleryFolders, files } from '../db/schema';
import { newId } from '../lib/ids';

const DEFAULT_FOLDER_NAME = 'Highlights';

// Every gallery always has at least one folder. Returns the id of the first
// folder, creating a default "Highlights" folder if the gallery has none and
// sweeping any unfiled files into it (lazy migration).
export async function ensureDefaultFolder(galleryId: string): Promise<string> {
  const existing = await db.query.galleryFolders.findFirst({
    where: eq(galleryFolders.galleryId, galleryId),
    orderBy: [asc(galleryFolders.position), asc(galleryFolders.name)],
  });
  if (existing) {
    await db.update(files).set({ folderId: existing.id })
      .where(and(eq(files.galleryId, galleryId), isNull(files.folderId)));
    return existing.id;
  }

  const id = newId();
  await db.insert(galleryFolders).values({ id, galleryId, name: DEFAULT_FOLDER_NAME, position: 0 });
  await db.update(files).set({ folderId: id })
    .where(and(eq(files.galleryId, galleryId), isNull(files.folderId)));
  return id;
}
