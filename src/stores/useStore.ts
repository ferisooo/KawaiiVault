import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { decryptField, isEncrypted } from "../utils/sessionCrypto";

export type Theme = "neon";
export type ViewMode = "grid";
export type SortField = "name" | "date" | "size" | "type";
export type Screen = "welcome" | "legal" | "login" | "vault";

export interface VaultInfo {
  id: string;
  name: string;
  created_at: string;
  file_count: number;
}

export interface VaultFile {
  id: string;
  name: string;
  size: number;
  file_type: string;
  category: string;
  hash: string;
  favorite: boolean;
  imported_at: string;
  folder?: string | null;
  trashed_at?: string | null;
  wrapped_dek?: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  noteType?: string;
  language?: string; // for code snippets: "js", "ts", "py", "sh", etc.
  trashedAt?: string;
  pinned?: boolean;
  starred?: boolean;
  color?: string;
  folder?: string;
  locked?: boolean;
  lockHash?: string; // SHA-256 hex of PIN
}

export interface DocItem {
  id: string;
  name: string;
  fileId?: string; // link to vault file
  filePath?: string; // absolute path on disk for opening
  addedAt: string;
  trashedAt?: string;
  folder?: string;
  pinned?: boolean;
  docCategory?: string;
  color?: string;
  starred?: boolean;
  locked?: boolean;
  lockHash?: string;
  lastOpenedAt?: string;
}

export interface PasswordItem {
  id: string;
  service: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
  totpSecret?: string;
}

export interface PageCategory {
  id: string;
  name: string;
  type: "media" | "notes" | "documents" | "passwords";
  rating: "sfw" | "nsfw";
  notes: NoteItem[];
  documents: DocItem[];
  passwords: PasswordItem[];
  trashedNotes?: NoteItem[];
  trashedDocs?: DocItem[];
  docFolders?: string[]; // explicit folder list (persists empty folders)
  mediaFolders?: string[]; // per-page media folder list
}

export interface VaultPage {
  id: string;
  name: string;
  color: string;
  icon: string;
  fileIds: string[];
  categories: PageCategory[];
}

export function createDefaultCategories(): PageCategory[] {
  return [
    { id: `cat_${Date.now()}_media`, name: "Media", type: "media", rating: "sfw", notes: [], documents: [], passwords: [] },
    { id: `cat_${Date.now()}_notes`, name: "Notes/Code", type: "notes", rating: "sfw", notes: [], documents: [], passwords: [] },
    { id: `cat_${Date.now()}_docs`, name: "Documents", type: "documents", rating: "sfw", notes: [], documents: [], passwords: [] },
    { id: `cat_${Date.now()}_pw`, name: "Passwords / Logins", type: "passwords", rating: "sfw", notes: [], documents: [], passwords: [] },
  ];
}

export interface AppState {
  screen: Screen;
  theme: Theme;
  currentPage: string | null; // null = home view
  vaultPages: VaultPage[];
  viewMode: ViewMode;
  sortField: SortField;
  sortAsc: boolean;
  searchQuery: string;
  categoryFilter: string;
  selectedFiles: Set<string>;
  showFavoritesOnly: boolean;
  activeVault: VaultInfo | null;
  previewFile: VaultFile | null;
  showSettings: boolean;
  showAuditLog: boolean;
  showIntegrity: boolean;
  showTrash: boolean;
  folderFilter: string | null;
  fullscreenFile: VaultFile | null;
  importProgress: { current: number; total: number; startTime?: number; fileName?: string } | null;
  exportQueue: { fileIds: string[]; destDir: string; current: number; total: number; currentFileName?: string; cancelled?: boolean } | null;
  customBackground: string | null;
  backgroundOpacity: number;
  backgroundFit: string;
  backgroundScale: number;
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  backgroundIsVideo: boolean;
  backgroundSource: "file" | "vault";
  backgroundVaultFileId: string | null;
  slideshowEnabled: boolean;
  slideshowInterval: number;
  slideshowFileIds: string[];
  slideshowShuffle: boolean;
  notification: { message: string; type: "success" | "error" | "warning" | "info" } | null;
  stealthMode: boolean;
}

