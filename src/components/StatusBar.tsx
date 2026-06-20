import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, HardDrive, Clock, Wifi } from "lucide-react";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  vaultName: string;
  fileCount: number;
  vaultSize?: number;
  themeMode?: ThemeMode;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ── Single flipping digit ──
function FlipDigit({ digit }: { digit: string }) {
  const prevDigitRef = useRef(digit);
  const [flipping, setFlipping] = useState(false);
  const [displayDigit, setDisplayDigit] = useState(digit);
  const [nextDigit, setNextDigit] = useState(digit);

  useEffect(() => {
    if (digit !== prevDigitRef.current) {
      setNextDigit(digit);
      setFlipping(true);
      const t = setTimeout(() => {
        setDisplayDigit(digit);
        setFlipping(false);
        prevDigitRef.current = digit;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [digit]);

  return (
    <span className="relative inline-block overflow-hidden" style={{ minWidth: "0.6em" }}>
      <AnimatePresence mode="popLayout">
        {flipping ? (
          <motion.span
            key={`next-${nextDigit}-${Date.now()}`}
            className="inline-block"
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ transformOrigin: "50% 0%", display: "inline-block" }}
          >
            {nextDigit}
          </motion.span>
        ) : (
          <motion.span
            key={`cur-${displayDigit}`}
            className="inline-block"
            initial={{ rotateX: 0, opacity: 1 }}
            animate={{ rotateX: 0, opacity: 1 }}
          >
            {displayDigit}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ── Flip clock time display ──
function FlipClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const parts = time.toLocaleTimeString().split("");
  return (
    <span style={{ display: "inline-flex" }}>
      {parts.map((ch, i) => (
        /\d/.test(ch) ? <FlipDigit key={i} digit={ch} /> : <span key={i}>{ch}</span>
      ))}
    </span>
  );
}

export default function StatusBar({ vaultName, fileCount, vaultSize, themeMode = "cyberpunk" }: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";

  const dotColor = "bg-[var(--color-neon-primary)]";
  const dotAnim = isNeon
    ? { opacity: [1, 0.3, 1, 0.5, 1], scale: [1, 1.2, 0.9, 1.1, 1] }
    : isCmd
      ? { opacity: [0.8, 1, 0.8] }
      : isBio
        ? { opacity: [0.6, 1, 0.6], scale: [0.9, 1.1, 0.9] }
        : { opacity: [1, 0.4, 1] };
  const dotDuration = isNeon ? 1.5 : isCmd ? 3 : isBio ? 4 : 2;
  const statusLabel = isNeon ? "Neon Link Active" : isCmd ? "Systems Nominal" : isBio ? "Network Online" : "System Active";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-4 px-3 py-1.5 bg-[var(--color-cyber-black)]/80 border-t border-[var(--color-cyber-border)] font-mono text-[17px] text-[var(--color-cyber-text)] tracking-wider uppercase status-bar-text"
    >
      <span className="flex items-center gap-1.5">
        <motion.span
          className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
          animate={dotAnim}
          transition={{ duration: dotDuration, repeat: Infinity, ease: "easeInOut" }}
          style={{ animation: "beacon 1.5s infinite" }}
        />
        <Wifi size={9} />
        {statusLabel}
      </span>
      <span className="w-[1px] h-3 bg-[var(--color-cyber-border)]" />
      <span className="flex items-center gap-1.5" style={{ animation: "pulse-dot 3s infinite" }}>
        <Shield size={9} className="text-[var(--color-neon-dark)]" />
        {vaultName}
      </span>
      <span className="w-[1px] h-3 bg-[var(--color-cyber-border)]" />
      <span className="flex items-center gap-1.5">
        <HardDrive size={9} />
        {fileCount} files{vaultSize ? ` · ${formatBytes(vaultSize)}` : ""}
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-1.5">
        <Clock size={9} />
        <FlipClock />
      </span>
    </motion.div>
  );
}
