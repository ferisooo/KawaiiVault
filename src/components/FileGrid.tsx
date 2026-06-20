import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  File, Image, Film, Music, FileText, Archive, Star, Eye, Monitor,
  Folder, FolderPlus, FolderOpen, Trash2, ChevronRight, Maximize, X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { VaultFile, ViewMode } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  files: VaultFile[];
  viewMode: ViewMode;
  selectedFiles: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (file: VaultFile) => void;
  onToggleFavorite: (id: string) => void;
  onFullscreen?: (file: VaultFile) => void;
  themeMode?: ThemeMode;
  searchQuery?: string;
  folders?: string[];
  folderFilter?: string | null;
  onFolderChange?: (folder: string | null) => void;
  onCreateFolder?: (name: string) => void;
  onDeleteFolder?: (name: string) => void;
  onMoveToFolder?: (fileIds: string[], folder: string | null) => void;
  thumbnails?: Record<string, string>;
  onVisibleFilesChange?: (visibleFileIds: string[], scrollDirection?: "up" | "down" | null) => void;
}

const categoryIcons: Record<string, typeof File> = {
  Images: Image, Videos: Film, Audio: Music,
  Documents: FileText, Archives: Archive, Programs: Monitor,
};

function getIcon(category: string) { return categoryIcons[category] || File; }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const SPARK_SPECTRUM = ["#22eeff", "#9944ff", "#ff44cc", "#33ff88"];

