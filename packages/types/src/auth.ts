import { z } from 'zod';

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const MeResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  brandName: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const LoginResponse = MeResponse;
export type LoginResponse = z.infer<typeof LoginResponse>;

export const CsrfResponse = z.object({
  token: z.string(),
});
export type CsrfResponse = z.infer<typeof CsrfResponse>;
