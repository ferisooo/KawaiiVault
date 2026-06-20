import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  glow?: boolean;
  hud?: boolean;
  themeMode?: ThemeMode;
  className?: string;
}

export default function GlassPanel({
  children,
  glow,
  hud,
  themeMode = "cyberpunk",
  className = "",
  ...props
}: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";

  const baseClasses = isNeon
    ? `
      relative rounded-[2px]
      bg-gradient-to-b from-[#04091a]/96 to-[#010306]/99
      border border-[rgba(0,255,255,0.2)]
      backdrop-blur-[20px]
      ${glow ? "shadow-[0_0_12px_rgba(0,255,255,0.3),0_0_30px_rgba(0,200,255,0.15)] border-[rgba(0,255,255,0.5)]" : "shadow-[0_2px_25px_rgba(0,0,0,0.9)]"}
      ${hud ? "hud-bracket" : ""}
    `
    : isBio
    ? `
      relative rounded-[6px]
      bg-gradient-to-br from-[#0d1f10]/92 to-[#060d06]/96
      border border-[var(--color-cyber-border)]
      backdrop-blur-[16px]
      ${glow ? "shadow-[0_0_12px_var(--color-neon-glow),0_0_24px_var(--color-neon-glow)] border-[var(--color-neon-dark)]/60" : "shadow-[0_4px_30px_rgba(0,230,118,0.04)]"}
    `
    : isCmd
      ? `
      relative rounded-[3px]
      bg-gradient-to-b from-[#0a1628]/94 to-[#060b18]/97
      border border-[var(--color-cyber-border)]
      backdrop-blur-[12px]
      ${glow ? "shadow-[0_0_8px_var(--color-neon-glow),0_0_16px_var(--color-neon-glow)] border-[var(--color-neon-dark)]/50" : "shadow-[0_2px_20px_rgba(33,150,243,0.03)]"}
    `
      : `
      relative rounded-sm
      bg-gradient-to-br from-[var(--color-cyber-panel)]/95 to-[var(--color-cyber-black)]/98
      border border-[var(--color-cyber-border)]
      backdrop-blur-xl
      ${glow ? "shadow-[0_0_15px_var(--color-neon-glow)] border-[var(--color-neon-dark)]" : ""}
      ${hud ? "hud-bracket" : ""}
    `;

  const radiusClass = isBio ? "rounded-[6px]" : isCmd ? "rounded-[3px]" : isNeon ? "rounded-[2px]" : "rounded-sm";

  const borderAnim = glow
    ? isNeon ? "nc-neon-pulse 1.5s infinite" : isBio ? "bio-breathe 4s infinite" : isCmd ? "cmd-pulse 2s infinite" : themeMode === "prismatic" ? "prism-pulse 3s infinite" : themeMode === "solarcore" ? "solar-pulse 3s infinite" : "neon-glow-pulse 3s infinite"
    : undefined;

  return (
    <motion.div
      className={`${baseClasses} ${className}`}
      style={borderAnim ? { animation: borderAnim } : undefined}
      {...props}
    >
      {/* Top edge glow line */}
      <div
        className={`absolute top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent ${
          isNeon
            ? "left-[3%] right-[3%] via-[var(--neon-cyan)]/40"
            : isBio
              ? "left-[10%] right-[10%] via-[var(--color-neon-primary)]/25"
              : isCmd
                ? "left-[15%] right-[15%] via-[var(--color-neon-primary)]/15"
                : "left-4 right-4 via-[var(--color-neon-dark)]/50"
        }`}
      />

      {/* Texture overlay */}
      <div
        className={`absolute inset-0 carbon-texture pointer-events-none opacity-50 ${radiusClass}`}
      />

      {/* Biotech: faint inner radial light */}
      {isBio && (
        <div
          className="absolute inset-0 rounded-[6px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(0,230,118,0.03) 0%, transparent 60%)",
          }}
        />
      )}

      {/* Command: subtle holographic inner light */}
      {isCmd && (
        <div
          className="absolute inset-0 rounded-[3px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(33,150,243,0.02) 0%, transparent 60%)",
          }}
        />
      )}

      {/* Neon City: electric inner glow */}
      {isNeon && (
        <div
          className="absolute inset-0 rounded-[2px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(0,255,255,0.04) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(0,150,255,0.02) 0%, transparent 40%)",
          }}
        />
      )}

      {/* Cyberpunk: corner bracket draw-in */}
      {!isBio && !isCmd && !isNeon && (
        <>
          <motion.span className="absolute top-0 left-0 h-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 12 }}
            transition={{ duration: 0.3, delay: 0.1 }} />
          <motion.span className="absolute top-0 left-0 w-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 12 }}
            transition={{ duration: 0.3, delay: 0.1 }} />
          <motion.span className="absolute top-0 right-0 h-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 12 }}
            transition={{ duration: 0.3, delay: 0.15 }} style={{ right: 0 }} />
          <motion.span className="absolute top-0 right-0 w-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 12 }}
            transition={{ duration: 0.3, delay: 0.15 }} />
          <motion.span className="absolute bottom-0 left-0 h-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 12 }}
            transition={{ duration: 0.3, delay: 0.15 }} />
          <motion.span className="absolute bottom-0 left-0 w-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 12 }}
            transition={{ duration: 0.3, delay: 0.15 }} style={{ bottom: 0 }} />
          <motion.span className="absolute bottom-0 right-0 h-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 12 }}
            transition={{ duration: 0.3, delay: 0.2 }} />
          <motion.span className="absolute bottom-0 right-0 w-[1px] bg-[var(--color-neon-primary)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 12 }}
            transition={{ duration: 0.3, delay: 0.2 }} />
        </>
      )}
      {/* Command: precision corner ticks */}
      {isCmd && (
        <>
          <motion.span className="absolute top-0 left-0 h-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 8 }}
            transition={{ duration: 0.25, delay: 0.1 }} />
          <motion.span className="absolute top-0 left-0 w-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 8 }}
            transition={{ duration: 0.25, delay: 0.1 }} />
          <motion.span className="absolute top-0 right-0 h-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 8 }}
            transition={{ duration: 0.25, delay: 0.15 }} />
          <motion.span className="absolute top-0 right-0 w-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 8 }}
            transition={{ duration: 0.25, delay: 0.15 }} />
          <motion.span className="absolute bottom-0 left-0 h-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 8 }}
            transition={{ duration: 0.25, delay: 0.15 }} />
          <motion.span className="absolute bottom-0 left-0 w-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 8 }}
            transition={{ duration: 0.25, delay: 0.15 }} />
          <motion.span className="absolute bottom-0 right-0 h-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 8 }}
            transition={{ duration: 0.25, delay: 0.2 }} />
          <motion.span className="absolute bottom-0 right-0 w-[1px] bg-[var(--color-neon-primary)]/40 pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 8 }}
            transition={{ duration: 0.25, delay: 0.2 }} />
        </>
      )}

      {/* Neon City: bright glowing corner brackets */}
      {isNeon && (
        <>
          <motion.span className="absolute top-0 left-0 h-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 14 }}
            transition={{ duration: 0.15, delay: 0.05 }} />
          <motion.span className="absolute top-0 left-0 w-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 14 }}
            transition={{ duration: 0.15, delay: 0.05 }} />
          <motion.span className="absolute top-0 right-0 h-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 14 }}
            transition={{ duration: 0.15, delay: 0.08 }} />
          <motion.span className="absolute top-0 right-0 w-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 14 }}
            transition={{ duration: 0.15, delay: 0.08 }} />
          <motion.span className="absolute bottom-0 left-0 h-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 14 }}
            transition={{ duration: 0.15, delay: 0.08 }} />
          <motion.span className="absolute bottom-0 left-0 w-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 14 }}
            transition={{ duration: 0.15, delay: 0.08 }} />
          <motion.span className="absolute bottom-0 right-0 h-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ width: 0 }} animate={{ width: 14 }}
            transition={{ duration: 0.15, delay: 0.1 }} />
          <motion.span className="absolute bottom-0 right-0 w-[2px] bg-[var(--neon-cyan)] pointer-events-none"
            initial={{ height: 0 }} animate={{ height: 14 }}
            transition={{ duration: 0.15, delay: 0.1 }} />
        </>
      )}

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
