import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { VaultPage } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

const DEFAULT_CATS = [
  { key: "media", label: "Media", icon: "\uD83C\uDFAC", size: "17" },
  { key: "notes", label: "Notes/Code", icon: "\uD83D\uDCDD", size: "17" },
  { key: "documents", label: "Docs", icon: "\uD83D\uDCC4", size: "17" },
  { key: "passwords", label: "Passwords", icon: "\uD83D\uDD12", size: "17" },
] as const;

interface Props {
  pages: VaultPage[];
  onOpenPage: (pageId: string) => void;
  onAddPage: (name: string, color: string, icon: string, categories?: string[], mediaRating?: "sfw" | "nsfw") => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onLock: () => void;
  onSettings: () => void;
  vaultName: string;
  themeMode?: ThemeMode;
}

const PAGE_COLORS = [
  "#ff4466", "#00ccff", "#ff6600", "#00ff00", "#ff66bb", "#9966ff",
  "#ffcc00", "#00ffaa", "#ff4444", "#44aaff", "#ff88cc", "#88ff44",
];

const PAGE_ICONS = [
  "\uD83D\uDCC1", "\uD83D\uDDBC\uFE0F", "\uD83C\uDFAC", "\uD83C\uDFB5", "\uD83D\uDCDD", "\uD83D\uDD12",
  "\u2B50", "\uD83D\uDCA1", "\uD83D\uDCCA", "\uD83C\uDFAE", "\u2764\uFE0F", "\uD83D\uDE80",
];

function getThemeRadius(mode?: ThemeMode): string {
  switch (mode) {
    case "biotech":   return "rounded-lg";
    case "command":   return "rounded-[3px]";
    case "neoncity":  return "rounded-[2px]";
    case "prismatic": return "rounded-md";
    case "solarcore": return "rounded-[2px]";
    default:          return "rounded-sm";
  }
}

function getVaultNameAnimation(mode?: ThemeMode): string {
  switch (mode) {
    case "biotech":   return "bio-breathe 3s infinite";
    case "command":   return "cmd-pulse 3s infinite";
    case "neoncity":  return "nc-neon-pulse 3s infinite";
    case "solarcore": return "solar-pulse 3s infinite";
    case "prismatic": return "prism-pulse 3s infinite";
    default:          return "neon-breathe 3s infinite";
  }
}

