import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, Volume2, VolumeX, Image, Film, Music, FileText, File, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { VaultFile } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
};
function getMimeType(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || `video/${ext}`;
}

interface Props {
  file: VaultFile | null;
  files?: VaultFile[];
  onClose: () => void;
  onNavigate?: (file: VaultFile) => void;
  onDelete?: (fileId: string) => void;
  themeMode?: ThemeMode;
  getCachedFile?: (fileId: string) => ArrayBuffer | null;
  setCachedFile?: (fileId: string, data: ArrayBuffer) => void;
}

const categoryIcons: Record<string, typeof File> = {
  Images: Image, Videos: Film, Audio: Music, Documents: FileText,
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FullscreenViewer({ file, files = [], onClose, onNavigate, onDelete, themeMode = "cyberpunk", getCachedFile, setCachedFile }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Decrypted content state
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState(false);
  const retryCountRef = useRef(0);

  // Fetch decrypted content when file changes
  useEffect(() => {
    if (!file) {
      setContentUrl(null);
      setContentLoading(false);
      setContentError(false);
      retryCountRef.current = 0;
      return;
    }

    const isMedia = ["Images", "Videos", "Audio"].includes(file.category);
    if (!isMedia) return;

    setContentLoading(true);
    setContentError(false);
    setContentUrl(null);
    retryCountRef.current = 0;

    // Images: fetch the WHOLE file as a blob. The streaming /file route caps
    // range responses (for video seeking), which truncates a >1 MB image so it
    // can't decode. fetch() sends no Range header, so it returns the full image.
    if (file.category === "Images") {
      let cancelled = false;
      let objUrl: string | null = null;

      // Session cache hit: skip the backend round-trip (and decryption)
      // entirely so revisiting an image is instant.
      const cached = getCachedFile?.(file.id);
      if (cached) {
        objUrl = URL.createObjectURL(new Blob([cached]));
        setContentUrl(objUrl);
        setContentLoading(false);
        return () => {
          if (objUrl) URL.revokeObjectURL(objUrl);
        };
      }

      fetch(convertFileSrc("file/" + file.id, "cvlt"))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))))
        .then((buf) => {
          if (cancelled) return;
          setCachedFile?.(file.id, buf);
          objUrl = URL.createObjectURL(new Blob([buf]));
          setContentUrl(objUrl);
          setContentLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setContentError(true);
            setContentLoading(false);
          }
        });
      return () => {
        cancelled = true;
        if (objUrl) URL.revokeObjectURL(objUrl);
      };
    }

    // Video / audio: stream via the protocol URL (range requests are correct here)
    setContentUrl(convertFileSrc("file/" + file.id, "cvlt"));
    setContentLoading(false);
  }, [file?.id]);

  // Trigger video.load() when streaming URL changes (needed for <source> elements)
  useEffect(() => {
    if (contentUrl && videoRef.current && !contentUrl.startsWith("blob:")) {
      videoRef.current.load();
    }
  }, [contentUrl]);

  // Memory cleanup: stop media when file changes or component unmounts
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [file]);

  const isImage = file?.category === "Images";
  const isVideo = file?.category === "Videos";
  const isAudio = file?.category === "Audio";
  const isMedia = isImage || isVideo || isAudio;

  // Keyboard controls
  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Delete" && onDelete && file) {
        e.preventDefault();
        const deleteId = file.id;
        // Navigate to next file before deleting, so the viewer stays open
        if (onNavigate && files.length > 1) {
          const currentIndex = files.findIndex((f) => f.id === deleteId);
          if (currentIndex !== -1) {
            const nextIndex = (currentIndex + 1) % files.length;
            onNavigate(files[nextIndex]);
          }
        }
        onDelete(deleteId);
        return;
      }
      if (e.key === " " && (isVideo || isAudio)) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "m" && (isVideo || isAudio)) setMuted((p) => !p);
      // Left/Right arrow: navigate between files
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && onNavigate && files.length > 0) {
        e.preventDefault();
        const currentIndex = files.findIndex((f) => f.id === file.id);
        if (currentIndex === -1) return;
        const nextIndex = e.key === "ArrowRight"
          ? (currentIndex + 1) % files.length
          : (currentIndex - 1 + files.length) % files.length;
        onNavigate(files[nextIndex]);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [file, isVideo, isAudio, files, onNavigate]);

  // Sync muted state
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Time update
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => { if (!seeking) setCurrentTime(el.currentTime); };
    const onDuration = () => setDuration(el.duration || 0);
    const onEnded = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDuration);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDuration);
      el.removeEventListener("ended", onEnded);
    };
  }, [file, seeking]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  }, []);

  const scrubToPosition = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const el = videoRef.current;
    if (!bar || !el || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  // Drag-to-scrub: attach document-level listeners while dragging
  useEffect(() => {
    if (!seeking) return;
    const onMove = (e: MouseEvent) => scrubToPosition(e.clientX);
    const onUp = () => setSeeking(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [seeking, scrubToPosition]);

  const handleScrubStart = (e: React.MouseEvent) => {
    setSeeking(true);
    scrubToPosition(e.clientX);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const Icon = file ? (categoryIcons[file.category] || File) : File;

  // Loading spinner component
  const LoadingOverlay = () => (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 size={48} className="text-[var(--color-neon-primary)]" />
      </motion.div>
      <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">
        Decrypting content…
      </p>
    </div>
  );

  // Placeholder fallback (shown on error)
  const PlaceholderFallback = ({ icon: FallbackIcon, label }: { icon: typeof File; label: string }) => (
    <div className="w-[600px] h-[400px] rounded-sm border border-[var(--color-neon-dark)]/30 bg-gradient-to-br from-[var(--color-cyber-panel)]/80 to-[var(--color-cyber-black)] flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{
          boxShadow: ["0 0 20px var(--color-neon-glow)", "0 0 40px var(--color-neon-glow)", "0 0 20px var(--color-neon-glow)"],
        }}
        transition={{ duration: 3, repeat: Infinity }}
        className="w-32 h-32 rounded-sm border border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)]"
      >
        <FallbackIcon size={48} className="text-[var(--color-neon-primary)]" />
      </motion.div>
      <p className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">{file?.name}</p>
      <p className="font-mono text-[17px] text-white/30">{label}</p>
    </div>
  );

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          className="fixed inset-0 z-[600] flex flex-col bg-black/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Close button — top-left */}
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-sm transition-colors"
          >
            <X size={20} />
          </motion.button>

          {/* File info overlay — top-right */}
          <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-1 bg-black/70 backdrop-blur-sm rounded-sm px-4 py-3 border border-white/10">
            <div className="flex items-center gap-2">
              <Icon size={14} className="text-[var(--color-neon-primary)]" />
              <span className="font-body text-[17px] text-white/90 truncate max-w-xs">{file.name}</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[17px] text-white/50">
              <span className="uppercase">{file.file_type}</span>
              <span>{file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</span>
              <span>{new Date(file.imported_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden" onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (isVideo || isAudio) togglePlay();
              else onClose();
            }
          }}>
            {isImage && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="relative max-w-full max-h-full"
              >
                {contentLoading ? (
                  <LoadingOverlay />
                ) : contentUrl && !contentError ? (
                  <img
                    src={contentUrl}
                    alt={file.name}
                    className="max-w-full max-h-[calc(100vh-120px)] object-contain rounded-sm border border-[var(--color-neon-dark)]/30"
                    onError={() => {
                      // contentUrl is a fully-fetched blob; if the browser still
                      // can't decode it the image data itself is bad (e.g. an
                      // unsupported format) — show the placeholder.
                      setContentError(true);
                    }}
                  />
                ) : (
                  <PlaceholderFallback icon={Image} label="Encrypted preview · Actual content secured in vault" />
                )}
              </motion.div>
            )}

            {isVideo && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative w-full h-full max-w-full max-h-full"
              >
                {contentLoading ? (
                  <div className="aspect-video flex items-center justify-center rounded-sm border border-[var(--color-neon-dark)]/30 bg-gradient-to-br from-[var(--color-cyber-panel)]/80 to-black">
                    <LoadingOverlay />
                  </div>
                ) : contentUrl && !contentError ? (
                  <div className="w-full h-full rounded-sm bg-black overflow-hidden relative">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-contain"
                      onClick={togglePlay}
                    >
                      <source src={contentUrl} type={getMimeType(file.file_type)} />
                    </video>
                    {!playing && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <motion.div
                          animate={{ boxShadow: ["0 0 20px var(--color-neon-glow)", "0 0 40px var(--color-neon-glow)", "0 0 20px var(--color-neon-glow)"] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="w-16 h-16 rounded-full border-2 border-[var(--color-neon-dark)] flex items-center justify-center bg-black/60 pointer-events-auto cursor-pointer"
                          onClick={togglePlay}
                        >
                          <Play size={28} className="text-[var(--color-neon-primary)] ml-1" />
                        </motion.div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video rounded-sm border border-[var(--color-neon-dark)]/30 bg-gradient-to-br from-[var(--color-cyber-panel)]/80 to-black flex flex-col items-center justify-center gap-4 relative overflow-hidden">
                    <motion.div
                      animate={{ boxShadow: ["0 0 20px var(--color-neon-glow)", "0 0 40px var(--color-neon-glow)", "0 0 20px var(--color-neon-glow)"] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="w-24 h-24 rounded-full border-2 border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)] cursor-pointer"
                      onClick={togglePlay}
                    >
                      {playing ? <Pause size={36} className="text-[var(--color-neon-primary)]" /> : <Play size={36} className="text-[var(--color-neon-primary)] ml-1" />}
                    </motion.div>
                    <p className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">{file.name}</p>
                    <p className="font-mono text-[17px] text-white/30">Encrypted media · Decrypted playback not available</p>
                    <video ref={videoRef} className="hidden" />
                  </div>
                )}
              </motion.div>
            )}

            {isAudio && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-[480px] max-w-full"
              >
                <div className="rounded-sm border border-[var(--color-neon-dark)]/30 bg-gradient-to-br from-[var(--color-cyber-panel)]/80 to-black p-8 flex flex-col items-center gap-6">
                  <motion.div
                    animate={{ rotate: playing ? 360 : 0 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="w-32 h-32 rounded-full border-2 border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)]"
                  >
                    <Music size={48} className="text-[var(--color-neon-primary)]" />
                  </motion.div>
                  <p className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">{file.name}</p>
                  {contentUrl && !contentError ? (
                    <video ref={videoRef} className="hidden">
                      <source src={contentUrl} type={getMimeType(file.file_type)} />
                    </video>
                  ) : (
                    <video ref={videoRef} className="hidden" />
                  )}
                </div>
              </motion.div>
            )}

            {!isMedia && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="w-32 h-32 rounded-sm border border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)]">
                  <Icon size={48} className="text-[var(--color-neon-primary)]" />
                </div>
                <p className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">{file.name}</p>
                <p className="font-mono text-[17px] text-white/40">Preview not available for this file type</p>
              </motion.div>
            )}
          </div>

          {/* Video/Audio Controls */}
          {(isVideo || isAudio) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="px-6 py-4 bg-black/80 border-t border-white/5"
            >
              {/* Scrubber — click or drag to seek */}
              <div
                ref={progressRef}
                onMouseDown={handleScrubStart}
                className="w-full h-2 bg-white/10 rounded-full cursor-pointer mb-3 group relative select-none"
              >
                <div
                  className="h-full bg-[var(--color-neon-primary)] rounded-full relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--color-neon-bright)] shadow-[0_0_8px_var(--color-neon-glow)] transition-transform ${seeking ? "scale-125" : "scale-100 group-hover:scale-110"}`} />
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={togglePlay}
                  className="p-2 text-white/80 hover:text-[var(--color-neon-bright)] transition-colors"
                >
                  {playing ? <Pause size={20} /> : <Play size={20} />}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setMuted(!muted)}
                  className="p-2 text-white/60 hover:text-white transition-colors"
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </motion.button>

                <span className="font-mono text-[17px] text-white/50">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                <span className="font-mono text-[17px] text-white/30 uppercase tracking-wider">
                  {file.file_type} · Encrypted
                </span>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
