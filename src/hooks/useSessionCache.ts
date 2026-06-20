import { useRef, useCallback } from "react";
import type { VaultFile } from "../stores/useStore";

/**
 * Session-level caches for:
 * 1. Decrypted file index - prevents repeated index decryption
 * 2. Decrypted file content - avoids decrypting same file twice
 * 3. File hashes - for deduplication before encryption
 */
export function useSessionCache(options?: { disableEviction?: boolean }) {
  // Cache: file index (keyed by filter params)
  const indexCacheRef = useRef<Map<string, { files: VaultFile[]; timestamp: number }>>(new Map());
  // Cache: decrypted file content (keyed by file ID)
  const fileCacheRef = useRef<Map<string, { data: ArrayBuffer; timestamp: number }>>(new Map());
  // Cache: known file hashes for deduplication
  const hashSetRef = useRef<Set<string>>(new Set());

  const disableEviction = options?.disableEviction ?? false;
  const INDEX_TTL = 30_000; // 30s TTL for index cache
  const FILE_CACHE_MAX = 50; // Max cached files to prevent memory bloat

  // Build a cache key from filter parameters
  const buildIndexKey = useCallback(
    (category?: string, search?: string, sortBy?: string, sortAsc?: boolean, folder?: string | null) =>
      `${category || ""}|${search || ""}|${sortBy || ""}|${sortAsc}|${folder || ""}`,
    []
  );

  // Get cached index if still valid
  const getCachedIndex = useCallback(
    (key: string): VaultFile[] | null => {
      const entry = indexCacheRef.current.get(key);
      if (entry && Date.now() - entry.timestamp < INDEX_TTL) {
        return entry.files;
      }
      indexCacheRef.current.delete(key);
      return null;
    },
    []
  );

  // Store index in cache
  const setCachedIndex = useCallback((key: string, files: VaultFile[]) => {
    indexCacheRef.current.set(key, { files, timestamp: Date.now() });
    // Evict oldest entries when over capacity (O(n) scan instead of sort)
    if (!disableEviction && indexCacheRef.current.size > 20) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of indexCacheRef.current) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) indexCacheRef.current.delete(oldestKey);
    }
  }, [disableEviction]);

  // Cache decrypted file content
  const getCachedFile = useCallback((fileId: string): ArrayBuffer | null => {
    const entry = fileCacheRef.current.get(fileId);
    if (entry) {
      entry.timestamp = Date.now(); // refresh access time
      return entry.data;
    }
    return null;
  }, []);

  const setCachedFile = useCallback((fileId: string, data: ArrayBuffer) => {
    // Evict oldest if at capacity (O(n) scan instead of sort)
    if (!disableEviction && fileCacheRef.current.size >= FILE_CACHE_MAX) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of fileCacheRef.current) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const entry = fileCacheRef.current.get(oldestKey);
        if (entry) {
          try { new Uint8Array(entry.data).fill(0); } catch { /* detached */ }
        }
        fileCacheRef.current.delete(oldestKey);
      }
    }
    fileCacheRef.current.set(fileId, { data, timestamp: Date.now() });
  }, [disableEviction]);

  // Track known hashes for deduplication
  const initHashes = useCallback((files: VaultFile[]) => {
    hashSetRef.current.clear();
    for (const f of files) {
      if (f.hash) hashSetRef.current.add(f.hash);
    }
  }, []);

  const isDuplicate = useCallback((hash: string): boolean => {
    return hashSetRef.current.has(hash);
  }, []);

  const addHash = useCallback((hash: string) => {
    hashSetRef.current.add(hash);
  }, []);

  const removeHash = useCallback((hash: string) => {
    hashSetRef.current.delete(hash);
  }, []);

  // Invalidate all caches (on lock/unlock)
  const clearAll = useCallback(() => {
    // Zero out decrypted file content before clearing references
    for (const [, entry] of fileCacheRef.current) {
      try {
        new Uint8Array(entry.data).fill(0);
      } catch {
        // ArrayBuffer may be detached
      }
    }
    indexCacheRef.current.clear();
    fileCacheRef.current.clear();
    hashSetRef.current.clear();
  }, []);

  // Invalidate just the index cache (after imports/deletes)
  const invalidateIndex = useCallback(() => {
    indexCacheRef.current.clear();
  }, []);

  return {
    buildIndexKey,
    getCachedIndex,
    setCachedIndex,
    getCachedFile,
    setCachedFile,
    initHashes,
    isDuplicate,
    addHash,
    removeHash,
    clearAll,
    invalidateIndex,
  };
}
