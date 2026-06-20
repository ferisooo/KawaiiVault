import { motion, AnimatePresence } from "framer-motion";
import { Download, X, ArrowUpCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateInfo } from "../hooks/useUpdateChecker";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  update: UpdateInfo | null;
  onDismiss: () => void;
  themeMode?: ThemeMode;
}

export default function UpdateNotification({ update, onDismiss, themeMode = "cyberpunk" }: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";

  const borderColor = isNeon
    ? "border-cyan-400/50"
    : isCmd
    ? "border-blue-500/40"
    : isBio
    ? "border-emerald-600/40"
    : "border-[var(--color-neon-dark)]";

  const accentColor = isNeon
    ? "text-cyan-300"
    : isCmd
    ? "text-blue-300"
    : isBio
    ? "text-emerald-400"
    : "text-[var(--color-neon-bright)]";

  const glowShadow = isNeon
    ? "shadow-[0_0_20px_rgba(0,255,255,0.2),0_0_40px_rgba(0,200,255,0.1)]"
    : isCmd
    ? "shadow-[0_0_20px_rgba(33,150,243,0.12)]"
    : isBio
    ? "shadow-[0_0_20px_rgba(0,230,118,0.12)]"
    : "shadow-[0_0_20px_var(--color-neon-glow)]";

  const radiusClass = isBio ? "rounded-lg" : isCmd ? "rounded-[3px]" : isNeon ? "rounded-[2px]" : "rounded-sm";

  const handleUpdateNow = async () => {
    if (!update) return;
    // Only open https update URLs — the URL comes from a remote release feed,
    // so reject anything that isn't a normal secure web link before handing it
    // to the OS / a new window (defense-in-depth alongside the backend check).
    let safeUrl = "";
    try {
      const parsed = new URL(update.url);
      if (parsed.protocol === "https:") safeUrl = parsed.href;
    } catch { /* invalid URL */ }
    if (!safeUrl) { onDismiss(); return; }
    try {
      await invoke("open_url_in_browser", { url: safeUrl });
    } catch {
      // Fallback: try window.open (may not work in all Tauri builds)
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }
    onDismiss();
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={
            isNeon
              ? { type: "spring", stiffness: 500, damping: 24 }
              : isCmd
              ? { type: "spring", stiffness: 280, damping: 26 }
              : isBio
              ? { type: "spring", stiffness: 200, damping: 24 }
              : { type: "spring", stiffness: 420, damping: 28 }
          }
          className={`fixed bottom-10 right-5 z-[90] w-72 bg-[var(--color-cyber-panel)]/95 backdrop-blur-xl border ${borderColor} ${glowShadow} ${radiusClass} overflow-hidden`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 pt-3 pb-2`}>
            <div className={`flex items-center gap-2 ${accentColor}`}>
              <ArrowUpCircle size={15} />
              <span className="font-display text-[17px] tracking-widest uppercase">
                Update Available
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 pb-1">
            <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] leading-relaxed">
              CyberVault{" "}
              <span className={`${accentColor} font-semibold`}>v{update.version}</span>{" "}
              is now available.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-4 pb-3 pt-2">
            <button
              onClick={handleUpdateNow}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[17px] font-display tracking-wider uppercase border ${borderColor} ${accentColor} hover:bg-[var(--color-neon-primary)]/10 transition-colors ${radiusClass}`}
            >
              <Download size={12} />
              Update Now
            </button>
            <button
              onClick={onDismiss}
              className={`flex-1 py-1.5 text-[17px] font-display tracking-wider uppercase text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] transition-colors border border-transparent hover:border-[var(--color-cyber-muted)]/30 ${radiusClass}`}
            >
              Later
            </button>
          </div>

          {/* Bottom energy line */}
          <motion.div
            className={`absolute bottom-0 left-0 h-[2px] bg-current ${accentColor} opacity-60`}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 30, ease: "linear" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
