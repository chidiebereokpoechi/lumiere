import { z } from 'zod';

// Booleans on the wire, 0/1 in the DB. Transforms here so handlers don't have
// to rewrap. Stays `undefined` when the field is absent in a PATCH.
//
// Idempotent: accepts a real boolean OR an already-coerced 0/1. The frontend
// validates with this same schema before sending, which turns `true` → `1`;
// the API then re-parses, so dbBool must tolerate seeing `1` the second time
// (otherwise z.boolean() rejects the number and the PATCH 400s).
const dbBool = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((v) => (v === true || v === 1 ? 1 : 0));

export const GalleryCreateInput = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).optional(),
  subtitle: z.string().optional(),
  password: z.string().min(1).optional(),
  clientName: z.string().optional(),
  clientEmail: z.string().email().optional(),
  eventDate: z.number().int().optional(),
  eventType: z.string().optional(),
}).strict();
export type GalleryCreateInput = z.infer<typeof GalleryCreateInput>;

export const GalleryPatchInput = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().nullable(),
  status: z.enum(['active', 'archived', 'draft']),
  downloadMode: z.enum(['none', 'watermarked', 'full', 'selected']),
  expiresAt: z.number().int().nullable(),
  gracePeriodDays: z.number().int().min(0),
  allowFavorites: dbBool,
  allowComments: dbBool,
  allowDownload: dbBool,
  notifyOnView: dbBool,
  clientName: z.string().nullable(),
  clientEmail: z.string().email().nullable(),
  eventDate: z.number().int().nullable(),
  eventType: z.string().nullable(),
  layout: z.enum(['grid', 'masonry', 'slideshow']),
  colorTheme: z.string(),
  customCss: z.string().nullable(),
  sortOrder: z.string(),
  coverFileId: z.string().nullable(),
  watermarkPresetId: z.string().nullable(),
  password: z.string().nullable(),
}).partial().strict();
export type GalleryPatchInput = z.infer<typeof GalleryPatchInput>;
