/**
 * Efficiently decode a base64 string to a Uint8Array.
 * Avoids the slow char-by-char loop pattern used elsewhere.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to a base64 string in fixed-size chunks.
 * Avoids `String.fromCharCode(...bytes)`, whose argument spread overflows the
 * call stack for large inputs (RangeError: Maximum call stack size exceeded).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB per fromCharCode call
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decode base64 data into a Blob with the given MIME type.
 */
export function base64ToBlob(b64: string, mimeType: string): Blob {
  return new Blob([base64ToBytes(b64) as BlobPart], { type: mimeType });
}

/**
 * Decode base64 data into a blob URL. Caller must revoke with URL.revokeObjectURL().
 */
export function base64ToBlobUrl(b64: string, mimeType: string): string {
  return URL.createObjectURL(base64ToBlob(b64, mimeType));
}
