import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Download, Trash2, File, Image, Film, Music, FileText, Shield, Clock, HardDrive, Tag } from "lucide-react";
import CyberButton from "./CyberButton";
import type { VaultFile } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  file: VaultFile | null;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  themeMode?: ThemeMode;
}

const categoryIcons: Record<string, typeof File> = {
  Images: Image, Videos: Film, Audio: Music, Documents: FileText,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function PreviewPanel({ file, onClose, onToggleFavorite, onExport, onDelete, themeMode = "cyberpunk" }: Props) {

  return (
    <AnimatePresence>
      {file && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed top-0 right-0 bottom-0 w-96 z-50 bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border-l border-[var(--color-neon-dark)] shadow-[-5px_0_30px_rgba(0,0,0,0.5)]"
            style={{ animation: "neon-glow-pulse 3s infinite" }}
          >
            {/* Header glow line */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-neon-primary)] to-transparent"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-cyber-border)]">
                <h3 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)]">
                  File Preview
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] hover:bg-white/5 rounded-sm transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* File icon + name */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center mb-6"
                >
                  <motion.div
                    className="w-24 h-24 mx-auto rounded-sm border border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)] mb-3"
                    animate={{
                      boxShadow: [
                        "0 0 10px var(--color-neon-glow)",
                        "0 0 20px var(--color-neon-glow)",
                        "0 0 10px var(--color-neon-glow)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ animation: "energy-orb 2s infinite" }}
                  >
                    {(() => {
                      const Icon = categoryIcons[file.category] || File;
                      return <Icon size={40} className="text-[var(--color-neon-primary)]" />;
                    })()}
                  </motion.div>
                  <h4 className="font-body text-[17px] font-semibold text-[var(--color-cyber-text)] break-all">
                    {file.name}
                  </h4>
                </motion.div>

                {/* Metadata */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-3"
                >
                  {[
                    { icon: HardDrive, label: "Size", value: formatSize(file.size) },
                    { icon: Tag, label: "Type", value: file.file_type.toUpperCase() || "Unknown" },
                    { icon: Tag, label: "Category", value: file.category },
                    { icon: Clock, label: "Imported", value: new Date(file.imported_at).toLocaleString() },
                    { icon: Shield, label: "SHA-256", value: file.hash.slice(0, 16) + "..." },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                      className="flex items-center gap-3 p-2.5 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/50"
                    >
                      <item.icon size={14} className="text-[var(--color-neon-dark)] flex-shrink-0" />
                      <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider w-16 flex-shrink-0">
                        {item.label}
                      </span>
                      <span className="font-mono text-[17px] text-[var(--color-cyber-text)] truncate">
                        {item.value}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Favorite status */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-4 p-3 rounded-sm border border-[var(--color-cyber-border)]/50 bg-[var(--color-cyber-black)]/40 flex items-center gap-3"
                >
                  <Star
                    size={16}
                    className={file.favorite ? "fill-yellow-500 text-yellow-500" : "text-[var(--color-cyber-muted)]"}
                  />
                  <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                    {file.favorite ? "Marked as favorite" : "Not favorited"}
                  </span>
                </motion.div>
              </div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="p-4 border-t border-[var(--color-cyber-border)] space-y-2"
              >
                <div className="flex gap-2">
                  <CyberButton themeMode={themeMode}
                    variant="secondary"
                    size="sm"
                    icon={<Star size={13} className={file.favorite ? "fill-yellow-500 text-yellow-500" : ""} />}
                    onClick={() => onToggleFavorite(file.id)}
                    className="flex-1"
                  >
                    {file.favorite ? "Unfavorite" : "Favorite"}
                  </CyberButton>
                  <CyberButton themeMode={themeMode}
                    variant="secondary"
                    size="sm"
                    icon={<Download size={13} />}
                    onClick={() => onExport(file.id)}
                    className="flex-1"
                  >
                    Export
                  </CyberButton>
                </div>

                <CyberButton themeMode={themeMode}
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => onDelete(file.id)}
                  className="w-full"
                >
                  Delete File
                </CyberButton>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
