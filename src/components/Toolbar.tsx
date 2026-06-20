import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  ArrowUpDown,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Download,
  Star,
  Settings,
  Lock,
  Home,
  Globe,
} from "lucide-react";
import CyberButton from "./CyberButton";
import type { SortField } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortField: SortField;
  sortAsc: boolean;
  onSortChange: (f: SortField) => void;
  onSortToggle: () => void;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddFiles: () => void;
  onDeleteSelected: () => void;
  onExportSelected: () => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  onSettings: () => void;
  onTrash: () => void;
  onLock: () => void;
  onHome?: () => void;
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
  themeMode?: ThemeMode;
  trashCount?: number;
  onExportEncryptedZip?: () => void;
  /** Toggle the private vault browser bar (media pages). */
  onBrowser?: () => void;
  browserActive?: boolean;
  /** Set sort field and direction in one step (used by the preset menu). */
  onSortPreset?: (field: SortField, asc: boolean) => void;
  // Folder props (kept for compatibility)
  folders?: string[];
  folderFilter?: string | null;
  onFolderChange?: (f: string | null) => void;
  onCreateFolder?: (name: string) => void;
}

const SORT_PRESETS: { label: string; field: SortField; asc: boolean }[] = [
  { label: "Newest first", field: "date", asc: false },
  { label: "Oldest first", field: "date", asc: true },
  { label: "Largest first", field: "size", asc: false },
  { label: "Smallest first", field: "size", asc: true },
  { label: "Name A–Z", field: "name", asc: true },
  { label: "Name Z–A", field: "name", asc: false },
  { label: "File type", field: "type", asc: true },
];

