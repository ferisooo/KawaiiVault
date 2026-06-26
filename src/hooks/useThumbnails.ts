import { useState, useEffect, useRef, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { VaultFile } from "../stores/useStore";
import { getCachedThumbnail, setCachedThumbnail, clearAllCachedThumbnails } from "../utils/thumbnailDB";

interface WorkerMessage {
  type: string;
  fileId?: string;
  buffer?: ArrayBuffer | null;
  mimeType?: string;
}

// Cooldown between visible-cell generation passes. Thumbnails are generated
// off the main process thread and cached in IndexedDB, so a short cooldown
// just makes first-time population feel responsive while still coalescing
// rapid scroll events.
const DEFAULT_COOLDOWN_MS = 250;
const DEFAULT_MAX_THUMBNAILS = 200;
const DEFAULT_THUMB_SIZE = 384;

export interface ThumbnailCacheConfig {
  bypassCache?: boolean;
  cacheAll?: boolean;
  maxThumbnails?: number;
  cooldownMs?: number;
  fullscreenUnload?: boolean;
  clearVideoCacheOnLock?: boolean;
  thumbResolution?: number;
}

export function useThumbnails(config: ThumbnailCacheConfig = {}) {
  const {
    bypassCache = false,
    cacheAll = false,
    maxThumbnails = DEFAULT_MAX_THUMBNAILS,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    fullscreenUnload = true,
    clearVideoCacheOnLock = true,
    thumbResolution = DEFAULT_THUMB_SIZE,
  } = config;
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnailsRef = useRef<Record<string, string>>({});
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const allFilesRef = useRef<VaultFile[]>([]);
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const bypassCacheRef = useRef(bypassCache);
  bypassCacheRef.current = bypassCache;
  const cacheAllRef = useRef(cacheAll);
  cacheAllRef.current = cacheAll;
  const maxThumbnailsRef = useRef(maxThumbnails);
  maxThumbnailsRef.current = maxThumbnails;
  const cooldownMsRef = useRef(cooldownMs);
  cooldownMsRef.current = cooldownMs;
  const fullscreenUnloadRef = useRef(fullscreenUnload);
  fullscreenUnloadRef.current = fullscreenUnload;
  const clearVideoCacheOnLockRef = useRef(clearVideoCacheOnLock);
  clearVideoCacheOnLockRef.current = clearVideoCacheOnLock;
  const thumbResRef = useRef(thumbResolution);
  thumbResRef.current = thumbResolution;

  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  const pausedRef = useRef(false);
  const importingRef = useRef(false);
  const lastGenerationTimeRef = useRef(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fullscreenModeRef = useRef(false);
  const viewedQueueRef = useRef<string[]>([]);
  const scrollDirectionRef = useRef<"up" | "down" | null>(null);

  const batchedUpdatesRef = useRef<Record<string, string>>({});
  const batchFlushTimerRef = useRef<number | null>(null);
  const lruOrderRef = useRef<string[]>([]);
  const videoCapturePendingRef = useRef<Set<string>>(new Set());
  const videoFileTypeMapRef = useRef<Map<string, string>>(new Map());

  const flushBatchedThumbnails = useCallback(() => {
    batchFlushTimerRef.current = null;
    const batch = batchedUpdatesRef.current;
    if (Object.keys(batch).length === 0) return;
    batchedUpdatesRef.current = {};
    setThumbnails((prev) => {
      const next = { ...prev, ...batch };
      if (!cacheAllRef.current && lruOrderRef.current.length > maxThumbnailsRef.current) {
        const excess = lruOrderRef.current.length - maxThumbnailsRef.current;
        const toEvict = lruOrderRef.current.splice(0, excess);
        for (const id of toEvict) {
          if (next[id]?.startsWith("blob:")) URL.revokeObjectURL(next[id]);
          delete next[id];
          seenIdsRef.current.delete(id);
        }
      }
      return next;
    });
  }, []);

  const addThumbnail = useCallback((fileId: string, url: string) => {
    batchedUpdatesRef.current[fileId] = url;
    const idx = lruOrderRef.current.indexOf(fileId);
    if (idx !== -1) lruOrderRef.current.splice(idx, 1);
    lruOrderRef.current.push(fileId);
    if (batchFlushTimerRef.current === null) {
      batchFlushTimerRef.current = requestAnimationFrame(flushBatchedThumbnails);
    }
  }, [flushBatchedThumbnails]);

  // Load an image thumbnail with a persistent IndexedDB cache so the backend
  // only ever generates each one once. On a cache hit it's instant (no backend
  // call) — fixing thumbnails that flicker/reload on scroll-back — and the
  // cache survives app restarts. Falls back to the raw protocol URL if caching
  // is unavailable so the image always shows.
  const loadImageThumbnail = useCallback((fileId: string) => {
    const size = thumbResRef.current;
    const protocolUrl = convertFileSrc("thumb/" + size + "/" + fileId, "cvlt");

    // Cache disabled via advanced setting — use the protocol URL directly.
    if (bypassCacheRef.current) {
      addThumbnail(fileId, protocolUrl);
      return;
    }

    // Key includes the size so changing thumbnail resolution doesn't serve a
    // stale-size cached image.
    const cacheKey = fileId + "@" + size;
    getCachedThumbnail(cacheKey).then((cached) => {
      if (cached) {
        addThumbnail(fileId, URL.createObjectURL(cached));
        return;
      }
      // Cache miss: fetch from the backend once, show it, and persist the blob.
      fetch(protocolUrl)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("thumb fetch failed"))))
        .then((blob) => {
          addThumbnail(fileId, URL.createObjectURL(blob));
          setCachedThumbnail(cacheKey, blob);
        })
        .catch(() => {
          // Fetch/caching failed — still display via the protocol URL.
          addThumbnail(fileId, protocolUrl);
        });
    });
  }, [addThumbnail]);

  // Serial queue for video thumbnail capture — processes one video at a time
  // to avoid CPU thrashing from multiple concurrent video decoders.
  const videoQueueRef = useRef<string[]>([]);
  const videoProcessingRef = useRef(false);

  const processVideoQueue = useCallback(() => {
    if (videoProcessingRef.current) return;
    const fileId = videoQueueRef.current.shift();
    if (!fileId) return;
    videoProcessingRef.current = true;

    const finishAndNext = () => {
      videoCapturePendingRef.current.delete(fileId);
      videoFileTypeMapRef.current.delete(fileId);
      videoProcessingRef.current = false;
      processVideoQueue();
    };

    getCachedThumbnail(fileId).then((cached) => {
      if (cached) {
        addThumbnail(fileId, URL.createObjectURL(cached));
        finishAndNext();
        return;
      }

      const fileUrl = convertFileSrc("file/" + fileId, "cvlt");

      // Capture the first frame with a hidden <video> + canvas. Two strategies,
      // tried in order:
      //   1. Stream the cvlt:// source with crossOrigin="anonymous". The backend
      //      sends Access-Control-Allow-Origin on every stream response, so the
      //      capture canvas is NOT tainted and no extra download is needed.
      //   2. If that errors or comes back tainted (canvas.toBlob → null, which
      //      is what produced the bare "MP4" placeholder), fetch the file as a
      //      same-origin blob: URL — blob URLs can never taint a canvas — and
      //      capture from that. The frame is cached, so this runs once per video.
      const attempt = (useBlob: boolean) => {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        if (!useBlob) video.crossOrigin = "anonymous";
        // Must be in the DOM for browsers to reliably fire load/seek events.
        video.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
        document.body.appendChild(video);

        let objectUrl: string | null = null;
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeoutId);
          video.removeEventListener("loadeddata", onLoadedData);
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          video.pause();
          video.removeAttribute("src");
          while (video.firstChild) video.removeChild(video.firstChild);
          video.load();
          video.remove();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };

        // Capture failed for this attempt: fall back to the blob strategy once,
        // otherwise give up and leave the placeholder.
        const fail = () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (!useBlob) attempt(true);
          else finishAndNext();
        };

        const succeed = (blob: Blob | null) => {
          if (settled) return;
          // A null blob means a tainted canvas — retry via the blob strategy.
          if (!blob) { fail(); return; }
          settled = true;
          cleanup();
          addThumbnail(fileId, URL.createObjectURL(blob));
          setCachedThumbnail(fileId, blob);
          finishAndNext();
        };

        const timeoutId = setTimeout(fail, 15000);

        const onLoadedData = () => { video.currentTime = 0.1; };

        const onSeeked = () => {
          try {
            const sz = thumbResRef.current;
            const canvas = document.createElement("canvas");
            canvas.width = sz;
            canvas.height = sz;
            const ctx = canvas.getContext("2d");
            if (!ctx) { fail(); return; }
            ctx.fillStyle = "#161616";
            ctx.fillRect(0, 0, sz, sz);
            if (video.videoWidth && video.videoHeight) {
              const scale = Math.max(sz / video.videoWidth, sz / video.videoHeight);
              const w = Math.round(video.videoWidth * scale);
              const h = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, Math.round((sz - w) / 2), Math.round((sz - h) / 2), w, h);
            }
            canvas.toBlob((blob) => succeed(blob), "image/webp", 0.75);
          } catch {
            // Tainted canvas throws here on some engines — fall back.
            fail();
          }
        };

        const onError = () => { fail(); };

        video.addEventListener("loadeddata", onLoadedData, { once: true });
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });

        if (useBlob) {
          fetch(fileUrl)
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("video fetch failed"))))
            .then((blob) => {
              objectUrl = URL.createObjectURL(blob);
              video.src = objectUrl;
              video.load();
            })
            .catch(() => fail());
        } else {
          video.src = fileUrl;
          video.load();
        }
      };

      attempt(false);
    });
  }, [addThumbnail]);

  // Capture the first frame of a video using a hidden <video> element + canvas.
  // Checks IndexedDB first — if cached, loads instantly without re-capturing.
  // Shows colored placeholder immediately; replaces it with real frame once ready.
  const captureVideoThumbnail = useCallback((fileId: string, fileType?: string) => {
    if (videoCapturePendingRef.current.has(fileId)) return;
    videoCapturePendingRef.current.add(fileId);
    videoQueueRef.current.push(fileId);
    // Store file_type so processVideoQueue can look it up for MIME hint
    if (fileType) videoFileTypeMapRef.current.set(fileId, fileType);
    processVideoQueue();
  }, [processVideoQueue]);

  // Initialize worker (only needed for non-image placeholder thumbnails now)
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL("../workers/thumbnailWorker.ts", import.meta.url),
        { type: "module" }
      );

      workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const { fileId, buffer, mimeType } = e.data;
        if (e.data.type === "thumbnail" && fileId) {
          if (buffer && mimeType) {
            const blob = new Blob([buffer], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            addThumbnail(fileId, blobUrl);
          }
          pendingRef.current.delete(fileId);
        }
        if (e.data.type === "done") {
          pendingRef.current.clear();
        }
      };
    } catch {
      // Worker not supported
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // On unmount, revoke any outstanding blob: thumbnail URLs and cancel a pending
  // batch flush, so they don't leak if the component tears down without an
  // explicit clearThumbnails (e.g. app close / route change).
  useEffect(() => {
    return () => {
      if (batchFlushTimerRef.current !== null) {
        cancelAnimationFrame(batchFlushTimerRef.current);
        batchFlushTimerRef.current = null;
      }
      for (const url of Object.values(thumbnailsRef.current)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, []);

  const setAllFiles = useCallback((files: VaultFile[]) => {
    allFilesRef.current = files;
  }, []);

  // Generate thumbnails for visible cells
  const generateForVisible = useCallback((visibleFileIds: string[], scrollDirection?: "up" | "down" | null) => {
    visibleIdsRef.current = new Set(visibleFileIds);
    if (scrollDirection !== undefined) scrollDirectionRef.current = scrollDirection;

    if (pausedRef.current) return;
    // During an import, every thumbnail is a full-file decrypt (images) or a
    // hidden <video> decode (videos) competing with the import for disk and
    // CPU. Defer generation entirely; the import flow calls clearSeenIds()
    // when it finishes, so the visible cells regenerate immediately after.
    if (importingRef.current) return;

    const now = Date.now();
    if (!bypassCacheRef.current && now - lastGenerationTimeRef.current < cooldownMsRef.current) return;

    // Images use protocol URLs (no decryption cost), so allow larger batches.
    // Fullscreen mode keeps small batches for smooth navigation.
    const batchSize = fullscreenModeRef.current ? 9 : 50;

    const filesToGenerate = allFilesRef.current.filter(
      (f: VaultFile) =>
        visibleFileIds.includes(f.id) &&
        !seenIdsRef.current.has(f.id) &&
        !thumbnailsRef.current[f.id] &&
        !pendingRef.current.has(f.id) &&
        ["Images", "Videos"].includes(f.category)
    ).slice(0, batchSize);

    if (filesToGenerate.length === 0) return;

    lastGenerationTimeRef.current = now;
    for (const f of filesToGenerate) {
      seenIdsRef.current.add(f.id);
    }

    // Images: use protocol URL directly (no decryption, no worker, no IndexedDB)
    const imageFiles = filesToGenerate.filter((f: VaultFile) => f.category === "Images");
    const nonImageFiles = filesToGenerate.filter((f: VaultFile) => f.category !== "Images");

    // Prioritize scroll direction for images
    const orderedImages = scrollDirectionRef.current === "up" ? [...imageFiles].reverse() : imageFiles;
    for (const f of orderedImages) {
      loadImageThumbnail(f.id);
    }

    // Non-images: worker generates colored placeholders, then real frame capture for videos
    if (nonImageFiles.length > 0 && workerRef.current) {
      for (const f of nonImageFiles) {
        pendingRef.current.add(f.id);
      }
      workerRef.current.postMessage({
        type: "generate",
        thumbSize: thumbResRef.current,
        files: nonImageFiles.map((f: VaultFile) => ({
          fileId: f.id,
          fileName: f.name,
          fileType: f.file_type,
          category: f.category,
        })),
      });
    }
    // Kick off real frame capture for video files (replaces placeholder once ready)
    for (const f of nonImageFiles.filter((f: VaultFile) => f.category === "Videos")) {
      captureVideoThumbnail(f.id, f.file_type);
    }

    // Fullscreen mode: unload old thumbnails (skip if cacheAll or fullscreenUnload disabled)
    if (fullscreenModeRef.current && !cacheAllRef.current && fullscreenUnloadRef.current) {
      for (const f of filesToGenerate) {
        viewedQueueRef.current.push(f.id);
      }
      if (viewedQueueRef.current.length >= 10) {
        const toUnload = viewedQueueRef.current.splice(0, 10);
        setThumbnails((prev: Record<string, string>) => {
          const next = { ...prev };
          for (const id of toUnload) {
            if (next[id]?.startsWith("blob:")) URL.revokeObjectURL(next[id]);
            delete next[id];
            seenIdsRef.current.delete(id);
          }
          return next;
        });
      }
    }
  }, [addThumbnail, captureVideoThumbnail, loadImageThumbnail]);

  const generateThumbnails = useCallback((files: VaultFile[]) => {
    allFilesRef.current = files;

    const toGenerate = files.filter(
      (f) =>
        !thumbnailsRef.current[f.id] &&
        !pendingRef.current.has(f.id) &&
        ["Images", "Videos"].includes(f.category)
    );

    if (toGenerate.length === 0) return;

    const imageFiles = toGenerate.filter((f) => f.category === "Images");
    const nonImageFiles = toGenerate.filter((f) => f.category !== "Images");

    // Images: cache-first load (IndexedDB), generating via the backend once.
    for (const f of imageFiles) {
      loadImageThumbnail(f.id);
    }

    // Non-images: worker placeholders
    if (nonImageFiles.length > 0 && workerRef.current) {
      for (const f of nonImageFiles) {
        pendingRef.current.add(f.id);
      }
      workerRef.current.postMessage({
        type: "generate",
        thumbSize: thumbResRef.current,
        files: nonImageFiles.map((f: VaultFile) => ({
          fileId: f.id,
          fileName: f.name,
          fileType: f.file_type,
          category: f.category,
        })),
      });
    }
    // Kick off real frame capture for video files
    for (const f of nonImageFiles.filter((f) => f.category === "Videos")) {
      captureVideoThumbnail(f.id, f.file_type);
    }
  }, [addThumbnail, captureVideoThumbnail, loadImageThumbnail]);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    importingRef.current = false;
  }, []);

  const setImporting = useCallback((importing: boolean) => {
    importingRef.current = importing;
  }, []);

  const clearSeenIds = useCallback(() => {
    seenIdsRef.current.clear();
    lastGenerationTimeRef.current = 0; // Reset cooldown so next visible-cell pass runs immediately
  }, []);

  const clearThumbnails = useCallback((clearPersistent = false) => {
    setThumbnails((prev: Record<string, string>) => {
      for (const url of Object.values(prev)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      return {};
    });
    pendingRef.current.clear();
    seenIdsRef.current.clear();
    viewedQueueRef.current = [];
    lruOrderRef.current = [];
    videoCapturePendingRef.current.clear();
    // On vault lock, also wipe the IndexedDB cache (vault closed = stale thumbnails)
    if (clearPersistent && clearVideoCacheOnLockRef.current) clearAllCachedThumbnails();
  }, []);

  const getThumbnail = useCallback(
    (fileId: string) => thumbnails[fileId] || null,
    [thumbnails]
  );

  const setFullscreenMode = useCallback((enabled: boolean) => {
    fullscreenModeRef.current = enabled;
    if (!enabled) {
      viewedQueueRef.current = [];
    }
  }, []);

  // ── Background pre-caching ──────────────────────────────────────────────
  // Slowly walk every image/video and write its thumbnail to the persistent
  // IndexedDB cache. Once cached, future views are instant — no backend
  // decryption is needed because the thumbnail is read straight from disk.
  // Throttled with a delay between files so it stays a gentle background task.
  const precacheRunningRef = useRef(false);
  const precacheCancelRef = useRef(false);

  const cancelPrecache = useCallback(() => {
    precacheCancelRef.current = true;
  }, []);

  const precacheAll = useCallback(
    async (
      files: VaultFile[],
      onProgress?: (done: number, total: number) => void,
      delayMs = 120,
    ) => {
      if (precacheRunningRef.current) return;
      precacheRunningRef.current = true;
      precacheCancelRef.current = false;
      const size = thumbResRef.current;
      const targets = files.filter(
        (f) => f.category === "Images" || f.category === "Videos"
      );
      const total = targets.length;
      let done = 0;
      onProgress?.(0, total);
      try {
        for (const f of targets) {
          if (precacheCancelRef.current) break;
          const isImage = f.category === "Images";
          const key = isImage ? f.id + "@" + size : f.id;
          try {
            const existing = await getCachedThumbnail(key);
            if (!existing) {
              if (isImage) {
                // Fetch the thumbnail once (decrypts + resizes in the backend)
                // and persist the blob so it never needs decrypting again.
                const url = convertFileSrc("thumb/" + size + "/" + f.id, "cvlt");
                const r = await fetch(url);
                if (r.ok) {
                  const blob = await r.blob();
                  await setCachedThumbnail(key, blob);
                }
              } else {
                // Videos decode through a hidden <video>; the existing queue
                // already persists the captured frame to IndexedDB.
                captureVideoThumbnail(f.id, f.file_type);
              }
            }
          } catch {
            /* ignore individual failures and keep going */
          }
          done++;
          onProgress?.(done, total);
          if (delayMs > 0) {
            await new Promise((res) => setTimeout(res, delayMs));
          }
        }
      } finally {
        precacheRunningRef.current = false;
        onProgress?.(done, total);
      }
    },
    [captureVideoThumbnail]
  );

  return { thumbnails, generateThumbnails, clearThumbnails, getThumbnail, setAllFiles, generateForVisible, pause, resume, setFullscreenMode, setImporting, clearSeenIds, precacheAll, cancelPrecache };
}
