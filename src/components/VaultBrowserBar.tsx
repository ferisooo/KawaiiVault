import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCw, Globe, X, ShieldCheck, Video, Music, Download, Star, Bookmark, Trash2 } from "lucide-react";
import CyberButton from "./CyberButton";
import type { ThemeMode } from "../hooks/useThemeMode";

export interface DetectedMedia {
  url: string;
  kind: "video" | "audio";
  label: string;
  w?: number;
  h?: number;
  dur?: number;
}

export interface BrowserBookmark {
  url: string;
  title: string;
  addedAt: string; // ISO timestamp
}

interface Props {
  themeMode?: ThemeMode;
  onOpen: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onClose: () => void;
  onGrab: (url: string, referer: string | null) => void;
  /** Load persisted bookmarks JSON (encrypted in the vault). Optional for demo mode. */
  loadBookmarks?: () => Promise<string>;
  /** Persist bookmarks JSON (encrypted in the vault). Optional for demo mode. */
  saveBookmarks?: (json: string) => Promise<void>;
}

/** Human-friendly label for a bookmarked URL (host + path, no scheme/www). */
function bookmarkLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const label = (u.hostname.replace(/^www\./, "") + path).replace(/\/$/, "");
    return label || url;
  } catch {
    return url;
  }
}

