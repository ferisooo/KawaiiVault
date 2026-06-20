import type { VaultPage } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  open: boolean;
  selectedCount: number;
  pages: VaultPage[];
  currentPageId: string | null;
  folders: string[];
  onMoveToPage: (pageId: string) => void;
  onMoveToFolder: (folder: string | null) => void;
  onClose: () => void;
  themeMode?: ThemeMode;
}

export default function MoveFilesModal({
  open, selectedCount, pages, currentPageId, folders, onMoveToPage, onMoveToFolder, onClose, themeMode,
}: Props) {
  if (!open) return null;

  const rad = themeMode === "biotech" ? "rounded-lg" : themeMode === "command" || themeMode === "solarcore" || themeMode === "neoncity" ? "rounded-[3px]" : themeMode === "prismatic" ? "rounded-md" : "rounded-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className={`relative z-10 p-6 ${rad} w-[400px] max-h-[80vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: "var(--color-cyber-panel)", border: "1px solid var(--color-cyber-border)", animation: "scale-in 0.25s ease-out" }}>
        <h3 className="font-mono text-[17px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-neon-bright)" }}>
          Move {selectedCount} File{selectedCount > 1 ? "s" : ""}
        </h3>
        <p className="font-mono text-[17px] mb-4" style={{ color: "var(--color-cyber-muted)" }}>
          Choose destination page or folder
        </p>

        {/* Move to another page */}
        <div className="mb-4">
          <span className="font-mono text-[17px] uppercase tracking-wider block mb-2" style={{ color: "var(--color-cyber-muted)" }}>
            Pages
          </span>
          <div className="grid grid-cols-3 gap-2">
            {pages.filter(p => p.id !== currentPageId).map(page => (
              <button key={page.id} onClick={() => { onMoveToPage(page.id); onClose(); }}
                className="flex flex-col items-center p-3 rounded-lg transition-all hover:scale-[1.03] cursor-pointer"
                style={{ backgroundColor: `${page.color}12`, border: `1px solid ${page.color}40` }}>
                <span className="text-[17px]">{page.icon}</span>
                <span className="font-mono text-[17px] uppercase tracking-wider mt-1" style={{ color: page.color }}>
                  {page.name}
                </span>
              </button>
            ))}
          </div>
          {pages.filter(p => p.id !== currentPageId).length === 0 && (
            <p className="font-mono text-[17px] text-center py-2" style={{ color: "var(--color-cyber-muted)" }}>
              No other pages available
            </p>
          )}
        </div>

        {/* Move to folder within current page */}
        {folders.length > 0 && (
          <div className="mb-4">
            <span className="font-mono text-[17px] uppercase tracking-wider block mb-2" style={{ color: "var(--color-cyber-muted)" }}>
              Folders (Current Page)
            </span>
            <div className="flex flex-col gap-1">
              <button onClick={() => { onMoveToFolder(null); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-sm transition-all hover:opacity-80 text-left"
                style={{ backgroundColor: "var(--color-cyber-surface)", border: "1px solid var(--color-cyber-border)" }}>
                <span className="text-[17px]">{"\uD83D\uDCC2"}</span>
                <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>Root (No Folder)</span>
              </button>
              {folders.map(f => (
                <button key={f} onClick={() => { onMoveToFolder(f); onClose(); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm transition-all hover:opacity-80 text-left"
                  style={{ backgroundColor: "var(--color-cyber-surface)", border: "1px solid var(--color-cyber-border)" }}>
                  <span className="text-[17px]">{"\uD83D\uDCC1"}</span>
                  <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>{f}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose}
          className="w-full font-mono text-[17px] uppercase tracking-wider px-4 py-2 rounded-sm mt-2"
          style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
