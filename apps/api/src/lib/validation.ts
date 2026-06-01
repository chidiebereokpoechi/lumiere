import type { z } from 'zod';
import type { Context } from 'elysia';

/**
 * Parses the request JSON body and validates it against a Zod schema. On
 * failure, sets `set.status = 400` and returns an error response object the
 * handler should return immediately. On success, returns the parsed/transformed
 * data. Use:
 *
 *   const parsed = await parseJsonBody(ctx, MySchema);
 *   if (!parsed.ok) return parsed.error;
 *   const input = parsed.data;
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  ctx: Pick<Context, 'request' | 'set'>,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; error: { error: string; issues: z.ZodIssue[] } }> {
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    ctx.set.status = 400;
    return { ok: false, error: { error: 'invalid_json', issues: [] } };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    ctx.set.status = 400;
    return { ok: false, error: { error: 'validation_failed', issues: result.error.issues } };
  }
  return { ok: true, data: result.data };
}
