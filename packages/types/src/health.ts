import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  s3: z.enum(['ok', 'error']),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
