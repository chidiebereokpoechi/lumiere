function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    console.error(`[config] Env var ${name} is not a number: ${v}`);
    process.exit(1);
  }
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: int('PORT', 3000),
  BASE_URL: optional('BASE_URL', 'http://localhost:3000'),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),

  JWT_SECRET: required('JWT_SECRET'),
  ACCESS_TOKEN_TTL_SECONDS: int('ACCESS_TOKEN_TTL_SECONDS', 3600),
  REFRESH_TOKEN_TTL_SECONDS: int('REFRESH_TOKEN_TTL_SECONDS', 60 * 60 * 24 * 30),

  ADMIN_EMAIL: optional('ADMIN_EMAIL', ''),
  ADMIN_PASSWORD: optional('ADMIN_PASSWORD', ''),

  DATABASE_PATH: optional('DATABASE_PATH', './data/lumiere.db'),

  S3_ENDPOINT_INTERNAL: required('S3_ENDPOINT_INTERNAL'),
  S3_ENDPOINT_PUBLIC: required('S3_ENDPOINT_PUBLIC'),
  S3_REGION: optional('S3_REGION', 'us-east-1'),
  S3_BUCKET: required('S3_BUCKET'),
  S3_ACCESS_KEY: required('S3_ACCESS_KEY'),
  S3_SECRET_KEY: required('S3_SECRET_KEY'),
  S3_FORCE_PATH_STYLE: bool('S3_FORCE_PATH_STYLE', true),
  PRESIGN_TTL_SECONDS: int('PRESIGN_TTL_SECONDS', 60),

  TRUSTED_PROXY_HOPS: int('TRUSTED_PROXY_HOPS', 1),
  RATE_LIMIT_WINDOW_MS: int('RATE_LIMIT_WINDOW_MS', 60_000),

  SMTP_HOST: optional('SMTP_HOST', ''),
  SMTP_PORT: int('SMTP_PORT', 587),
  SMTP_USER: optional('SMTP_USER', ''),
  SMTP_PASS: optional('SMTP_PASS', ''),
  FROM_EMAIL: optional('FROM_EMAIL', 'noreply@example.com'),

  IS_PROD: optional('NODE_ENV', 'development') === 'production',
} as const;
