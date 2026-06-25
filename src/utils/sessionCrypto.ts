/**
 * Session-level encryption for sensitive data (passwords, TOTP secrets).
 *
 * Uses Web Crypto AES-GCM with a non-extractable key generated fresh each
 * session. The key lives inside the browser's crypto module and cannot be read
 * back out as bytes from JavaScript.
 *
 * What this gains you: sensitive fields are stored as ciphertext in React
 * state, so they are not sitting in the clear in app state most of the time,
 * and the raw key cannot be exported by JS.
 *
 * What it does NOT do: it is not protection against a full memory dump or a
 * compromised renderer. The decryption key and any value you actually decrypt
 * for display both live in this same process, so an attacker who can read the
 * process memory can still recover plaintext. Treat this as state hygiene, not
 * as a defense against an attacker with code execution / memory access.
 */

import { bytesToBase64, base64ToBytes } from "./base64";

const ENC_PREFIX = "__enc:";
let _sessionKey: CryptoKey | null = null;

/** Generate a fresh session key (call once on vault unlock). */
export async function initSessionKey(): Promise<void> {
  _sessionKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,           // non-extractable — cannot be read back from JS
    ["encrypt", "decrypt"],
  );
}

/** Destroy the session key (call on vault lock). */
export function clearSessionKey(): void {
  _sessionKey = null;
}

/** Encrypt a plaintext string → prefixed base64 blob. */
export async function encryptField(plaintext: string): Promise<string> {
  if (!_sessionKey || !plaintext) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    _sessionKey,
    encoded,
  );
  // Pack iv + ciphertext into one base64 string
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return ENC_PREFIX + bytesToBase64(combined);
}

/** Decrypt a prefixed blob → plaintext string. */
export async function decryptField(blob: string): Promise<string> {
  if (!_sessionKey || !blob.startsWith(ENC_PREFIX)) return blob;
  const bytes = base64ToBytes(blob.slice(ENC_PREFIX.length));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    _sessionKey,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

/** Check whether a value is session-encrypted. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/** Encrypt password & totpSecret fields in a PasswordItem array (in-place copy). */
export async function encryptPasswords<T extends { password: string; totpSecret?: string }>(
  items: T[],
): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      password: await encryptField(item.password),
      totpSecret: item.totpSecret ? await encryptField(item.totpSecret) : item.totpSecret,
    })),
  );
}

/** Return the encrypted length (for glitch mask display). */
export function encryptedLength(blob: string): number {
  if (!blob.startsWith(ENC_PREFIX)) return blob.length;
  // Approximate original length from base64 size minus overhead
  const b64 = blob.slice(ENC_PREFIX.length);
  const rawLen = Math.floor((b64.length * 3) / 4) - 12 - 16; // minus iv and tag
  return Math.max(rawLen, 1);
}
