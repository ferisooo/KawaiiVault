import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Palette, Shield, Info, Clock, Trash2, Lock, Image, HardDrive, Download, Upload, Cpu, HelpCircle, FolderOpen, AlertTriangle, ChevronDown, Crown, ExternalLink } from "lucide-react";
import CyberButton from "./CyberButton";
import PhoneAccessCard from "./PhoneAccessCard";
import type { Theme } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";
import { useTauri } from "../hooks/useTauri";
import { invoke } from "@tauri-apps/api/core";

type SettingsTab = "appearance" | "tools" | "help";

const TABS: { id: SettingsTab; label: string; icon: typeof Shield }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "tools", label: "Tools", icon: Cpu },
  { id: "help", label: "Help / Info", icon: HelpCircle },
];

interface Props {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  customBackground: string | null;
  onBackgroundChange: (bg: string | null) => void;
  backgroundOpacity?: number;
  onBackgroundOpacityChange?: (opacity: number) => void;
  backgroundFit?: string;
  onBackgroundFitChange?: (fit: string) => void;
  backgroundScale?: number;
  onBackgroundScaleChange?: (scale: number) => void;
  backgroundOffsetX?: number;
  onBackgroundOffsetXChange?: (x: number) => void;
  backgroundOffsetY?: number;
  onBackgroundOffsetYChange?: (y: number) => void;
  backgroundIsVideo?: boolean;
  onBackgroundIsVideoChange?: (isVideo: boolean) => void;
  vaultSizeInfo?: { total_size: number; total_files: number; categories: { category: string; size: number; count: number }[] } | null;
  themeMode?: ThemeMode;
  onBackupVault?: () => void;
  onRestoreVault?: () => void;
  backupInProgress?: boolean;
  restoreInProgress?: boolean;
  bypassChunkLimits?: boolean;
  onBypassChunkLimitsChange?: (val: boolean) => void;
  bypassThumbnailCache?: boolean;
  onBypassThumbnailCacheChange?: (val: boolean) => void;
  cacheAllThumbnails?: boolean;
  onCacheAllThumbnailsChange?: (val: boolean) => void;
  onPrecacheThumbnails?: () => void;
  onCancelPrecache?: () => void;
  precacheProgress?: { done: number; total: number; running: boolean } | null;
  maxThumbnails?: number;
  onMaxThumbnailsChange?: (val: number) => void;
  cooldownMs?: number;
  onCooldownMsChange?: (val: number) => void;
  fullscreenUnload?: boolean;
  onFullscreenUnloadChange?: (val: boolean) => void;
  clearVideoCacheOnLock?: boolean;
  onClearVideoCacheOnLockChange?: (val: boolean) => void;
  thumbResolution?: number;
  onThumbResolutionChange?: (val: number) => void;
  memoryAmberPercent?: number;
  onMemoryAmberPercentChange?: (val: number) => void;
  vaultFiles?: { id: string; name: string; category: string; file_type: string }[];
  onVaultFileBackground?: (fileId: string) => void;
  slideshowEnabled?: boolean;
  onSlideshowEnabledChange?: (enabled: boolean) => void;
  slideshowInterval?: number;
  onSlideshowIntervalChange?: (interval: number) => void;
  slideshowFileIds?: string[];
  onSlideshowFileIdsChange?: (ids: string[]) => void;
  slideshowShuffle?: boolean;
  onSlideshowShuffleChange?: (shuffle: boolean) => void;
  stealthMode?: boolean;
  onStealthModeChange?: (enabled: boolean) => void;
  stealthHint?: string;
  onStealthHintChange?: (hint: string) => void;
  disableFileEviction?: boolean;
  onDisableFileEvictionChange?: (val: boolean) => void;
  onWipeComplete?: () => void;
  // License / Pro
  isPro?: boolean;
  licenseKey?: string | null;
  licenseEmail?: string | null;
  licenseLoading?: boolean;
  licenseError?: string | null;
  trialDaysLeft?: number | null;
  onActivateLicense?: (key: string) => Promise<boolean>;
  onDeactivateLicense?: () => void;
}

const themes: { id: Theme; label: string; color: string; accent: string }[] = [
  { id: "neon", label: "Neon", color: "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-yellow-400", accent: "shadow-[0_0_15px_rgba(255,45,149,0.45)]" },
];

const AUTO_LOCK_OPTIONS = [
  { label: "Disabled", value: 0 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "15 minutes", value: 900 },
  { label: "30 minutes", value: 1800 },
];


const SLIDESHOW_INTERVALS = [
  { label: "1 second", value: 1 },
  { label: "5 seconds", value: 5 },
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
];