// ── Selection sparks at card corners ──
function SelectionSparks({ prismatic = false }: { prismatic?: boolean }) {
  const sparks = [
    { tx: "-8px", ty: "-8px", delay: 0 },
    { tx: "8px",  ty: "-8px", delay: 0.05 },
    { tx: "-8px", ty: "8px",  delay: 0.1 },
    { tx: "8px",  ty: "8px",  delay: 0.15 },
  ];
  return (
    <>
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{
            top: "50%", left: "50%",
            backgroundColor: prismatic ? SPARK_SPECTRUM[i] : "var(--color-neon-primary)",
          }}
          initial={{ scale: 0, x: "-50%", y: "-50%", opacity: 1 }}
          animate={{ scale: [0, 1, 0], x: s.tx, y: s.ty, opacity: [1, 1, 0] }}
          transition={{ duration: 0.4, delay: s.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

// ── Individual file card (memoized to prevent unnecessary re-renders) ──
const FileCard = memo(function FileCard({
  file, selected, onToggleSelect, onPreview, onToggleFavorite, onFullscreen, isNew, thumbnail, themeMode,
}: {
  file: VaultFile;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (file: VaultFile) => void;
  onToggleFavorite: (id: string) => void;
  onFullscreen?: (file: VaultFile) => void;
  isNew?: boolean;
  thumbnail?: string | null;
  themeMode?: ThemeMode;
}) {
  const Icon = getIcon(file.category);
  const prevSelectedRef = useRef(false);
  const [showSparks, setShowSparks] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && !prevSelectedRef.current) {
      setShowSparks(true);
      const t = setTimeout(() => setShowSparks(false), 500);
      return () => clearTimeout(t);
    }
    prevSelectedRef.current = selected;
  }, [selected]);

  // Direct DOM manipulation for tilt + hover lift — avoids re-renders on every mousemove
  const mouseDownRef = useRef(false);
  const handleMouseEnter = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "transform 0.06s ease, box-shadow 0.2s ease";
    el.style.boxShadow = "0 0 20px var(--color-neon-glow), 0 0 40px var(--color-neon-glow)";
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseDownRef.current) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg) translateY(-4px) scale(1.03)`;
  };
  const handleMouseLeave = () => {
    mouseDownRef.current = false;
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = "";
    el.style.boxShadow = "";
    el.style.transition = "transform 0.35s ease, box-shadow 0.3s ease";
  };

  // Stable callbacks that use file identity
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onToggleSelect(file.id);
    } else {
      if (onFullscreen) onFullscreen(file);
      else onPreview(file);
    }
  }, [file, onToggleSelect, onPreview, onFullscreen]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(file.id);
  }, [file.id, onToggleSelect]);

  const handleFavoriteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(file.id);
  }, [file.id, onToggleFavorite]);

  const handleFullscreenClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFullscreen) onFullscreen(file);
  }, [file, onFullscreen]);

  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview(file);
  }, [file, onPreview]);

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => { mouseDownRef.current = true; }}
      onMouseUp={() => { mouseDownRef.current = false; }}
      style={{ transformStyle: "preserve-3d", willChange: "transform" }}
    >
      <div
        onClick={handleClick}
        className={`relative group cursor-pointer rounded-sm border overflow-hidden file-card-base ${
          themeMode === "prismatic"
            ? selected
              ? "border-transparent bg-[rgba(34,238,255,0.06)] prism-glow"
              : "border-[var(--color-cyber-border)] bg-[var(--color-cyber-panel)]/60 hover:border-[rgba(34,238,255,0.25)] hover:shadow-[0_0_12px_rgba(34,238,255,0.12),0_0_20px_rgba(153,68,255,0.06)]"
            : selected
              ? "border-[var(--color-neon-primary)] bg-[var(--color-neon-subtle)] shadow-[0_0_15px_var(--color-neon-glow)] file-card-selected"
              : "border-[var(--color-cyber-border)] bg-[var(--color-cyber-panel)]/60 hover:border-[var(--color-neon-dark)] hover:shadow-[0_0_10px_var(--color-neon-glow)]"
        }`}
      >
        {/* Selection checkbox — top-left corner */}
        <div
          className={`absolute top-2 left-2 z-20 w-5 h-5 rounded-sm border flex items-center justify-center cursor-pointer file-card-base ${
            selected
              ? "bg-[var(--color-neon-primary)] border-[var(--color-neon-primary)]"
              : "bg-[var(--color-cyber-black)]/60 border-[var(--color-cyber-border)] opacity-0 group-hover:opacity-100"
          }`}
          onClick={handleCheckboxClick}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Prismatic: animated spectrum border when selected */}
        {themeMode === "prismatic" && selected && (
          <div
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{
              background: "linear-gradient(90deg,#ff3355,#ff8833,#ffcc22,#33ff88,#22eeff,#3366ff,#9944ff,#ff44cc,#ff3355)",
              backgroundSize: "300% 100%",
              animation: "liquid-spectrum 3s ease-in-out infinite",
              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: "1px",
            }}
          />
        )}

        {/* Holographic shimmer overlay — only rendered via CSS, no extra DOM when not hovered */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100"
          style={{
            background: themeMode === "prismatic"
              ? "linear-gradient(105deg, transparent 25%, rgba(34,238,255,0.06) 40%, rgba(255,204,34,0.04) 50%, rgba(255,68,204,0.06) 60%, transparent 75%)"
              : "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
            transition: "opacity 0.3s ease",
          }}
        />

        {/* Selection indicator bar */}
        {selected && (
          <div
            className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
            style={
              themeMode === "prismatic"
                ? {
                    background: "linear-gradient(90deg,#ff3355,#ffcc22,#33ff88,#22eeff,#9944ff,#ff44cc)",
                    backgroundSize: "200% 100%",
                    animation: "liquid-spectrum 2s ease-in-out infinite",
                  }
                : { background: "var(--color-neon-primary)" }
            }
          />
        )}

        {/* Selection sparks — only rendered when actively firing */}
        {showSparks && (
          <AnimatePresence>
            <SelectionSparks prismatic={themeMode === "prismatic"} />
          </AnimatePresence>
        )}

        {/* Scan-in beam overlay for new files */}
        {isNew && (
          <motion.div
            className="absolute inset-x-0 h-[2px] bg-[var(--color-neon-primary)] pointer-events-none z-10"
            style={{ boxShadow: "0 0 8px var(--color-neon-glow), 0 0 16px var(--color-neon-glow)" }}
            initial={{ top: 0, opacity: 1 }}
            animate={{ top: "100%", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeIn" }}
          />
        )}

        {/* Icon / Thumbnail area */}
        <div className="flex items-center justify-center h-36 p-2 bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="object-contain rounded-sm max-h-32 w-full"
              style={{ imageRendering: "auto" }}
              loading="lazy"
              onError={(e) => {
                // Hide broken image and let the icon fallback show via CSS
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Icon
              size={48}
              className={`file-card-base ${
                selected ? "text-[var(--color-neon-bright)]" : "text-[var(--color-cyber-muted)] group-hover:text-[var(--color-neon-primary)]"
              }`}
            />
          )}
        </div>

        {/* Info */}
        <div className="p-4 border-t border-[var(--color-cyber-border)]/50">
          <p className="font-body text-[17px] text-[var(--color-cyber-text)] truncate" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">{formatSize(file.size)}</span>
            <span className="font-mono text-[17px] text-[var(--color-neon-dark)] uppercase">.{file.file_type || "?"}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">{file.category}</span>
            <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">{new Date(file.imported_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
          </div>
        </div>

        {/* Hover overlay actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 file-card-base">
          <button
            onClick={handleFavoriteClick}
            className="w-6 h-6 rounded-sm bg-[var(--color-cyber-black)]/80 border border-[var(--color-cyber-border)] flex items-center justify-center backdrop-blur-sm hover:scale-110 active:scale-90 file-card-base"
          >
            <Star size={12} className={file.favorite ? "fill-[var(--color-status-star)] text-[var(--color-status-star)]" : "text-[var(--color-cyber-muted)] hover:text-[var(--color-status-star)]"} />
          </button>
          {onFullscreen && (
            <button
              onClick={handleFullscreenClick}
              className="w-6 h-6 rounded-sm bg-[var(--color-cyber-black)]/80 border border-[var(--color-cyber-border)] flex items-center justify-center backdrop-blur-sm hover:scale-110 active:scale-90 file-card-base"
            >
              <Maximize size={12} className="text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)]" />
            </button>
          )}
          <button
            onClick={handlePreviewClick}
            className="w-6 h-6 rounded-sm bg-[var(--color-cyber-black)]/80 border border-[var(--color-cyber-border)] flex items-center justify-center backdrop-blur-sm hover:scale-110 active:scale-90 file-card-base"
          >
            <Eye size={12} className="text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)]" />
          </button>
        </div>

        {/* Favorite badge */}
        {file.favorite && (
          <div className="absolute top-2 left-8 z-10">
            <Star size={10} className="fill-[var(--color-status-star)] text-[var(--color-status-star)]" />
          </div>
        )}
      </div>
    </div>
  );
});

export default function FileGrid({
  files, viewMode, selectedFiles, onToggleSelect, onPreview,
  onToggleFavorite, onFullscreen, themeMode = "cyberpunk", searchQuery = "",
  folders = [], folderFilter, onFolderChange, onCreateFolder, onDeleteFolder, onMoveToFolder,
  thumbnails = {},
  onVisibleFilesChange,
}: Props) {
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const prevFilesRef = useRef<Set<string>>(new Set());
  const newFileIdsRef = useRef<Set<string>>(new Set());
  const prevSelSizeRef = useRef(0);
  const [batchFlash, setBatchFlash] = useState(false);
  const [searchScan, setSearchScan] = useState(false);
  const prevSearchRef = useRef(searchQuery);

  // Virtual scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation for file grid (scroll only — arrow file navigation is in App.tsx)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "Home":
          e.preventDefault();
          el.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          e.preventDefault();
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          break;
        case "PageDown":
          e.preventDefault();
          el.scrollBy({ top: el.clientHeight * 0.8, behavior: "smooth" });
          break;
        case "PageUp":
          e.preventDefault();
          el.scrollBy({ top: -el.clientHeight * 0.8, behavior: "smooth" });
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Detect newly added files for materialize effect
  useEffect(() => {
    const currentIds = new Set(files.map((f) => f.id));
    const added = new Set<string>();
    for (const id of currentIds) {
      if (!prevFilesRef.current.has(id) && prevFilesRef.current.size > 0) {
        added.add(id);
      }
    }
    newFileIdsRef.current = added;
    prevFilesRef.current = currentIds;

    if (added.size > 0) {
      setTimeout(() => { newFileIdsRef.current = new Set(); }, 800);
    }
  }, [files]);

  // Detect batch select (selectedFiles jumps to all files)
  useEffect(() => {
    const prevSize = prevSelSizeRef.current;
    const newSize = selectedFiles.size;
    if (newSize === files.length && files.length > 1 && newSize - prevSize > 1) {
      setBatchFlash(true);
      setTimeout(() => setBatchFlash(false), 600);
    }
    prevSelSizeRef.current = newSize;
  }, [selectedFiles.size]);

  // Search scan beam trigger
  useEffect(() => {
    if (searchQuery !== prevSearchRef.current && searchQuery.length > 0) {
      setSearchScan(true);
      setTimeout(() => setSearchScan(false), 800);
    }
    prevSearchRef.current = searchQuery;
  }, [searchQuery]);

  // Calculate columns for grid mode
  const getColumns = (): number => {
    return 4;
  };

  const columns = getColumns();

  // Shuffle files when viewing All (no folder filter), re-randomize on each render
  const displayFiles = useMemo(() => {
    if (folderFilter !== null && folderFilter !== undefined) return files;
    // Fisher-Yates shuffle with a random seed so it re-shuffles every time
    const arr = [...files];
    let seed = (Date.now() ^ Math.random() * 0xffffffff) >>> 0;
    const rand = () => { seed = (seed ^ (seed << 13)) >>> 0; seed = (seed ^ (seed >> 7)) >>> 0; seed = (seed ^ (seed << 17)) >>> 0; return seed / 0xffffffff; };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, folderFilter]);

  // Group files into rows for virtualized grid
  const rows = useMemo(() => {
    const result: VaultFile[][] = [];
    for (let i = 0; i < displayFiles.length; i += columns) {
      result.push(displayFiles.slice(i, i + columns));
    }
    return result;
  }, [displayFiles, columns]);

  // Row height estimate (bigger cards for 3-column layout)
  const getRowHeight = (): number => {
    return 280;
  };

  // Virtual scrolling — reduced overscan for less off-screen rendering
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => getRowHeight(),
    overscan: 3,
  });

  // Track scroll direction
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<"up" | "down" | null>(null);

  // Report visible file IDs for visible-cell thumbnail generation
  const reportVisibleFiles = useCallback(() => {
    if (!onVisibleFilesChange) return;
    const el = scrollContainerRef.current;
    if (el) {
      const currentTop = el.scrollTop;
      if (currentTop > lastScrollTopRef.current + 5) {
        scrollDirectionRef.current = "down";
      } else if (currentTop < lastScrollTopRef.current - 5) {
        scrollDirectionRef.current = "up";
      }
      lastScrollTopRef.current = currentTop;
    }
    const virtualItems = virtualizer.getVirtualItems();
    const visibleIds: string[] = [];
    for (const item of virtualItems) {
      const rowFiles = rows[item.index];
      if (rowFiles) {
        for (const f of rowFiles) {
          visibleIds.push(f.id);
        }
      }
    }
    onVisibleFilesChange(visibleIds, scrollDirectionRef.current);
  }, [onVisibleFilesChange, virtualizer, rows]);

  // Trigger visible files report on initial render
  useEffect(() => {
    reportVisibleFiles();
  }, [reportVisibleFiles]);

  // Throttled scroll handler — fires at most once per animation frame
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !onVisibleFilesChange) return;
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        reportVisibleFiles();
        rafId = null;
      });
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [reportVisibleFiles, onVisibleFilesChange]);

  const hasFolders = folders.length > 0 || onCreateFolder;

  // Folder sidebar component
  const FolderSidebar = () => (
    <div className="w-44 shrink-0 border-r border-[var(--color-cyber-border)]/50 bg-[var(--color-cyber-panel)]/30 overflow-y-auto">
      <div className="px-3 py-2 border-b border-[var(--color-cyber-border)]/30">
        <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest">Folders</p>
      </div>
      {/* Root / All Files */}
      <button
        onClick={() => onFolderChange?.(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[17px] font-mono file-card-base ${
          folderFilter === null || folderFilter === undefined
            ? "bg-[var(--color-neon-subtle)] text-[var(--color-neon-bright)] border-l-2 border-l-[var(--color-neon-primary)]"
            : "text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] hover:bg-white/[0.02] border-l-2 border-l-transparent"
        }`}
      >
        <FolderOpen size={13} />
        All Files
      </button>
      {folders.map((f) => (
        <div key={f} className="group flex items-center">
          <button
            onClick={() => onFolderChange?.(f)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 text-left text-[17px] font-mono file-card-base folder-item truncate ${
              folderFilter === f
                ? "bg-[var(--color-neon-subtle)] text-[var(--color-neon-bright)] border-l-2 border-l-[var(--color-neon-primary)]"
                : "text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] hover:bg-white/[0.02] border-l-2 border-l-transparent"
            }`}
          >
            <Folder size={13} />
            <span className="truncate">{f}</span>
          </button>
          {onDeleteFolder && (
            <button
              onClick={() => onDeleteFolder(f)}
              className="p-1 mr-1 text-[var(--color-cyber-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 file-card-base"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
      {/* Create folder */}
      {onCreateFolder && (
        <div className="border-t border-[var(--color-cyber-border)]/30 mt-1 pt-1 px-2 pb-2">
          {showNewFolder ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Name..."
                className="flex-1 bg-[var(--color-cyber-black)]/60 border border-[var(--color-cyber-border)] rounded-sm px-2 py-1 text-[17px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    onCreateFolder(newFolderName.trim());
                    setNewFolderName("");
                    setShowNewFolder(false);
                  }
                  if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
                }}
              />
              <button
                onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
                className="flex items-center justify-center px-2 py-1 text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-400/60 rounded-sm bg-red-950/20 file-card-base"
                title="Cancel"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 w-full px-1 py-1.5 text-[17px] font-mono text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] file-card-base"
            >
              <FolderPlus size={12} />
              New Folder
            </button>
          )}
        </div>
      )}
      {/* Move selected to folder */}
      {selectedFiles.size > 0 && onMoveToFolder && (
        <div className="border-t border-[var(--color-cyber-border)]/30 mt-1 pt-1 px-2 pb-2">
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mb-1">{selectedFiles.size} selected</p>
          <button
            onClick={() => onMoveToFolder([...selectedFiles], null)}
            className="flex items-center gap-1.5 w-full px-1 py-1 text-[17px] font-mono text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] file-card-base"
          >
            <ChevronRight size={10} /> Move to root
          </button>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => onMoveToFolder([...selectedFiles], f)}
              className="flex items-center gap-1.5 w-full px-1 py-1 text-[17px] font-mono text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] file-card-base truncate"
            >
              <ChevronRight size={10} /> {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (files.length === 0) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {hasFolders && <FolderSidebar />}
        <div className="flex-1" />
      </div>
    );
  }

  // ── Grid view with virtual scrolling ──
  return (
    <div className="flex-1 flex overflow-hidden">
      {hasFolders && <FolderSidebar />}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 relative">
        {/* Search scan beam */}
        <AnimatePresence>
          {searchScan && (
            <motion.div
              className="absolute inset-x-4 h-[1px] pointer-events-none z-20"
              style={{ background: "linear-gradient(90deg, transparent, var(--color-neon-primary), transparent)", boxShadow: "0 0 12px var(--color-neon-glow)" }}
              initial={{ top: 0, opacity: 0 }}
              animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>

        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const rowFiles = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3"
              >
                <AnimatePresence>
                {rowFiles.map((file) => {
                  const isNew = newFileIdsRef.current.has(file.id);
                  const isSelected = selectedFiles.has(file.id);
                  return (
                    <motion.div
                      key={file.id}
                      initial={isNew ? { scale: 0.5, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={themeMode === "cyberpunk"
                        ? { scale: 0.85, opacity: 0, filter: "brightness(3) saturate(0) blur(8px)" }
                        : themeMode === "solarcore"
                        ? { scale: 0.9, opacity: 0, rotate: 2, filter: "brightness(1.5) sepia(1) blur(6px)" }
                        : themeMode === "neoncity"
                        ? { opacity: 0, filter: "brightness(2.5) saturate(2) hue-rotate(90deg) blur(4px)", scaleY: 0.8 }
                        : themeMode === "command"
                        ? { scale: 0.95, opacity: 0, filter: "brightness(1.8) saturate(0.3) blur(3px)", borderColor: "rgba(255,60,80,0.5)" }
                        : themeMode === "prismatic"
                        ? { scale: 1.1, opacity: 0, filter: "brightness(2) saturate(2) hue-rotate(180deg) blur(8px)" }
                        : themeMode === "biotech"
                        ? { scale: 0.85, opacity: 0, filter: "saturate(0) brightness(0.6) blur(5px)" }
                        : { scale: 0.8, opacity: 0, filter: "blur(4px)" }
                      }
                      transition={isNew
                        ? { type: "spring", stiffness: 400, damping: 22, duration: 0.35 }
                        : { duration: themeMode === "cyberpunk" ? 0.5 : themeMode === "solarcore" ? 0.7 : themeMode === "neoncity" ? 0.5 : themeMode === "command" ? 0.4 : themeMode === "prismatic" ? 0.6 : themeMode === "biotech" ? 0.8 : 0.25 }
                      }
                      layout
                    >
                      <FileCard
                        file={file}
                        selected={isSelected}
                        onToggleSelect={onToggleSelect}
                        onPreview={onPreview}
                        onToggleFavorite={onToggleFavorite}
                        onFullscreen={onFullscreen}
                        isNew={isNew}
                        thumbnail={thumbnails[file.id] || null}
                        themeMode={themeMode}
                      />
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
