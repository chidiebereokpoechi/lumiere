import type { z } from 'zod';
import type { Context } from 'elysia';

/**
 * Validate the already-parsed request body against a Zod schema. Elysia has
 * read the body and exposed it as `ctx.body` by the time the handler runs;
 * this just adds schema enforcement + nice errors on top.
 *
 *   const parsed = parseBody(ctx, MySchema);
 *   if (!parsed.ok) return parsed.error;
 *   const input = parsed.data;
 */
export function parseBody<S extends z.ZodTypeAny>(
  ctx: Pick<Context, 'body' | 'set'>,
  schema: S,
): { ok: true; data: z.infer<S> } | { ok: false; error: { error: string; issues: z.ZodIssue[] } } {
  const result = schema.safeParse(ctx.body);
  if (!result.success) {
    ctx.set.status = 400;
    return { ok: false, error: { error: 'validation_failed', issues: result.error.issues } };
  }
  return { ok: true, data: result.data };
}
