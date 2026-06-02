import { z } from 'zod';

export const CommentInput = z.object({
  body: z.string().min(1).max(2000),
  fileId: z.string().min(1).optional(),
  clientName: z.string().min(1).max(120).optional(),
  clientEmail: z.string().email().optional(),
}).strict();
export type CommentInput = z.infer<typeof CommentInput>;

export const CommentModerationInput = z.object({
  isApproved: z.boolean(),
}).strict();
export type CommentModerationInput = z.infer<typeof CommentModerationInput>;