/** Turn whatever the user typed into a navigable URL (or a search query). */
export function toBrowserUrl(input: string): string | null {
  const q = input.trim();
  if (!q) return null;
  if (/^https?:\/\//i.test(q)) return q;
  // Bare domain ("site.com", "site.com/path") → navigate directly
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(q)) return `https://${q}`;
  // Anything else → private search
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

/**
 * Control bar for the private vault browser. The browsing itself happens in a
 * separate incognito window; this bar drives navigation, shows where it is,
 * and lists media the injected scanner detects on the current page so the user
 * can grab it straight into the vault. Downloads never touch the disk
 * unencrypted.
 */
export default function VaultBrowserBar({ themeMode = "cyberpunk", onOpen, onBack, onForward, onReload, onClose, onGrab, loadBookmarks, saveBookmarks }: Props) {
  const [input, setInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [media, setMedia] = useState<DetectedMedia[]>([]);
  const [showMedia, setShowMedia] = useState(false);
  const [grabbed, setGrabbed] = useState<Set<string>>(new Set());
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted bookmarks once when the browser bar mounts.
  useEffect(() => {
    if (!loadBookmarks) return;
    let cancelled = false;
    loadBookmarks()
      .then((json) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(json) as BrowserBookmark[];
          if (Array.isArray(parsed)) setBookmarks(parsed.filter((b) => b && typeof b.url === "string"));
        } catch { /* corrupt/empty → start blank */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loadBookmarks]);

  // Persist + update state together so storage never drifts from the UI.
  const persistBookmarks = (next: BrowserBookmark[]) => {
    setBookmarks(next);
    saveBookmarks?.(JSON.stringify(next)).catch(() => {});
  };

  const isBookmarked = !!currentUrl && bookmarks.some((b) => b.url === currentUrl);

  const toggleBookmark = () => {
    if (!currentUrl) return;
    if (isBookmarked) {
      persistBookmarks(bookmarks.filter((b) => b.url !== currentUrl));
    } else {
      const entry: BrowserBookmark = { url: currentUrl, title: bookmarkLabel(currentUrl), addedAt: new Date().toISOString() };
      // Newest first.
      persistBookmarks([entry, ...bookmarks]);
    }
  };

  const removeBookmark = (url: string) => {
    persistBookmarks(bookmarks.filter((b) => b.url !== url));
  };

  const openBookmark = (url: string) => {
    onOpen(url);
    setShowBookmarks(false);
  };

  useEffect(() => {
    let unNav: (() => void) | undefined;
    let unMedia: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unNav = await listen<string>("browser-nav", (e) => {
          setCurrentUrl(e.payload);
          // New page → clear the previous page's detections.
          setMedia([]);
          setShowMedia(false);
          setGrabbed(new Set());
        });
        unMedia = await listen<{ url: string; items: DetectedMedia[] }>("browser-media-found", (e) => {
          const items = (e.payload?.items ?? []).filter((m) => m && m.url);
          setMedia(items);
        });
      } catch { /* events unavailable (demo mode) */ }
    })();
    return () => { unNav?.(); unMedia?.(); };
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const go = () => {
    const url = toBrowserUrl(input);
    if (url) onOpen(url);
  };

  const grab = (m: DetectedMedia) => {
    onGrab(m.url, currentUrl);
    setGrabbed((prev) => new Set(prev).add(m.url));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="relative z-10 bg-[var(--color-cyber-panel)]/80 border-b border-[var(--color-cyber-border)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Globe size={17} className="text-[var(--color-neon-primary)] shrink-0" />
        <span className="font-display text-[17px] uppercase tracking-wider text-[var(--color-neon-bright)] shrink-0 hidden md:inline">
          Private Browser
        </span>

        <CyberButton themeMode={themeMode} variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack} title="Back" aria-label="Browser back" />
        <CyberButton themeMode={themeMode} variant="ghost" size="sm" icon={<ArrowRight size={17} />} onClick={onForward} title="Forward" aria-label="Browser forward" />
        <CyberButton themeMode={themeMode} variant="ghost" size="sm" icon={<RotateCw size={17} />} onClick={onReload} title="Reload" aria-label="Browser reload" />

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder={currentUrl ?? "Type a URL or search privately…"}
          className="flex-1 min-w-[120px] bg-[var(--color-cyber-black)]/60 border border-[var(--color-cyber-border)] rounded-sm px-3 py-1.5 text-[17px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_8px_var(--color-neon-glow)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/50"
        />
        <CyberButton themeMode={themeMode} variant="primary" size="sm" onClick={go}>
          Go
        </CyberButton>

        {/* Bookmark the current page (star fills when this page is saved). */}
        <CyberButton
          themeMode={themeMode}
          variant={isBookmarked ? "primary" : "ghost"}
          size="sm"
          icon={<Star size={17} fill={isBookmarked ? "currentColor" : "none"} />}
          onClick={toggleBookmark}
          title={!currentUrl ? "Open a page first to bookmark it" : isBookmarked ? "Remove this page from bookmarks" : "Bookmark this page"}
          aria-label="Toggle bookmark"
          style={!currentUrl ? { opacity: 0.55 } : undefined}
        />

        {/* Bookmarks list toggle. */}
        <CyberButton
          themeMode={themeMode}
          variant={showBookmarks ? "primary" : bookmarks.length === 0 ? "ghost" : "secondary"}
          size="sm"
          icon={<Bookmark size={17} />}
          onClick={() => { setShowBookmarks((v) => !v); setShowMedia(false); }}
          title="Saved bookmarks"
          aria-label="Show bookmarks"
          style={bookmarks.length === 0 ? { opacity: 0.7 } : undefined}
        >
          {`Saved (${bookmarks.length})`}
        </CyberButton>

        {/* Detected-media indicator — always visible so there's a fixed place
            to check; lights up and becomes clickable when the scanner finds
            grabbable media on the current page. */}
        <CyberButton
          themeMode={themeMode}
          variant={media.length === 0 ? "ghost" : showMedia ? "primary" : "secondary"}
          size="sm"
          icon={<Video size={17} />}
          onClick={() => { if (media.length > 0) { setShowMedia((v) => !v); setShowBookmarks(false); } }}
          title={media.length === 0
            ? "Watching this page for videos/audio — none found yet (ads and stream fragments are filtered out)"
            : "Media detected on this page — click to list and save to vault"}
          style={media.length === 0 ? { opacity: 0.55 } : undefined}
        >
          {`Media (${media.length})`}
        </CyberButton>

        <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] shrink-0 hidden xl:flex items-center gap-1.5" title="Incognito window — downloads are encrypted into the vault and never touch your Downloads folder">
          <ShieldCheck size={14} className="text-[var(--color-status-success,#22c55e)]" />
          downloads → vault
        </span>

        <div className="w-[1px] h-5 bg-[var(--color-cyber-border)] mx-0.5" />
        <CyberButton themeMode={themeMode} variant="ghost" size="sm" icon={<X size={17} />} onClick={onClose} title="Close browser" aria-label="Close browser" />
      </div>

      {/* Detected media list */}
      <AnimatePresence>
        {showMedia && media.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-[var(--color-cyber-border)]"
          >
            <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
              {media.map((m) => {
                const isGrabbed = grabbed.has(m.url);
                return (
                  <div key={m.url} className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 hover:bg-[var(--color-cyber-black)]/70 transition-colors">
                    {m.kind === "audio"
                      ? <Music size={15} className="text-[var(--color-neon-primary)] shrink-0" />
                      : <Video size={15} className="text-[var(--color-neon-primary)] shrink-0" />}
                    <span className="font-mono text-[17px] text-[var(--color-cyber-text)] truncate flex-1" title={m.url}>
                      {m.label}
                      {m.w && m.h ? <span className="text-[var(--color-cyber-muted)]"> · {m.w}×{m.h}</span> : null}
                    </span>
                    <CyberButton
                      themeMode={themeMode}
                      variant={isGrabbed ? "ghost" : "secondary"}
                      size="sm"
                      icon={<Download size={15} />}
                      onClick={() => grab(m)}
                      title={isGrabbed ? "Sent to vault" : "Save to vault"}
                    >
                      {isGrabbed ? "Sent" : "Grab"}
                    </CyberButton>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved bookmarks list */}
      <AnimatePresence>
        {showBookmarks && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-[var(--color-cyber-border)]"
          >
            {bookmarks.length === 0 ? (
              <div className="px-4 py-3 font-mono text-[15px] text-[var(--color-cyber-muted)]">
                No bookmarks yet. Open a page and tap the <Star size={13} className="inline align-[-2px]" /> to save it here.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-1">
                {bookmarks.map((b) => (
                  <div key={b.url} className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 hover:bg-[var(--color-cyber-black)]/70 transition-colors">
                    <Bookmark size={15} className="text-[var(--color-neon-primary)] shrink-0" />
                    <button
                      type="button"
                      onClick={() => openBookmark(b.url)}
                      className="flex-1 min-w-0 text-left font-mono text-[17px] text-[var(--color-cyber-text)] truncate hover:text-[var(--color-neon-bright)] transition-colors"
                      title={b.url}
                    >
                      {b.title || bookmarkLabel(b.url)}
                    </button>
                    <CyberButton
                      themeMode={themeMode}
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={15} />}
                      onClick={() => removeBookmark(b.url)}
                      title="Remove bookmark"
                      aria-label="Remove bookmark"
                    />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
