import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, RotateCcw, AlertTriangle, FileText, Image, Film, Music, Archive, File } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import CyberButton from "./CyberButton";
import type { VaultFile } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";
import { useTauri } from "../hooks/useTauri";
import { deleteCachedThumbnailsForFile } from "../utils/thumbnailDB";

interface Props {
  open: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  onNotify: (message: string, type: "success" | "error" | "warning" | "info") => void;
  onFilesChanged: () => void;
  pageFileIds?: string[]; // When set, only show trashed files belonging to this page
}

const categoryIcon = (cat: string) => {
  switch (cat) {
    case "Images": return <Image size={16} />;
    case "Videos": return <Film size={16} />;
    case "Audio": return <Music size={16} />;
    case "Documents": return <FileText size={16} />;
    case "Archives": return <Archive size={16} />;
    default: return <File size={16} />;
  }
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export default function TrashPanel({ open, onClose, themeMode, onNotify, onFilesChanged, pageFileIds }: Props) {
  const tauri = useTauri();
  const [trashedFiles, setTrashedFiles] = useState<VaultFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptyProgress, setEmptyProgress] = useState<number | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Listen for progress events during empty trash
  useEffect(() => {
    let cancelled = false;
    listen<number>("trash-progress", (event) => {
      if (!cancelled) setEmptyProgress(event.payload);
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  const loadTrash = useCallback(async () => {
    try {
      let files = await tauri.getTrashedFiles();
      // Filter to only files belonging to the current page
      if (pageFileIds) {
        const idSet = new Set(pageFileIds);
        files = files.filter(f => idSet.has(f.id));
      }
      setTrashedFiles(files);
    } catch {
      setTrashedFiles([]);
    }
  }, [pageFileIds]);

  useEffect(() => {
    if (open) {
      loadTrash();
      setSelected(new Set());
      setConfirmEmpty(false);
    }
  }, [open, loadTrash]);

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    setLoading(true);
    try {
      await tauri.restoreFromTrash(ids);
      onNotify(`${ids.length} file${ids.length > 1 ? "s" : ""} restored`, "success");
      setSelected(new Set());
      await loadTrash();
      onFilesChanged();
    } catch {
      onNotify("Failed to restore files", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    setLoading(true);
    setEmptyProgress(0);
    // Capture the ids being permanently deleted so we can purge their cached
    // previews from IndexedDB once the backend confirms the wipe.
    const purgedIds = trashedFiles.map((f) => f.id);
    try {
      const count = await tauri.emptyTrash();
      await Promise.all(purgedIds.map((id) => deleteCachedThumbnailsForFile(id)));
      onNotify(`${count} file${count !== 1 ? "s" : ""} permanently deleted`, "warning");
      setConfirmEmpty(false);
      setSelected(new Set());
      await loadTrash();
      onFilesChanged();
    } catch {
      onNotify("Failed to empty trash", "error");
    } finally {
      setLoading(false);
      setEmptyProgress(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSize = trashedFiles.reduce((s, f) => s + f.size, 0);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-[560px] max-h-[80vh] bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
          style={{ boxShadow: "0 0 30px rgba(var(--color-neon-rgb, 255,0,0), 0.08)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-cyber-border)]">
            <div className="flex items-center gap-2">
              <Trash2 size={18} className="text-[var(--color-neon-primary)]" />
              <h2 className="text-[17px] font-mono uppercase tracking-wider text-[var(--color-cyber-text)]">
                Trash
              </h2>
              {trashedFiles.length > 0 && (
                <span className="text-[17px] font-mono text-[var(--color-cyber-muted)]">
                  ({trashedFiles.length})
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
            {trashedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--color-cyber-muted)]">
                <Trash2 size={40} className="mb-3 opacity-30" />
                <p className="text-[17px] font-mono">Trash is empty</p>
              </div>
            ) : (
              <div className="space-y-1">
                {trashedFiles.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => toggleSelect(f.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer transition-all ${
                      selected.has(f.id)
                        ? "bg-[var(--color-neon-subtle)] border border-[var(--color-neon-primary)]/30"
                        : "hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                      selected.has(f.id)
                        ? "bg-[var(--color-neon-primary)] border-[var(--color-neon-primary)]"
                        : "border-[var(--color-cyber-border)]"
                    }`}>
                      {selected.has(f.id) && <span className="text-[17px] text-black font-bold">✓</span>}
                    </div>

                    {/* Icon */}
                    <span className="text-[var(--color-cyber-muted)] shrink-0">
                      {categoryIcon(f.category)}
                    </span>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-mono text-[var(--color-cyber-text)] truncate">{f.name}</p>
                      <p className="text-[17px] font-mono text-[var(--color-cyber-muted)]">
                        {formatSize(f.size)} · {f.trashed_at ? timeAgo(f.trashed_at) : ""}
                      </p>
                    </div>

                    {/* Per-item restore */}
                    <CyberButton
                      themeMode={themeMode}
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={12} />}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleRestore([f.id]);
                      }}
                    >
                      Restore
                    </CyberButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress bar during empty trash */}
          {emptyProgress !== null && (
            <div className="px-5 py-2 border-t border-[var(--color-cyber-border)]">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-[var(--color-cyber-black)]/60 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[var(--color-neon-primary)] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(emptyProgress * 100)}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <span className="text-[17px] font-mono text-[var(--color-cyber-muted)] w-12 text-right">
                  {Math.round(emptyProgress * 100)}%
                </span>
              </div>
              <p className="text-[17px] font-mono text-[var(--color-cyber-muted)] mt-1">
                Rewriting vault bundle...
              </p>
            </div>
          )}

          {/* Footer */}
          {trashedFiles.length > 0 && (
            <div className="px-5 py-3 border-t border-[var(--color-cyber-border)] flex items-center justify-between gap-2">
              <p className="text-[17px] font-mono text-[var(--color-cyber-muted)]">
                {trashedFiles.length} item{trashedFiles.length !== 1 ? "s" : ""} · {formatSize(totalSize)}
                {" · auto-deletes after 30 days"}
              </p>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <CyberButton
                    themeMode={themeMode}
                    variant="primary"
                    size="sm"
                    icon={<RotateCcw size={13} />}
                    onClick={() => handleRestore([...selected])}
                    disabled={loading}
                  >
                    Restore {selected.size}
                  </CyberButton>
                )}

                {confirmEmpty ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[17px] text-[var(--color-neon-primary)] font-mono mr-1">
                      <AlertTriangle size={13} className="inline -mt-0.5" /> Sure?
                    </span>
                    <CyberButton
                      themeMode={themeMode}
                      variant="danger"
                      size="sm"
                      onClick={handleEmptyTrash}
                      disabled={loading}
                    >
                      Yes, delete all
                    </CyberButton>
                    <CyberButton
                      themeMode={themeMode}
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmEmpty(false)}
                    >
                      Cancel
                    </CyberButton>
                  </div>
                ) : (
                  <CyberButton
                    themeMode={themeMode}
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => setConfirmEmpty(true)}
                    disabled={loading}
                  >
                    Empty Trash
                  </CyberButton>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