export default function HomePage({
  pages, onOpenPage, onAddPage, onDeletePage, onRenamePage, onLock, onSettings, vaultName, themeMode,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PAGE_COLORS[0]);
  const [newIcon, setNewIcon] = useState(PAGE_ICONS[0]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [mediaRating, setMediaRating] = useState<"sfw" | "nsfw">("sfw");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const radius = getThemeRadius(themeMode);

  const selectCat = (key: string) => {
    setSelectedCat(prev => prev === key ? null : key);
  };

  const handleCreate = () => {
    if (!newName.trim() || !selectedCat) return;
    onAddPage(newName.trim(), newColor, newIcon, [selectedCat], mediaRating);
    setNewName("");
    setSelectedCat(null);
    setMediaRating("sfw");
    setShowCreate(false);
  };

  const startRename = (page: VaultPage) => {
    setEditingId(page.id);
    setEditName(page.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRenamePage(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Top bar — minimal: vault name + lock + settings */}
      <div className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--color-cyber-border)", backgroundColor: "var(--color-cyber-panel)" }}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[17px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-neon-bright)", animation: getVaultNameAnimation(themeMode) }}>
            {vaultName}
          </span>
          <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: "var(--color-cyber-muted)" }}>
            Home
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSettings}
            className={`font-mono text-[17px] uppercase tracking-wider px-3 py-1.5 ${radius} transition-all hover:opacity-80`}
            style={{ color: "var(--color-neon-primary)", border: "1px solid var(--color-neon-dark)" }}>
            Settings
          </button>
          <button onClick={onLock}
            className={`font-mono text-[17px] uppercase tracking-wider px-3 py-1.5 ${radius} transition-all hover:opacity-80`}
            style={{ color: "var(--color-neon-primary)", border: "1px solid var(--color-neon-dark)" }}>
            Lock
          </button>
        </div>
      </div>

      {/* Main content — 4x4 grid */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[700px]">
          <div className="grid grid-cols-4 gap-4">
            {pages.map((page, idx) => (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.06, ease: "easeOut" }}
                className="relative group"
              >
                {editingId === page.id ? (
                  <div className={`flex flex-col items-center justify-center aspect-square ${radius} p-3`}
                    style={{ backgroundColor: `${page.color}15`, border: `2px solid ${page.color}` }}>
                    <input
                      ref={inputRef}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={commitRename}
                      autoFocus
                      className="w-full bg-transparent border-b text-center font-mono text-[17px] outline-none py-1"
                      style={{ color: page.color, borderColor: page.color }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onOpenPage(page.id)}
                    className={`w-full flex flex-col items-center justify-center aspect-square ${radius} transition-all hover:scale-[1.03] active:scale-[0.97] cursor-pointer`}
                    style={{
                      backgroundColor: `${page.color}12`,
                      border: `1px solid ${page.color}40`,
                      boxShadow: `0 0 15px ${page.color}10`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = page.color;
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 25px ${page.color}25`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = `${page.color}40`;
                      (e.currentTarget as HTMLElement).style.boxShadow = `0 0 15px ${page.color}10`;
                    }}
                  >
                    <span className="text-[17px] mb-2">{page.icon}</span>
                    <span className="font-mono text-[17px] font-medium uppercase tracking-wider" style={{ color: page.color }}>
                      {page.name}
                    </span>
                  </button>
                )}

                {/* Page actions (hover) */}
                <div className="absolute top-1.5 right-1.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); startRename(page); }}
                    className="w-7 h-7 flex items-center justify-center rounded text-[17px] hover:opacity-80 hover:scale-110 transition-transform"
                    style={{ backgroundColor: `${page.color}25`, color: page.color, animation: "pop-in 0.2s ease-out" }}>
                    &#x270E;
                  </button>
                  {confirmDelete === page.id ? (
                    <button onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); setConfirmDelete(null); }}
                      className="w-7 h-7 flex items-center justify-center rounded text-[17px] hover:opacity-80 hover:scale-110 transition-transform"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-status-danger) 30%, transparent)", color: "var(--color-status-danger)", animation: "pop-in 0.2s ease-out" }}>
                      &#x2713;
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(page.id); setTimeout(() => setConfirmDelete(null), 3000); }}
                      className="w-7 h-7 flex items-center justify-center rounded text-[17px] hover:opacity-80 hover:scale-110 transition-transform"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-status-danger) 15%, transparent)", color: "var(--color-status-danger)", animation: "pop-in 0.2s ease-out" }}>
                      &#x2715;
                    </button>
                  )}
                </div>
              </motion.div>
            ))}

          </div>

          {/* Add page button — centered */}
          {pages.length < 16 && (
            <div className="flex justify-center mt-6">
              <button onClick={() => setShowCreate(true)}
                className={`flex flex-col items-center justify-center px-8 py-4 ${radius} transition-all hover:scale-[1.03] cursor-pointer`}
                style={{
                  backgroundColor: "var(--color-cyber-surface)",
                  border: "2px dashed var(--color-cyber-border)",
                  boxShadow: "0 0 15px var(--color-cyber-border)",
                  animation: "pulse-dot 2s infinite",
                }}>
                <span className="text-[17px] mb-1" style={{ color: "var(--color-cyber-muted)" }}>+</span>
                <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: "var(--color-cyber-muted)" }}>
                  Add Page
                </span>
              </button>
            </div>
          )}

          {/* Create page modal */}
          <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
              <div className="absolute inset-0 bg-black/60" />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={`relative z-10 p-6 ${radius} w-[380px]`} onClick={e => e.stopPropagation()}
                style={{ backgroundColor: "var(--color-cyber-panel)", border: "1px solid var(--color-cyber-border)" }}>
                <h3 className="font-mono text-[17px] font-bold uppercase tracking-wider mb-4" style={{ color: "var(--color-neon-bright)" }}>
                  Create Page
                </h3>

                {/* Name */}
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="Page name..."
                  autoFocus
                  className="w-full bg-transparent border rounded px-3 py-2 font-mono text-[17px] outline-none mb-4"
                  style={{ color: "var(--color-cyber-text)", borderColor: "var(--color-cyber-border)" }}
                />

                {/* Default categories — toggleable */}
                <div className="mb-4">
                  <span className="font-mono text-[17px] uppercase tracking-wider block mb-2" style={{ color: "var(--color-cyber-muted)" }}>Categories</span>
                  <div className="space-y-1.5">
                    {DEFAULT_CATS.map(cat => {
                      const active = selectedCat === cat.key;
                      return (
                        <button key={cat.key} onClick={() => selectCat(cat.key)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded transition-all text-left"
                          style={{
                            backgroundColor: active ? `${newColor}15` : "transparent",
                            border: `1px solid ${active ? newColor + "50" : "var(--color-cyber-border)"}`,
                            opacity: active ? 1 : 0.4,
                          }}>
                          <span className="font-mono" style={{ fontSize: `${cat.size}px`, color: active ? newColor : "var(--color-cyber-muted)" }}>
                            {active ? "\u2713" : "\u2717"}
                          </span>
                          <span className="font-mono" style={{ fontSize: `${cat.size}px`, color: active ? newColor : "var(--color-cyber-muted)" }}>
                            {cat.icon}
                          </span>
                          <span className="font-mono flex-1" style={{ fontSize: `${cat.size}px`, color: active ? "var(--color-cyber-text)" : "var(--color-cyber-muted)" }}>{cat.label}</span>
                          {cat.key === "media" && active && (
                            <span
                              onClick={e => { e.stopPropagation(); setMediaRating(mediaRating === "sfw" ? "nsfw" : "sfw"); }}
                              className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded cursor-pointer transition-all"
                              style={{
                                color: mediaRating === "nsfw" ? "var(--color-status-danger)" : "var(--color-status-success)",
                                border: `1px solid color-mix(in srgb, ${mediaRating === "nsfw" ? "var(--color-status-danger)" : "var(--color-status-success)"} 25%, transparent)`,
                              }}>
                              {mediaRating}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color picker */}
                <div className="mb-4">
                  <span className="font-mono text-[17px] uppercase tracking-wider block mb-2" style={{ color: "var(--color-cyber-muted)" }}>Color</span>
                  <div className="flex flex-wrap gap-2">
                    {PAGE_COLORS.map(c => (
                      <button key={c} onClick={() => setNewColor(c)}
                        className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          border: newColor === c ? "2px solid white" : "2px solid transparent",
                          transform: newColor === c ? "scale(1.15)" : "scale(1)",
                        }} />
                    ))}
                  </div>
                </div>

                {/* Icon picker */}
                <div className="mb-5">
                  <span className="font-mono text-[17px] uppercase tracking-wider block mb-2" style={{ color: "var(--color-cyber-muted)" }}>Icon</span>
                  <div className="flex flex-wrap gap-2">
                    {PAGE_ICONS.map(ic => (
                      <button key={ic} onClick={() => setNewIcon(ic)}
                        className="w-9 h-9 flex items-center justify-center rounded text-[17px] transition-transform hover:scale-110"
                        style={{
                          backgroundColor: newIcon === ic ? `${newColor}25` : "var(--color-cyber-surface)",
                          border: newIcon === ic ? `1px solid ${newColor}` : "1px solid transparent",
                        }}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="flex items-center justify-center mb-4 p-4 rounded-lg" style={{ backgroundColor: `${newColor}12`, border: `1px solid ${newColor}40` }}>
                  <div className="flex flex-col items-center">
                    <span className="text-[17px] mb-1">{newIcon}</span>
                    <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: newColor }}>
                      {newName || "Preview"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={() => setShowCreate(false)}
                    className={`flex-1 font-mono text-[17px] uppercase tracking-wider px-4 py-2 ${radius}`}
                    style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={!newName.trim() || !selectedCat}
                    className={`flex-1 font-mono text-[17px] uppercase tracking-wider px-4 py-2 ${radius} transition-all`}
                    style={{
                      color: (newName.trim() && selectedCat) ? newColor : "var(--color-cyber-muted)",
                      border: `1px solid ${(newName.trim() && selectedCat) ? newColor : "var(--color-cyber-border)"}`,
                      backgroundColor: (newName.trim() && selectedCat) ? `${newColor}18` : "transparent",
                    }}>
                    Create
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
