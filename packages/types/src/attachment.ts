import { z } from 'zod';

export const AttachmentPatchInput = z.object({
  displayName: z.string().min(1).max(200).nullable(),
  description: z.string().max(2000).nullable(),
  position: z.number().int().min(0),
  folderId: z.string().nullable(),
}).partial().strict();
export type AttachmentPatchInput = z.infer<typeof AttachmentPatchInput>;
