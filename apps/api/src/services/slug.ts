import { eq } from 'drizzle-orm';
import { db } from '../db';
import { galleries } from '../db/schema';
import { newId } from '../lib/ids';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Make a slug unique within `galleries.slug`. Tries the base first, then
 * appends short random suffixes until a free one is found.
 */
export async function uniqueGallerySlug(base: string): Promise<string> {
  let candidate = slugify(base) || newId(8).toLowerCase();
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await db.query.galleries.findFirst({ where: eq(galleries.slug, candidate) });
    if (!existing) return candidate;
    candidate = `${slugify(base) || 'gallery'}-${newId(6).toLowerCase()}`;
  }
  // Extremely unlikely to reach here; fall back to a fully random slug.
  return newId(16).toLowerCase();
}
