import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, type VaultFile, type VaultInfo } from "./stores/useStore";
import { useDiagStore } from "./stores/useDiagStore";
import { useTauri } from "./hooks/useTauri";
import { getThemeMode } from "./hooks/useThemeMode";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useThumbnails } from "./hooks/useThumbnails";
import { useSessionCache } from "./hooks/useSessionCache";
import { useVaultReliability } from "./hooks/useVaultReliability";
import { useLicense } from "./hooks/useLicense";
import { convertFileSrc } from "@tauri-apps/api/core";
import { initSessionKey, clearSessionKey, encryptPasswords } from "./utils/sessionCrypto";

// Cyberpunk effects
import Particles from "./effects/Particles";
import Scanlines from "./effects/Scanlines";
import GridBackground from "./effects/GridBackground";

// Biotech effects
import NeuralWeb from "./effects/NeuralWeb";
import BioParticles from "./effects/BioParticles";
import BioBackground from "./effects/BioBackground";
import BioOrganicFX from "./effects/BioOrganicFX";

// Command effects
import Starfield from "./effects/Starfield";
import CommandGrid from "./effects/CommandGrid";

// Neon City effects
import NeonCityGrid from "./effects/NeonCityGrid";
import NeonStreaks from "./effects/NeonStreaks";
import NeonParticles from "./effects/NeonParticles";
import NeonRain from "./effects/NeonRain";

// New effects
import DataStream from "./effects/DataStream";
import EmpRipple from "./effects/EmpRipple";
import CursorTrail from "./effects/CursorTrail";
import RadarSweep from "./effects/RadarSweep";
import TacticalHUD from "./effects/TacticalHUD";

import UnlockBurst from "./effects/UnlockBurst";
import PrismaticBackground from "./effects/PrismaticBackground";
import SolarCoreBackground from "./effects/SolarCoreBackground";
import SolarFlare from "./effects/SolarFlare";
import KawaiiBackground from "./effects/KawaiiBackground";
import KawaiiClickBurst from "./effects/KawaiiClickBurst";
import NeonBackground from "./effects/NeonBackground";
import NeonFX from "./effects/NeonFX";

// Components
import LoginScreen from "./components/LoginScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import LegalScreen, { hasAcceptedTOS } from "./components/LegalScreen";
import Toolbar from "./components/Toolbar";
import FileGrid from "./components/FileGrid";
import PreviewPanel from "./components/PreviewPanel";
// Lazy-loaded: only loaded when opened
const FullscreenViewer = lazy(() => import("./components/FullscreenViewer"));
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const TrashPanel = lazy(() => import("./components/TrashPanel"));
const DecoySnakeGame = lazy(() => import("./components/DecoySnakeGame"));
import HomePage from "./components/HomePage";
import PageCategories from "./components/PageCategories";
import VaultBrowserBar from "./components/VaultBrowserBar";
import MoveFilesModal from "./components/MoveFilesModal";
import ImportProgress, { ExportQueue } from "./components/ImportProgress";
import StatusBar from "./components/StatusBar";
import Notification from "./components/Notification";
import DiagBot from "./components/DiagBot";
import DiagReport from "./components/DiagReport";
import UpdateNotification from "./components/UpdateNotification";
import { useUpdateChecker } from "./hooks/useUpdateChecker";

// Generate demo files for browser preview
function generateDemoFiles(count: number): VaultFile[] {
  const names = ["report", "photo", "video", "track", "document", "backup", "archive", "notes", "invoice", "design"];
  const exts = ["pdf", "jpg", "mp4", "mp3", "docx", "zip", "png", "txt", "xlsx", "pptx"];
  const categories = ["Documents", "Images", "Videos", "Audio", "Archives", "Spreadsheets", "Presentations", "Other"];

  return Array.from({ length: count }, (_, i) => ({
    id: `file-${i}`,
    name: `${names[i % names.length]}_${String(i + 1).padStart(4, "0")}.${exts[i % exts.length]}`,
    size: Math.floor(Math.random() * 50000000) + 1024,
    file_type: exts[i % exts.length],
    category: categories[i % categories.length],
    hash: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
    favorite: Math.random() > 0.85,
    imported_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
  }));
}

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB per file

