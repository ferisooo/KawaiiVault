import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, X, Download } from "lucide-react";
import type { ThemeMode } from "../hooks/useThemeMode";

interface ImportProgressProps {
  progress: { current: number; total: number; startTime?: number; fileName?: string } | null;
  onCancel: () => void;
  themeMode?: ThemeMode;
}

interface ExportQueueProps {
  queue: { fileIds: string[]; destDir: string; current: number; total: number; currentFileName?: string; cancelled?: boolean } | null;
  onCancel: () => void;
  themeMode?: ThemeMode;
}

function formatETA(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ETA_WINDOW_MS = 45_000;

export default function ImportProgress({ progress, onCancel, themeMode = "cyberpunk" }: ImportProgressProps) {
  const pct = progress ? (progress.current / progress.total) * 100 : 0;

  // Rolling-window ETA: estimate the rate from the last ~45s of progress
  // instead of the average since the start, so a few slow early files (cold
  // cloud downloads, huge videos) don't inflate the estimate for the whole
  // import.
  const samplesRef = useRef<{ t: number; current: number }[]>([]);
  useEffect(() => {
    if (!progress) {
      samplesRef.current = [];
      return;
    }
    const now = Date.now();
    samplesRef.current.push({ t: now, current: progress.current });
    samplesRef.current = samplesRef.current.filter((s) => now - s.t <= ETA_WINDOW_MS);
  }, [progress]);

  let etaStr = "";
  if (progress && progress.current > 0) {
    const now = Date.now();
    const oldest = samplesRef.current[0];
    let rate = 0; // files per second
    if (oldest && progress.current > oldest.current && now - oldest.t > 3000) {
      rate = (progress.current - oldest.current) / ((now - oldest.t) / 1000);
    } else if (progress.startTime && now > progress.startTime) {
      rate = progress.current / ((now - progress.startTime) / 1000);
    }
    if (rate > 0) {
      etaStr = `ETA ${formatETA((progress.total - progress.current) / rate)}`;
    }
  }

  return (
    <AnimatePresence>
      {progress && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-96"
        >
          <div className="bg-[var(--color-cyber-panel)]/95 border border-[var(--color-neon-dark)] rounded-sm p-4 backdrop-blur-xl shadow-[0_0_30px_var(--color-neon-glow)]"
            style={{ animation: pct >= 100 ? "burst-ring 0.6s ease-out" : "neon-glow-pulse 1.5s infinite" }}>
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 size={16} className="text-[var(--color-neon-primary)]" />
              </motion.div>
              <span className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">
                Importing Files
              </span>
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] ml-auto">
                {progress.current} / {progress.total}
              </span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onCancel}
                className="p-1 text-[var(--color-cyber-muted)] hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </motion.button>
            </div>

            {/* Current file name */}
            {progress.fileName && (
              <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mb-2 truncate">
                {progress.fileName}
              </p>
            )}

            {/* Progress bar */}
            <div className="w-full h-2 bg-[var(--color-cyber-black)] rounded-full overflow-hidden border border-[var(--color-cyber-border)]">
              <motion.div
                className={`h-full rounded-full relative ${themeMode === "prismatic" ? "prism-progress" : "bg-gradient-to-r from-[var(--color-neon-dark)] via-[var(--color-neon-primary)] to-[var(--color-neon-bright)]"}`}
                initial={{ width: "0%" }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3 }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--color-neon-primary)] blur-md" />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]"
                style={pct >= 90 ? { animation: "neon-strobe 1s infinite", color: "var(--color-neon-bright)" } : undefined}>
                <Upload size={10} className="inline mr-1" />
                {etaStr || "Calculating..."}
              </span>
              <span className="font-mono text-[17px] text-[var(--color-neon-primary)]">
                {Math.round(pct)}%
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ExportQueue({ queue, onCancel, themeMode = "cyberpunk" }: ExportQueueProps) {
  const pct = queue ? (queue.current / queue.total) * 100 : 0;

  return (
    <AnimatePresence>
      {queue && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 right-6 z-[100] w-80"
        >
          <div className="bg-[var(--color-cyber-panel)]/95 border border-[var(--color-neon-dark)] rounded-sm p-4 backdrop-blur-xl shadow-[0_0_30px_var(--color-neon-glow)]">
            <div className="flex items-center gap-3 mb-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              >
                <Download size={16} className="text-[var(--color-neon-primary)]" />
              </motion.div>
              <span className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)]">
                Exporting Files
              </span>
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] ml-auto">
                {queue.current} / {queue.total}
              </span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onCancel}
                className="p-1 text-[var(--color-cyber-muted)] hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </motion.button>
            </div>

            {queue.currentFileName && (
              <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mb-2 truncate">
                {queue.currentFileName}
              </p>
            )}

            <div className="w-full h-1.5 bg-[var(--color-cyber-black)] rounded-full overflow-hidden border border-[var(--color-cyber-border)]">
              <motion.div
                className="h-full bg-gradient-to-r from-[var(--color-neon-dark)] to-[var(--color-neon-primary)] rounded-full"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="flex items-center justify-between mt-1.5">
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                {queue.cancelled ? "Cancelling..." : "Exporting sequentially..."}
              </span>
              <span className="font-mono text-[17px] text-[var(--color-neon-primary)]">
                {Math.round(pct)}%
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
