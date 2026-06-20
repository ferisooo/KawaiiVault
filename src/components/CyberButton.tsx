import { useState, useRef } from "react";
import { motion } from "framer-motion";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  pulse?: boolean;
  themeMode?: ThemeMode;
}

interface Ripple { id: number; x: number; y: number; }

export default function CyberButton({
  children,
  variant = "secondary",
  size = "md",
  icon,
  pulse,
  themeMode = "cyberpunk",
  className = "",
  onClick,
  ...props
}: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";
  const isNeonTheme = themeMode === "neon";
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleIdRef = useRef(0);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = rippleIdRef.current++;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 700);
    onClick?.(e);
  };

  const radiusClass = isNeonTheme ? "rounded-md" : isBio ? "rounded-[6px]" : isCmd ? "rounded-[3px]" : isNeon ? "rounded-[2px]" : "rounded-sm";
  const transitionClass = isBio
    ? "transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
    : isCmd
      ? "transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
      : isNeon
        ? "transition-all duration-100 ease-[cubic-bezier(0.2,0,0.3,1)]"
        : "transition-all duration-200";

  // Icon-only buttons drop the label gap and use square padding so they stay
  // compact (keeps crowded toolbars from feeling cramped).
  const iconOnly = icon != null && (children == null || children === false || children === "");
  const baseClasses = `relative inline-flex items-center justify-center ${iconOnly ? "" : "gap-2"} font-display font-semibold uppercase tracking-wider overflow-hidden cursor-pointer select-none ${radiusClass} ${transitionClass}`;

  const sizeClasses = iconOnly
    ? { sm: "p-1.5 text-[17px]", md: "p-2 text-[17px]", lg: "p-3 text-[17px]" }
    : { sm: "px-3 py-1.5 text-[17px]", md: "px-4 py-2 text-[17px]", lg: "px-6 py-3 text-[17px]" };

  const getVariantClass = () => {
    if (isNeonTheme) {
      // Black · pink · yellow — animated gradients that pan continuously.
      const animGrad =
        "bg-[length:220%_220%] animate-[neon-gradient-pan_6s_ease_infinite]";
      return {
        primary:
          `${animGrad} bg-[linear-gradient(120deg,rgba(255,45,149,0.9),rgba(255,212,0,0.85),rgba(255,45,149,0.9))] border border-[var(--color-neon-bright)] text-[#1a0010] font-bold shadow-[0_0_12px_var(--color-neon-glow),0_0_28px_var(--color-neon-yellow-glow)]`,
        secondary:
          `${animGrad} bg-[linear-gradient(120deg,rgba(255,45,149,0.16),rgba(255,212,0,0.10),rgba(255,45,149,0.16))] border border-[var(--color-neon-dark)] text-[var(--color-neon-bright)] hover:border-[var(--color-neon-primary)] hover:shadow-[0_0_12px_var(--color-neon-glow),0_0_22px_var(--color-neon-yellow-glow)]`,
        danger:
          "bg-gradient-to-b from-[#ff2d95]/30 to-[#ff2d95]/10 border border-[#ff2d95]/70 text-[#ff63bf] hover:shadow-[0_0_14px_rgba(255,45,149,0.45)]",
        ghost:
          "bg-transparent border border-transparent text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-yellow-bright)] hover:border-[var(--color-neon-dark)]",
      };
    }
    if (isNeon) {
      return {
        primary:
          "bg-gradient-to-b from-[var(--color-neon-primary)]/15 to-[var(--color-neon-dark)]/8 border border-[var(--neon-cyan)]/60 text-[var(--color-neon-bright)] shadow-[0_0_10px_var(--color-neon-glow),0_0_25px_var(--color-neon-glow),0_0_50px_rgba(0,200,255,0.1)]",
        secondary:
          "bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-[var(--color-cyber-border)] text-[var(--color-neon-bright)] hover:border-[var(--neon-cyan)]/50 hover:shadow-[0_0_8px_var(--color-neon-glow)]",
        danger:
          "bg-gradient-to-b from-red-900/20 to-red-900/8 border border-[#ff4466]/50 text-[#ff4466] hover:border-[#ff4466]/80 hover:shadow-[0_0_12px_rgba(255,68,102,0.3)]",
        ghost:
          "bg-transparent border border-transparent text-[var(--color-cyber-muted)] hover:text-[var(--neon-cyan)] hover:border-[var(--color-cyber-border)]",
      };
    }
    if (isCmd) {
      return {
        primary:
          "bg-gradient-to-b from-[var(--color-neon-primary)]/10 to-[var(--color-neon-dark)]/5 border border-[var(--color-neon-primary)]/50 text-[var(--color-neon-bright)] shadow-[0_0_6px_var(--color-neon-glow),0_0_12px_var(--color-neon-glow)]",
        secondary:
          "bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-[var(--color-cyber-border)] text-[var(--color-neon-bright)] hover:border-[var(--color-neon-dark)]",
        danger:
          "bg-gradient-to-b from-red-900/15 to-red-900/5 border border-[#ef5350]/40 text-[#ef5350] hover:border-[#ef5350]/60 hover:shadow-[0_0_8px_rgba(239,83,80,0.15)]",
        ghost:
          "bg-transparent border border-transparent text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] hover:border-[var(--color-cyber-border)]/50",
      };
    }
    if (isBio) {
      return {
        primary:
          "bg-gradient-to-br from-[var(--color-neon-primary)]/12 to-[var(--color-neon-dark)]/6 border border-[var(--color-neon-primary)]/60 text-[var(--color-neon-bright)] shadow-[0_0_12px_var(--color-neon-glow),0_0_24px_var(--color-neon-glow)]",
        secondary:
          "bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-[var(--color-cyber-border)] text-[var(--color-neon-bright)] hover:border-[var(--color-neon-dark)]",
        danger:
          "bg-gradient-to-br from-amber-900/20 to-amber-900/5 border border-amber-800/60 text-amber-400 hover:border-amber-600 hover:shadow-[0_0_10px_rgba(255,171,64,0.2)]",
        ghost:
          "bg-transparent border border-transparent text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] hover:border-[var(--color-cyber-border)]/60",
      };
    }
    return {
      primary:
        "bg-gradient-to-b from-[var(--color-neon-primary)]/20 to-[var(--color-neon-dark)]/10 border border-[var(--color-neon-primary)] text-[var(--color-neon-bright)] shadow-[0_0_10px_var(--color-neon-glow),0_0_20px_var(--color-neon-glow)]",
      secondary:
        "bg-gradient-to-b from-white/5 to-white/[0.02] border border-[var(--color-cyber-border)] text-[var(--color-neon-bright)] hover:border-[var(--color-neon-dark)]",
      danger:
        "bg-gradient-to-b from-red-900/30 to-red-900/10 border border-red-800 text-red-400 hover:border-red-600 hover:shadow-[0_0_10px_rgba(255,0,0,0.3)]",
      ghost:
        "bg-transparent border border-transparent text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] hover:border-[var(--color-cyber-border)]",
    };
  };

  const variantClasses = getVariantClass();

  const pulseClass = pulse
    ? isBio
      ? "animate-[bio-breathe_4s_ease-in-out_infinite]"
      : isCmd
        ? "animate-[cmd-pulse_3s_ease-in-out_infinite]"
        : isNeon
          ? "animate-[pulse-glow_1.5s_ease-in-out_infinite]"
          : "animate-[pulse-glow_2s_ease-in-out_infinite]"
    : "";

  const hoverAnim = isNeonTheme ? { scale: 1.04, y: -2 } : isBio ? { scale: 1.01, y: -1 } : isCmd ? { scale: 1.01 } : isNeon ? { scale: 1.03, y: -2 } : { scale: 1.02, y: -1 };
  const tapAnim = isNeonTheme ? { scale: 0.94 } : isBio ? { scale: 0.98 } : isCmd ? { scale: 0.99 } : isNeon ? { scale: 0.95 } : { scale: 0.97 };
  const sweepDuration = isBio ? 0.7 : isNeon ? 0.35 : isNeonTheme ? 0.4 : 0.5;
  const sweepOpacity = isNeonTheme ? "via-[var(--color-neon-yellow-glow)]" : isBio ? "via-white/[0.03]" : isCmd ? "via-white/[0.04]" : isNeon ? "via-white/[0.07]" : "via-white/5";

  // Ripple color per theme
  const rippleColor = isNeonTheme
    ? "bg-[var(--color-neon-yellow-glow)]"
    : isBio
    ? "bg-[var(--color-neon-primary)]/25"
    : isCmd
      ? "bg-[var(--color-neon-primary)]/20"
      : isNeon
        ? "bg-[var(--neon-cyan)]/40"
        : "bg-[var(--color-neon-primary)]/30";

  return (
    <motion.button
      whileHover={hoverAnim}
      whileTap={tapAnim}
      onClick={handleClick}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${pulseClass} ${className}`}
      {...(props as any)}
    >
      {/* Sweep effect */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-r from-transparent ${sweepOpacity} to-transparent`}
        initial={{ x: "-100%" }}
        whileHover={{ x: "100%" }}
        transition={{ duration: sweepDuration, ease: "easeInOut" }}
      />

      {/* Click ripples */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className={`absolute pointer-events-none rounded-full ${rippleColor} animate-[ripple-expand_0.7s_ease-out_forwards]`}
          style={{ left: r.x - 12, top: r.y - 12, width: 24, height: 24 }}
        />
      ))}

      {/* Cyberpunk: sharp corner accents */}
      {themeMode === "cyberpunk" && (
        <>
          <span className="absolute top-0 left-0 w-2 h-[1px] bg-[var(--color-neon-primary)]" />
          <span className="absolute top-0 left-0 w-[1px] h-2 bg-[var(--color-neon-primary)]" />
          <span className="absolute bottom-0 right-0 w-2 h-[1px] bg-[var(--color-neon-primary)]" />
          <span className="absolute bottom-0 right-0 w-[1px] h-2 bg-[var(--color-neon-primary)]" />
        </>
      )}

      {/* Biotech: soft luminous top edge */}
      {isBio && (
        <span className="absolute top-0 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-[var(--color-neon-primary)]/30 to-transparent" />
      )}

      {/* Command: precise holographic top line */}
      {isCmd && (
        <span className="absolute top-0 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-transparent via-[var(--color-neon-primary)]/20 to-transparent" />
      )}

      {/* Neon City: bright neon edge glow — top and bottom */}
      {isNeon && (
        <>
          <span className="absolute top-0 left-[5%] right-[5%] h-[1px] bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/50 to-transparent" />
          <span className="absolute bottom-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-[var(--neon-cyan)]/30 to-transparent" />
        </>
      )}

      {icon && <span className="relative z-10">{icon}</span>}
      {children != null && children !== false && children !== "" && (
        <span className="relative z-10">{children}</span>
      )}
    </motion.button>
  );
}
