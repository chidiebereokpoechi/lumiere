import { z } from 'zod';

export const FolderCreateInput = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type FolderCreateInput = z.infer<typeof FolderCreateInput>;

export const FolderPatchInput = z.object({
  name: z.string().min(1).max(120),
  position: z.number().int().min(0),
  coverPhotoId: z.string().nullable(),
}).partial().strict();
export type FolderPatchInput = z.infer<typeof FolderPatchInput>;

// Bulk-assign photos to a folder (or null to move them back to the gallery root).
export const PhotoMoveInput = z.object({
  photoIds: z.array(z.string().min(1)).min(1),
  folderId: z.string().nullable(),
}).strict();
export type PhotoMoveInput = z.infer<typeof PhotoMoveInput>;

// Set photo order: position becomes the index of each id in the array.
export const PhotoReorderInput = z.object({
  photoIds: z.array(z.string().min(1)).min(1),
}).strict();
export type PhotoReorderInput = z.infer<typeof PhotoReorderInput>;

// Set a unified order across photos AND file attachments: each item's position
// becomes its index in the array, written to whichever table it belongs to, so
// the two share one ordering space.
export const MediaReorderInput = z.object({
  items: z.array(z.object({
    kind: z.enum(['photo', 'file']),
    id: z.string().min(1),
  })).min(1),
}).strict();
export type MediaReorderInput = z.infer<typeof MediaReorderInput>;
