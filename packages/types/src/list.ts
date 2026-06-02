import { z } from 'zod';

// Client identifies themselves once per session with an email; required before
// favoriting or creating lists.
export const IdentifyInput = z.object({
  email: z.string().email(),
}).strict();
export type IdentifyInput = z.infer<typeof IdentifyInput>;

export const ListCreateInput = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type ListCreateInput = z.infer<typeof ListCreateInput>;

export const ListPatchInput = z.object({
  name: z.string().min(1).max(120),
}).strict();
export type ListPatchInput = z.infer<typeof ListPatchInput>;

export const ListItemInput = z.object({
  fileId: z.string().min(1),
}).strict();
export type ListItemInput = z.infer<typeof ListItemInput>;