export default function App() {
  const store = useAppStore();
  const diag = useDiagStore();
  const tauri = useTauri();
  const [license, licenseActions] = useLicense();
  const [stealthHint, setStealthHint] = useState(() => localStorage.getItem("cybervault_stealth_hint") ?? "");
  const [stealthBypassed, setStealthBypassed] = useState(false);
  const [bypassChunkLimits, setBypassChunkLimits] = useState(() => {
    return localStorage.getItem("cybervault_bypass_chunk_limits") === "true";
  });
  const [bypassThumbnailCache, setBypassThumbnailCache] = useState(() => {
    return localStorage.getItem("cybervault_bypass_thumbnail_cache") === "true";
  });
  const [cacheAllThumbnails, setCacheAllThumbnails] = useState(() => {
    return localStorage.getItem("cybervault_cache_all_thumbnails") === "true";
  });
  const [maxThumbnails, setMaxThumbnails] = useState(() => {
    const saved = localStorage.getItem("cybervault_max_thumbnails");
    return saved ? Number(saved) : 200;
  });
  const [cooldownMs, setCooldownMs] = useState(() => {
    const saved = localStorage.getItem("cybervault_cooldown_ms");
    return saved ? Number(saved) : 5000;
  });
  const [fullscreenUnload, setFullscreenUnload] = useState(() => {
    return localStorage.getItem("cybervault_fullscreen_unload") !== "false";
  });
  const [clearVideoCacheOnLock, setClearVideoCacheOnLock] = useState(() => {
    return localStorage.getItem("cybervault_clear_video_cache_on_lock") !== "false";
  });
  const [thumbResolution, setThumbResolution] = useState(() => {
    const saved = localStorage.getItem("cybervault_thumb_resolution");
    return saved ? Number(saved) : 256;
  });
  const [memoryAmberPercent, setMemoryAmberPercent] = useState(() => {
    const saved = localStorage.getItem("cybervault_memory_amber_percent");
    return saved ? Number(saved) : 1.5;
  });
  const [disableFileEviction, setDisableFileEviction] = useState(() => {
    return localStorage.getItem("cybervault_disable_file_eviction") === "true";
  });
  const [precacheProgress, setPrecacheProgress] = useState<{ done: number; total: number; running: boolean } | null>(null);
  const thumbs = useThumbnails({
    bypassCache: bypassThumbnailCache,
    cacheAll: cacheAllThumbnails,
    maxThumbnails,
    cooldownMs,
    fullscreenUnload,
    clearVideoCacheOnLock,
    thumbResolution,
  });
  const sessionCache = useSessionCache({ disableEviction: disableFileEviction });
  const reliability = useVaultReliability();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [allVaultFiles, setAllVaultFiles] = useState<VaultFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const importCancelRef = useRef(false);
  const [trashCount, setTrashCount] = useState(0);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [folders, setFolders] = useState<string[]>([]);
  const [vaultSize, setVaultSize] = useState(0);
  const [vaultSizeInfo, setVaultSizeInfo] = useState<{ total_size: number; total_files: number; categories: { category: string; size: number; count: number }[] } | null>(null);
  const [demoFiles] = useState(() => generateDemoFiles(150));
  const exportCancelRef = useRef(false);
  const [pageZoom, setPageZoom] = useState(1);
  const [thumbnailsReady, setThumbnailsReady] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const loadFilesRequestId = useRef(0);

  // Pre-cache all thumbnails into the persistent IndexedDB cache so future
  // views never need to decrypt them again. Runs slowly in the background.
  const handlePrecacheThumbnails = useCallback(() => {
    const total = allVaultFiles.filter((f) => f.category === "Images" || f.category === "Videos").length;
    if (total === 0) {
      store.notify("No images or videos to cache", "info");
      return;
    }
    setPrecacheProgress({ done: 0, total, running: true });
    thumbs
      .precacheAll(allVaultFiles, (done, t) => {
        setPrecacheProgress({ done, total: t, running: true });
      })
      .then(() => {
        setPrecacheProgress((p) => (p ? { ...p, running: false } : null));
        store.notify("Thumbnail cache complete", "success");
      });
  }, [allVaultFiles, thumbs, store]);

  const handleCancelPrecache = useCallback(() => {
    thumbs.cancelPrecache();
    setPrecacheProgress((p) => (p ? { ...p, running: false } : null));
  }, [thumbs]);

  const themeMode = useMemo(() => getThemeMode(store.theme), [store.theme]);

  // Reset pro features to defaults when license expires
  const prevIsProRef = useRef(license.isPro);
  useEffect(() => {
    if (prevIsProRef.current && !license.isPro) {
      // Pro → Free transition: reset all pro features
      store.setTheme("neon");
      store.update({
        slideshowEnabled: false,
        slideshowFileIds: [],
        slideshowShuffle: false,
        slideshowInterval: 30,
        stealthMode: false,
      });
      setStealthHint("");
      // Reset advanced settings to defaults
      setBypassChunkLimits(false);
      setBypassThumbnailCache(false);
      setCacheAllThumbnails(false);
      setMaxThumbnails(200);
      setCooldownMs(5000);
      setFullscreenUnload(true);
      setClearVideoCacheOnLock(true);
      setThumbResolution(256);
      setMemoryAmberPercent(1.5);
      setDisableFileEviction(false);
    }
    prevIsProRef.current = license.isPro;
  }, [license.isPro]); // eslint-disable-line react-hooks/exhaustive-deps

  const { updateAvailable, dismiss: dismissUpdate } = useUpdateChecker();

  // ── Media page: stable filtered views (images + videos only) ──
  const isMediaPage = useMemo(() => {
    const pg = store.vaultPages.find(p => p.id === store.currentPage);
    return pg?.categories?.[0]?.type === "media";
  }, [store.vaultPages, store.currentPage]);
  const mediaFiles = useMemo(() => {
    const allMedia = files.filter(f => f.category === "Images" || f.category === "Videos");
    const pg = store.vaultPages.find(p => p.id === store.currentPage);
    if (pg?.categories?.[0]?.type !== "media") return allMedia;
    // Media page visibility is self-healing: show files associated with THIS
    // page PLUS any media not owned by ANY OTHER page. That way files stranded
    // by an interrupted import (no page association) are always visible here
    // instead of being invisible-but-counted-in-size. The adoption effect
    // below then persists the association in the background.
    const ownedElsewhere = new Set(
      store.vaultPages.filter(p => p.id !== pg.id).flatMap(p => p.fileIds)
    );
    const mine = new Set(pg.fileIds);
    return allMedia.filter(f => mine.has(f.id) || !ownedElsewhere.has(f.id));
  }, [files, store.vaultPages, store.currentPage]);
  // Fixed filter set on media pages so the Images/Videos chips are always
  // offered, even before any file of that kind exists in the vault.
  const mediaCategories = useMemo(() => ["All", "Images", "Videos"], []);

  // Rescue orphaned media files: an import interrupted mid-way (auto-lock,
  // crash, cancel) could leave files in the vault that no page references —
  // they count toward the vault size but are invisible and unmanageable on
  // every media page. When a media page is open, adopt any such files into it.
  const orphanRescueNotifiedRef = useRef(false);
  useEffect(() => {
    if (!isMediaPage || !store.currentPage || files.length === 0) return;
    const referenced = new Set(store.vaultPages.flatMap((p) => p.fileIds));
    const orphans = files
      .filter((f) => (f.category === "Images" || f.category === "Videos") && !referenced.has(f.id))
      .map((f) => f.id);
    if (orphans.length === 0) return;
    store.addFilesToPage(orphans, store.currentPage);
    if (!orphanRescueNotifiedRef.current) {
      orphanRescueNotifiedRef.current = true;
      store.notify(`Recovered ${orphans.length} file${orphans.length > 1 ? "s" : ""} from an interrupted import`, "success");
    }
  }, [isMediaPage, files, store.vaultPages, store.currentPage]);

  // Per-page media folders (instead of vault-global folders)
  const currentMediaCategory = useMemo(() => {
    if (!isMediaPage) return null;
    const pg = store.vaultPages.find(p => p.id === store.currentPage);
    return pg?.categories?.find(c => c.type === "media") ?? null;
  }, [isMediaPage, store.vaultPages, store.currentPage]);

  const pageFolders = useMemo(() => {
    if (currentMediaCategory) return currentMediaCategory.mediaFolders ?? [];
    return folders;
  }, [currentMediaCategory, folders]);

  // ── Debounced search: wait 300ms after typing stops ──
  const debouncedSearch = useDebouncedValue(store.searchQuery, 300);

  // Background path intentionally NOT persisted to localStorage.
  // Storing filesystem paths in plaintext would leak file locations outside the encrypted vault.
  // User re-selects background after app restart.

  // ── Disable stealth mode on startup if no vaults exist ──
  useEffect(() => {
    if (!store.stealthMode) return;
    tauri.listVaults().then((vaults) => {
      if (vaults.length === 0) {
        store.update({ stealthMode: false });
        localStorage.removeItem("cybervault_stealth_mode");
        localStorage.removeItem("cybervault_stealth_hint");
      }
    }).catch(() => {});
  }, []);

  // ── Ctrl + mouse wheel zoom ──
  const baseThumbResolution = useRef(thumbResolution);
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setPageZoom((prev) => {
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const next = Math.min(2.0, Math.max(0.5, +(prev + delta).toFixed(2)));
        // Scale thumbnail resolution with zoom so thumbnails stay sharp
        const scaledRes = Math.round(baseThumbResolution.current * Math.max(1, next));
        if (scaledRes !== thumbResolution) {
          setThumbResolution(scaledRes);
        }
        return next;
      });
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [thumbResolution]);

  // ── DiagBot: Performance monitoring ──
  const diagOperationStart = useRef<Record<string, number>>({});

  const diagTrackStart = useCallback((op: string) => {
    diagOperationStart.current[op] = performance.now();
  }, []);

  const diagTrackEnd = useCallback(
    (op: string, success: boolean, message?: string) => {
      const start = diagOperationStart.current[op];
      if (!start) return;
      const duration_ms = Math.round(performance.now() - start);
      delete diagOperationStart.current[op];

      if (!success) {
        diag.addLog("error", "warning", op, message || `${op} failed`, {
          duration_ms,
          probable_cause: "Operation returned an error or threw an exception",
        });
      } else if (duration_ms > 2000) {
        diag.addLog(
          "performance",
          "warning",
          op,
          `${op} completed slowly (${duration_ms}ms)`,
          {
            duration_ms,
            probable_cause: "Operation took longer than 2000ms threshold",
          }
        );
      }
    },
    [diag.addLog]
  );

  // ── DiagBot: Memory leak detection (every 10s) ──
  useEffect(() => {
    if (store.screen !== "vault") return;

    const checkMemory = () => {
      if ((performance as any).memory) {
        const mem = (performance as any).memory;
        const usedMB = mem.usedJSHeapSize / (1024 * 1024);
        const totalMB = mem.jsHeapSizeLimit / (1024 * 1024);
        const percent = (usedMB / totalMB) * 100;
        diag.addMemorySnapshot({
          timestamp: new Date().toISOString(),
          usedMB,
          totalMB,
          percent,
        }, memoryAmberPercent);
      } else {
        // Fallback: estimate using performance entries
        const usedMB = 50 + Math.random() * 30; // demo approximation
        const totalMB = 512;
        diag.addMemorySnapshot({
          timestamp: new Date().toISOString(),
          usedMB,
          totalMB,
          percent: (usedMB / totalMB) * 100,
        }, memoryAmberPercent);
      }
    };

    checkMemory();
    const interval = setInterval(checkMemory, 10000);
    return () => clearInterval(interval);
  }, [store.screen, memoryAmberPercent]);

  // ── DiagBot: Auto-clear thumbnail cache only on critical RAM warning (>85%) ──
  useEffect(() => {
    if (diag.memoryWarning) {
      thumbs.clearThumbnails();
      diag.addLog(
        "performance",
        "critical",
        "memory-auto-clear",
        "RAM usage critical (>85%) — thumbnail cache cleared automatically"
      );
    }
  }, [diag.memoryWarning]);

  // ── DiagBot: Vault integrity statistics ──
  useEffect(() => {
    if (store.screen !== "vault") return;

    const updateIntegrity = async () => {
      try {
        const sizeInfo = await tauri.getVaultSize();
        diag.updateVaultIntegrity({
          fileCount: sizeInfo.total_files,
          lastHealthCheck: new Date().toISOString(),
          healthStatus: "healthy",
          orphanedBlobs: 0,
        });
      } catch {
        // Demo mode
        diag.updateVaultIntegrity({
          fileCount: files.length,
          lastHealthCheck: new Date().toISOString(),
          healthStatus: files.length > 0 ? "healthy" : "unknown",
          orphanedBlobs: Math.floor(Math.random() * 3),
        });
      }
    };

    updateIntegrity();
    const interval = setInterval(updateIntegrity, 30000);
    return () => clearInterval(interval);
  }, [store.screen, files.length]);

  // ── DiagBot: Monitor for errors (global error handler) ──
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      diag.addLog("crash", "critical", "runtime", event.message, {
        probable_cause: `Uncaught error at ${event.filename}:${event.lineno}`,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      diag.addLog(
        "crash",
        "critical",
        "promise",
        String(event.reason?.message || event.reason || "Unhandled promise rejection"),
        {
          probable_cause: "An async operation failed without error handling",
        }
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  // Auto-lock polling: check every 5s
  useEffect(() => {
    if (store.screen !== "vault") return;

    const interval = setInterval(async () => {
      try {
        // Flush any pending page saves before the backend auto-lock check,
        // which may lock the vault and clear in-memory pages_json.
        await store.flushSavePages();
        const locked = await tauri.checkAutoLock();
        if (locked) {
          tauri.clearClipboard().catch(() => {}); // wipe any copied secret on auto-lock
          sessionCache.clearAll();
          clearSessionKey();
          store.lockVault();
          store.notify("Vault auto-locked due to inactivity", "warning");
          return;
        }
      } catch {
        // Demo mode or error — ignore
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [store.screen]);

  // Backend watchdog lock: the Rust side enforces the idle timeout even when
  // this window is frozen or its JS is no longer running. When it fires, sync
  // the UI to the locked state so secrets disappear from the screen too.
  useEffect(() => {
    if (store.screen !== "vault") return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("vault-auto-locked", () => {
          tauri.clearClipboard().catch(() => {});
          sessionCache.clearAll();
          clearSessionKey();
          thumbs.clearThumbnails(true);
          setFiles([]);
          setShowBrowser(false); // backend already closed the browser window
          store.lockVault();
          store.notify("Vault auto-locked due to inactivity", "warning");
        });
      } catch { /* events unavailable (demo) */ }
    })();
    return () => { unlisten?.(); };
  }, [store.screen]);

  // Clipboard auto-clear: poll the backend expiry timer and wipe the OS
  // clipboard once a copied secret's timeout elapses (configurable via
  // clipboard_clear_secs; backend arms the timer on mark_clipboard_copied).
  useEffect(() => {
    if (store.screen !== "vault") return;

    const interval = setInterval(async () => {
      try {
        if (await tauri.checkClipboardExpiry()) {
          await tauri.clearClipboard();
        }
      } catch {
        // Demo mode or no clipboard — ignore
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [store.screen]);

  // Activity tracking: report mouse/keyboard to backend (debounced)
  useEffect(() => {
    if (store.screen !== "vault") return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const reportActivity = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
      }, 10000); // debounce 10s
      tauri.touchActivity().catch(() => {});
    };

    window.addEventListener("mousemove", reportActivity);
    window.addEventListener("keydown", reportActivity);
    window.addEventListener("click", reportActivity);

    // Report initial activity
    tauri.touchActivity().catch(() => {});

    return () => {
      window.removeEventListener("mousemove", reportActivity);
      window.removeEventListener("keydown", reportActivity);
      window.removeEventListener("click", reportActivity);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [store.screen]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (store.screen !== "vault") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L → lock vault. Ctrl+Shift+L → PANIC lock: same instant lock, but
      // works from any view (viewer, settings, trash) so it's a reliable
      // "someone just walked in" kill switch.
      if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        if (e.shiftKey) {
          store.update({ fullscreenFile: null, previewFile: null, showSettings: false, showTrash: false });
        }
        handleLock();
        return;
      }

      // Esc → close viewer/panels
      if (e.key === "Escape") {
        if (store.fullscreenFile) {
          store.update({ fullscreenFile: null });
        } else if (store.previewFile) {
          store.update({ previewFile: null });
        } else if (store.showSettings) {
          store.update({ showSettings: false });
        } else if (store.showTrash) {
          store.update({ showTrash: false });
        }
        return;
      }

      // Delete key → move selected files to trash immediately
      if (e.key === "Delete" && !store.fullscreenFile && !store.showSettings && !store.showTrash) {
        if (store.selectedFiles.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
          return;
        }
      }

      // Arrow keys → navigate files (only on home/media view, not on pages)
      if (!store.fullscreenFile && !store.showSettings && !store.currentPage) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
          if (files.length === 0) return;
          const selectedIds = [...store.selectedFiles];
          const lastSelected = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
          const currentIndex = lastSelected ? files.findIndex((f) => f.id === lastSelected) : -1;

          let nextIndex: number;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            nextIndex = currentIndex < files.length - 1 ? currentIndex + 1 : 0;
          } else {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : files.length - 1;
          }

          const nextFile = files[nextIndex];
          if (nextFile) {
            store.update({ selectedFiles: new Set([nextFile.id]), previewFile: nextFile });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store.screen, store.fullscreenFile, store.previewFile, store.showSettings, store.currentPage, files]);

  // Load files when vault is unlocked (with session index cache for fast vault open)
  const loadFiles = useCallback(async () => {
    if (store.screen !== "vault") return;
    const requestId = ++loadFilesRequestId.current;
    setFilesLoading(true);

    // Check session cache first (cached decrypted file index)
    const cacheKey = sessionCache.buildIndexKey(
      store.categoryFilter, debouncedSearch, store.sortField, store.sortAsc, store.folderFilter
    );
    const cached = sessionCache.getCachedIndex(cacheKey);
    if (cached) {
      if (requestId !== loadFilesRequestId.current) return; // stale
      setFiles(cached);
      thumbs.setAllFiles(cached);
      setFilesLoading(false);
      return;
    }

    try {
      // Fast vault open: getFiles returns only metadata (names, sizes, dates)
      // No file content decryption happens here
      const f = await tauri.getFiles(
        store.categoryFilter,
        debouncedSearch,
        store.sortField,
        store.sortAsc,
        store.folderFilter,
      );
      if (requestId !== loadFilesRequestId.current) return; // stale
      setFiles(f);
      thumbs.setAllFiles(f);
      sessionCache.setCachedIndex(cacheKey, f);
      sessionCache.initHashes(f);
      // Fetch all vault files (unfiltered) for slideshow across all folders
      try {
        const allF = await tauri.getFiles("All", "", "name", true, null);
        setAllVaultFiles(allF);
      } catch { setAllVaultFiles(f); }
      const cats = await tauri.getCategories();
      setCategories(cats);
      const flds = await tauri.listFolders();
      setFolders(flds);
      try {
        const sizeInfo = await tauri.getVaultSize();
        setVaultSize(sizeInfo.total_size);
        setVaultSizeInfo(sizeInfo);
      } catch { /* demo */ }
      try {
        const trashed = await tauri.getTrashedFiles();
        setTrashCount(trashed.length);
      } catch { /* demo */ }
    } catch {
      // Demo mode — filter/sort client-side
      let filtered = [...demoFiles];

      if (store.folderFilter) {
        filtered = filtered.filter((f) => f.folder === store.folderFilter);
      }
      if (store.showFavoritesOnly) {
        filtered = filtered.filter((f) => f.favorite);
      }
      if (store.categoryFilter !== "All") {
        filtered = filtered.filter((f) => f.category === store.categoryFilter);
      }
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter((f) => f.name.toLowerCase().includes(q));
      }

      filtered.sort((a, b) => {
        let cmp = 0;
        switch (store.sortField) {
          case "date": cmp = a.imported_at.localeCompare(b.imported_at); break;
          case "size": cmp = a.size - b.size; break;
          case "type": cmp = a.file_type.localeCompare(b.file_type); break;
          default: cmp = a.name.localeCompare(b.name);
        }
        return store.sortAsc ? cmp : -cmp;
      });

      setFiles(filtered);
      setAllVaultFiles(demoFiles);
      thumbs.setAllFiles(filtered);
      sessionCache.setCachedIndex(cacheKey, filtered);
      sessionCache.initHashes(filtered);

      const uniqueCats = [...new Set(demoFiles.map((f) => f.category))].sort();
      setCategories(["All", ...uniqueCats]);
      const totalSize = filtered.reduce((sum, f) => sum + f.size, 0);
      setVaultSize(totalSize);
      // Build demo category breakdown
      const catMap: Record<string, { size: number; count: number }> = {};
      demoFiles.forEach((f) => {
        if (!catMap[f.category]) catMap[f.category] = { size: 0, count: 0 };
        catMap[f.category].size += f.size;
        catMap[f.category].count += 1;
      });
      setVaultSizeInfo({
        total_size: demoFiles.reduce((s, f) => s + f.size, 0),
        total_files: demoFiles.length,
        categories: Object.entries(catMap).map(([category, { size, count }]) => ({ category, size, count })).sort((a, b) => b.size - a.size),
      });
    }
    setFilesLoading(false);
  }, [store.screen, store.categoryFilter, debouncedSearch, store.sortField, store.sortAsc, store.showFavoritesOnly, store.folderFilter, store.currentPage, demoFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Watch-folder auto-import: when the backend poller imports new media from
  // the configured watch folder, refresh the grid so the files appear, and
  // let the user know.
  useEffect(() => {
    if (store.screen !== "vault") return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<number>("watch-imported", (e) => {
          const count = e.payload || 0;
          sessionCache.invalidateIndex();
          loadFiles();
          thumbs.clearSeenIds();
          importDoneRef.current = true;
          if (count > 0) {
            store.notify(`Auto-imported ${count} file${count > 1 ? "s" : ""} from watch folder`, "success");
          }
        });
      } catch { /* events unavailable (demo) */ }
    })();
    return () => { unlisten?.(); };
  }, [store.screen, loadFiles]);


  // Vault browser: refresh the grid when a download finishes importing, and
  // surface failures (e.g. vault locked mid-download).
  useEffect(() => {
    if (store.screen !== "vault") return;
    let unlistenOk: (() => void) | undefined;
    let unlistenFail: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenOk = await listen<string>("browser-download-imported", (e) => {
          sessionCache.invalidateIndex();
          loadFiles();
          thumbs.clearSeenIds();
          importDoneRef.current = true;
          store.notify(`Saved to vault: ${e.payload}`, "success");
        });
        unlistenFail = await listen<string>("browser-download-failed", (e) => {
          store.notify(`Download not saved — ${e.payload}`, "error");
        });
      } catch { /* events unavailable (demo) */ }
    })();
    return () => { unlistenOk?.(); unlistenFail?.(); };
  }, [store.screen, loadFiles]);

  const [lockFlash, setLockFlash] = useState(false);

  const handleLock = async () => {
    // Flash + shake effect on lock
    setLockFlash(true);
    setTimeout(() => setLockFlash(false), 400);
    // Cancel any active exports/imports before locking
    exportCancelRef.current = true;
    importCancelRef.current = true;
    store.update({ exportQueue: null, importProgress: null });
    // Flush any pending page saves to backend before clearing state
    try {
      await store.flushSavePages();
    } catch { /* best-effort */ }
    try {
      await tauri.lockVault();
    } catch { /* demo */ }
    tauri.clearClipboard().catch(() => {}); // wipe any copied secret on lock
    sessionCache.clearAll();
    setFiles([]);
    setCategories(["All"]);
    setFolders([]);
    setAllVaultFiles([]);
    thumbs.clearThumbnails(true); // true = also wipe IndexedDB (vault locked)
    setThumbnailsReady(false);
    importDoneRef.current = false;
    clearSessionKey(); // Destroy session encryption key — encrypted fields become unreadable
    setShowBrowser(false); // backend lock_vault closes the browser window
    store.lockVault();
    // Reset stealth bypass so the snake game re-appears on next login
    setStealthBypassed(false);
  };

  // Visible-cell thumbnail generation callback (delayed 5s after unlock to avoid
  // thrashing during initial load, but always allowed after an import completes)
  const importDoneRef = useRef(false);
  const handleVisibleFilesChange = useCallback((visibleFileIds: string[], scrollDirection?: "up" | "down" | null) => {
    if (!thumbnailsReady && !importDoneRef.current) return;
    thumbs.generateForVisible(visibleFileIds, scrollDirection);
  }, [thumbs.generateForVisible, thumbnailsReady]);

  const handleAddFiles = async () => {
    importCancelRef.current = false;
    diagTrackStart("file_import");
    // Live per-file progress events from the backend; without them the bar
    // only moves between chunks, which looks like a hang on a slow chunk.
    let unlistenProgress: (() => void) | undefined;
    const progressBase = { value: 0 };
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      // On media pages, restrict file picker to images and videos only
      const filters = isMediaPage ? [{
        name: "Images & Videos",
        extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico",
                     "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm"],
      }] : undefined;
      const selected = await open({ multiple: true, filters }) as string | string[] | null;
      if (!selected) {
        diagTrackEnd("file_import", true);
        return;
      }
      const paths = Array.isArray(selected) ? selected : [selected];

      const total = paths.length;
      const startTime = Date.now();
      store.update({ importProgress: { current: 0, total, startTime } });

      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenProgress = await listen<{ done: number; name: string }>("import-progress", (e) => {
          store.update({
            importProgress: {
              current: Math.min(total, progressBase.value + e.payload.done),
              total,
              startTime,
              fileName: e.payload.name,
            },
          });
        });
      } catch { /* events unavailable (demo mode) */ }

      let totalImported = 0;
      let skippedErrors = 0;
      const importedFileIds: string[] = [];
      const folder = store.folderFilter || undefined;

      // Pause thumbnail generation during import — every thumbnail costs a
      // full-file decrypt that competes with the import for disk and CPU.
      thumbs.setImporting(true);

      // Split into small fixed-size batches. There is deliberately NO pre-scan
      // / sizing pass: statting every file up front could stall for a long time
      // when the source files live on OneDrive/cloud storage (the "calculating
      // forever" hang). Small batches keep memory bounded, update the progress
      // bar often, and release the backend lock between calls so the UI stays
      // responsive. The advanced "bypass chunk limits" toggle still sends
      // everything in one call.
      const chunks: string[][] = [];
      if (bypassChunkLimits) {
        chunks.push(paths);
      } else {
        const CHUNK_FILES = 20;
        for (let i = 0; i < paths.length; i += CHUNK_FILES) {
          chunks.push(paths.slice(i, i + CHUNK_FILES));
        }
      }
      diag.addLog("info", "info", "file_import", `Import started: ${total} files in ${chunks.length} batch(es)`, { metrics: { files: total, chunks: chunks.length } });

      let processed = 0;
      let chunkIndex = 0;
      for (const chunk of chunks) {
        if (importCancelRef.current) break;
        chunkIndex++;
        progressBase.value = processed;

        const fileName = chunk[0].split(/[\\/]/).pop() || chunk[0];
        store.update({ importProgress: { current: processed, total, startTime, fileName } });

        const chunkStart = Date.now();
        try {
          const imported = await tauri.importFiles(chunk, folder);
          for (const f of imported) {
            importedFileIds.push(f.id);
            totalImported++;
          }
          // Register this chunk with the current page immediately. If the
          // import is interrupted (lock, crash, cancel), the files already
          // imported stay visible instead of becoming orphans the page
          // doesn't know about.
          if (imported.length > 0 && store.currentPage) {
            store.addFilesToPage(imported.map((f) => f.id), store.currentPage);
          }
          // Show this chunk's files in the grid RIGHT NOW by merging the
          // returned VaultFile records straight into state. importFiles
          // returns the imported records, so there is no need for a backend
          // reload here (which would contend with the next chunk for the
          // vault lock and could stall). A full canonical reload happens once
          // at the end for correct sorting.
          if (imported.length > 0) {
            setFiles((prev) => {
              const existing = new Set(prev.map((f) => f.id));
              const merged = [...prev];
              for (const f of imported) if (!existing.has(f.id)) merged.push(f);
              thumbs.setAllFiles(merged);
              return merged;
            });
            setAllVaultFiles((prev) => {
              const existing = new Set(prev.map((f) => f.id));
              const merged = [...prev];
              for (const f of imported) if (!existing.has(f.id)) merged.push(f);
              return merged;
            });
            thumbs.clearSeenIds();
          }
          const dur = Date.now() - chunkStart;
          // Flag slow chunks as a performance issue so they stand out in the report.
          diag.addLog(dur > 8000 ? "performance" : "info", dur > 8000 ? "warning" : "info", "file_import",
            `Chunk ${chunkIndex}/${chunks.length}: ${imported.length}/${chunk.length} files in ${(dur / 1000).toFixed(1)}s`,
            { duration_ms: dur, metrics: { files: chunk.length, imported: imported.length, msPerFile: Math.round(dur / Math.max(1, chunk.length)) } });
        } catch (err) {
          console.error("Import chunk failed:", err);
          skippedErrors += chunk.length;
          diag.addLog("error", "warning", "file_import",
            `Chunk ${chunkIndex}/${chunks.length} failed: ${String(err).slice(0, 200)}`,
            { duration_ms: Date.now() - chunkStart, metrics: { files: chunk.length } });
        }

        processed += chunk.length;
        store.update({ importProgress: { current: processed, total, startTime, fileName } });
      }

      unlistenProgress?.();
      unlistenProgress = undefined;
      store.update({ importProgress: null });
      // Update hash cache with all newly imported files (for future import dedup)
      // Done after the loop so same-batch files with identical content aren't rejected
      sessionCache.invalidateIndex();
      thumbs.setImporting(false);
      // Associate imported files with the current page
      if (importedFileIds.length > 0 && store.currentPage) {
        store.addFilesToPage(importedFileIds, store.currentPage);
      }
      // Reload file index, then proactively generate thumbnails for imported files
      await loadFiles();
      // Clear seen-ids so freshly imported files aren't skipped by the visibility system
      thumbs.clearSeenIds();
      importDoneRef.current = true; // Allow thumbnail generation even if thumbnailsReady is false

      const totalFailed = total - totalImported;
      const suffix = totalFailed > 0 ? ` (${totalFailed} failed)` : "";
      if (importCancelRef.current) {
        store.notify(`Import cancelled: ${totalImported} files saved${suffix}`, "warning");
      } else {
        store.notify(`${totalImported} files imported${suffix}`, "success");
      }
      diagTrackEnd("file_import", true);
      diag.addLog("info", "info", "file_import", `${totalImported} files imported${suffix}`);
    } catch {
      unlistenProgress?.();
      diagTrackEnd("file_import", true);
      // Demo mode — simulate chunked import
      const total = 50;
      const startTime = Date.now();
      importCancelRef.current = false;
      store.update({ importProgress: { current: 0, total, startTime } });

      for (let i = 0; i <= total; i++) {
        if (importCancelRef.current) {
          store.update({ importProgress: null });
          store.notify(`Import cancelled: ${i} files saved (demo)`, "warning");
          loadFiles();
          return;
        }
        await new Promise((r) => setTimeout(r, 40));
        store.update({ importProgress: { current: i, total, startTime, fileName: `file_${String(i).padStart(4, "0")}.dat` } });
      }

      store.update({ importProgress: null });
      store.notify(`${total} files imported (demo)`, "success");
      loadFiles();
    } finally {
      store.update({ importProgress: null });
    }
  };

  const handleDeleteSelected = async () => {
    const ids = [...store.selectedFiles];
    if (ids.length === 0) return;
    diagTrackStart("file_delete");
    try {
      await tauri.deleteFiles(ids);
      diagTrackEnd("file_delete", true);
    } catch {
      diagTrackEnd("file_delete", true);
    }
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    setTrashCount((prev) => prev + ids.length);
    sessionCache.invalidateIndex();
    // Remove deleted files from current page's fileIds
    if (store.currentPage) {
      store.removeFilesFromPage(ids, store.currentPage);
    }
    store.deselectAll();
    store.notify(`${ids.length} file${ids.length > 1 ? "s" : ""} moved to trash`, "warning");
    diag.addLog("info", "info", "file_delete", `${ids.length} files moved to trash`);
  };

  const handleExportSelected = async () => {
    const ids = [...store.selectedFiles];
    if (ids.length === 0) return;

    // Single file: just export directly
    if (ids.length === 1) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const dest = await open({ directory: true }) as string | null;
        if (dest) {
          await tauri.exportFiles(ids, dest);
          store.notify("File exported", "success");
        }
      } catch {
        store.notify("File exported (demo)", "success");
      }
      return;
    }

    // Multiple files: use export queue
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dest = await open({ directory: true }) as string | null;
      if (!dest) return;

      exportCancelRef.current = false;
      store.update({ exportQueue: { fileIds: ids, destDir: dest, current: 0, total: ids.length } });

      for (let i = 0; i < ids.length; i++) {
        if (exportCancelRef.current) break;
        try {
          const fileName = await tauri.exportSingleFile(ids[i], dest);
          store.update({
            exportQueue: { fileIds: ids, destDir: dest, current: i + 1, total: ids.length, currentFileName: fileName },
          });
        } catch {
          store.update({
            exportQueue: { fileIds: ids, destDir: dest, current: i + 1, total: ids.length, currentFileName: `Error on file ${i + 1}` },
          });
        }
      }

      const exported = exportCancelRef.current ? "Export cancelled" : `${ids.length} files exported`;
      store.update({ exportQueue: null });
      store.notify(exported, exportCancelRef.current ? "warning" : "success");
    } catch {
      // Demo mode
      exportCancelRef.current = false;
      store.update({ exportQueue: { fileIds: ids, destDir: "/demo", current: 0, total: ids.length } });

      for (let i = 0; i < ids.length; i++) {
        if (exportCancelRef.current) break;
        await new Promise((r) => setTimeout(r, 200));
        store.update({
          exportQueue: { fileIds: ids, destDir: "/demo", current: i + 1, total: ids.length, currentFileName: `file_${i + 1}.dat` },
        });
      }

      store.update({ exportQueue: null });
      store.notify(`${ids.length} files exported (demo)`, "success");
    }
  };

  // ── Encrypted ZIP export ──
  const [showZipPasswordDialog, setShowZipPasswordDialog] = useState(false);
  const [zipPassword, setZipPassword] = useState("");
  const [zipPasswordConfirm, setZipPasswordConfirm] = useState("");

  const handleExportEncryptedZip = () => {
    const ids = [...store.selectedFiles];
    if (ids.length === 0) return;
    setZipPassword("");
    setZipPasswordConfirm("");
    setShowZipPasswordDialog(true);
  };

  const handleZipPasswordConfirm = async () => {
    if (!zipPassword || zipPassword !== zipPasswordConfirm) {
      store.notify("Passwords do not match", "warning");
      return;
    }
    const ids = [...store.selectedFiles];
    setShowZipPasswordDialog(false);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        title: "Save Encrypted ZIP",
        defaultPath: "vault-export.zip",
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      }) as string | null;
      if (!dest) return;
      await tauri.exportEncryptedZip(ids, dest, zipPassword);
      store.notify(`${ids.length} files exported as encrypted ZIP`, "success");
    } catch {
      store.notify("Encrypted ZIP export failed", "error");
    }
    setZipPassword("");
    setZipPasswordConfirm("");
  };



  const handleCancelImport = useCallback(() => {
    importCancelRef.current = true;
  }, []);

  const handleCancelExport = () => {
    exportCancelRef.current = true;
    store.update({
      exportQueue: store.exportQueue ? { ...store.exportQueue, cancelled: true } : null,
    });
  };

  const handleToggleFavorite = async (fileId: string) => {
    try {
      const updated = await tauri.toggleFavorite(fileId);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, favorite: !f.favorite } : f))
      );
    }
  };

  const handlePreviewExport = async (fileId: string) => {
    store.update({ previewFile: null });
    store.update({ selectedFiles: new Set([fileId]) });
    handleExportSelected();
  };

  const handlePreviewDelete = async (fileId: string) => {
    store.update({ previewFile: null });
    store.update({ selectedFiles: new Set([fileId]) });
    handleDeleteSelected();
  };

  const updateMediaFolders = (newFolders: string[]) => {
    const pg = store.vaultPages.find(p => p.id === store.currentPage);
    if (!pg) return;
    const cats = pg.categories.map(c =>
      c.type === "media" ? { ...c, mediaFolders: newFolders } : c
    );
    store.updatePageCategories(pg.id, cats);
  };

  const handleCreateFolder = async (name: string) => {
    if (isMediaPage) {
      const existing = currentMediaCategory?.mediaFolders ?? [];
      if (existing.includes(name.trim())) {
        store.notify("Folder already exists", "warning");
        return;
      }
      const updated = [...existing, name.trim()].sort();
      updateMediaFolders(updated);
      store.notify(`Folder "${name}" created`, "success");
      return;
    }
    try {
      const flds = await tauri.createFolder(name);
      setFolders(flds);
      store.notify(`Folder "${name}" created`, "success");
    } catch {
      setFolders(prev => [...prev, name].sort());
      sessionCache.invalidateIndex();
      store.notify(`Folder "${name}" created (demo)`, "success");
    }
  };

  const handleDeleteFolder = async (name: string) => {
    if (isMediaPage) {
      const existing = currentMediaCategory?.mediaFolders ?? [];
      const updated = existing.filter(f => f !== name);
      updateMediaFolders(updated);
      // Unset folder on files in this page that were in the deleted folder
      const pg = store.vaultPages.find(p => p.id === store.currentPage);
      if (pg) {
        const pageFileIds = pg.fileIds.filter(id => {
          const file = files.find(f => f.id === id);
          return file?.folder === name;
        });
        if (pageFileIds.length > 0) {
          try { await tauri.moveFilesToFolder(pageFileIds, undefined); } catch { /* demo */ }
        }
      }
      if (store.folderFilter === name) store.update({ folderFilter: null });
      store.notify(`Folder "${name}" deleted`, "warning");
      loadFiles();
      return;
    }
    try {
      const flds = await tauri.deleteFolder(name);
      setFolders(flds);
      if (store.folderFilter === name) store.update({ folderFilter: null });
      store.notify(`Folder "${name}" deleted`, "warning");
      loadFiles();
    } catch {
      setFolders(prev => prev.filter(f => f !== name));
      if (store.folderFilter === name) store.update({ folderFilter: null });
      store.notify(`Folder deleted (demo)`, "warning");
    }
  };

  const handleMoveToFolder = async (fileIds: string[], folder: string | null) => {
    try {
      await tauri.moveFilesToFolder(fileIds, folder || undefined);
      store.notify(`${fileIds.length} files moved`, "success");
      loadFiles();
    } catch { store.notify(`Files moved (demo)`, "success"); }
  };

  const handleFullscreen = (file: VaultFile) => {
    store.update({ fullscreenFile: file });
    thumbs.setFullscreenMode(true);
  };

  // ── Encrypted vault backup ──
  const handleBackupVault = async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const vaultName = store.activeVault?.name || "vault";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const dest = await save({
        title: "Save Vault Backup",
        defaultPath: `${vaultName}_${timestamp}.vault`,
        filters: [{ name: "Vault Backup", extensions: ["vault"] }],
      }) as string | null;
      if (!dest) return;
      diagTrackStart("vault_backup");
      try {
        const result = await tauri.backupVault(dest);
        diagTrackEnd("vault_backup", true);
        store.notify(`Vault backed up: ${result.file_count} files`, "success");
        diag.addLog("info", "info", "vault_backup", `Backup completed: ${result.file_count} files`);
      } catch {
        // Fallback: use exportFiles for all files
        const allIds = files.map((f) => f.id);
        await reliability.backupVault(tauri.exportFiles, allIds, dest);
        diagTrackEnd("vault_backup", true);
        store.notify(`Vault backed up: ${allIds.length} files`, "success");
        diag.addLog("info", "info", "vault_backup", `Backup completed: ${allIds.length} files`);
      }
    } catch {
      diagTrackEnd("vault_backup", false, "Backup failed");
      store.notify("Backup completed (demo)", "success");
      diag.addLog("info", "info", "vault_backup", "Vault backup completed (demo)");
    }
  };

  // ── Encrypted vault restore ──
  const handleRestoreVault = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true }) as string | null;
      if (!selected) return;
      diagTrackStart("vault_restore");
      try {
        const result = await tauri.restoreVault(selected);
        diagTrackEnd("vault_restore", true);
        sessionCache.invalidateIndex();
        store.notify(`Vault restored: ${result.restored_count} files`, "success");
        diag.addLog("info", "info", "vault_restore", `Restore completed: ${result.restored_count} files`);
        loadFiles();
      } catch {
        diagTrackEnd("vault_restore", false, "Restore failed");
        store.notify("Restore failed", "error");
      }
    } catch {
      store.notify("Vault restored (demo)", "success");
      diag.addLog("info", "info", "vault_restore", "Vault restore completed (demo)");
    }
  };

  // FullscreenViewer handles its own blob URL cleanup via useEffect
  const handleCloseViewer = useCallback(() => {
    store.update({ fullscreenFile: null });
    thumbs.setFullscreenMode(false);
  }, []);

  const isBiotech = themeMode === "biotech";
  const isCommand = themeMode === "command";
  const isNeonCity = themeMode === "neoncity";
  const isSolarCore = themeMode === "solarcore";

  const [unlockBurst, setUnlockBurst] = useState(false);


  // Slideshow crossfade: two alternating layers so there is never a black frame
  type SlideBg = { url: string; isVideo: boolean } | null;
  const [slideLayerA, setSlideLayerA] = useState<SlideBg>(null);
  const [slideLayerB, setSlideLayerB] = useState<SlideBg>(null);
  const [slideActive, setSlideActive] = useState<"a" | "b">("a");
  const slideActiveRef = useRef<"a" | "b">("a");
  const filesRef = useRef<VaultFile[]>([]);
  filesRef.current = allVaultFiles.length > 0 ? allVaultFiles : files; // use all vault files for slideshow lookup
  const slideshowPrevSettingsRef = useRef<{
    backgroundOpacity: number;
    backgroundFit: string;
    backgroundScale: number;
    backgroundOffsetX: number;
    backgroundOffsetY: number;
  } | null>(null);

  // Handle selecting a vault file as custom background
  const handleVaultFileBackground = useCallback(async (fileId: string) => {
    try {
      const [b64Data, mimeType] = await tauri.getFileContent(fileId);
      const isVideo = mimeType.startsWith("video/");
      const dataUrl = `data:${mimeType};base64,${b64Data}`;
      store.update({
        customBackground: dataUrl,
        backgroundIsVideo: isVideo,
        backgroundSource: "vault",
        backgroundVaultFileId: fileId,
      });
    } catch {
      store.notify("Failed to load vault file as background", "error");
    }
  }, [tauri, store]);

  // Slideshow: cycle through vault images/videos at the configured interval.
  // Uses two alternating layers with CSS crossfade — no black frames.
  // Protocol URLs (cvlt://) are used directly — no base64 IPC, no blob URL churn.
  useEffect(() => {
    if (!store.slideshowEnabled || store.slideshowFileIds.length < 1 || store.screen !== "vault") {
      setSlideLayerA(null);
      setSlideLayerB(null);
      return;
    }

    let idx = 0;
    let destroyed = false;

    const tick = () => {
      if (destroyed) return;
      let fileId: string;
      if (store.slideshowShuffle) {
        idx = Math.floor(Math.random() * store.slideshowFileIds.length);
        fileId = store.slideshowFileIds[idx];
      } else {
        fileId = store.slideshowFileIds[idx];
        idx = (idx + 1) % store.slideshowFileIds.length;
      }

      // Look up file metadata from the files list — no IPC needed
      const fileEntry = filesRef.current.find((f) => f.id === fileId);
      if (!fileEntry) return;

      const isVideo = fileEntry.category === "Videos";
      // Direct protocol URL — browser streams it, no base64, no memory churn
      const url = convertFileSrc("file/" + fileId, "cvlt");
      const slide = { url, isVideo };

      // Put new content into the currently-inactive layer
      const current = slideActiveRef.current;
      const next = current === "a" ? "b" : "a";

      // Render new content into the inactive layer first (it's hidden, opacity 0)
      if (next === "b") setSlideLayerB(slide);
      else setSlideLayerA(slide);

      // One frame delay so React paints the hidden layer before we show it
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (destroyed) return;
          // Now cross-fade: make the next layer visible, old layer fades out
          slideActiveRef.current = next;
          setSlideActive(next);
        });
      });
    };

    // Kick off immediately so first slide appears without waiting for the interval
    tick();
    const interval = setInterval(tick, store.slideshowInterval * 1000);
    return () => {
      destroyed = true;
      clearInterval(interval);
    };
  }, [store.slideshowEnabled, store.slideshowFileIds, store.slideshowInterval, store.slideshowShuffle, store.screen]);

  const handleUnlock = async (vault: VaultInfo) => {
    setUnlockBurst(true);
    setThumbnailsReady(false);
    setTimeout(() => setUnlockBurst(false), 2000);
    setTimeout(() => setThumbnailsReady(true), 5000);
    store.update({ screen: "vault", activeVault: vault });

    // Clean up legacy non-vault-scoped pages key (one-time migration)
    localStorage.removeItem("cybervault_pages");

    // Generate a fresh session encryption key for this unlock session
    await initSessionKey();

    // Load encrypted pages from backend (passwords, notes, documents)
    let pagesRestored = false;
    try {
      const pagesJson = await tauri.loadPages();
      const parsed = JSON.parse(pagesJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Encrypt all password/TOTP fields with the session key so they
        // are never held as plaintext in React state or DevTools.
        for (const page of parsed) {
          if (page.categories) {
            for (const cat of page.categories) {
              if (cat.passwords && cat.passwords.length > 0) {
                cat.passwords = await encryptPasswords(cat.passwords);
              }
            }
          }
        }
        store.update({ vaultPages: parsed });
        pagesRestored = true;
      }
    } catch {
      // Backend load failed — fall through to localStorage fallback
    }

    // Fallback: restore page shell from localStorage so pages at least appear
    // (content like notes/passwords won't be available, but pages won't vanish)
    if (!pagesRestored) {
      try {
        const saved = localStorage.getItem(`cybervault_pages_${vault.id}`);
        if (saved) {
          const shell = JSON.parse(saved);
          if (Array.isArray(shell) && shell.length > 0) {
            store.update({ vaultPages: shell });
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Restore slideshow config from localStorage
    try {
      const saved = localStorage.getItem(`cybervault-slideshow-${vault.id}`);
      if (saved) {
        const config = JSON.parse(saved);
        store.update({
          slideshowEnabled: config.enabled || false,
          slideshowInterval: config.interval || 30,
          slideshowFileIds: [],  // Not persisted in localStorage — must be re-selected after unlock
          slideshowShuffle: config.shuffle || false,
        });
      }
    } catch { /* ignore parse errors */ }
  };

  // Persist slideshow config to localStorage when it changes
  useEffect(() => {
    if (!store.activeVault || store.screen !== "vault") return;
    const config = {
      enabled: store.slideshowEnabled,
      interval: store.slideshowInterval,
      // fileIds intentionally omitted — persisting file IDs in plaintext localStorage
      // would leak which files the user selected. Re-selected after unlock.
      shuffle: store.slideshowShuffle,
    };
    localStorage.setItem(`cybervault-slideshow-${store.activeVault.id}`, JSON.stringify(config));
  }, [store.slideshowEnabled, store.slideshowInterval, store.slideshowFileIds, store.slideshowShuffle, store.activeVault, store.screen]);

  return (
    <div
      className={`h-screen w-screen relative bg-[var(--color-cyber-black)] ${pageZoom !== 1 ? "overflow-auto" : "overflow-hidden"}`}
      style={pageZoom !== 1 ? { transform: `scale(${pageZoom})`, transformOrigin: "top left", width: `${100 / pageZoom}%`, minHeight: `${100 / pageZoom}%` } : undefined}
    >
      {/* Animated neon background — hidden when a custom background is active to prevent bleed-through */}
      {!(store.screen === "vault" && store.customBackground) && (
        <AnimatePresence mode="wait">
          <motion.div
            key="neon-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <NeonBackground />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Custom background image or video — rendered above theme backgrounds */}
      {store.screen === "vault" && (
        store.slideshowEnabled && (slideLayerA || slideLayerB) ? (
          // Slideshow mode: two crossfading layers — the inactive layer sits at opacity 0
          // while the active one is at the user's chosen opacity. Transitions prevent black frames.
          <>
            {[{ layer: slideLayerA, id: "a" }, { layer: slideLayerB, id: "b" }].map(({ layer, id }) => {
              if (!layer) return null;
              const isActive = slideActive === id;
              const commonStyle: React.CSSProperties = {
                opacity: isActive ? store.backgroundOpacity / 100 : 0,
                transition: "opacity 0.6s ease",
                pointerEvents: "none",
              };
              return layer.isVideo ? (
                <video
                  key={id}
                  src={layer.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="fixed inset-0 z-[2] w-full h-full"
                  style={{
                    ...commonStyle,
                    objectFit: store.backgroundFit as React.CSSProperties["objectFit"],
                    objectPosition: `calc(50% + ${store.backgroundOffsetX}px) calc(50% + ${store.backgroundOffsetY}px)`,
                    transform: store.backgroundScale !== 100 ? `scale(${store.backgroundScale / 100})` : undefined,
                  }}
                />
              ) : (
                <div
                  key={id}
                  className="fixed inset-0 z-[2] bg-no-repeat"
                  style={{
                    ...commonStyle,
                    backgroundImage: `url(${layer.url})`,
                    backgroundSize: store.backgroundScale !== 100 ? `${store.backgroundScale}%` : store.backgroundFit,
                    backgroundPosition: `calc(50% + ${store.backgroundOffsetX}px) calc(50% + ${store.backgroundOffsetY}px)`,
                  }}
                />
              );
            })}
          </>
        ) : store.customBackground ? (
          // Static background (manual selection)
          store.backgroundIsVideo ? (
            <video
              key="static-bg-video"
              src={store.customBackground}
              autoPlay
              loop
              muted
              playsInline
              className="fixed inset-0 z-[2] w-full h-full pointer-events-none"
              style={{
                opacity: store.backgroundOpacity / 100,
                objectFit: store.backgroundFit as React.CSSProperties["objectFit"],
                objectPosition: `calc(50% + ${store.backgroundOffsetX}px) calc(50% + ${store.backgroundOffsetY}px)`,
                transform: store.backgroundScale !== 100 ? `scale(${store.backgroundScale / 100})` : undefined,
              }}
            />
          ) : (
            <div
              className="fixed inset-0 z-[2] bg-no-repeat pointer-events-none"
              style={{
                backgroundImage: `url(${store.customBackground})`,
                opacity: store.backgroundOpacity / 100,
                backgroundSize: store.backgroundScale !== 100 ? `${store.backgroundScale}%` : store.backgroundFit,
                backgroundPosition: `calc(50% + ${store.backgroundOffsetX}px) calc(50% + ${store.backgroundOffsetY}px)`,
              }}
            />
          )
        ) : null
      )}


      {/* Unlock burst overlay */}
      <UnlockBurst active={unlockBurst} themeMode={themeMode} />

      {/* Snake game — only visible in stealth mode as disguise on welcome/login screens */}
      {(store.screen === "welcome" || store.screen === "login") && store.stealthMode && !stealthBypassed && (
        <Suspense fallback={null}>
          <DecoySnakeGame
            hint={stealthHint}
            onPinEntered={async (pin: string) => {
              // Try the PIN against all vaults — unlock the first match
              try {
                const vaults = await tauri.listVaults();
                for (const vault of vaults) {
                  try {
                    const ok = await tauri.unlockVault(vault.id, pin);
                    if (ok) {
                      setStealthBypassed(true);
                      handleUnlock(vault);
                      return;
                    }
                  } catch (e) {
                    const msg = String(e);
                    if (msg.includes("VAULT_DESTROYED_SILENT") || msg.includes("VAULT_DESTROYED")) {
                      // Duress/self-destruct triggered — clear stealth if no vaults remain
                      const remaining = await tauri.listVaults();
                      if (remaining.length === 0) {
                        localStorage.removeItem("cybervault_stealth_mode");
                        localStorage.removeItem("cybervault_stealth_hint");
                        store.update({ stealthMode: false });
                      }
                      setStealthBypassed(true);
                      store.update({ screen: "login" });
                      return;
                    }
                    // Other errors (lockout, etc.) — continue trying next vault
                  }
                }
              } catch {
                // Tauri not available (demo mode) — fall through
              }
              // No vault matched — return false to signal failure
              return false;
            }}
            onBypass={() => {
              // After 10 failed attempts, bypass disguise to vault selection screen
              setStealthBypassed(true);
              store.update({ screen: "login" });
            }}
          />
        </Suspense>
      )}

      {/* Welcome screen (overlays the snake game) */}
      <AnimatePresence>
        {store.screen === "welcome" && (
          <WelcomeScreen onContinue={() => store.update({ screen: hasAcceptedTOS() ? "login" : "legal" })} />
        )}
      </AnimatePresence>

      {/* Terms of Service & Privacy Policy (first launch only) */}
      <AnimatePresence>
        {store.screen === "legal" && (
          <LegalScreen onAccept={() => store.update({ screen: "login" })} />
        )}
      </AnimatePresence>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {store.screen === "login" ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              isBiotech
                ? { opacity: 0, scale: 0.97, filter: "blur(4px)" }
                : isCommand
                  ? { opacity: 0, clipPath: "inset(0 0 0 100%)" }
                  : { opacity: 0, scale: 0.95, filter: "blur(2px)" }
            }
            transition={{ duration: isBiotech ? 0.5 : isCommand ? 0.4 : 0.35 }}
            className="relative z-10 h-full"
          >
            <LoginScreen onUnlock={handleUnlock} notify={store.notify} themeMode={themeMode} />
          </motion.div>
        ) : store.screen === "vault" ? (
          <motion.div
            key="vault"
            initial={
              isBiotech
                ? { opacity: 0, scale: 0.98, filter: "blur(4px)" }
                : isCommand
                  ? { opacity: 0, clipPath: "inset(0 100% 0 0)" }
                  : { opacity: 0, clipPath: "inset(0 0 100% 0)" }
            }
            animate={
              isBiotech
                ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                : isCommand
                  ? { opacity: 1, clipPath: "inset(0 0% 0 0)" }
                  : { opacity: 1, clipPath: "inset(0 0 0% 0)" }
            }
            exit={{ opacity: 0, scale: 0.96, filter: "blur(3px)" }}
            transition={{ duration: isBiotech ? 0.6 : isCommand ? 0.45 : 0.4, ease: "easeOut" }}
            className="relative z-10 h-full flex flex-col"
            style={lockFlash ? { animation: "screen-shake 0.3s ease-out" } : undefined}
          >
            {/* Lock flash overlay */}
            <AnimatePresence>
              {lockFlash && (
                <motion.div
                  key="lock-flash"
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="fixed inset-0 z-[200] pointer-events-none"
                  style={{ backgroundColor: "white" }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
            {store.currentPage === null ? (
              /* ── Home Page: 4x4 category grid ── */
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex-1 flex flex-col h-full"
              >
              <HomePage
                pages={store.vaultPages}
                onOpenPage={(pageId) => store.update({ currentPage: pageId, folderFilter: null })}
                onAddPage={store.addPage}
                onDeletePage={store.deletePage}
                onRenamePage={store.renamePage}
                onLock={handleLock}
                onSettings={() => store.update({ showSettings: true })}
                vaultName={store.activeVault?.name || "CyberVault"}
                themeMode={themeMode}
              />
              </motion.div>
            ) : (
              /* ── Category Page: full vault view ── */
              <motion.div
                key={`page-${store.currentPage}`}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex-1 flex flex-col h-full"
              ><>
                {/* Back-to-home nav bar. On media pages this is folded into the
                    single Toolbar below (Home/Settings/Lock live there), so we
                    skip this second bar to keep the page from feeling cramped. */}
                {!isMediaPage && (
                  <div className="flex items-center gap-1 px-4 py-1.5" style={{ borderBottom: "1px solid var(--color-cyber-border)", backgroundColor: "var(--color-cyber-panel)" }}>
                    <button
                      onClick={() => store.update({ currentPage: null, searchQuery: "", categoryFilter: "All", folderFilter: null, selectedFiles: new Set() })}
                      className="font-mono text-[17px] uppercase tracking-wider px-3 py-1 rounded-sm transition-all hover:opacity-80"
                      style={{ color: "var(--color-neon-bright)", border: "1px solid var(--color-neon-dark)" }}>
                      &#8592; Home
                    </button>
                    <button
                      onClick={handleLock}
                      className="font-mono text-[17px] uppercase tracking-wider px-3 py-1 rounded-sm transition-all hover:opacity-80 lock-button"
                      style={{ color: "var(--color-neon-bright)", border: "1px solid var(--color-neon-dark)" }}>
                      &#128274; Lock
                    </button>
                    <button
                      onClick={() => store.update({ showSettings: true })}
                      className="font-mono text-[17px] uppercase tracking-wider px-3 py-1 rounded-sm transition-all hover:opacity-80"
                      style={{ color: "var(--color-neon-primary)", border: "1px solid var(--color-neon-dark)" }}>
                      Settings
                    </button>
                  </div>
                )}

                {/* Render category-specific full-page UI or media toolbar+grid */}
                {(() => {
                  const pg = store.vaultPages.find(p => p.id === store.currentPage);
                  const catType = pg?.categories?.[0]?.type;

                  if (catType === "notes" || catType === "documents" || catType === "passwords") {
                    return (
                      <div className="flex-1 overflow-y-auto">
                        <PageCategories
                          categories={pg!.categories}
                          pageColor={pg!.color}
                          onUpdate={(cats) => store.updatePageCategories(pg!.id, cats)}
                          themeMode={themeMode}
                          isPro={license.isPro}
                        />
                      </div>
                    );
                  }

                  // Media pages: show toolbar + file grid (images & videos only)
                  const pageFiles = isMediaPage ? mediaFiles : files;
                  const pageCats = isMediaPage ? mediaCategories : categories;
                  return (
                    <>
                      <Toolbar
                        searchQuery={store.searchQuery}
                        onSearchChange={(q) => store.update({ searchQuery: q })}
                        sortField={store.sortField}
                        sortAsc={store.sortAsc}
                        onSortChange={(f) => store.update({ sortField: f })}
                        onSortToggle={() => store.update({ sortAsc: !store.sortAsc })}
                        selectedCount={store.selectedFiles.size}
                        totalCount={pageFiles.length}
                        onSelectAll={() => store.selectAll(pageFiles.map((f) => f.id))}
                        onDeselectAll={store.deselectAll}
                        onAddFiles={handleAddFiles}
                        onDeleteSelected={handleDeleteSelected}
                        onExportSelected={handleExportSelected}
                        showFavoritesOnly={store.showFavoritesOnly}
                        onToggleFavorites={() => store.update({ showFavoritesOnly: !store.showFavoritesOnly })}
                        onSettings={() => store.update({ showSettings: true })}
                        onTrash={() => store.update({ showTrash: true })}
                        trashCount={trashCount}
                        onLock={handleLock}
                        onHome={() => store.update({ currentPage: null, searchQuery: "", categoryFilter: "All", folderFilter: null, selectedFiles: new Set() })}
                        categories={pageCats}
                        categoryFilter={store.categoryFilter}
                        onCategoryChange={(c) => store.update({ categoryFilter: c })}
                        themeMode={themeMode}
                        onExportEncryptedZip={handleExportEncryptedZip}
                        folders={pageFolders}
                        folderFilter={store.folderFilter}
                        onFolderChange={(f) => store.update({ folderFilter: f })}
                        onCreateFolder={handleCreateFolder}
                        onBrowser={isMediaPage ? () => setShowBrowser((v) => !v) : undefined}
                        browserActive={showBrowser}
                        onSortPreset={(f, asc) => store.update({ sortField: f, sortAsc: asc })}
                      />

                      {isMediaPage && showBrowser && (
                        <VaultBrowserBar
                          themeMode={themeMode}
                          onOpen={(url) =>
                            tauri.browserOpen(url).catch((e) => store.notify(String(e), "error"))
                          }
                          onBack={() => tauri.browserBack().catch(() => {})}
                          onForward={() => tauri.browserForward().catch(() => {})}
                          onReload={() => tauri.browserReload().catch(() => {})}
                          onClose={() => {
                            tauri.browserClose().catch(() => {});
                            setShowBrowser(false);
                          }}
                          onGrab={(url, referer) => {
                            store.notify("Grabbing media into vault…", "info");
                            tauri.browserGrab(url, referer ?? undefined).catch((e) => store.notify(String(e), "error"));
                          }}
                        />
                      )}

                      {filesLoading && files.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-3">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="w-8 h-8 border-2 border-[var(--color-neon-primary)] border-t-transparent rounded-full"
                            />
                            <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">Loading vault index…</p>
                          </div>
                        </div>
                      ) : (
                        <FileGrid
                          files={pageFiles}
                          viewMode={store.viewMode}
                          selectedFiles={store.selectedFiles}
                          onToggleSelect={store.toggleFileSelection}
                          onPreview={(file) => store.update({ previewFile: file })}
                          onToggleFavorite={handleToggleFavorite}
                          onFullscreen={handleFullscreen}
                          themeMode={themeMode}
                          searchQuery={store.searchQuery}
                          folders={pageFolders}
                          folderFilter={store.folderFilter}
                          onFolderChange={(f) => store.update({ folderFilter: f })}
                          onCreateFolder={handleCreateFolder}
                          onDeleteFolder={handleDeleteFolder}
                          onMoveToFolder={handleMoveToFolder}
                          thumbnails={thumbs.thumbnails}
                          onVisibleFilesChange={handleVisibleFilesChange}
                        />
                      )}

                      <StatusBar
                        vaultName={store.activeVault?.name || "Unknown"}
                        fileCount={pageFiles.length}
                        vaultSize={vaultSize}
                        themeMode={themeMode}
                      />
                    </>
                  );
                })()}

                {/* Move files modal */}
                <MoveFilesModal
                  open={showMoveModal}
                  selectedCount={store.selectedFiles.size}
                  pages={store.vaultPages}
                  currentPageId={store.currentPage}
                  folders={pageFolders}
                  onMoveToPage={(pageId) => {
                    store.moveFilesToPage([...store.selectedFiles], pageId);
                    setShowMoveModal(false);
                  }}
                  onMoveToFolder={(folder) => {
                    handleMoveToFolder([...store.selectedFiles], folder);
                    setShowMoveModal(false);
                  }}
                  onClose={() => setShowMoveModal(false)}
                  themeMode={themeMode}
                />
              </>
              </motion.div>
            )}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Overlays */}
      <PreviewPanel
        file={store.previewFile}
        onClose={() => store.update({ previewFile: null })}
        onToggleFavorite={handleToggleFavorite}
        onExport={handlePreviewExport}
        onDelete={handlePreviewDelete}
        themeMode={themeMode}
      />

      {/* Lazy-loaded: Settings panel only loads when opened */}
      {store.showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel
            open={store.showSettings}
            onClose={() => store.update({ showSettings: false })}
            theme={store.theme}
            onThemeChange={store.setTheme}
            customBackground={store.customBackground}
            onBackgroundChange={(bg) => store.update({ customBackground: bg })}
            backgroundOpacity={store.backgroundOpacity}
            onBackgroundOpacityChange={(opacity) => store.update({ backgroundOpacity: opacity })}
            backgroundFit={store.backgroundFit}
            onBackgroundFitChange={(fit) => store.update({ backgroundFit: fit })}
            backgroundScale={store.backgroundScale}
            onBackgroundScaleChange={(scale) => store.update({ backgroundScale: scale })}
            backgroundOffsetX={store.backgroundOffsetX}
            onBackgroundOffsetXChange={(x) => store.update({ backgroundOffsetX: x })}
            backgroundOffsetY={store.backgroundOffsetY}
            onBackgroundOffsetYChange={(y) => store.update({ backgroundOffsetY: y })}
            backgroundIsVideo={store.backgroundIsVideo}
            onBackgroundIsVideoChange={(isVideo) => store.update({ backgroundIsVideo: isVideo })}
            vaultSizeInfo={vaultSizeInfo}
            themeMode={themeMode}
            onBackupVault={handleBackupVault}
            onRestoreVault={handleRestoreVault}
            backupInProgress={reliability.backupInProgress}
            restoreInProgress={reliability.restoreInProgress}
            bypassChunkLimits={bypassChunkLimits}
            onBypassChunkLimitsChange={(val: boolean) => {
              setBypassChunkLimits(val);
              localStorage.setItem("cybervault_bypass_chunk_limits", String(val));
            }}
            bypassThumbnailCache={bypassThumbnailCache}
            onBypassThumbnailCacheChange={(val: boolean) => {
              setBypassThumbnailCache(val);
              localStorage.setItem("cybervault_bypass_thumbnail_cache", String(val));
            }}
            cacheAllThumbnails={cacheAllThumbnails}
            onCacheAllThumbnailsChange={(val: boolean) => {
              setCacheAllThumbnails(val);
              localStorage.setItem("cybervault_cache_all_thumbnails", String(val));
            }}
            onPrecacheThumbnails={handlePrecacheThumbnails}
            onCancelPrecache={handleCancelPrecache}
            precacheProgress={precacheProgress}
            maxThumbnails={maxThumbnails}
            onMaxThumbnailsChange={(val: number) => {
              setMaxThumbnails(val);
              localStorage.setItem("cybervault_max_thumbnails", String(val));
            }}
            cooldownMs={cooldownMs}
            onCooldownMsChange={(val: number) => {
              setCooldownMs(val);
              localStorage.setItem("cybervault_cooldown_ms", String(val));
            }}
            fullscreenUnload={fullscreenUnload}
            onFullscreenUnloadChange={(val: boolean) => {
              setFullscreenUnload(val);
              localStorage.setItem("cybervault_fullscreen_unload", String(val));
            }}
            clearVideoCacheOnLock={clearVideoCacheOnLock}
            onClearVideoCacheOnLockChange={(val: boolean) => {
              setClearVideoCacheOnLock(val);
              localStorage.setItem("cybervault_clear_video_cache_on_lock", String(val));
            }}
            thumbResolution={thumbResolution}
            onThumbResolutionChange={(val: number) => {
              setThumbResolution(val);
              localStorage.setItem("cybervault_thumb_resolution", String(val));
            }}
            memoryAmberPercent={memoryAmberPercent}
            onMemoryAmberPercentChange={(val) => {
              setMemoryAmberPercent(val);
              localStorage.setItem("cybervault_memory_amber_percent", String(val));
            }}
            disableFileEviction={disableFileEviction}
            onDisableFileEvictionChange={(val: boolean) => {
              setDisableFileEviction(val);
              localStorage.setItem("cybervault_disable_file_eviction", String(val));
            }}
            vaultFiles={(allVaultFiles.length > 0 ? allVaultFiles : files).map((f) => ({ id: f.id, name: f.name, category: f.category, file_type: f.file_type }))}
            onVaultFileBackground={handleVaultFileBackground}
            slideshowEnabled={store.slideshowEnabled}
            onSlideshowEnabledChange={(enabled) => {
              if (enabled) {
                slideshowPrevSettingsRef.current = {
                  backgroundOpacity: store.backgroundOpacity,
                  backgroundFit: store.backgroundFit,
                  backgroundScale: store.backgroundScale,
                  backgroundOffsetX: store.backgroundOffsetX,
                  backgroundOffsetY: store.backgroundOffsetY,
                };
                store.update({
                  slideshowEnabled: true,
                  backgroundOpacity: 100,
                  backgroundFit: "contain",
                  backgroundScale: 100,
                  backgroundOffsetX: 0,
                  backgroundOffsetY: 0,
                });
              } else {
                const prev = slideshowPrevSettingsRef.current;
                store.update({
                  slideshowEnabled: false,
                  ...(prev || {
                    backgroundOpacity: 40,
                    backgroundFit: "cover",
                    backgroundScale: 100,
                    backgroundOffsetX: 0,
                    backgroundOffsetY: 0,
                  }),
                });
                slideshowPrevSettingsRef.current = null;
              }
            }}
            slideshowInterval={store.slideshowInterval}
            onSlideshowIntervalChange={(interval) => store.update({ slideshowInterval: interval })}
            slideshowFileIds={store.slideshowFileIds}
            onSlideshowFileIdsChange={(ids) => store.update({ slideshowFileIds: ids })}
            slideshowShuffle={store.slideshowShuffle}
            onSlideshowShuffleChange={(shuffle) => store.update({ slideshowShuffle: shuffle })}
            stealthMode={store.stealthMode}
            onStealthModeChange={(enabled) => {
              store.update({ stealthMode: enabled });
              localStorage.setItem("cybervault_stealth_mode", String(enabled));
            }}
            stealthHint={stealthHint}
            onStealthHintChange={(hint: string) => {
              setStealthHint(hint);
              localStorage.setItem("cybervault_stealth_hint", hint);
            }}
            onWipeComplete={() => {
              sessionCache.invalidateIndex();
              loadFiles();
            }}
            isPro={license.isPro}
            licenseKey={license.licenseKey}
            licenseEmail={license.email}
            licenseLoading={license.loading}
            licenseError={license.error}
            trialDaysLeft={license.trialDaysLeft}
            onActivateLicense={licenseActions.activate}
            onDeactivateLicense={licenseActions.deactivate}
          />
        </Suspense>
      )}

      {store.showTrash && (
        <Suspense fallback={null}>
          <TrashPanel
            open={store.showTrash}
            onClose={() => store.update({ showTrash: false })}
            themeMode={themeMode}
            onNotify={store.notify}
            onFilesChanged={() => { loadFiles(); }}
            pageFileIds={undefined}
          />
        </Suspense>
      )}

      {/* Lazy-loaded: Fullscreen viewer only loads when a file is opened */}
      {store.fullscreenFile && (
        <Suspense fallback={null}>
          <FullscreenViewer
            file={store.fullscreenFile}
            files={files}
            onClose={handleCloseViewer}
            onNavigate={(f) => store.update({ fullscreenFile: f })}
            onDelete={(fileId) => {
              // Don't close the viewer — the viewer navigates to the next file first
              store.update({ selectedFiles: new Set([fileId]) });
              handleDeleteSelected();
            }}
            themeMode={themeMode}
            getCachedFile={sessionCache.getCachedFile}
            setCachedFile={sessionCache.setCachedFile}
          />
        </Suspense>
      )}

      {/* Encrypted ZIP password dialog */}
      <AnimatePresence>
        {showZipPasswordDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowZipPasswordDialog(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[700]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[90vw] z-[701] bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border border-[var(--color-neon-dark)] rounded-sm shadow-[0_0_30px_var(--color-neon-glow)] p-6 space-y-4"
            >
              <h3 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)]">
                Encrypted ZIP Password
              </h3>
              <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                Set a password to encrypt the ZIP archive.
              </p>
              <p className="font-mono text-[17px] text-amber-400/70">
                Note: Use 7-Zip or WinRAR to extract. Windows Explorer does not support AES-encrypted ZIPs.
              </p>
              <input
                type="password"
                value={zipPassword}
                onChange={(e) => setZipPassword(e.target.value)}
                placeholder="Password..."
                className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[17px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/40"
                autoFocus
              />
              <input
                type="password"
                value={zipPasswordConfirm}
                onChange={(e) => setZipPasswordConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleZipPasswordConfirm(); }}
                placeholder="Confirm password..."
                className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[17px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/40"
              />
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowZipPasswordDialog(false)}
                  className="flex-1 px-4 py-2 border border-[var(--color-cyber-border)] rounded-sm text-[17px] font-display uppercase tracking-wider text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleZipPasswordConfirm}
                  disabled={!zipPassword || zipPassword !== zipPasswordConfirm}
                  className="flex-1 px-4 py-2 bg-[var(--color-neon-primary)]/20 border border-[var(--color-neon-primary)] rounded-sm text-[17px] font-display uppercase tracking-wider text-[var(--color-neon-bright)] hover:bg-[var(--color-neon-primary)]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Export
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ImportProgress progress={store.importProgress} onCancel={handleCancelImport} themeMode={themeMode} />
      <ExportQueue queue={store.exportQueue} onCancel={handleCancelExport} themeMode={themeMode} />
      <Notification notification={store.notification} themeMode={themeMode} />

      {/* DiagBot floating assistant */}
      {store.screen === "vault" && (
        <DiagBot
          logs={diag.logs}
          unreadCount={diag.unreadCount}
          isOpen={diag.isOpen}
          healthScore={diag.healthScore}
          memorySnapshots={diag.memorySnapshots}
          memoryWarning={diag.memoryWarning}
          memoryAmberPercent={memoryAmberPercent}
          vaultIntegrity={diag.vaultIntegrity}
          onOpen={() => diag.setOpen(true)}
          onClose={() => diag.setOpen(false)}
          onClearLogs={diag.clearLogs}
          onExportReport={() => { diag.setOpen(false); diag.setShowReport(true); }}
          themeMode={themeMode}
        />
      )}

      <DiagReport
        open={diag.showReport}
        onClose={() => diag.setShowReport(false)}
        logs={diag.logs}
        healthScore={diag.healthScore}
        themeMode={themeMode}
      />

      {/* Global neon click + mouse-drag effects */}
      <NeonFX />

      {/* Update available notification */}
      <UpdateNotification update={updateAvailable} onDismiss={dismissUpdate} themeMode={themeMode} />
    </div>
  );
}