const initialState: AppState = {
  screen: "welcome",
  theme: "neon",
  currentPage: null,
  vaultPages: [],
  viewMode: "grid",
  sortField: "name",
  sortAsc: true,
  searchQuery: "",
  categoryFilter: "All",
  selectedFiles: new Set(),
  showFavoritesOnly: false,
  activeVault: null,
  previewFile: null,
  showSettings: false,
  showAuditLog: false,
  showIntegrity: false,
  showTrash: false,
  folderFilter: null,
  fullscreenFile: null,
  importProgress: null,
  exportQueue: null,
  customBackground: null,
  backgroundOpacity: 40,
  backgroundFit: "cover",
  backgroundScale: 100,
  backgroundOffsetX: 0,
  backgroundOffsetY: 0,
  backgroundIsVideo: false,
  backgroundSource: "file",
  backgroundVaultFileId: null,
  slideshowEnabled: false,
  slideshowInterval: 30,
  slideshowFileIds: [],
  slideshowShuffle: false,
  notification: null,
  stealthMode: localStorage.getItem("cybervault_stealth_mode") === "true",
};

export function useAppStore() {
  const [state, setState] = useState<AppState>(initialState);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeVaultIdRef = useRef<string | null>(null);

  const update = useCallback((partial: Partial<AppState>) => {
    if ("activeVault" in partial) {
      activeVaultIdRef.current = partial.activeVault?.id ?? null;
    }
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    update({ theme });
  }, [update]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedFiles);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return { ...prev, selectedFiles: next };
    });
  }, []);

  const selectAll = useCallback((fileIds: string[]) => {
    update({ selectedFiles: new Set(fileIds) });
  }, [update]);

  const deselectAll = useCallback(() => {
    update({ selectedFiles: new Set() });
  }, [update]);

  const notify = useCallback((message: string, type: "success" | "error" | "warning" | "info" = "info") => {
    if (notifyTimerRef.current) {
      clearTimeout(notifyTimerRef.current);
    }
    update({ notification: { message, type } });
    notifyTimerRef.current = setTimeout(() => update({ notification: null }), 3000);
  }, [update]);

  const lockVault = useCallback(() => {
    update({
      screen: "login",
      activeVault: null,
      selectedFiles: new Set(),
      previewFile: null,
      searchQuery: "",
      categoryFilter: "All",
      showSettings: false,
      showAuditLog: false,
      showIntegrity: false,
      showTrash: false,
      folderFilter: null,
      fullscreenFile: null,
      exportQueue: null,
      currentPage: null,
      vaultPages: [],  // Clear sensitive pages data from memory on lock
    });
  }, [update]);

  const savePagesPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const savePages = useCallback((pages: VaultPage[]) => {
    // Decrypt session-encrypted passwords before sending to the backend,
    // which has its own AES-256-GCM encryption at rest.
    const persist = (async () => {
      const pagesForBackend = JSON.parse(JSON.stringify(pages));
      for (const page of pagesForBackend) {
        if (page.categories) {
          for (const cat of page.categories) {
            if (cat.passwords) {
              for (const pw of cat.passwords) {
                if (pw.password && isEncrypted(pw.password)) {
                  try { pw.password = await decryptField(pw.password); } catch { /* keep as-is */ }
                }
                if (pw.totpSecret && isEncrypted(pw.totpSecret)) {
                  try { pw.totpSecret = await decryptField(pw.totpSecret); } catch { /* keep as-is */ }
                }
              }
            }
          }
        }
      }
      await invoke("save_pages", { pagesJson: JSON.stringify(pagesForBackend) }).catch(() => {
        // Backend not available (e.g. browser dev mode) — silent fallback
      });
    })();
    savePagesPromiseRef.current = persist;

    // Write only page/category IDs and names to localStorage (per-vault).
    // Zero content, zero file references — just enough for instant UI shell loading.
    const vaultId = activeVaultIdRef.current;
    if (!vaultId) return;
    const sanitized = pages.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      fileIds: [],
      categories: p.categories.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        rating: c.rating,
        notes: [],
        documents: [],
        passwords: [],
      })),
    }));
    localStorage.setItem(`cybervault_pages_${vaultId}`, JSON.stringify(sanitized));
  }, []);

  const flushSavePages = useCallback(() => savePagesPromiseRef.current, []);

  const addPage = useCallback((name: string, color: string, icon: string, selectedCats?: string[], mediaRating?: "sfw" | "nsfw") => {
    setState(prev => {
      const allCats = createDefaultCategories();
      const cats = selectedCats
        ? allCats.filter(c => selectedCats.includes(c.type)).map(c =>
            c.type === "media" && mediaRating ? { ...c, rating: mediaRating } : c
          )
        : allCats;
      // Auto-deduplicate page names: "Notes" → "Notes 2" → "Notes 3" etc.
      const existingNames = new Set(prev.vaultPages.map(p => p.name.toLowerCase()));
      let finalName = name;
      if (existingNames.has(finalName.toLowerCase())) {
        let n = 2;
        while (existingNames.has(`${name} ${n}`.toLowerCase())) n++;
        finalName = `${name} ${n}`;
      }
      const page: VaultPage = {
        id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: finalName, color, icon, fileIds: [],
        categories: cats,
      };
      const pages = [...prev.vaultPages, page];
      savePages(pages);
      return { ...prev, vaultPages: pages };
    });
  }, [savePages]);

  const updatePageCategories = useCallback((pageId: string, categories: PageCategory[]) => {
    setState(prev => {
      const pages = prev.vaultPages.map(p => p.id === pageId ? { ...p, categories } : p);
      savePages(pages);
      return { ...prev, vaultPages: pages };
    });
  }, [savePages]);

  const deletePage = useCallback((pageId: string) => {
    setState(prev => {
      const pages = prev.vaultPages.filter(p => p.id !== pageId);
      savePages(pages);
      return { ...prev, vaultPages: pages, currentPage: prev.currentPage === pageId ? null : prev.currentPage };
    });
  }, [savePages]);

  const renamePage = useCallback((pageId: string, name: string) => {
    setState(prev => {
      const pages = prev.vaultPages.map(p => p.id === pageId ? { ...p, name } : p);
      savePages(pages);
      return { ...prev, vaultPages: pages };
    });
  }, [savePages]);

  const moveFilesToPage = useCallback((fileIds: string[], targetPageId: string) => {
    setState(prev => {
      const pages = prev.vaultPages.map(p => {
        // Remove files from this page
        const remaining = p.fileIds.filter(id => !fileIds.includes(id));
        // Add files if this is the target
        if (p.id === targetPageId) {
          return { ...p, fileIds: [...new Set([...remaining, ...fileIds])] };
        }
        return { ...p, fileIds: remaining };
      });
      savePages(pages);
      return { ...prev, vaultPages: pages, selectedFiles: new Set() };
    });
  }, [savePages]);

  const addFilesToPage = useCallback((fileIds: string[], pageId: string) => {
    setState(prev => {
      const pages = prev.vaultPages.map(p => {
        if (p.id === pageId) {
          return { ...p, fileIds: [...new Set([...p.fileIds, ...fileIds])] };
        }
        return p;
      });
      savePages(pages);
      return { ...prev, vaultPages: pages };
    });
  }, [savePages]);

  const removeFilesFromPage = useCallback((fileIds: string[], pageId: string) => {
    setState(prev => {
      const pages = prev.vaultPages.map(p => {
        if (p.id === pageId) {
          return { ...p, fileIds: p.fileIds.filter(id => !fileIds.includes(id)) };
        }
        return p;
      });
      savePages(pages);
      return { ...prev, vaultPages: pages };
    });
  }, [savePages]);

  return {
    ...state,
    update,
    setTheme,
    toggleFileSelection,
    selectAll,
    deselectAll,
    notify,
    lockVault,
    addPage,
    deletePage,
    renamePage,
    moveFilesToPage,
    addFilesToPage,
    removeFilesFromPage,
    savePages,
    flushSavePages,
    updatePageCategories,
  };
}
