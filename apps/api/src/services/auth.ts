import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from '@node-rs/argon2';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens } from '../db/schema';
import { env } from '../lib/config';
import { newId, now } from '../lib/ids';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'lumiere';
const AUDIENCE = 'lumiere-admin';

export interface AccessClaims {
  sub: string; // photographer id
  email: string;
}

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}

export async function issueAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

function sha256Hex(input: string): string {
  return new Bun.CryptoHasher('sha256').update(input).digest('hex');
}

export async function issueRefreshToken(photographerId: string): Promise<{ raw: string; expiresAt: number }> {
  const raw = newId(48);
  const tokenHash = sha256Hex(raw);
  const expiresAt = now() + env.REFRESH_TOKEN_TTL_SECONDS;
  await db.insert(refreshTokens).values({
    id: newId(),
    photographerId,
    tokenHash,
    expiresAt,
    createdAt: now(),
  });
  return { raw, expiresAt };
}

export async function rotateRefreshToken(raw: string): Promise<
  | { ok: true; photographerId: string; newRaw: string; expiresAt: number }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' }
> {
  const tokenHash = sha256Hex(raw);
  const row = await db.query.refreshTokens.findFirst({
    where: and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)),
  });
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expiresAt < now()) return { ok: false, reason: 'expired' };

  await db.update(refreshTokens).set({ revokedAt: now() }).where(eq(refreshTokens.id, row.id));
  const fresh = await issueRefreshToken(row.photographerId);
  return { ok: true, photographerId: row.photographerId, newRaw: fresh.raw, expiresAt: fresh.expiresAt };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const tokenHash = sha256Hex(raw);
  await db.update(refreshTokens).set({ revokedAt: now() }).where(eq(refreshTokens.tokenHash, tokenHash));
}