function VaultBackgroundPicker({ vaultFiles, onSelect, themeMode }: {
  vaultFiles: { id: string; name: string; category: string; file_type: string }[];
  onSelect: (fileId: string) => void;
  themeMode?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="mt-2">
      <CyberButton
        variant="ghost"
        themeMode={themeMode as any}
        onClick={() => setShowPicker(!showPicker)}
        className="w-full !justify-center !text-[17px]"
      >
        <Lock size={14} />
        {showPicker ? "Hide Vault Files" : "From Vault"}
      </CyberButton>
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 max-h-[260px] overflow-y-auto border border-[var(--color-cyber-border)]/30 rounded-sm p-2 bg-[var(--color-cyber-black)]/30 space-y-0.5">
              {vaultFiles.length === 0 ? (
                <p className="px-2 py-1.5 font-mono text-[17px] text-[var(--color-cyber-muted)] italic">No images or videos in vault</p>
              ) : (
                vaultFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { onSelect(f.id); setShowPicker(false); }}
                    className="w-full text-left px-3 py-1.5 rounded-sm hover:bg-[var(--color-neon-subtle)] transition-colors font-mono text-[17px] text-[var(--color-cyber-text)] hover:text-[var(--color-neon-bright)] truncate flex items-center gap-2"
                  >
                    <span className="text-[var(--color-cyber-muted)] text-[17px] shrink-0">[{f.category === "Videos" ? "VID" : "IMG"}]</span>
                    {f.name}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SlideshowControls({ vaultFiles, slideshowEnabled, onSlideshowEnabledChange, slideshowInterval, onSlideshowIntervalChange, slideshowFileIds, onSlideshowFileIdsChange, slideshowShuffle, onSlideshowShuffleChange, themeMode }: {
  vaultFiles: { id: string; name: string; category: string }[];
  slideshowEnabled: boolean;
  onSlideshowEnabledChange?: (enabled: boolean) => void;
  slideshowInterval: number;
  onSlideshowIntervalChange?: (interval: number) => void;
  slideshowFileIds: string[];
  onSlideshowFileIdsChange?: (ids: string[]) => void;
  slideshowShuffle?: boolean;
  onSlideshowShuffleChange?: (shuffle: boolean) => void;
  themeMode?: string;
}) {
  const [showFileList, setShowFileList] = useState(false);
  const [fileFilter, setFileFilter] = useState<"all" | "images" | "videos">("all");
  const isCustomInterval = !SLIDESHOW_INTERVALS.some((opt) => opt.value === slideshowInterval);
  const [showCustomInput, setShowCustomInput] = useState(isCustomInterval);
  const [customSeconds, setCustomSeconds] = useState(String(isCustomInterval ? slideshowInterval : ""));
  const toggleFile = (id: string) => {
    const next = slideshowFileIds.includes(id)
      ? slideshowFileIds.filter((fid) => fid !== id)
      : [...slideshowFileIds, id];
    onSlideshowFileIdsChange?.(next);
  };

  const filteredFiles = vaultFiles.filter((f) => {
    if (fileFilter === "images") return f.category === "Images";
    if (fileFilter === "videos") return f.category === "Videos";
    return true;
  });

  const imageCount = vaultFiles.filter((f) => f.category === "Images").length;
  const videoCount = vaultFiles.filter((f) => f.category === "Videos").length;

  return (
    <div className="mt-3 p-3 rounded-sm bg-[var(--color-cyber-black)]/30 border border-[var(--color-cyber-border)]/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5">
          <Image size={14} className="text-[var(--color-neon-primary)]" /> Slideshow
        </span>
        <button
          onClick={() => onSlideshowEnabledChange?.(!slideshowEnabled)}
          className={`w-10 h-5 rounded-full transition-all relative ${
            slideshowEnabled ? "bg-[var(--color-neon-primary)] shadow-[0_0_10px_var(--color-neon-glow)]" : "bg-[var(--color-cyber-border)]"
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${slideshowEnabled ? "left-5" : "left-0.5"}`} />
        </button>
      </div>
      <AnimatePresence>
        {slideshowEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Interval</span>
              <select
                value={showCustomInput ? "custom" : slideshowInterval}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setShowCustomInput(true);
                  } else {
                    setShowCustomInput(false);
                    onSlideshowIntervalChange?.(Number(e.target.value));
                  }
                }}
                className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-2 py-1.5 text-[var(--color-cyber-text)] font-mono text-[17px] focus:border-[var(--color-neon-primary)] outline-none"
              >
                {SLIDESHOW_INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                <option value="custom">Custom...</option>
              </select>
            </div>
            {showCustomInput && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Secs</span>
                <input
                  type="number"
                  min="1"
                  max="86400"
                  value={customSeconds}
                  onChange={(e) => {
                    setCustomSeconds(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (val >= 1 && val <= 86400) {
                      onSlideshowIntervalChange?.(val);
                    }
                  }}
                  placeholder="Enter seconds..."
                  className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-2 py-1.5 text-[var(--color-cyber-text)] font-mono text-[17px] focus:border-[var(--color-neon-primary)] outline-none"
                />
              </div>
            )}
            {/* Shuffle / Random order toggle */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">Random Order</span>
              <button
                onClick={() => onSlideshowShuffleChange?.(!slideshowShuffle)}
                className={`w-10 h-5 rounded-full transition-all relative ${
                  slideshowShuffle ? "bg-[var(--color-neon-primary)] shadow-[0_0_10px_var(--color-neon-glow)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${slideshowShuffle ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <div>
              <button
                onClick={() => setShowFileList(!showFileList)}
                className="w-full text-left font-mono text-[17px] text-[var(--color-neon-bright)] hover:text-[var(--color-neon-primary)] transition-colors flex items-center justify-between"
              >
                <span>{slideshowFileIds.length} file{slideshowFileIds.length !== 1 ? "s" : ""} selected</span>
                <ChevronDown size={14} className={`transition-transform ${showFileList ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {showFileList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {/* Filter: All / Images / Videos */}
                    <div className="flex gap-1 mt-2 mb-2">
                      {([
                        { key: "all" as const, label: "All", count: vaultFiles.length },
                        { key: "images" as const, label: "Images", count: imageCount },
                        { key: "videos" as const, label: "Videos", count: videoCount },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setFileFilter(opt.key)}
                          className={`px-2.5 py-1 rounded-sm font-mono text-[17px] transition-all ${
                            fileFilter === opt.key
                              ? "bg-[var(--color-neon-primary)] text-white"
                              : "bg-[var(--color-cyber-border)]/30 text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)]"
                          }`}
                        >
                          {opt.label} ({opt.count})
                        </button>
                      ))}
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1">
                      {filteredFiles.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-[var(--color-neon-subtle)] cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={slideshowFileIds.includes(f.id)}
                            onChange={() => toggleFile(f.id)}
                            className="accent-[var(--color-neon-primary)]"
                          />
                          <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] shrink-0">[{f.category === "Videos" ? "VID" : "IMG"}]</span>
                          <span className="font-mono text-[17px] text-[var(--color-cyber-text)] truncate">{f.name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => onSlideshowFileIdsChange?.(filteredFiles.map((f) => f.id))}
                        className="font-mono text-[17px] text-[var(--color-neon-primary)] hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => onSlideshowFileIdsChange?.([])}
                        className="font-mono text-[17px] text-[var(--color-cyber-muted)] hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function ProLockOverlay({ children, locked, label }: { children: React.ReactNode; locked: boolean; label?: string }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-30 blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-cyber-black)]/60 rounded-sm backdrop-blur-[2px]">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-amber-500/10 border border-amber-500/30">
          <Crown size={14} className="text-amber-400" />
          <span className="font-mono text-[15px] text-amber-400 uppercase tracking-wider">
            {label || "Pro Feature"}
          </span>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ id, icon, label, labelClass, borderClass, open: isOpen, onToggle, children }: {
  id: string;
  icon: React.ReactNode;
  label: string;
  labelClass?: string;
  borderClass?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-2 pb-1 border-b ${borderClass || "border-[var(--color-cyber-border)]/30"} cursor-pointer group/collapse`}
      >
        {icon}
        <span className={`font-display text-[17px] font-semibold tracking-[0.2em] uppercase flex-1 text-left ${labelClass || "text-[var(--color-cyber-muted)]"}`}>
          {label}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="text-[var(--color-cyber-muted)] group-hover/collapse:text-[var(--color-neon-bright)] transition-colors" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Info popup modal ──
function InfoPopup({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto bg-[var(--color-cyber-bg)] border border-[var(--color-cyber-border)] rounded-sm shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-[var(--color-cyber-border)] bg-[var(--color-cyber-bg)]">
            <h2 className="font-display text-[17px] font-bold tracking-[0.2em] uppercase text-[var(--color-neon-bright)]">{title}</h2>
            <button onClick={onClose} className="text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors"><X size={16} /></button>
          </div>
          <div className="px-5 py-4 space-y-4 font-mono text-[15px] text-[var(--color-cyber-text)] leading-relaxed">
            {children}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Content constants ──
const TOS_CONTENT = () => (
  <>
    <p className="text-[var(--color-cyber-muted)] italic">Last updated: March 2026</p>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Why I Built This</h3>
      <p>I built CyberVault because I noticed that genuinely privacy-focused apps are either overpriced, overcomplicated, or just not available for everyday people. I wanted to create something that puts your privacy first without emptying your wallet. Your data is yours — period.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">What You're Agreeing To</h3>
      <p>By using CyberVault, you agree to these terms. If you don't agree, please don't use the app — no hard feelings.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Liability Disclaimer</h3>
      <p>CyberVault is provided "as is" with no warranties of any kind — express or implied. I'm an independent developer, not a security firm. I do my best to make this app secure, but I can't guarantee it'll be perfect in every scenario.</p>
      <p className="mt-2">I am <span className="text-amber-400">not responsible</span> for any data loss, corruption, unauthorized access, or damages that may result from using this app. You use it at your own risk.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How You Use It Is On You</h3>
      <p>I built this for legitimate privacy protection. I'm not responsible for how anyone chooses to use CyberVault. Don't use it for anything illegal — that's on you, not me.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">No Vault Is 100% Foolproof</h3>
      <p>Let me be upfront: <span className="text-amber-400">no vault is 100% foolproof.</span> CyberVault is designed to protect against casual and intermediate unauthorized access — someone snooping on your computer, a nosy roommate, or a thief who stole your device.</p>
      <p className="mt-2">It is <span className="text-red-400">not intended to, and cannot, guarantee protection</span> against official investigations or government-level forensic analysis. If a state-level actor with unlimited resources wants in, no consumer software can promise absolute protection. I'm being honest about that.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Passwords & Recovery</h3>
      <p>Your plaintext password is never stored — only a one-way Argon2id hash is kept locally in your vault file for authentication. This hash cannot be reversed to recover your password. If you forget your password, <span className="text-amber-400">your data cannot be recovered</span> — but you do have the option to wipe and delete the vault entirely from the login screen so you can start fresh. Please keep your password safe.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Changes to These Terms</h3>
      <p>I may update these terms from time to time. Continued use of the app means you accept the updated terms.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Questions?</h3>
      <p>If you have any questions, feel free to reach out at{" "}
        <button onClick={async () => { try { await invoke("open_url_in_browser", { url: "https://bio.link/cybero" }); } catch { window.open("https://bio.link/cybero", "_blank"); } }} className="text-[var(--color-neon-primary)] underline underline-offset-2 hover:text-[var(--color-neon-bright)] transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit inline">bio.link/cybero</button>.
      </p>
    </div>
  </>
);

const PRIVACY_CONTENT = () => (
  <>
    <p className="text-[var(--color-cyber-muted)] italic">Last updated: March 2026</p>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">The Short Version</h3>
      <p>I don't collect your data. I don't want your data. CyberVault was built specifically so that your files stay on <span className="text-[var(--color-neon-primary)]">your device</span> and nowhere else.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">No Data Collection</h3>
      <p>CyberVault does <span className="text-emerald-400">not</span> collect any personal information. No names, no emails, no usage analytics, no telemetry, no crash reports, no device fingerprints — nothing. I literally have no idea who you are or how you use the app, and that's by design.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">No Data Transmission</h3>
      <p>Your files, passwords, notes, documents — none of it ever leaves your device. CyberVault does <span className="text-emerald-400">not</span> send any sensitive data to any server, cloud service, or third party. Everything is encrypted and stored locally on your machine.</p>
      <p className="mt-2">The only network request CyberVault makes is license key verification with Gumroad (if you're a Pro subscriber). That request contains only your license key — no vault data, no file names, no personal information.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Local-Only Encryption</h3>
      <p>All encryption and decryption happens entirely on your device. Your plaintext password is never stored — only an Argon2id hash of it is kept locally in the vault file for authentication. Your encryption keys are derived locally and held in protected memory while the vault is unlocked, then securely wiped when you lock it.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">No Accounts Required</h3>
      <p>You don't need to create an account, provide an email, or sign up for anything to use CyberVault. The app works entirely offline (except for optional Pro license verification).</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">What Gets Stored Locally</h3>
      <p>The only things stored on your device are: your encrypted vault file (containing your files, notes, passwords, etc.), your theme/UI preferences in browser localStorage, and your license key if you're a Pro subscriber. All vault content is AES-256-GCM encrypted.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Third Parties</h3>
      <p>CyberVault does not integrate with any third-party analytics, advertising, or tracking services. The only external service is Gumroad for Pro license verification, and that interaction is minimal and contains no sensitive data.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Questions?</h3>
      <p>If you have any questions about this policy, feel free to reach out at{" "}
        <button onClick={async () => { try { await invoke("open_url_in_browser", { url: "https://bio.link/cybero" }); } catch { window.open("https://bio.link/cybero", "_blank"); } }} className="text-[var(--color-neon-primary)] underline underline-offset-2 hover:text-[var(--color-neon-bright)] transition-colors bg-transparent border-none p-0 cursor-pointer font-inherit text-inherit inline">bio.link/cybero</button>.
      </p>
    </div>
  </>
);

const FEATURES_CONTENT = () => (
  <>
    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Encryption</h3>
      <p>Every file you import gets locked with its own unique key. Even if someone somehow got hold of one key, your other files would still be safe. I use AES-256-GCM — a widely trusted encryption standard.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Password Protection</h3>
      <p>Your password goes through an intentionally slow and memory-heavy process (Argon2id) before it can be used. This makes it extremely hard for anyone to guess your password by trying millions of combinations — each guess takes significant computing power.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Everything Is Hidden</h3>
      <p>It's not just your files that are encrypted — your file names, folder names, notes, passwords, and activity logs are all encrypted too. If someone opened your vault file without the password, they'd see nothing useful. Not even file names.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Duress Password</h3>
      <p>You can set a second "panic" password. If you're ever forced to open your vault, entering this password silently destroys everything and shows a "vault not found" message — as if nothing was ever there. Your files are overwritten with random junk before being deleted.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Self-Destruct</h3>
      <p>If someone tries to guess your password, the vault keeps count. After too many wrong guesses (you choose how many — between 3 and 20), the vault permanently destroys itself. Restarting the app doesn't reset the counter.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Auto-Lock</h3>
      <p>Walk away from your computer? The vault locks itself after a timeout you set (30 seconds to 30 minutes). When it locks, everything in memory is wiped clean — nothing lingers.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Stealth Mode</h3>
      <p>Makes the app look like a snake game. Anyone glancing at your screen would just see a game — not a vault. You enter a secret PIN inside the game to reveal the real login screen.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Memory Protection</h3>
      <p>While you're using the vault, your sensitive data is scrambled in memory so other programs can't easily snoop on it. The moment you lock the vault, everything is wiped from memory completely.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Backup & Restore</h3>
      <p>You can create a full backup of your vault at any time. The backup stays encrypted — you still need your password to open it. Great for peace of mind or moving to a new computer.</p>
    </div>
  </>
);

const FAQ_CONTENT = () => (
  <>
    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How are my files protected?</h3>
      <p>When you import a file, CyberVault creates a unique random key just for that file, encrypts it, and then locks that key with your vault's master key (which comes from your password). Everything is encrypted on your device — nothing is sent anywhere.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How do I create a vault?</h3>
      <p>Click "Create Vault" on the welcome screen, pick a name, and set a strong password (at least 8 characters). That's it — your vault is ready to use right away.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How do I add files?</h3>
      <p>Open your vault and click the "+" button in the toolbar. Your files are encrypted automatically the moment they're imported.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Can I recover a forgotten password?</h3>
      <p><span className="text-red-400">No.</span> Your actual password is never saved — only a scrambled version of it that can't be reversed. There's no master key and no backdoor. If you forget your password, your data is gone for good. You can wipe the vault from the login screen to start fresh, but the old data is lost. Write your password down somewhere safe.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How do I set up the duress password?</h3>
      <p>Go to Settings &gt; Tools &gt; Duress Password. Pick a password that's different from your main one (at least 8 characters). If you ever enter this password at the login screen, the vault silently destroys itself.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How do I back up my vault?</h3>
      <p>Go to Settings &gt; Tools &gt; Backup &amp; Restore. Hit "Backup" and choose where to save it. The backup is a complete encrypted copy. To restore, click "Restore" and pick the backup file.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">What happens when the vault auto-locks?</h3>
      <p>Everything gets wiped from memory — your files, thumbnails, encryption keys, all of it. You'll need to enter your password again to get back in. Nothing is left behind.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">How does stealth mode work?</h3>
      <p>It replaces the login screen with a playable snake game. To get to your vault, enter your secret PIN inside the game (there's a tiny hint in the corner). Anyone looking over your shoulder just sees a game.</p>
    </div>

    <div>
      <h3 className="text-[var(--color-neon-bright)] uppercase tracking-wider mb-2 font-bold">Is my data stored in the cloud?</h3>
      <p><span className="text-emerald-400">No.</span> Everything stays on your device. CyberVault never uploads anything anywhere. The only network request is optional Pro license verification with Gumroad.</p>
    </div>
  </>
);

// ── Help/Info tab component ──
function HelpInfoTab({ vaultSizeInfo, isPro, licenseKey, licenseEmail, licenseLoading, licenseError, trialDaysLeft, onActivateLicense, onDeactivateLicense, themeMode }: {
  vaultSizeInfo?: { total_size: number; total_files: number; categories: { category: string; size: number; count: number }[] } | null;
  isPro: boolean;
  licenseKey?: string | null;
  licenseEmail?: string | null;
  licenseLoading?: boolean;
  licenseError?: string | null;
  trialDaysLeft?: number | null;
  onActivateLicense?: (key: string) => Promise<boolean>;
  onDeactivateLicense?: () => void;
  themeMode?: string;
}) {
  const [popup, setPopup] = useState<"tos" | "privacy" | "features" | "faq" | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [vaultSizeOpen, setVaultSizeOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  const infoButtons: { id: "tos" | "privacy" | "features" | "faq"; label: string; icon: React.ReactNode }[] = [
    { id: "tos", label: "Terms of Service", icon: <Shield size={13} /> },
    { id: "privacy", label: "Privacy Policy", icon: <Lock size={13} /> },
    { id: "features", label: "Features", icon: <Cpu size={13} /> },
    { id: "faq", label: "FAQs", icon: <HelpCircle size={13} /> },
  ];

  return (
    <>
      {/* Info Buttons */}
      <div>
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className="w-full flex items-center justify-between font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-1 bg-transparent border-none p-0 cursor-pointer hover:text-[var(--color-neon-bright)] transition-colors"
        >
          <span className="flex items-center gap-2">
            <Info size={14} className="text-[var(--color-neon-primary)]" />
            Information
          </span>
          <ChevronDown size={16} className={`text-[var(--color-neon-primary)] transition-transform ${infoOpen ? "rotate-180" : ""}`} />
        </button>
        {infoOpen && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {infoButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => setPopup(btn.id)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-sm border border-[var(--color-cyber-border)]/40 bg-[var(--color-cyber-black)]/30 hover:bg-[var(--color-neon-subtle)] hover:border-[var(--color-neon-primary)]/40 transition-all font-mono text-[15px] text-[var(--color-cyber-text)] hover:text-[var(--color-neon-bright)]"
              >
                <span className="text-[var(--color-neon-primary)]">{btn.icon}</span>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vault Size Indicator */}
      {vaultSizeInfo && (
        <div>
          <button
            onClick={() => setVaultSizeOpen(!vaultSizeOpen)}
            className="w-full flex items-center justify-between font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-1 bg-transparent border-none p-0 cursor-pointer hover:text-[var(--color-neon-bright)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <HardDrive size={14} className="text-[var(--color-neon-primary)]" />
              Vault Size
            </span>
            <ChevronDown size={16} className={`text-[var(--color-neon-primary)] transition-transform ${vaultSizeOpen ? "rotate-180" : ""}`} />
          </button>
          {vaultSizeOpen && (
            <div className="p-3 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/30 space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">Total</span>
                <span className="font-mono text-[17px] text-[var(--color-neon-bright)] font-semibold">
                  {formatBytes(vaultSizeInfo.total_size)} · {vaultSizeInfo.total_files} files
                </span>
              </div>
              {vaultSizeInfo.categories.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-[var(--color-cyber-border)]/20">
                  {vaultSizeInfo.categories.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">{cat.category}</span>
                      <span className="font-mono text-[17px] text-[var(--color-neon-primary)]">
                        {formatBytes(cat.size)} ({cat.count})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Feedback Form */}
      <div className="px-4 py-3">
        <button
          onClick={async () => {
            try {
              await invoke("open_url_in_browser", { url: "https://docs.google.com/forms/d/e/1FAIpQLScRpKg7tSZTKWwrqekMOzk8CiQfGWtXeL6_8YqItHdr-B-Vqg/viewform?usp=header" });
            } catch {
              window.open("https://docs.google.com/forms/d/e/1FAIpQLScRpKg7tSZTKWwrqekMOzk8CiQfGWtXeL6_8YqItHdr-B-Vqg/viewform?usp=header", "_blank");
            }
          }}
          className="flex items-center gap-2 font-mono text-[17px] text-[var(--color-neon-primary)] hover:text-[var(--color-neon-secondary)] transition-colors cursor-pointer bg-transparent border-none p-0"
        >
          <ExternalLink size={14} />
          Bugs/Feedback
        </button>
      </div>

      {/* Version */}
      <div className="text-center font-mono text-[17px] text-[var(--color-cyber-muted)]/50 pt-2">
        CyberVault v1.0.0 · AES-256-GCM · Argon2id KDF
      </div>

      {/* Popups */}
      <InfoPopup open={popup === "tos"} onClose={() => setPopup(null)} title="Terms of Service">
        <TOS_CONTENT />
      </InfoPopup>
      <InfoPopup open={popup === "privacy"} onClose={() => setPopup(null)} title="Privacy Policy">
        <PRIVACY_CONTENT />
      </InfoPopup>
      <InfoPopup open={popup === "features"} onClose={() => setPopup(null)} title="Security Features">
        <FEATURES_CONTENT />
      </InfoPopup>
      <InfoPopup open={popup === "faq"} onClose={() => setPopup(null)} title="Frequently Asked Questions">
        <FAQ_CONTENT />
      </InfoPopup>
    </>
  );
}

function SubscriptionSection({ isPro, licenseKey, licenseEmail, licenseLoading, licenseError, trialDaysLeft, onActivateLicense, onDeactivateLicense, themeMode }: {
  isPro: boolean;
  licenseKey?: string | null;
  licenseEmail?: string | null;
  licenseLoading?: boolean;
  licenseError?: string | null;
  trialDaysLeft?: number | null;
  onActivateLicense?: (key: string) => Promise<boolean>;
  onDeactivateLicense?: () => void;
  themeMode?: string;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!keyInput.trim() || !onActivateLicense) return;
    setActivating(true);
    setLocalError(null);
    const ok = await onActivateLicense(keyInput.trim());
    setActivating(false);
    if (ok) setKeyInput("");
    // Error details are surfaced via licenseError from the hook
  };

  return (
    <>
      {/* Status Badge */}
      <div className={`p-4 rounded-sm border ${isPro ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--color-cyber-border)]/30 bg-[var(--color-cyber-black)]/30"}`}>
        <div className="flex items-center gap-3 mb-3">
          <Crown size={20} className={isPro ? "text-amber-400" : "text-[var(--color-cyber-muted)]"} />
          <div>
            <h3 className={`font-display text-[19px] font-bold tracking-wider uppercase ${isPro ? "text-amber-400" : "text-[var(--color-cyber-text)]"}`}>
              {isPro ? "Pro Active" : "Free Plan"}
            </h3>
            {isPro && licenseEmail && (
              <p className="font-mono text-[15px] text-[var(--color-cyber-muted)]">{licenseEmail}</p>
            )}
          </div>
        </div>

        {isPro ? (
          <div className="space-y-3">
            {trialDaysLeft !== null && trialDaysLeft !== undefined && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-sm border ${trialDaysLeft <= 2 ? "border-red-500/40 bg-red-500/10" : "border-amber-500/30 bg-amber-500/5"}`}>
                <Clock size={14} className={trialDaysLeft <= 2 ? "text-red-400" : "text-amber-400"} />
                <span className={`font-mono text-[14px] ${trialDaysLeft <= 2 ? "text-red-400" : "text-amber-400"}`}>
                  {trialDaysLeft <= 0
                    ? "Trial expired"
                    : `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} left in trial`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] text-[var(--color-cyber-muted)] uppercase tracking-wider">Key:</span>
              <span className="font-mono text-[15px] text-[var(--color-neon-primary)]">
                {licenseKey ? `${licenseKey.slice(0, 8)}${"•".repeat(16)}` : "—"}
              </span>
            </div>
            <CyberButton
              variant="ghost"
              themeMode={themeMode as any}
              onClick={onDeactivateLicense}
              className="w-full !text-red-400 hover:!text-red-300"
            >
              Deactivate License
            </CyberButton>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-mono text-[15px] text-[var(--color-cyber-muted)]">
              Enter your Gumroad license key to unlock all Pro features.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[var(--color-cyber-text)] font-mono text-[15px] focus:border-amber-500 outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/30"
              />
              <CyberButton
                variant="ghost"
                themeMode={themeMode as any}
                onClick={handleActivate}
                className="shrink-0 !px-4 !text-amber-400"
              >
                {activating || licenseLoading ? "Verifying..." : "Activate"}
              </CyberButton>
            </div>
            {(localError || licenseError) && (
              <p className="font-mono text-[15px] text-red-400">{localError || licenseError}</p>
            )}
          </div>
        )}
      </div>

      {/* Pro Features List */}
      <div>
        <h3 className="font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-3 flex items-center gap-2">
          <Crown size={14} className="text-amber-400" />
          Pro Features
        </h3>
        <div className="space-y-1.5">
          {[
            "All 6 theme colors",
            "Slideshow mode",
            "Duress password",
            "Self-destruct",
            "Vault location / transfer",
            "Stealth mode",
            "Advanced settings",
            "Unlimited notes",
            "Unlimited documents",
            "Unlimited passwords",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 font-mono text-[15px]">
              <span className={isPro ? "text-emerald-400" : "text-[var(--color-cyber-muted)]/50"}>{isPro ? "✓" : "○"}</span>
              <span className={isPro ? "text-[var(--color-cyber-text)]" : "text-[var(--color-cyber-muted)]"}>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Free Plan Limits */}
      {!isPro && (
        <div className="p-3 rounded-sm bg-[var(--color-cyber-black)]/30 border border-[var(--color-cyber-border)]/30">
          <h4 className="font-display text-[15px] font-semibold tracking-wider uppercase text-[var(--color-cyber-muted)] mb-2">Free Plan Limits</h4>
          <div className="space-y-1 font-mono text-[15px] text-[var(--color-cyber-muted)]">
            <p>• Neon Crimson theme only</p>
            <p>• Max 10 notes per page</p>
            <p>• Max 10 documents per page</p>
            <p>• Max 10 passwords per page</p>
          </div>
        </div>
      )}
    </>
  );
}

function ToolsSections({ isPro, themeMode, autoLockTimeout, onAutoLockChange, duressEnabled, duressPin, setDuressPin, duressStatus, onSetDuressPin, selfDestructEnabled, setSelfDestructEnabled, selfDestructThreshold, setSelfDestructThreshold, selfDestructConfirm, setSelfDestructConfirm, selfDestructStatus, tauri, setSelfDestructStatus, onBackupVault, onRestoreVault, backupInProgress, restoreInProgress, vaultPath, transferring, setTransferring, setVaultPath, watchFolder, setWatchFolder, bypassChunkLimits, setBypassChunkLimits, onBypassChunkLimitsChange, bypassThumbnailCache, setBypassThumbnailCache, onBypassThumbnailCacheChange, cacheAllThumbnails, onCacheAllThumbnailsChange, onPrecacheThumbnails, onCancelPrecache, precacheProgress, maxThumbnails, onMaxThumbnailsChange, cooldownMs, onCooldownMsChange, fullscreenUnload, onFullscreenUnloadChange, clearVideoCacheOnLock, onClearVideoCacheOnLockChange, thumbResolution, onThumbResolutionChange, memoryAmberPercent, onMemoryAmberPercentChange, stealthMode, onStealthModeChange, stealthHint, onStealthHintChange, disableFileEviction, onDisableFileEvictionChange, onWipeComplete }: any) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Wipe vault state
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wipeStatus, setWipeStatus] = useState("");
  const [wiping, setWiping] = useState(false);

  return (
    <>
      {/* Auto Lock */}
      <CollapsibleSection id="autolock" icon={<Clock size={13} className="text-[var(--color-neon-primary)]" />} label="Auto Lock" open={openSections.has("autolock")} onToggle={toggle}>
        <select
          value={autoLockTimeout}
          onChange={(e: any) => onAutoLockChange(Number(e.target.value))}
          className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[var(--color-cyber-text)] font-mono text-[17px] focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_10px_var(--color-neon-glow)] outline-none transition-all"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </CollapsibleSection>

      {/* Duress Password */}
      <ProLockOverlay locked={!isPro} label="Pro — Duress Password">
      <CollapsibleSection id="duress" icon={<Lock size={13} className="text-amber-500" />} label="Duress Password" open={openSections.has("duress")} onToggle={toggle}>
        <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mb-2">
          {duressEnabled ? "Active — entering it silently wipes the vault." : "Set a duress password that silently destroys the vault."}
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={duressPin}
            onChange={(e: any) => setDuressPin(e.target.value)}
            placeholder={duressEnabled ? "Update duress password..." : "Set duress password..."}
            className="flex-1 bg-[var(--color-cyber-black)] border border-amber-900/40 rounded-sm px-3 py-2 text-amber-300 font-mono text-[17px] focus:border-amber-500 outline-none transition-all placeholder:text-amber-900/50"
          />
          <CyberButton variant="ghost" themeMode={themeMode} onClick={onSetDuressPin} className="shrink-0 !px-3 !text-amber-400">
            {duressEnabled ? "Update" : "Set"}
          </CyberButton>
        </div>
        {duressStatus && <p className="font-mono text-[17px] text-amber-400/70 mt-1">{duressStatus}</p>}
      </CollapsibleSection>
      </ProLockOverlay>

      {/* Self-Destruct */}
      <ProLockOverlay locked={!isPro} label="Pro — Self-Destruct">
      <CollapsibleSection id="selfdestruct" icon={<Trash2 size={13} className="text-red-400" />} label="Self-Destruct" labelClass="text-red-400/80" borderClass="border-red-900/30" open={openSections.has("selfdestruct")} onToggle={toggle}>
        <div className="border border-red-900/30 rounded-sm p-3 bg-red-950/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[17px] text-red-400 uppercase tracking-widest flex items-center gap-1.5">
              <Shield size={12} /> Enable
            </span>
            <button
              onClick={async () => {
                const newValue = !selfDestructEnabled;
                setSelfDestructEnabled(newValue);
                if (!newValue) {
                  // Toggling OFF — save immediately to backend
                  setSelfDestructConfirm("");
                  try {
                    await tauri.updateSecurityConfig(undefined, undefined, false, undefined);
                    setSelfDestructStatus("Self-destruct disabled");
                  } catch {
                    setSelfDestructStatus("Failed to disable self-destruct");
                  }
                } else {
                  setSelfDestructStatus("");
                }
              }}
              className={`w-10 h-5 rounded-full transition-all relative ${
                selfDestructEnabled ? "bg-red-600 shadow-[0_0_10px_rgba(255,0,0,0.4)]" : "bg-[var(--color-cyber-border)]"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${selfDestructEnabled ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
          <AnimatePresence>
            {selfDestructEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <div className="flex items-start gap-2 p-2 rounded-sm bg-red-950/40 border border-red-800/40">
                  <Shield size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="font-mono text-[17px] text-red-300 leading-relaxed">
                    Vault and ALL files permanently deleted after too many failed PIN attempts.
                  </p>
                </div>
                <div>
                  <label className="font-mono text-[17px] text-red-400/70 uppercase tracking-widest mb-1 block">Failed Attempt Threshold</label>
                  <select
                    value={selfDestructThreshold}
                    onChange={(e: any) => setSelfDestructThreshold(Number(e.target.value))}
                    className="w-full bg-[var(--color-cyber-black)] border border-red-900/50 rounded-sm px-3 py-2 text-red-300 font-mono text-[17px] focus:border-red-500 outline-none transition-all"
                  >
                    {[3, 5, 7, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>{n} failed attempts</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-[17px] text-red-400/70 uppercase tracking-widest mb-1 block">Type "I understand" to confirm</label>
                  <input
                    type="text"
                    value={selfDestructConfirm}
                    onChange={(e: any) => setSelfDestructConfirm(e.target.value)}
                    placeholder='Type "I understand"'
                    className={`w-full bg-[var(--color-cyber-black)] border rounded-sm px-3 py-2 font-mono text-[17px] outline-none transition-all placeholder:text-red-900/50 ${
                      selfDestructConfirm === "I understand" ? "border-red-500 text-red-300 shadow-[0_0_10px_rgba(255,0,0,0.2)]" : "border-red-900/50 text-red-400/70"
                    }`}
                  />
                </div>
                <CyberButton
                  variant="ghost"
                  themeMode={themeMode}
                  disabled={selfDestructConfirm !== "I understand"}
                  onClick={async () => {
                    try {
                      await tauri.updateSecurityConfig(undefined, undefined, selfDestructEnabled, selfDestructThreshold);
                      setSelfDestructStatus("Self-destruct configured");
                      setSelfDestructConfirm("");
                    } catch {
                      setSelfDestructStatus("Failed to save self-destruct settings");
                      setSelfDestructConfirm("");
                    }
                  }}
                  className="w-full !text-red-400"
                >
                  Save Self-Destruct Settings
                </CyberButton>
                {selfDestructStatus && <p className="font-mono text-[17px] text-red-400/70">{selfDestructStatus}</p>}
              </motion.div>
            )}
          </AnimatePresence>
          {!selfDestructEnabled && selfDestructStatus && <p className="font-mono text-[17px] text-red-400/70 mt-2">{selfDestructStatus}</p>}
        </div>
      </CollapsibleSection>
      </ProLockOverlay>

      {/* Wipe Vault */}
      <CollapsibleSection id="wipevault" icon={<AlertTriangle size={13} className="text-red-400" />} label="Wipe All Files" labelClass="text-red-400/80" borderClass="border-red-900/30" open={openSections.has("wipevault")} onToggle={toggle}>
        <div className="border border-red-900/30 rounded-sm p-3 bg-red-950/20 space-y-3">
          <div className="flex items-start gap-2 p-2 rounded-sm bg-red-950/40 border border-red-800/40">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="font-mono text-[17px] text-red-300 leading-relaxed">
              Permanently delete ALL files from this vault — visible, hidden, and trashed. This cannot be undone.
            </p>
          </div>
          <div>
            <label className="font-mono text-[17px] text-red-400/70 uppercase tracking-widest mb-1 block">
              Type "WIPE" to confirm
            </label>
            <input
              type="text"
              value={wipeConfirm}
              onChange={(e: any) => setWipeConfirm(e.target.value)}
              placeholder="WIPE"
              className="w-full bg-[var(--color-cyber-black)] border border-red-900/50 rounded-sm px-3 py-2 text-red-300 font-mono text-[17px] focus:border-red-500 outline-none transition-all placeholder:text-red-900/50"
            />
          </div>
          <CyberButton
            variant="ghost"
            themeMode={themeMode}
            disabled={wipeConfirm !== "WIPE" || wiping}
            onClick={async () => {
              setWiping(true);
              setWipeStatus("");
              try {
                const count = await tauri.wipeVault();
                setWipeStatus(`Wiped ${count} files from vault`);
                setWipeConfirm("");
                onWipeComplete?.();
              } catch (e: any) {
                setWipeStatus(`Failed: ${e}`);
              } finally {
                setWiping(false);
              }
            }}
            className="w-full !text-red-400"
          >
            {wiping ? "Wiping..." : "Wipe All Files"}
          </CyberButton>
          {wipeStatus && <p className="font-mono text-[17px] text-red-400/70">{wipeStatus}</p>}
        </div>
      </CollapsibleSection>

      {/* Backup & Restore */}
      <CollapsibleSection id="backup" icon={<Download size={13} className="text-[var(--color-neon-primary)]" />} label="Backup & Restore" open={openSections.has("backup")} onToggle={toggle}>
        <div className="flex gap-2">
          <CyberButton variant="ghost" themeMode={themeMode} onClick={onBackupVault} disabled={backupInProgress} className="flex-1 !justify-center">
            <Download size={14} />
            {backupInProgress ? "Backing up..." : "Backup"}
          </CyberButton>
          <CyberButton variant="ghost" themeMode={themeMode} onClick={onRestoreVault} disabled={restoreInProgress} className="flex-1 !justify-center">
            <Upload size={14} />
            {restoreInProgress ? "Restoring..." : "Restore"}
          </CyberButton>
        </div>
      </CollapsibleSection>

      {/* Vault Location */}
      <ProLockOverlay locked={!isPro} label="Pro — Vault Location">
      <CollapsibleSection id="location" icon={<FolderOpen size={13} className="text-[var(--color-neon-primary)]" />} label="Vault Location" open={openSections.has("location")} onToggle={toggle}>
        <div className="p-3 rounded-sm bg-[var(--color-cyber-black)]/30 border border-[var(--color-cyber-border)]/30 space-y-3">
          <div>
            <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block">Current Path</label>
            <div className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[var(--color-neon-bright)] font-mono text-[17px] truncate select-all">
              {vaultPath || "Loading..."}
            </div>
          </div>
          <CyberButton
            variant="ghost"
            themeMode={themeMode}
            disabled={transferring}
            onClick={async () => {
              try {
                const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
                const selected = await openDialog({ directory: true, multiple: false, title: "Select New Vault Location" }) as string | null;
                if (selected) {
                  setTransferring(true);
                  try {
                    const newPath = await tauri.transferVault(selected);
                    setVaultPath(newPath);
                    alert("Vault transferred successfully!");
                  } catch (e: any) {
                    alert(`Transfer failed: ${e}`);
                  } finally {
                    setTransferring(false);
                  }
                }
              } catch {
                alert("Could not open directory picker");
              }
            }}
            className="w-full !justify-center"
          >
            <FolderOpen size={14} />
            {transferring ? "Transferring..." : "Transfer Vault"}
          </CyberButton>
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">Move all vault data to a different directory.</p>
        </div>
      </CollapsibleSection>
      </ProLockOverlay>

      {/* Watch Folder (auto-import) */}
      <CollapsibleSection id="watchfolder" icon={<FolderOpen size={13} className="text-[var(--color-neon-primary)]" />} label="Watch Folder (Auto-Import)" open={openSections.has("watchfolder")} onToggle={toggle}>
        <div className="p-3 rounded-sm bg-[var(--color-cyber-black)]/30 border border-[var(--color-cyber-border)]/30 space-y-3">
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
            Pick a folder and CyberVault will automatically import any photos, videos, and audio you put there — encrypting them into the vault within a few seconds. The original files are left untouched.
          </p>
          <div>
            <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block">Current Watch Folder</label>
            <div className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[17px] truncate select-all font-mono"
              style={{ color: watchFolder ? "var(--color-neon-bright)" : "var(--color-cyber-muted)" }}>
              {watchFolder || "None — auto-import is off"}
            </div>
          </div>
          <div className="flex gap-2">
            <CyberButton
              variant="ghost"
              themeMode={themeMode}
              onClick={async () => {
                try {
                  const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
                  const selected = await openDialog({ directory: true, multiple: false, title: "Select Folder to Auto-Import From" }) as string | null;
                  if (selected) {
                    try {
                      await tauri.setWatchFolder(selected);
                      setWatchFolder(selected);
                    } catch (e: any) {
                      alert(`Could not set watch folder: ${e}`);
                    }
                  }
                } catch {
                  alert("Could not open directory picker");
                }
              }}
              className="flex-1 !justify-center"
            >
              <FolderOpen size={14} />
              {watchFolder ? "Change Folder" : "Choose Folder"}
            </CyberButton>
            {watchFolder && (
              <CyberButton
                variant="danger"
                themeMode={themeMode}
                onClick={async () => {
                  try {
                    await tauri.setWatchFolder(null);
                    setWatchFolder(null);
                  } catch (e: any) {
                    alert(`Could not turn off watch folder: ${e}`);
                  }
                }}
                className="!justify-center"
              >
                Turn Off
              </CyberButton>
            )}
          </div>
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
            Tip: point this at your phone-sync folder (e.g. a OneDrive camera-roll folder) and new photos get vaulted automatically. Runs quietly in the background — it won't slow the app down.
          </p>
        </div>
      </CollapsibleSection>

      {/* Stealth Mode */}
      <ProLockOverlay locked={!isPro} label="Pro — Stealth Mode">
      <CollapsibleSection id="stealth" icon={<Lock size={13} className="text-[var(--color-neon-primary)]" />} label="Stealth Mode" open={openSections.has("stealth")} onToggle={toggle}>
        <div className="p-3 rounded-sm bg-[var(--color-cyber-black)]/30 border border-[var(--color-cyber-border)]/30 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
              <Lock size={14} className="text-[var(--color-neon-primary)] shrink-0" />
              <span className="break-words">Enable Stealth Mode</span>
            </span>
            <button
              onClick={() => onStealthModeChange?.(!stealthMode)}
              className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                stealthMode ? "bg-[var(--color-neon-primary)] shadow-[0_0_10px_var(--color-neon-glow)]" : "bg-[var(--color-cyber-border)]"
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${stealthMode ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
            When enabled, shows a snake game instead of the login screen. Type your vault PIN + Enter to reveal the real login.
          </p>
          {stealthMode && (
            <div className="pt-2 border-t border-[var(--color-cyber-border)]/30">
              <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1.5 block">
                PIN Hint
              </label>
              <input
                type="text"
                value={stealthHint ?? ""}
                onChange={(e) => onStealthHintChange?.(e.target.value)}
                placeholder="A subtle reminder only you'd understand..."
                maxLength={60}
                className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[var(--color-cyber-text)] font-mono text-[17px] focus:border-[var(--color-neon-primary)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/50"
              />
              <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-1">
                Shown in the snake game corner at tiny size. After 10 wrong attempts, you'll bypass to the vault screen.
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>
      </ProLockOverlay>

      {/* Advanced */}
      <ProLockOverlay locked={!isPro} label="Pro — Advanced Settings">
      <CollapsibleSection id="advanced" icon={<AlertTriangle size={13} className="text-amber-400" />} label="Advanced" labelClass="text-amber-400/80" borderClass="border-amber-500/40" open={openSections.has("advanced")} onToggle={toggle}>
        <div className="p-3 rounded-sm bg-amber-500/5 border border-amber-500/20 space-y-4">
          <p className="font-mono text-[17px] text-amber-400/60 uppercase tracking-wider">Fine-tune how thumbnails and imports behave</p>

          {/* Thumbnail resolution slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5">
                <Image size={14} className="text-amber-400 shrink-0" />
                Thumbnail resolution
              </span>
              <span className="font-mono text-[17px] text-amber-400 font-semibold">{thumbResolution ?? 256}px</span>
            </div>
            <input
              type="range"
              min="64"
              max="512"
              step="64"
              value={thumbResolution ?? 256}
              onChange={(e) => onThumbResolutionChange?.(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-cyber-border)] rounded-full appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[17px] text-[var(--color-cyber-muted)]">
              <span>64px</span>
              <span>512px</span>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50">Controls the image quality of video thumbnails. Higher = sharper but uses more memory. Does not change the grid card size. <span className="text-amber-400 font-semibold">Default: 256px</span></p>
          </div>

          {/* Bypass chunk upload limits */}
          <div className="space-y-1 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Fast import mode</span>
              </span>
              <button
                onClick={() => {
                  const next = !bypassChunkLimits;
                  setBypassChunkLimits(next);
                  onBypassChunkLimitsChange?.(next);
                }}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  bypassChunkLimits ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${bypassChunkLimits ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Imports files as fast as possible with no throttling. <span className="text-amber-400">OFF:</span> Throttles large imports to prevent timeouts.</p>
          </div>

          {/* Bypass thumbnail cooldown */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Fast thumbnail loading</span>
              </span>
              <button
                onClick={() => {
                  const next = !bypassThumbnailCache;
                  setBypassThumbnailCache(next);
                  onBypassThumbnailCacheChange?.(next);
                }}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  bypassThumbnailCache ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${bypassThumbnailCache ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Generates thumbnails immediately with no delay between batches. <span className="text-amber-400">OFF:</span> Waits between batches to reduce CPU usage.</p>
          </div>

          {/* Cache all thumbnails */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <Image size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Keep all thumbnails in memory</span>
              </span>
              <button
                onClick={() => {
                  const next = !cacheAllThumbnails;
                  onCacheAllThumbnailsChange?.(next);
                }}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  cacheAllThumbnails ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cacheAllThumbnails ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Never removes thumbnails from memory — all images stay loaded as you scroll. Uses more RAM. <span className="text-amber-400">OFF:</span> Old thumbnails are removed when you have too many loaded.</p>
          </div>

          {/* Pre-cache all thumbnails to disk */}
          <div className="space-y-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <Image size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Pre-cache all thumbnails</span>
              </span>
              {precacheProgress?.running ? (
                <CyberButton variant="ghost" themeMode={themeMode} onClick={() => onCancelPrecache?.()} className="shrink-0 !px-3 !text-amber-400">
                  Stop
                </CyberButton>
              ) : (
                <CyberButton variant="secondary" themeMode={themeMode} onClick={() => onPrecacheThumbnails?.()} className="shrink-0 !px-3">
                  Build cache
                </CyberButton>
              )}
            </div>
            {precacheProgress && (precacheProgress.running || precacheProgress.done > 0) && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-[var(--color-cyber-border)] overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${precacheProgress.total ? Math.round((precacheProgress.done / precacheProgress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="font-mono text-[15px] text-amber-300/60 text-right">
                  {precacheProgress.done} / {precacheProgress.total}
                  {precacheProgress.running ? " — caching…" : " — done"}
                </p>
              </div>
            )}
            <p className="font-mono text-[17px] text-amber-300/50 pl-6">
              Slowly walks every image and video and saves its thumbnail to disk in the background. Once cached, viewing them next time is instant — no decryption needed. Safe to keep using the app while it runs.
            </p>
          </div>

          {/* Max in-memory thumbnails slider */}
          <div className="space-y-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5">
                <Image size={14} className="text-amber-400 shrink-0" />
                Max thumbnails in memory
              </span>
              <span className="font-mono text-[17px] text-amber-400 font-semibold">{maxThumbnails ?? 200}</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="50"
              value={maxThumbnails ?? 200}
              onChange={(e) => onMaxThumbnailsChange?.(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-cyber-border)] rounded-full appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[17px] text-[var(--color-cyber-muted)]">
              <span>50</span>
              <span>1000</span>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50">How many thumbnails to keep loaded at once. When this limit is reached, the oldest ones are removed first. <span className="text-amber-400 font-semibold">Default: 200</span></p>
          </div>

          {/* Cooldown between batches slider */}
          <div className="space-y-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5">
                <Clock size={14} className="text-amber-400 shrink-0" />
                Thumbnail loading delay
              </span>
              <span className="font-mono text-[17px] text-amber-400 font-semibold">{((cooldownMs ?? 5000) / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="10000"
              step="500"
              value={cooldownMs ?? 5000}
              onChange={(e) => onCooldownMsChange?.(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-cyber-border)] rounded-full appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[17px] text-[var(--color-cyber-muted)]">
              <span>0s</span>
              <span>10s</span>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50">Wait time between loading batches of thumbnails. Lower = thumbnails appear faster but uses more CPU. <span className="text-amber-400 font-semibold">Default: 5s</span></p>
          </div>

          {/* Fullscreen unloading toggle */}
          <div className="space-y-1 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <Image size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Unload thumbnails in fullscreen</span>
              </span>
              <button
                onClick={() => onFullscreenUnloadChange?.(!fullscreenUnload)}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  fullscreenUnload ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${fullscreenUnload ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Frees memory by removing old thumbnails while you browse in fullscreen. <span className="text-amber-400">OFF:</span> Keeps all thumbnails loaded even in fullscreen mode.</p>
          </div>

          {/* Clear video cache on lock toggle */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <Trash2 size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Wipe video thumbnails on lock</span>
              </span>
              <button
                onClick={() => onClearVideoCacheOnLockChange?.(!clearVideoCacheOnLock)}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  clearVideoCacheOnLock ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${clearVideoCacheOnLock ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Deletes saved video thumbnails when the vault locks for security. <span className="text-amber-400">OFF:</span> Keeps video thumbnails saved so they load instantly next time.</p>
          </div>

          {/* Memory amber threshold slider */}
          <div className="space-y-2 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5">
                <Cpu size={14} className="text-amber-400 shrink-0" />
                Memory warning threshold
              </span>
              <span className="font-mono text-[17px] text-amber-400 font-semibold">{memoryAmberPercent ?? 1.5}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={memoryAmberPercent ?? 1.5}
              onChange={(e) => onMemoryAmberPercentChange?.(Number(e.target.value))}
              className="w-full h-1.5 bg-[var(--color-cyber-border)] rounded-full appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between font-mono text-[17px] text-[var(--color-cyber-muted)]">
              <span>0.5%</span>
              <span>10%</span>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50">
              When the app's memory usage goes above this %, thumbnails are automatically cleared to free RAM. <span className="text-amber-400 font-semibold">Default: 1.5%</span>
            </p>
          </div>

          {/* Disable file cache eviction */}
          <div className="space-y-1 pt-2 border-t border-amber-500/20">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[17px] text-[var(--color-cyber-text)] flex items-center gap-1.5 min-w-0">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="break-words">Disable file cache eviction</span>
              </span>
              <button
                onClick={() => onDisableFileEvictionChange?.(!disableFileEviction)}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  disableFileEviction ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-[var(--color-cyber-border)]"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${disableFileEviction ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="font-mono text-[17px] text-amber-300/50 pl-6"><span className="text-amber-400">ON:</span> Never evicts decrypted files or index entries from the session cache — all opened files stay in memory until the vault locks. Uses more RAM. <span className="text-amber-400">OFF:</span> Oldest cached files are automatically removed when the cache is full (LRU eviction).</p>
          </div>
        </div>
      </CollapsibleSection>
      </ProLockOverlay>
    </>
  );
}

export default function SettingsPanel({ open, onClose, theme, onThemeChange, customBackground, onBackgroundChange, backgroundOpacity = 40, onBackgroundOpacityChange, backgroundFit = "cover", onBackgroundFitChange, backgroundScale = 100, onBackgroundScaleChange, backgroundOffsetX = 0, onBackgroundOffsetXChange, backgroundOffsetY = 0, onBackgroundOffsetYChange, backgroundIsVideo = false, onBackgroundIsVideoChange, vaultSizeInfo, themeMode = "cyberpunk", onBackupVault, onRestoreVault, backupInProgress, restoreInProgress, bypassChunkLimits: bypassChunkLimitsProp, onBypassChunkLimitsChange, bypassThumbnailCache: bypassThumbnailCacheProp, onBypassThumbnailCacheChange, cacheAllThumbnails, onCacheAllThumbnailsChange, onPrecacheThumbnails, onCancelPrecache, precacheProgress, maxThumbnails = 200, onMaxThumbnailsChange, cooldownMs = 5000, onCooldownMsChange, fullscreenUnload = true, onFullscreenUnloadChange, clearVideoCacheOnLock = true, onClearVideoCacheOnLockChange, thumbResolution = 256, onThumbResolutionChange, vaultFiles, onVaultFileBackground, slideshowEnabled, onSlideshowEnabledChange, slideshowInterval = 30, onSlideshowIntervalChange, slideshowFileIds = [], onSlideshowFileIdsChange, slideshowShuffle, onSlideshowShuffleChange, memoryAmberPercent = 1.5, onMemoryAmberPercentChange, stealthMode, onStealthModeChange, stealthHint, onStealthHintChange, disableFileEviction, onDisableFileEvictionChange, onWipeComplete, isPro = false, licenseKey, licenseEmail, licenseLoading, licenseError, trialDaysLeft, onActivateLicense, onDeactivateLicense }: Props) {
  const tauri = useTauri();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [autoLockTimeout, setAutoLockTimeout] = useState(300);
  const [duressEnabled, setDuressEnabled] = useState(false);
  const [duressPin, setDuressPin] = useState("");
  const [duressStatus, setDuressStatus] = useState("");
  const [selfDestructEnabled, setSelfDestructEnabled] = useState(false);
  const [selfDestructThreshold, setSelfDestructThreshold] = useState(10);
  const [selfDestructConfirm, setSelfDestructConfirm] = useState("");
  const [selfDestructStatus, setSelfDestructStatus] = useState("");


  // Vault location state
  const [vaultPath, setVaultPath] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Watch-folder auto-import state
  const [watchFolder, setWatchFolder] = useState<string | null>(null);

  // Advanced experimental toggles — sync from parent props
  const [bypassChunkLimits, setBypassChunkLimits] = useState(bypassChunkLimitsProp ?? false);
  const [bypassThumbnailCache, setBypassThumbnailCache] = useState(bypassThumbnailCacheProp ?? false);
  useEffect(() => { setBypassChunkLimits(bypassChunkLimitsProp ?? false); }, [bypassChunkLimitsProp]);
  useEffect(() => { setBypassThumbnailCache(bypassThumbnailCacheProp ?? false); }, [bypassThumbnailCacheProp]);

  useEffect(() => {
    if (!open) return;
    tauri.updateSecurityConfig().then((config) => {
      setAutoLockTimeout(config.auto_lock_timeout_secs);
      setDuressEnabled(config.duress_enabled);
      if (config.self_destruct_enabled !== undefined) setSelfDestructEnabled(config.self_destruct_enabled);
      if (config.self_destruct_threshold !== undefined) setSelfDestructThreshold(config.self_destruct_threshold);
    }).catch(() => {});

    tauri.getVaultPath().then(setVaultPath).catch(() => {});
    tauri.getWatchFolder().then(setWatchFolder).catch(() => {});
  }, [open]);

  const handleAutoLockChange = async (value: number) => {
    setAutoLockTimeout(value);
    try { await tauri.updateSecurityConfig(value); } catch {}
  };

  const handleSetDuressPin = async () => {
    if (duressPin.length < 8) {
      setDuressStatus("Duress PIN must be at least 8 characters");
      return;
    }
    try {
      await tauri.setDuressPin(duressPin);
      setDuressStatus("Duress password configured");
      setDuressEnabled(true);
      setDuressPin("");
    } catch (e) {
      setDuressStatus(String(e));
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
            <div className="w-full max-w-lg bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border border-[var(--color-neon-dark)] rounded-sm shadow-[0_0_30px_var(--color-neon-glow)] overflow-hidden settings-flicker">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-cyber-border)]">
                <h2 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)] flex items-center gap-2">
                  <Settings2Icon />
                  System Settings
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

              {/* Tab Bar */}
              <div className="flex border-b border-[var(--color-cyber-border)]">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 font-display text-[17px] tracking-wider uppercase transition-all ${
                        activeTab === tab.id
                          ? "text-[var(--color-neon-bright)] border-b-2 border-[var(--color-neon-primary)] bg-[var(--color-neon-subtle)]"
                          : "text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)] hover:bg-white/5"
                      }`}
                    >
                      <Icon size={12} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

                {/* ===== APPEARANCE TAB ===== */}
                {activeTab === "appearance" && (
                  <>
                    {/* Theme */}
                    <div>
                      <h3 className="font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-3 flex items-center gap-2">
                        <Palette size={14} className="text-[var(--color-neon-primary)]" />
                        Theme
                      </h3>
                      {themes.map((t) => (
                        <div
                          key={t.id}
                          className={`p-3 rounded-md border text-left relative border-current ${t.accent} bg-white/5`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full ${t.color} ${t.accent}`} />
                            <span className="font-display text-[17px] tracking-wider uppercase neon-gradient-text">
                              {t.label}
                            </span>
                          </div>
                          <p className="font-mono text-[15px] text-[var(--color-cyber-muted)] mt-2">
                            Animated neon — black, pink &amp; yellow with glowing text and effects.
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Custom Background */}
                    <div>
                      <h3 className="font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-3 flex items-center gap-2">
                        <Image size={14} className="text-[var(--color-neon-primary)]" />
                        Custom Background
                      </h3>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-4 py-2.5 text-[17px] font-mono truncate">
                          {customBackground ? (
                            <span className="text-[var(--color-neon-bright)]">
                              {backgroundIsVideo ? "🎬 " : ""}{customBackground.split(/[\\/]/).pop()}
                            </span>
                          ) : (
                            <span className="text-[var(--color-cyber-muted)]/50">No custom background</span>
                          )}
                        </div>
                        <CyberButton
                          variant="ghost"
                          themeMode={themeMode}
                          onClick={async () => {
                            try {
                              const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
                              const { convertFileSrc } = await import("@tauri-apps/api/core");
                              const selected = await openDialog({
                                multiple: false,
                                title: "Select Background Image or Video",
                                filters: [
                                  { name: "Media", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"] },
                                ],
                              }) as string | null;
                              if (selected) {
                                const ext = selected.split(".").pop()?.toLowerCase() || "";
                                const isVideo = ["mp4", "webm", "mov"].includes(ext);
                                onBackgroundIsVideoChange?.(isVideo);
                                onBackgroundChange(convertFileSrc(selected));
                              }
                            } catch {
                              onBackgroundChange(null);
                              onBackgroundIsVideoChange?.(false);
                            }
                          }}
                          className="shrink-0 !px-3"
                          title="From file system"
                        >
                          <Image size={14} />
                        </CyberButton>
                        {customBackground && (
                          <CyberButton
                            variant="ghost"
                            themeMode={themeMode}
                            onClick={() => { onBackgroundChange(null); onBackgroundIsVideoChange?.(false); }}
                            className="shrink-0 !px-3 hover:!text-red-500"
                          >
                            <X size={14} />
                          </CyberButton>
                        )}
                      </div>

                      {/* Slideshow Mode */}
                      {(vaultFiles || []).filter((f) => ["Images", "Videos"].includes(f.category)).length > 1 && (
                        <ProLockOverlay locked={!isPro} label="Pro — Slideshow">
                        <SlideshowControls
                          vaultFiles={(vaultFiles || []).filter((f) => ["Images", "Videos"].includes(f.category))}
                          slideshowEnabled={slideshowEnabled || false}
                          onSlideshowEnabledChange={onSlideshowEnabledChange}
                          slideshowInterval={slideshowInterval}
                          onSlideshowIntervalChange={onSlideshowIntervalChange}
                          slideshowFileIds={slideshowFileIds}
                          onSlideshowFileIdsChange={onSlideshowFileIdsChange}
                          slideshowShuffle={slideshowShuffle}
                          onSlideshowShuffleChange={onSlideshowShuffleChange}
                          themeMode={themeMode}
                        />
                        </ProLockOverlay>
                      )}

                      {/* Background controls (shown when background or slideshow is set) */}
                      {(customBackground || slideshowEnabled) && (
                        <div className="mt-3 space-y-3">
                          {/* Opacity */}
                          {onBackgroundOpacityChange && (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Opacity</span>
                              <input type="range" min="10" max="100" step="5" value={backgroundOpacity}
                                onChange={(e) => onBackgroundOpacityChange(Number(e.target.value))}
                                className="flex-1 h-1 appearance-none bg-[var(--color-cyber-border)] rounded-full cursor-pointer accent-[var(--color-neon-primary)]" />
                              <span className="font-mono text-[17px] text-[var(--color-neon-bright)] w-8 text-right">{backgroundOpacity}%</span>
                            </div>
                          )}

                          {/* Fit / Position */}
                          {onBackgroundFitChange && (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Fit</span>
                              <select value={backgroundFit} onChange={(e) => onBackgroundFitChange(e.target.value)}
                                className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-2 py-1.5 text-[var(--color-cyber-text)] font-mono text-[17px] focus:border-[var(--color-neon-primary)] outline-none">
                                <option value="cover">Cover</option>
                                <option value="contain">Contain</option>
                              </select>
                            </div>
                          )}

                          {/* Scale */}
                          {onBackgroundScaleChange && (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Scale</span>
                              <input type="range" min="50" max="200" step="5" value={backgroundScale}
                                onChange={(e) => onBackgroundScaleChange(Number(e.target.value))}
                                className="flex-1 h-1 appearance-none bg-[var(--color-cyber-border)] rounded-full cursor-pointer accent-[var(--color-neon-primary)]" />
                              <span className="font-mono text-[17px] text-[var(--color-neon-bright)] w-8 text-right">{backgroundScale}%</span>
                            </div>
                          )}

                          {/* X Offset */}
                          {onBackgroundOffsetXChange && (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">X Offset</span>
                              <input type="range" min="-50" max="50" step="1" value={backgroundOffsetX}
                                onChange={(e) => onBackgroundOffsetXChange(Number(e.target.value))}
                                className="flex-1 h-1 appearance-none bg-[var(--color-cyber-border)] rounded-full cursor-pointer accent-[var(--color-neon-primary)]" />
                              <span className="font-mono text-[17px] text-[var(--color-neon-bright)] w-8 text-right">{backgroundOffsetX}</span>
                            </div>
                          )}

                          {/* Y Offset */}
                          {onBackgroundOffsetYChange && (
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider shrink-0 w-14">Y Offset</span>
                              <input type="range" min="-50" max="50" step="1" value={backgroundOffsetY}
                                onChange={(e) => onBackgroundOffsetYChange(Number(e.target.value))}
                                className="flex-1 h-1 appearance-none bg-[var(--color-cyber-border)] rounded-full cursor-pointer accent-[var(--color-neon-primary)]" />
                              <span className="font-mono text-[17px] text-[var(--color-neon-bright)] w-8 text-right">{backgroundOffsetY}</span>
                            </div>
                          )}

                          {/* Reset button */}
                          {(backgroundScale !== 100 || backgroundOffsetX !== 0 || backgroundOffsetY !== 0 || backgroundFit !== (slideshowEnabled ? "contain" : "cover")) && (
                            <button
                              onClick={() => {
                                onBackgroundFitChange?.(slideshowEnabled ? "contain" : "cover");
                                onBackgroundScaleChange?.(100);
                                onBackgroundOffsetXChange?.(0);
                                onBackgroundOffsetYChange?.(0);
                              }}
                              className="font-mono text-[17px] text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors underline"
                            >
                              Reset to defaults
                            </button>
                          )}
                        </div>
                      )}

                      <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-1.5">
                        {customBackground
                          ? `${backgroundIsVideo ? "Video" : "Image"} background at ${backgroundOpacity}% opacity`
                          : slideshowEnabled
                            ? `Slideshow at ${backgroundOpacity}% opacity`
                            : "Set a custom background image or video"}
                      </p>
                    </div>

                  </>
                )}

                {/* ===== TOOLS TAB ===== */}
                {activeTab === "tools" && (
                  <div className="mb-6">
                    <PhoneAccessCard tauri={tauri} />
                  </div>
                )}

                {activeTab === "tools" && (
                  <ToolsSections
                    isPro={isPro}
                    themeMode={themeMode}
                    autoLockTimeout={autoLockTimeout}
                    onAutoLockChange={handleAutoLockChange}
                    duressEnabled={duressEnabled}
                    duressPin={duressPin}
                    setDuressPin={setDuressPin}
                    duressStatus={duressStatus}
                    onSetDuressPin={handleSetDuressPin}
                    selfDestructEnabled={selfDestructEnabled}
                    setSelfDestructEnabled={setSelfDestructEnabled}
                    selfDestructThreshold={selfDestructThreshold}
                    setSelfDestructThreshold={setSelfDestructThreshold}
                    selfDestructConfirm={selfDestructConfirm}
                    setSelfDestructConfirm={setSelfDestructConfirm}
                    selfDestructStatus={selfDestructStatus}
                    tauri={tauri}
                    setSelfDestructStatus={setSelfDestructStatus}
                    onBackupVault={onBackupVault}
                    onRestoreVault={onRestoreVault}
                    backupInProgress={backupInProgress}
                    restoreInProgress={restoreInProgress}
                    vaultPath={vaultPath}
                    transferring={transferring}
                    setTransferring={setTransferring}
                    setVaultPath={setVaultPath}
                    watchFolder={watchFolder}
                    setWatchFolder={setWatchFolder}
                    bypassChunkLimits={bypassChunkLimits}
                    setBypassChunkLimits={setBypassChunkLimits}
                    onBypassChunkLimitsChange={onBypassChunkLimitsChange}
                    bypassThumbnailCache={bypassThumbnailCache}
                    setBypassThumbnailCache={setBypassThumbnailCache}
                    onBypassThumbnailCacheChange={onBypassThumbnailCacheChange}
                    cacheAllThumbnails={cacheAllThumbnails}
                    onCacheAllThumbnailsChange={onCacheAllThumbnailsChange}
                    onPrecacheThumbnails={onPrecacheThumbnails}
                    onCancelPrecache={onCancelPrecache}
                    precacheProgress={precacheProgress}
                    maxThumbnails={maxThumbnails}
                    onMaxThumbnailsChange={onMaxThumbnailsChange}
                    cooldownMs={cooldownMs}
                    onCooldownMsChange={onCooldownMsChange}
                    fullscreenUnload={fullscreenUnload}
                    onFullscreenUnloadChange={onFullscreenUnloadChange}
                    clearVideoCacheOnLock={clearVideoCacheOnLock}
                    onClearVideoCacheOnLockChange={onClearVideoCacheOnLockChange}
                    thumbResolution={thumbResolution}
                    onThumbResolutionChange={onThumbResolutionChange}
                    memoryAmberPercent={memoryAmberPercent}
                    onMemoryAmberPercentChange={onMemoryAmberPercentChange}
                    stealthMode={stealthMode}
                    onStealthModeChange={onStealthModeChange}
                    stealthHint={stealthHint}
                    onStealthHintChange={onStealthHintChange}
                    disableFileEviction={disableFileEviction}
                    onDisableFileEvictionChange={onDisableFileEvictionChange}
                    onWipeComplete={onWipeComplete}
                  />
                )}

                {/* ===== HELP / INFO TAB ===== */}
                {activeTab === "help" && (
                  <HelpInfoTab
                    vaultSizeInfo={vaultSizeInfo}
                    isPro={isPro}
                    licenseKey={licenseKey}
                    licenseEmail={licenseEmail}
                    licenseLoading={licenseLoading}
                    licenseError={licenseError}
                    trialDaysLeft={trialDaysLeft}
                    onActivateLicense={onActivateLicense}
                    onDeactivateLicense={onDeactivateLicense}
                    themeMode={themeMode}
                  />
                )}

              </div>

              <div className="p-4 border-t border-[var(--color-cyber-border)]">
                <CyberButton variant="secondary" themeMode={themeMode} onClick={onClose} className="w-full">
                  Close Settings
                </CyberButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Settings2Icon() {
  return <Info size={18} className="text-[var(--color-neon-primary)]" />;
}
