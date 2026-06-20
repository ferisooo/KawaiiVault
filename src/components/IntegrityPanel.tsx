import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, ShieldAlert, ShieldOff, Loader2 } from "lucide-react";
import CyberButton from "./CyberButton";
import { useTauri } from "../hooks/useTauri";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  open: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
}

export default function IntegrityPanel({ open, onClose, themeMode = "cyberpunk" }: Props) {
  const tauri = useTauri();
  const [results, setResults] = useState<[string, boolean][]>([]);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      runCheck();
    } else {
      setResults([]);
      setDone(false);
    }
  }, [open]);

  const runCheck = async () => {
    setChecking(true);
    setDone(false);
    try {
      const r = await tauri.checkIntegrity();
      setResults(r);
    } catch {
      // Demo
      setResults([
        ["document_001.pdf", true],
        ["photo_vacation.jpg", true],
        ["budget_2024.xlsx", true],
        ["notes.txt", true],
        ["corrupted_file.zip", false],
        ["presentation.pptx", true],
        ["music_track.mp3", true],
        ["video_clip.mp4", true],
      ]);
    }
    setChecking(false);
    setDone(true);
  };

  const passed = results.filter(([, ok]) => ok).length;
  const failed = results.filter(([, ok]) => !ok).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div className="w-full max-w-2xl max-h-[80vh] bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border border-[var(--color-neon-dark)] rounded-sm shadow-[0_0_30px_var(--color-neon-glow)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-cyber-border)]">
                <h2 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)] flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[var(--color-neon-primary)]" />
                  Integrity Verification
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] rounded-sm transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* Status bar */}
              {done && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`px-4 py-3 border-b flex items-center gap-3 ${
                    failed > 0
                      ? "border-red-800 bg-red-900/20"
                      : "border-green-800 bg-green-900/20"
                  }`}
                >
                  {failed > 0 ? (
                    <ShieldAlert size={16} className="text-red-400" />
                  ) : (
                    <ShieldCheck size={16} className="text-green-400" />
                  )}
                  <span className="font-mono text-[17px]">
                    <span className="text-green-400">{passed} passed</span>
                    {failed > 0 && (
                      <>
                        {" • "}
                        <span className="text-red-400">{failed} failed</span>
                      </>
                    )}
                    {" • "}
                    <span className="text-[var(--color-cyber-muted)]">{results.length} total</span>
                  </span>
                </motion.div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                {checking ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 size={32} className="text-[var(--color-neon-primary)]" />
                    </motion.div>
                    <p className="font-display text-[17px] tracking-wider uppercase text-[var(--color-neon-bright)] mt-4">
                      Verifying file integrity...
                    </p>
                    <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-1">
                      Computing SHA-256 hashes
                    </p>
                    {/* Scanning animation bar */}
                    <div className="w-64 h-1 bg-[var(--color-cyber-border)] rounded-full mt-4 overflow-hidden">
                      <motion.div
                        className="h-full bg-[var(--color-neon-primary)] rounded-full"
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        style={{ width: "40%" }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 relative">
                    {/* Scan beam sweeps through the result list */}
                    <motion.div
                      className="absolute inset-x-0 h-[2px] pointer-events-none z-10"
                      style={{
                        background: "linear-gradient(90deg, transparent, var(--color-neon-primary), transparent)",
                        boxShadow: "0 0 8px var(--color-neon-glow)",
                      }}
                      initial={{ top: 0, opacity: 0 }}
                      animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
                      transition={{ duration: Math.max(0.5, results.length * 0.06 + 0.2), ease: "linear" }}
                    />
                    {results.map(([name, ok], i) => (
                      <motion.div
                        key={name}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className={`flex items-center gap-3 p-2.5 rounded-sm border transition-colors ${
                          ok
                            ? "border-[var(--color-cyber-border)]/30 bg-[var(--color-cyber-black)]/30 hover:border-green-900"
                            : "border-red-800/50 bg-red-900/10 hover:border-red-700"
                        }`}
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: i * 0.06 + 0.15, type: "spring", stiffness: 400 }}
                          className="flex-shrink-0"
                        >
                          {ok ? (
                            <ShieldCheck size={14} className="text-green-500" />
                          ) : (
                            <ShieldOff size={14} className="text-red-500" />
                          )}
                        </motion.div>
                        <span className="font-body text-[17px] text-[var(--color-cyber-text)] flex-1 truncate">
                          {name}
                        </span>
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.06 + 0.2 }}
                          className={`font-mono text-[17px] uppercase tracking-wider ${ok ? "text-green-500" : "text-red-500"}`}
                        >
                          {ok ? "INTACT" : "CORRUPTED"}
                        </motion.span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-[var(--color-cyber-border)] flex gap-2">
                <CyberButton variant="secondary" themeMode={themeMode} onClick={runCheck} disabled={checking} className="flex-1">
                  Re-scan
                </CyberButton>
                <CyberButton variant="secondary" themeMode={themeMode} onClick={onClose} className="flex-1">
                  Close
                </CyberButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