export default function Toolbar(props: Props) {
  const tm = props.themeMode || "cyberpunk";
  const [sortOpen, setSortOpen] = useState(false);
  const currentSort = SORT_PRESETS.find((p) => p.field === props.sortField && p.asc === props.sortAsc);

  const applySort = (field: SortField, asc: boolean) => {
    if (props.onSortPreset) {
      props.onSortPreset(field, asc);
    } else {
      props.onSortChange(field);
      if (props.sortAsc !== asc) props.onSortToggle();
    }
    setSortOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-cyber-panel)]/80 border-b border-[var(--color-cyber-border)] backdrop-blur-xl relative z-20"
    >
      {/* Left: Home, |divider|, Add Files (primary), Category filter */}
      {props.onHome && (
        <CyberButton themeMode={tm} variant="ghost" size="sm" icon={<Home size={17} />} onClick={props.onHome} title="Back to home" aria-label="Back to home" />
      )}

      <div className="w-[1px] h-5 bg-[var(--color-cyber-border)] mx-0.5" />

      <CyberButton themeMode={tm} variant="primary" size="sm" icon={<Plus size={17} />} onClick={props.onAddFiles}>
        Add Files
      </CyberButton>

      {props.onBrowser && (
        <CyberButton
          themeMode={tm}
          variant={props.browserActive ? "primary" : "ghost"}
          size="sm"
          icon={<Globe size={17} />}
          onClick={props.onBrowser}
          title="Private browser — downloads save straight into the vault"
          aria-label="Toggle private browser"
        >
          Browser
        </CyberButton>
      )}

      {/* Select all / deselect \u2014 always visible so files can be selected in
          one click (a labelled button, not just the count chip). */}
      <CyberButton themeMode={tm}
        variant={props.selectedCount > 0 && props.selectedCount === props.totalCount ? "primary" : "ghost"}
        size="sm"
        icon={props.selectedCount > 0 ? <CheckSquare size={17} /> : <Square size={17} />}
        onClick={props.selectedCount > 0 ? props.onDeselectAll : props.onSelectAll}
        title={props.selectedCount > 0 ? "Deselect all" : "Select all"}
      >
        {props.selectedCount > 0 ? "Deselect" : "Select All"}
      </CyberButton>

      {/* Category filter \u2014 visible chips when the list is short (media pages:
          All / Images / Videos), dropdown otherwise */}
      {props.categories.length <= 4 ? (
        <div className="flex items-center gap-1">
          {props.categories.map((cat) => (
            <CyberButton
              key={cat}
              themeMode={tm}
              variant={props.categoryFilter === cat ? "primary" : "ghost"}
              size="sm"
              onClick={() => props.onCategoryChange(cat)}
              title={cat === "All" ? "Show everything" : `Show only ${cat.toLowerCase()}`}
            >
              {cat}
            </CyberButton>
          ))}
        </div>
      ) : (
        <div className="relative">
          <select
            value={props.categoryFilter}
            onChange={(e) => props.onCategoryChange(e.target.value)}
            className="appearance-none bg-[var(--color-cyber-black)]/60 border border-[var(--color-cyber-border)] rounded-sm px-3 py-1.5 pr-7 text-[17px] text-[var(--color-cyber-text)] font-mono uppercase tracking-wider focus:border-[var(--color-neon-primary)] outline-none transition-all cursor-pointer hover:border-[var(--color-neon-dark)]"
          >
            {props.categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-cyber-muted)] text-[17px]">
            {"\u25BE"}
          </div>
        </div>
      )}

      {/* Favorites toggle (icon-only) */}
      <CyberButton themeMode={tm}
        variant={props.showFavoritesOnly ? "primary" : "ghost"}
        size="sm"
        icon={<Star size={17} className={props.showFavoritesOnly ? "fill-current" : ""} />}
        onClick={props.onToggleFavorites}
        title={props.showFavoritesOnly ? "Showing favorites only" : "Show favorites only"}
        aria-label="Toggle favorites filter"
      />

      {/* Sort \u2014 labelled button with a click-to-open preset menu */}
      <div className="relative">
        <CyberButton
          themeMode={tm}
          variant={sortOpen ? "primary" : "ghost"}
          size="sm"
          icon={<ArrowUpDown size={17} />}
          onClick={() => setSortOpen((v) => !v)}
          title="Sort files"
          aria-label="Sort"
        >
          {currentSort?.label ?? "Sort"}
        </CyberButton>
        {sortOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
            <div
              className="absolute top-full left-0 mt-1 bg-[var(--color-cyber-panel)] border border-[var(--color-cyber-border)] rounded-sm shadow-lg shadow-black/50 z-50 min-w-[170px]"
              style={{ animation: "wipe-in-down 0.2s ease-out" }}
            >
              {SORT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applySort(p.field, p.asc)}
                  className={`block w-full text-left px-3 py-1.5 text-[17px] font-mono uppercase tracking-wider transition-all ${
                    currentSort?.label === p.label
                      ? "text-[var(--color-neon-bright)] bg-[var(--color-neon-subtle)]"
                      : "text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Selected file actions (appear only when items are selected) */}
      {props.selectedCount > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1">
          <div className="w-[1px] h-5 bg-[var(--color-cyber-border)] mx-0.5" />
          <span className="font-mono text-[17px] text-[var(--color-neon-bright)] uppercase tracking-wider px-1">
            {props.selectedCount} selected
          </span>
          <CyberButton themeMode={tm} variant="danger" size="sm" icon={<Trash2 size={17} />} onClick={props.onDeleteSelected} style={{ animation: "alert-pulse 1s infinite" }}>
            Delete
          </CyberButton>
          <CyberButton themeMode={tm} variant="secondary" size="sm" icon={<Download size={17} />} onClick={props.onExportSelected} title="Export selected" aria-label="Export selected" />
          {props.onExportEncryptedZip && (
            <CyberButton themeMode={tm} variant="secondary" size="sm" icon={<Lock size={17} />} onClick={props.onExportEncryptedZip} title="Export as encrypted ZIP" aria-label="Export as encrypted ZIP" />
          )}
        </motion.div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Search, |divider|, Trash, Settings, Lock */}
      <div className="relative max-w-[200px]">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-cyber-muted)]" />
        <input
          type="text"
          value={props.searchQuery}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full bg-[var(--color-cyber-black)]/60 border border-[var(--color-cyber-border)] rounded-sm pl-9 pr-4 py-1.5 text-[17px] text-[var(--color-cyber-text)] font-body focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_8px_var(--color-neon-glow)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/40"
          onFocus={e => { (e.target as HTMLElement).style.animation = "neon-glow-pulse 2s infinite"; }}
          onBlur={e => { (e.target as HTMLElement).style.animation = ""; }}
        />
      </div>

      <div className="w-[1px] h-5 bg-[var(--color-cyber-border)] mx-0.5" />

      <CyberButton themeMode={tm} variant="ghost" size="sm" icon={<Trash2 size={17} />} onClick={props.onTrash} title={`Trash${props.trashCount ? ` (${props.trashCount})` : ""}`} aria-label="Open trash">
        {props.trashCount ? props.trashCount : undefined}
      </CyberButton>
      <CyberButton themeMode={tm} variant="ghost" size="sm" icon={<Settings size={17} />} onClick={props.onSettings} title="Settings" aria-label="Settings" />
      <CyberButton themeMode={tm} variant="ghost" size="sm" icon={<Lock size={17} />} onClick={props.onLock} title="Lock vault" aria-label="Lock vault" />
    </motion.div>
  );
}
