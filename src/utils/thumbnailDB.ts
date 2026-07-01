/**
 * IndexedDB-backed persistent thumbnail cache — encrypted at rest.
 *
 * Thumbnails are visual previews of vault content, so storing them as
 * plaintext blobs (as earlier versions did) was a forensic leak: they
 * survived vault lock and were readable by anything that could read the
 * webview profile directory. Every record is now AES-256-GCM encrypted with
 * a key the backend derives one-way from the vault's master key
 * (get_cache_key). While the vault is locked the cache is undecryptable
 * noise; unlocking restores instant cache hits.
 *
 * Legacy plaintext entries are purged the first time a cache key is
 * installed, and are never returned to callers.
 */

const DB_NAME = "cybervault_thumbnails";
const DB_VERSION = 1;
const STORE_NAME = "thumbs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// ── Cache encryption key (vault-derived, session-scoped) ──

let _cacheKey: CryptoKey | null = null;
let _legacyPurged = false;

interface EncryptedThumbRecord {
  v: 2;
  iv: Uint8Array;
  data: ArrayBuffer;
  type: string;
}

/**
 * Install the vault-derived cache key (hex, from the backend's get_cache_key
 * command). Call on every unlock. Also purges any plaintext entries written
 * by older app versions.
 */
export async function initThumbCacheKey(hexKey: string): Promise<void> {
  try {
    const raw = new Uint8Array(hexKey.length / 2);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = parseInt(hexKey.slice(i * 2, i * 2 + 2), 16);
    }
    _cacheKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false, // non-extractable
      ["encrypt", "decrypt"],
    );
    raw.fill(0);
    void purgeLegacyPlaintext();
  } catch {
    _cacheKey = null;
  }
}

/** Drop the cache key (call on vault lock). Cached data becomes unreadable. */
export function clearThumbCacheKey(): void {
  _cacheKey = null;
}

async function encryptBlob(blob: Blob): Promise<EncryptedThumbRecord | null> {
  if (!_cacheKey) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      _cacheKey,
      await blob.arrayBuffer(),
    );
    return { v: 2, iv, data, type: blob.type || "image/webp" };
  } catch {
    return null;
  }
}

async function decryptRecord(rec: EncryptedThumbRecord): Promise<Blob | null> {
  if (!_cacheKey) return null;
  try {
    // Fresh copy: values from IndexedDB are typed Uint8Array<ArrayBufferLike>,
    // which TS won't accept as BufferSource.
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
      _cacheKey,
      rec.data,
    );
    return new Blob([plaintext], { type: rec.type || "image/webp" });
  } catch {
    // Wrong vault's key (or corrupt record) — treat as a miss.
    return null;
  }
}

/** One-time sweep deleting plaintext Blob records from older versions. */
async function purgeLegacyPlaintext(): Promise<void> {
  if (_legacyPurged) return;
  _legacyPurged = true;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (cursor.value instanceof Blob) cursor.delete();
      cursor.continue();
    };
  } catch {
    // silent fail
  }
}

export async function getCachedThumbnail(fileId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const rec = await new Promise<unknown>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(fileId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!rec) return null;
    if (rec instanceof Blob) {
      // Legacy plaintext entry — purge it; it re-caches encrypted on next fetch.
      void deleteCachedThumbnail(fileId);
      return null;
    }
    const r = rec as EncryptedThumbRecord;
    if (r.v === 2 && r.iv && r.data) {
      const blob = await decryptRecord(r);
      if (!blob) void deleteCachedThumbnail(fileId); // undecryptable — stale
      return blob;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setCachedThumbnail(fileId: string, blob: Blob): Promise<void> {
  // No cache key (vault locked, or a legacy unencrypted vault) — never fall
  // back to storing plaintext; the thumbnail just isn't persisted.
  const rec = await encryptBlob(blob);
  if (!rec) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(rec, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // IndexedDB not available — silent fail
  }
}

export async function deleteCachedThumbnail(fileId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // silent fail
  }
}

/**
 * Delete every cached thumbnail belonging to a file: the bare video key
 * (`fileId`) and all sized image keys (`fileId@<size>`). Called when a file is
 * permanently deleted so its preview doesn't linger in the cache.
 */
export async function deleteCachedThumbnailsForFile(fileId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      // [fileId, fileId+"￿"] covers "fileId" and "fileId@256" etc. File
      // IDs are fixed-length UUIDs, so no other file's keys fall in this range.
      store.delete(IDBKeyRange.bound(fileId, fileId + "￿"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // silent fail
  }
}

export async function clearAllCachedThumbnails(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // silent fail
  }
}
