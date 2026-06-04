import { z } from 'zod';

// Per-item comment. `scope` is driven by the collection the item is viewed in:
// 'set' = public comment on the file (approval-gated, shown to all);
// 'list'/'favorites' = a private editable note (one per author, by email).
// The author is the authenticated gallery session — no name/email in the body.
export const CommentInput = z.object({
  body: z.string().min(1).max(2000),
  fileId: z.string().min(1),
  scope: z.enum(['set', 'list', 'favorites']),
  listId: z.string().min(1).optional(),
}).strict();
export type CommentInput = z.infer<typeof CommentInput>;

export const CommentModerationInput = z.object({
  isApproved: z.boolean(),
}).strict();
export type CommentModerationInput = z.infer<typeof CommentModerationInput>;
