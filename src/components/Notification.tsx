import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  notification: { message: string; type: "success" | "error" | "warning" | "info" } | null;
  themeMode?: ThemeMode;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const cyberColors = {
  success: "border-green-600 text-green-400 shadow-[0_0_15px_rgba(0,255,0,0.2)]",
  error: "border-red-600 text-red-400 shadow-[0_0_15px_rgba(255,0,0,0.2)]",
  warning: "border-yellow-600 text-yellow-400 shadow-[0_0_15px_rgba(255,255,0,0.2)]",
  info: "border-[var(--color-neon-dark)] text-[var(--color-neon-bright)] shadow-[0_0_15px_var(--color-neon-glow)]",
};

const bioColors = {
  success: "border-emerald-600/60 text-emerald-400 shadow-[0_0_12px_rgba(0,230,118,0.2)]",
  error: "border-amber-700/60 text-[#ff8a65] shadow-[0_0_12px_rgba(255,138,101,0.15)]",
  warning: "border-amber-600/60 text-amber-400 shadow-[0_0_12px_rgba(255,171,64,0.15)]",
  info: "border-[var(--color-neon-dark)]/60 text-[var(--color-neon-bright)] shadow-[0_0_12px_var(--color-neon-glow)]",
};

const cmdColors = {
  success: "border-blue-500/40 text-blue-300 shadow-[0_0_8px_rgba(33,150,243,0.15)]",
  error: "border-[#ef5350]/40 text-[#ef5350] shadow-[0_0_8px_rgba(239,83,80,0.15)]",
  warning: "border-amber-500/40 text-amber-400 shadow-[0_0_8px_rgba(255,183,77,0.15)]",
  info: "border-[var(--color-neon-dark)]/40 text-[var(--color-neon-bright)] shadow-[0_0_8px_var(--color-neon-glow)]",
};

const neonColors = {
  success: "border-cyan-400/60 text-cyan-300 shadow-[0_0_15px_rgba(0,255,255,0.3),0_0_30px_rgba(0,200,255,0.15)]",
  error: "border-[#ff4466]/60 text-[#ff4466] shadow-[0_0_15px_rgba(255,68,102,0.3),0_0_30px_rgba(255,68,102,0.15)]",
  warning: "border-amber-400/60 text-amber-300 shadow-[0_0_15px_rgba(255,183,77,0.3),0_0_30px_rgba(255,183,77,0.15)]",
  info: "border-[var(--neon-cyan)]/60 text-[var(--color-neon-bright)] shadow-[0_0_15px_var(--color-neon-glow),0_0_30px_rgba(0,200,255,0.15)]",
};

export default function Notification({ notification, themeMode = "cyberpunk" }: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";
  const colorMap = isNeon ? neonColors : isCmd ? cmdColors : isBio ? bioColors : cyberColors;
  const radiusClass = isBio ? "rounded-[6px]" : isCmd ? "rounded-[3px]" : isNeon ? "rounded-[2px]" : "rounded-sm";

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, x: "-50%", scale: 0.9 }}
          animate={{ opacity: 1, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, x: "-50%", scale: 0.9 }}
          transition={isNeon
            ? { type: "spring", stiffness: 500, damping: 24 }
            : isCmd
              ? { type: "spring", stiffness: 300, damping: 28 }
              : isBio
                ? { type: "spring", stiffness: 200, damping: 25 }
                : { type: "spring", stiffness: 500, damping: 30 }
          }
          className={`fixed top-6 left-1/2 z-[100] px-6 py-3 bg-[var(--color-cyber-panel)]/95 border backdrop-blur-xl font-display text-[17px] tracking-wider uppercase ${radiusClass} ${colorMap[notification.type]}`}
          style={{ animation: isNeon ? "nc-tube-flicker 0.5s ease-out" : isCmd ? "hud-scan-pulse 0.4s ease-out" : isBio ? "bio-breathe 0.5s ease-out" : themeMode === "prismatic" ? "prism-pulse 0.5s ease-out" : themeMode === "solarcore" ? "solar-pulse 0.5s ease-out" : "neon-flicker 0.5s ease-out" }}
        >
          <div className="flex items-center gap-3">
            {(() => {
              const Icon = icons[notification.type];
              return <Icon size={16} />;
            })()}
            <span>{notification.message}</span>
          </div>
          {/* Energy line at bottom */}
          <motion.div
            className={`absolute bottom-0 left-0 h-[2px] bg-current ${isBio ? "rounded-b-[6px]" : isCmd ? "rounded-b-[3px]" : isNeon ? "rounded-b-[2px]" : ""}`}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 3, ease: "linear" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
