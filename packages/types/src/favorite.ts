import { z } from 'zod';

export const FavoriteInput = z.object({
  photoId: z.string().min(1),
  note: z.string().max(500).optional(),
  clientEmail: z.string().email().optional(),
}).strict();
export type FavoriteInput = z.infer<typeof FavoriteInput>;

export const UnfavoriteInput = z.object({
  photoId: z.string().min(1),
}).strict();
export type UnfavoriteInput = z.infer<typeof UnfavoriteInput>;
