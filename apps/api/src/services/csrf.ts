import { newId } from '../lib/ids';

export const CSRF_COOKIE = 'lumiere_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function newCsrfToken(): string {
  return newId(32);
}

// Constant-time equality on hex strings of the same length.
export function csrfMatches(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  if (!cookieValue || !headerValue) return false;
  if (cookieValue.length !== headerValue.length) return false;
  let diff = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ headerValue.charCodeAt(i);
  }
  return diff === 0;
}
