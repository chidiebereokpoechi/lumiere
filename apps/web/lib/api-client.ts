/**
 * Two API clients — one for React Server Components, one for client code.
 *
 * Server-side (`apiServer`): runs inside the Next.js Node process during RSC
 * rendering. It targets the internal API URL (the Bun container in prod,
 * localhost:3200 in dev) and explicitly forwards the incoming request's cookies
 * so the backend can validate the photographer JWT / gallery session.
 *
 * Client-side (`apiClient`): runs in the browser. Requests go to the same
 * origin as the page (the Next.js server in dev, nginx in prod) and the
 * browser handles cookies automatically. We default to `credentials: 'include'`
 * because every authenticated endpoint relies on httpOnly cookies.
 */

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://localhost:3200';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiServer<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Dynamically import next/headers to avoid bundling it into client code if
  // this file is ever pulled into a 'use client' module.
  const { cookies } = await import('next/headers');
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${INTERNAL_API}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readJson(res));
  }
  return readJson(res) as Promise<T>;
}

export async function apiClient<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...init?.headers },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readJson(res));
  }
  return readJson(res) as Promise<T>;
}

/**
 * Wrapper for client-side mutations. Fetches the CSRF token first if we don't
 * already have it cached in the cookie, then attaches the `X-CSRF-Token`
 * header on top of `apiClient`.
 */
export async function apiClientMutation<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Best-effort CSRF read from the lumiere_csrf cookie (set by GET /api/auth/csrf
  // for admin sessions; the backend just needs the header to match the cookie).
  const csrf = readCookie('lumiere_csrf');
  let token = csrf;
  if (!token) {
    const { token: fresh } = await apiClient<{ token: string }>('/api/auth/csrf');
    token = fresh;
  }
  return apiClient<T>(path, {
    ...init,
    headers: { ...init.headers, 'X-CSRF-Token': token! },
  });
}

/**
 * Client-side JSON request with the body serialized and the content-type set.
 * Thin sugar over `apiClient` for the common mutation shape.
 */
export function postJson<T = unknown>(
  path: string,
  body: unknown,
  method = "POST",
): Promise<T> {
  return apiClient<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Resolve the CSRF token: read the `lumiere_csrf` cookie, falling back to a
 * fresh `GET /api/auth/csrf`. Exported for callers that issue mutations outside
 * `apiClientMutation` (e.g. the XHR upload path, which needs the raw header).
 */
export async function getCsrfToken(): Promise<string> {
  const cached = readCookie("lumiere_csrf");
  if (cached) return cached;
  const { token } = await apiClient<{ token: string }>("/api/auth/csrf");
  return token;
}

/**
 * Uniform user-facing message for a failed request. `action` describes what was
 * attempted, e.g. `apiErrorMessage(err, "Reorder failed")` →
 * "Reorder failed (409)" for an ApiError, "Network error" otherwise.
 */
export function apiErrorMessage(err: unknown, action: string): string {
  return err instanceof ApiError ? `${action} (${err.status})` : "Network error";
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const target = `${name}=`;
  for (const cookie of document.cookie.split(';')) {
    const trimmed = cookie.trimStart();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return undefined;
}
