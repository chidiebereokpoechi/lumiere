const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstuvwxyz';

export function newId(length = 21): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
