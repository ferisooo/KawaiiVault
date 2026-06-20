import { useMemo } from "react";

// Animated neon background: a drifting grid, floating gradient orbs, and large
// glowing neon words that flicker like a neon sign. Black · pink · yellow.
const WORDS = ["CYBERVAULT", "SECURE", "ENCRYPTED", "VAULT", "NEON", "PRIVATE", "0xFF2D95"];

interface BgWord {
  text: string;
  top: string;
  left: string;
  size: string;
  delay: string;
  duration: string;
  solid: boolean;
}

export default function NeonBackground() {
  const words = useMemo<BgWord[]>(() => {
    const out: BgWord[] = [];
    for (let i = 0; i < 7; i++) {
      out.push({
        text: WORDS[i % WORDS.length],
        top: `${8 + ((i * 13) % 80)}%`,
        left: `${-5 + ((i * 29) % 70)}%`,
        size: `${5 + ((i * 3) % 9)}rem`,
        delay: `${(i * 1.7).toFixed(1)}s`,
        duration: `${12 + (i % 5) * 3}s`,
        solid: i % 3 === 0,
      });
    }
    return out;
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Neon grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,45,149,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,212,0,0.04) 1px, transparent 1px)`,
          backgroundSize: "46px 46px",
        }}
      />

      {/* Floating gradient orbs */}
      <div
        className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-50"
        style={{
          background: "radial-gradient(circle, rgba(255,45,149,0.35), transparent 65%)",
          animation: "neon-bg-drift 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -bottom-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full blur-[120px] opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(255,212,0,0.25), transparent 65%)",
          animation: "neon-bg-drift 22s ease-in-out infinite 3s",
        }}
      />

      {/* Glowing neon words */}
      <div className="neon-bg-text-layer">
        {words.map((w, i) => (
          <span
            key={i}
            className={`neon-bg-word${w.solid ? " solid" : ""}`}
            style={{
              top: w.top,
              left: w.left,
              fontSize: w.size,
              animationDelay: `${w.delay}, ${w.delay}`,
              animationDuration: `${w.duration}, 7s`,
            }}
          >
            {w.text}
          </span>
        ))}
      </div>

      {/* Vignette to keep content readable */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.72) 100%)" }}
      />
    </div>
  );
}
