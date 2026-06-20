import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ScrollText, Shield, Lock, Unlock, Upload, Trash2, Download, Star, Activity } from "lucide-react";
import CyberButton from "./CyberButton";
import type { AuditEntry } from "../stores/useStore";
import { useTauri } from "../hooks/useTauri";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  open: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
}

const actionIcons: Record<string, typeof Activity> = {
  VAULT_CREATED: Shield,
  VAULT_UNLOCKED: Unlock,
  VAULT_LOCKED: Lock,
  FILES_IMPORTED: Upload,
  FILES_DELETED: Trash2,
  FILES_EXPORTED: Download,
  FAVORITE_TOGGLED: Star,
};

const actionColors: Record<string, string> = {
  VAULT_CREATED: "text-green-400 bg-green-400/10",
  VAULT_UNLOCKED: "text-blue-400 bg-blue-400/10",
  VAULT_LOCKED: "text-yellow-400 bg-yellow-400/10",
  FILES_IMPORTED: "text-[var(--color-neon-bright)] bg-[var(--color-neon-subtle)]",
  FILES_DELETED: "text-red-400 bg-red-400/10",
  FILES_EXPORTED: "text-purple-400 bg-purple-400/10",
};

export default function AuditLogPanel({ open, onClose, themeMode = "cyberpunk" }: Props) {
  const tauri = useTauri();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (open) loadLog();
  }, [open]);

  const loadLog = async () => {
    try {
      const log = await tauri.getAuditLog();
      setEntries(log);
    } catch {
      // Demo data
      setEntries([
        { id: "1", action: "VAULT_UNLOCKED", details: "Vault unlocked successfully", timestamp: new Date().toISOString() },
        { id: "2", action: "FILES_IMPORTED", details: "47 files imported", timestamp: new Date(Date.now() - 300000).toISOString() },
        { id: "3", action: "FILES_DELETED", details: "3 files deleted", timestamp: new Date(Date.now() - 600000).toISOString() },
        { id: "4", action: "FILES_EXPORTED", details: "12 files exported", timestamp: new Date(Date.now() - 900000).toISOString() },
        { id: "5", action: "VAULT_CREATED", details: "Vault 'Personal' created", timestamp: new Date(Date.now() - 86400000).toISOString() },
      ]);
    }
  };

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
                  <ScrollText size={18} className="text-[var(--color-neon-primary)]" />
                  Audit Log
                </h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                    {entries.length} entries
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] rounded-sm transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {entries.map((entry, i) => {
                  const Icon = actionIcons[entry.action] || Activity;
                  const colorClass = actionColors[entry.action] || "text-[var(--color-cyber-muted)] bg-white/5";
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-start gap-3 p-3 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/50 hover:border-[var(--color-cyber-border)] transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-sm flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[17px] font-semibold tracking-wider text-[var(--color-cyber-text)]">
                            {entry.action.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="font-body text-[17px] text-[var(--color-cyber-muted)] mt-0.5">
                          {entry.details}
                        </p>
                      </div>
                      <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] whitespace-nowrap flex-shrink-0">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-[var(--color-cyber-border)]">
                <CyberButton variant="secondary" themeMode={themeMode} onClick={onClose} className="w-full">
                  Close Log
                </CyberButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
