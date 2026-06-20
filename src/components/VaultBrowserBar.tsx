import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCw, Globe, X, ShieldCheck, Video, Music, Download } from "lucide-react";
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

interface Props {
  themeMode?: ThemeMode;
  onOpen: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onClose: () => void;
  onGrab: (url: string, referer: string | null) => void;
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
export default function VaultBrowserBar({ themeMode = "cyberpunk", onOpen, onBack, onForward, onReload, onClose, onGrab }: Props) {
  const [input, setInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [media, setMedia] = useState<DetectedMedia[]>([]);
  const [showMedia, setShowMedia] = useState(false);
  const [grabbed, setGrabbed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

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

        {/* Detected-media indicator — always visible so there's a fixed place
            to check; lights up and becomes clickable when the scanner finds
            grabbable media on the current page. */}
        <CyberButton
          themeMode={themeMode}
          variant={media.length === 0 ? "ghost" : showMedia ? "primary" : "secondary"}
          size="sm"
          icon={<Video size={17} />}
          onClick={() => { if (media.length > 0) setShowMedia((v) => !v); }}
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
    </motion.div>
  );
}
