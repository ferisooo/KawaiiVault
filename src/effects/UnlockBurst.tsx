import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  active: boolean;
  themeMode?: ThemeMode;
}

// Radial burst particles on vault unlock
export default function UnlockBurst({ active, themeMode = "cyberpunk" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef(false);
  const isCrimson = themeMode === "cyberpunk";
  const isSolar = themeMode === "solarcore";
  const isNeonCity = themeMode === "neoncity";
  const isCommand = themeMode === "command";
  const isPrismatic = themeMode === "prismatic";
  const isBiotech = themeMode === "biotech";

  const color =
    themeMode === "biotech"   ? "0, 230, 118" :
    themeMode === "command"   ? "33, 150, 243" :
    themeMode === "prismatic" ? "34, 238, 255" :
    themeMode === "neoncity"  ? "0, 150, 255" :
    themeMode === "solarcore" ? "255, 180, 0" :
    themeMode === "kawaii"    ? "255, 95, 162" :
    "255, 26, 26";

  useEffect(() => {
    if (!active || playedRef.current) return;
    playedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    interface Particle {
      x: number; y: number;
      vx: number; vy: number;
      life: number; maxLife: number;
      size: number;
      r: number; g: number; b: number;
    }

    const particles: Particle[] = [];

    // Solar: particles rise gently from bottom; others: center burst
    const burstCount = isCrimson ? 100 : isSolar ? 80 : isNeonCity ? 90 : isCommand ? 60 : isPrismatic ? 100 : isBiotech ? 70 : 80;
    for (let i = 0; i < burstCount; i++) {
      if (isBiotech) {
        // Organism awakening: green bioluminescent particles drift outward from center, organic
        const angle = (i / 70) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 0.8 + Math.random() * 3; // slower, more organic
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0, // delayed
          maxLife: 0.8 + Math.random() * 0.2,
          size: 1.5 + Math.random() * 3.5,
          r: Math.floor(Math.random() * 40),       // 0-40
          g: 200 + Math.floor(Math.random() * 40),  // 200-240
          b: 100 + Math.floor(Math.random() * 60),  // 100-160
        });
      } else if (isPrismatic) {
        // Prism burst: rainbow particles explode from center, each a different color
        const PRISM_SPECTRUM: [number, number, number][] = [
          [255,51,85],[255,136,51],[255,204,34],[51,255,136],
          [34,238,255],[51,102,255],[153,68,255],[255,68,204],
        ];
        const angle = (i / burstCount) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 2 + Math.random() * 6;
        const [pr, pg, pb] = PRISM_SPECTRUM[i % PRISM_SPECTRUM.length];
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 0.7 + Math.random() * 0.3,
          size: 1.5 + Math.random() * 3,
          r: pr, g: pg, b: pb,
        });
      } else if (isCommand) {
        // Cold boot: radar ping contacts appear at random positions
        const pingAngle = Math.random() * Math.PI * 2;
        const dist = 0.15 + Math.random() * 0.35;
        particles.push({
          x: cx + Math.cos(pingAngle) * Math.max(canvas.width, canvas.height) * 0.45 * dist,
          y: cy + Math.sin(pingAngle) * Math.max(canvas.width, canvas.height) * 0.45 * dist,
          vx: (Math.random() - 0.5) * 0.3, // very slight drift
          vy: (Math.random() - 0.5) * 0.3,
          life: 0, // delayed activation
          maxLife: 0.8 + Math.random() * 0.2,
          size: 1 + Math.random() * 2,
          r: 33 + Math.floor(Math.random() * 67),  // 33-100
          g: 150 + Math.floor(Math.random() * 31),  // 150-181
          b: 243 + Math.floor(Math.random() * 10),   // 243-253
        });
      } else if (isSolar) {
        // Sunrise: golden particles float up from bottom edge
        const warmth = Math.random();
        particles.push({
          x: Math.random() * canvas.width,
          y: canvas.height + Math.random() * 30,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(0.5 + Math.random() * 2.5), // gentle upward
          life: 0, // activated by delay
          maxLife: 0.8 + Math.random() * 0.2,
          size: 1.5 + Math.random() * 3,
          r: Math.round(204 + warmth * 51), // amber to gold
          g: Math.round(136 + warmth * 80),
          b: Math.round(warmth * 58),
        });
      } else if (isNeonCity) {
        // City power-on: particles rise from bottom like neon lights flickering to life
        const hues = [185, 200, 270, 330]; // cyan, blue, violet, pink
        const hue = hues[Math.floor(Math.random() * hues.length)];
        const isH185 = hue === 185, isH200 = hue === 200, isH270 = hue === 270;
        particles.push({
          x: Math.random() * canvas.width,
          y: canvas.height - Math.random() * canvas.height * 0.5, // bottom half
          vx: (Math.random() - 0.5) * 2,
          vy: -(1 + Math.random() * 4),
          life: 0, // delayed activation
          maxLife: 0.7 + Math.random() * 0.3,
          size: 1 + Math.random() * 2.5,
          r: isH185 ? 0 : isH200 ? 0 : isH270 ? 119 : 255,
          g: isH185 ? 255 : isH200 ? 150 : isH270 ? 68 : 68,
          b: isH185 ? 255 : isH200 ? 255 : isH270 ? 255 : 170,
        });
      } else {
        const angle = (i / burstCount) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 8;
        const isOrange = isCrimson && Math.random() < 0.4;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 0.6 + Math.random() * 0.4,
          size: 1.5 + Math.random() * 3,
          r: isOrange ? 255 : parseInt(color.split(",")[0]),
          g: isOrange ? 60 + Math.random() * 40 : parseInt(color.split(",")[1]),
          b: isOrange ? 0 : parseInt(color.split(",")[2]),
        });
      }
    }

    // Crimson power-on: additional spark rain from top (delayed spawn)
    if (isCrimson) {
      for (let i = 0; i < 60; i++) {
        const isOrange = Math.random() < 0.5;
        particles.push({
          x: Math.random() * canvas.width,
          y: -10 - Math.random() * 50,
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 5,
          life: 0, // starts dead — activated later by delay
          maxLife: 0.5 + Math.random() * 0.5,
          size: 0.8 + Math.random() * 2,
          r: isOrange ? 255 : 255,
          g: isOrange ? 80 + Math.random() * 40 : 26,
          b: isOrange ? 10 : 26,
        });
      }
    }

    let animId: number;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      frame++;

      for (const p of particles) {
        // Delayed particle activation
        if (p.life === 0) {
          const activateFrame = isBiotech
            ? 30 + Math.random() * 50  // biotech: stagger 500-1350ms (organic awakening)
            : isCommand
            ? 40 + Math.random() * 60  // command: stagger 650-1650ms (radar contacts appearing)
            : isSolar
            ? 20 + Math.random() * 40  // solar: stagger 350-1000ms
            : isNeonCity
            ? 25 + Math.random() * 50  // neoncity: stagger 400-1250ms (bottom-up flicker)
            : 35 + Math.random() * 20; // crimson: stagger 600-950ms
          if (frame > activateFrame) {
            p.life = 1;
          } else {
            alive = true;
            continue;
          }
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= p.vy > 0 ? 0.98 : 0.94; // Rain particles slow less
        if (p.vy > 0) p.vy += 0.05; // Gravity for rain
        p.life -= 0.025 / p.maxLife;

        if (p.life <= 0) continue;
        alive = true;

        const alpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * 0.8})`;
        ctx.fill();

        // Glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3 * alpha);
        grad.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3 * alpha, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      if (alive) {
        animId = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        playedRef.current = false;
      }
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [active]);

  // Reset when deactivated
  useEffect(() => {
    if (!active) playedRef.current = false;
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Canvas particles */}
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[200]"
          />

          {isCrimson ? (
            <>
              {/* Phase 1: Black screen (power cut) */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[199]"
                style={{ backgroundColor: "#000" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 1, 0] }}
                transition={{ duration: 1.2, times: [0, 0.4, 1], ease: "easeOut" }}
              />

              {/* Phase 1b: CRT power-on red line */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[201]"
                style={{
                  background: "linear-gradient(0deg, transparent 48%, rgba(255,0,40,0.8) 49.5%, rgba(255,60,60,1) 50%, rgba(255,0,40,0.8) 50.5%, transparent 52%)",
                }}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{
                  scaleY: [0, 0.002, 0.002, 1],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.0,
                  times: [0, 0.1, 0.45, 1],
                  ease: "easeInOut",
                }}
              />

              {/* Phase 2: Red static/noise flicker */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[200]"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(255,0,40,0.03) 2px,
                    rgba(255,0,40,0.03) 4px
                  )`,
                  animation: "crimson-static-noise 0.1s steps(4) infinite",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.3, 0.1, 0.25, 0] }}
                transition={{ duration: 0.6, delay: 0.3, ease: "linear" }}
              />

              {/* Phase 3: Final scan line sweep */}
              <motion.div
                className="fixed left-0 right-0 pointer-events-none z-[201]"
                style={{
                  height: 3,
                  top: 0,
                  background: "linear-gradient(90deg, transparent, rgba(255,40,60,0.6) 30%, rgba(255,80,80,0.9) 50%, rgba(255,40,60,0.6) 70%, transparent)",
                  boxShadow: "0 0 15px rgba(255,0,40,0.5), 0 0 30px rgba(255,0,40,0.2)",
                }}
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: [0, window.innerHeight || 900], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 0.6, delay: 1.0, ease: "easeInOut" }}
              />

            </>
          ) : isSolar ? (
            <>
              {/* Solar Phase 1: Dark to warm — sunrise from bottom */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[199]"
                style={{ backgroundColor: "#080604" }}
                initial={{ opacity: 0.9 }}
                animate={{ opacity: [0.9, 0.8, 0] }}
                transition={{ duration: 1.8, times: [0, 0.3, 1], ease: "easeOut" }}
              />

              {/* Solar Phase 2: Golden horizon light rising from bottom */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[200]"
                style={{
                  background: "linear-gradient(0deg, rgba(255,200,0,0.25) 0%, rgba(232,168,0,0.12) 15%, transparent 50%)",
                }}
                initial={{ y: "100%" }}
                animate={{ y: ["100%", "0%", "0%"] }}
                transition={{ duration: 1.5, times: [0, 0.6, 1], ease: "easeOut" }}
              />

              {/* Solar Phase 3: White-gold flash at peak */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[201]"
                style={{ backgroundColor: "rgba(255, 240, 200, 1)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0.12, 0] }}
                transition={{ duration: 1.6, times: [0, 0.5, 0.65, 1], ease: "easeOut" }}
              />

            </>
          ) : isCommand ? (
            <>
              {/* Phase 1: Dark screen — system offline */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[199]"
                style={{ backgroundColor: "#020810" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 1, 0] }}
                transition={{ duration: 2.5, times: [0, 0.4, 1], ease: "easeOut" }}
              />

              {/* Phase 2: Grid appears first (coordinate lines) */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[200]"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(33, 150, 243, 0.06) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(33, 150, 243, 0.06) 1px, transparent 1px)
                  `,
                  backgroundSize: "80px 80px",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0.8, 0.6, 0] }}
                transition={{ duration: 2.0, times: [0, 0.15, 0.25, 0.7, 1], ease: "easeOut" }}
              />

              {/* Phase 3: Sonar sweep line rotates once */}
              <motion.div
                className="fixed pointer-events-none z-[201]"
                style={{
                  top: "50%", left: "50%",
                  width: 2, height: "45vmax",
                  marginLeft: -1,
                  transformOrigin: "center top",
                  background: "linear-gradient(180deg, rgba(100, 181, 246, 0.5) 0%, rgba(33, 150, 243, 0.15) 70%, transparent 100%)",
                }}
                initial={{ rotate: 0, opacity: 0 }}
                animate={{ rotate: [0, 0, 360], opacity: [0, 0, 0.8, 0.6, 0] }}
                transition={{ duration: 2.2, times: [0, 0.2, 0.25, 0.7, 1], ease: "easeOut" }}
              />

              {/* Phase 4: "SYSTEM ONLINE" text flash */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[202] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0, 0.6, 0.5, 0.7, 0] }}
                transition={{ duration: 2.2, times: [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.85], ease: "easeOut" }}
              >
                <span
                  style={{
                    color: "rgba(100, 181, 246, 0.9)",
                    fontFamily: "'Exo 2', monospace",
                    fontSize: "14px",
                    letterSpacing: "0.3em",
                    textTransform: "uppercase",
                    textShadow: "0 0 12px rgba(33, 150, 243, 0.6), 0 0 30px rgba(33, 150, 243, 0.3)",
                  }}
                >
                  SYSTEM ONLINE
                </span>
              </motion.div>

            </>
          ) : isNeonCity ? (
            <>
              {/* Phase 1: Blackout — city dark */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[199]"
                style={{ backgroundColor: "#010306" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 1, 0] }}
                transition={{ duration: 2.0, times: [0, 0.3, 1], ease: "easeOut" }}
              />

              {/* Phase 2: Neon lights flicker on from bottom upward — horizontal bands */}
              {[0.2, 0.35, 0.5, 0.65, 0.8].map((yPos, idx) => {
                const colors = [
                  "rgba(0, 255, 255, 0.15)",
                  "rgba(255, 68, 170, 0.12)",
                  "rgba(0, 150, 255, 0.15)",
                  "rgba(119, 68, 255, 0.1)",
                  "rgba(0, 200, 255, 0.12)",
                ];
                return (
                  <motion.div
                    key={`nc-band-${idx}`}
                    className="fixed pointer-events-none z-[200]"
                    style={{
                      left: 0, right: 0,
                      bottom: `${yPos * 100}%`,
                      height: "20%",
                      background: `linear-gradient(0deg, ${colors[idx]}, transparent)`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0, 0.8, 0.3, 0.9, 0.6, 0] }}
                    transition={{
                      duration: 1.6,
                      delay: 0.3 + idx * 0.2,
                      times: [0, 0.1, 0.15, 0.2, 0.3, 0.6, 1],
                      ease: "easeOut",
                    }}
                  />
                );
              })}

              {/* Phase 3: Neon sign buzz flash */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[201]"
                style={{
                  background: "linear-gradient(180deg, rgba(0,255,255,0.08) 0%, rgba(0,150,255,0.04) 50%, rgba(255,68,170,0.03) 100%)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0.6, 0, 0.8, 0.4, 0] }}
                transition={{ duration: 1.2, delay: 0.8, times: [0, 0.1, 0.15, 0.25, 0.35, 0.6, 1], ease: "easeOut" }}
              />

            </>
          ) : isBiotech ? (
            <>
              {/* Phase 1: Dark organic void */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[199]"
                style={{ backgroundColor: "#030d08" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 1, 0] }}
                transition={{ duration: 2.5, times: [0, 0.35, 1], ease: "easeOut" }}
              />

              {/* Phase 2: DNA strands appear (two rotating lines) */}
              {[0, 1].map((strand) => (
                <motion.div
                  key={`dna-${strand}`}
                  className="fixed pointer-events-none z-[200]"
                  style={{
                    top: 0, left: "50%",
                    width: 2, height: "100%",
                    marginLeft: -1,
                    background: `linear-gradient(180deg, transparent 0%, rgba(0,230,118,0.15) 20%, rgba(105,240,174,0.2) 50%, rgba(0,230,118,0.15) 80%, transparent 100%)`,
                  }}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{
                    opacity: [0, 0, 0.6, 0.4, 0],
                    scaleX: [0, 0, 1, 1, 0],
                    x: strand === 0
                      ? [0, 0, -20, -25, -30]
                      : [0, 0, 20, 25, 30],
                  }}
                  transition={{ duration: 2.2, times: [0, 0.15, 0.3, 0.6, 1], ease: "easeOut" }}
                />
              ))}

              {/* Phase 3: Bioluminescent pulse from center */}
              <motion.div
                className="fixed pointer-events-none z-[201] rounded-full"
                style={{
                  top: "50%", left: "50%",
                  width: 4, height: 4,
                  marginLeft: -2, marginTop: -2,
                  background: "rgba(105, 240, 174, 0.6)",
                  boxShadow: "0 0 20px rgba(0,230,118,0.5), 0 0 40px rgba(0,230,118,0.2)",
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 0, 40, 120], opacity: [0, 0, 0.4, 0] }}
                transition={{ duration: 2.0, times: [0, 0.3, 0.5, 1], ease: "easeOut" }}
              />

              {/* Phase 4: Heartbeat double-pulse flash */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[202]"
                style={{ backgroundColor: "rgba(0, 230, 118, 1)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0.06, 0, 0.04, 0] }}
                transition={{ duration: 2.0, times: [0, 0.55, 0.6, 0.65, 0.7, 0.8], ease: "easeOut" }}
              />

              {/* Phase 5: "SYSTEM ALIVE" text flash */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[203] flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0, 0.5, 0.4, 0.6, 0] }}
                transition={{ duration: 2.5, times: [0, 0.6, 0.65, 0.7, 0.73, 0.76, 0.88], ease: "easeOut" }}
              >
                <span
                  style={{
                    color: "rgba(105, 240, 174, 0.9)",
                    fontFamily: "'Exo 2', monospace",
                    fontSize: "13px",
                    letterSpacing: "0.3em",
                    textTransform: "uppercase",
                    textShadow: "0 0 12px rgba(0,230,118,0.6), 0 0 30px rgba(0,230,118,0.3)",
                  }}
                >
                  SYSTEM ALIVE
                </span>
              </motion.div>

            </>
          ) : isPrismatic ? (
            <>
              {/* Phase 1: White beam enters from top-left */}
              <motion.div
                className="fixed pointer-events-none z-[200]"
                style={{
                  top: 0, left: 0,
                  width: "150%", height: 4,
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.7) 70%, transparent 100%)",
                  transformOrigin: "top left",
                  transform: "rotate(35deg)",
                }}
                initial={{ x: "-100%", opacity: 0 }}
                animate={{ x: ["-100%", "20%", "20%"], opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, times: [0, 0.4, 1], ease: "easeOut" }}
              />

              {/* Phase 2: Rainbow split from center — each color fans outward */}
              {[
                { color: "rgba(255,51,85,0.15)", angle: -30, delay: 0.35 },
                { color: "rgba(255,136,51,0.12)", angle: -18, delay: 0.38 },
                { color: "rgba(255,204,34,0.12)", angle: -6, delay: 0.41 },
                { color: "rgba(51,255,136,0.12)", angle: 6, delay: 0.44 },
                { color: "rgba(34,238,255,0.15)", angle: 18, delay: 0.47 },
                { color: "rgba(51,102,255,0.12)", angle: 30, delay: 0.50 },
                { color: "rgba(153,68,255,0.12)", angle: 42, delay: 0.53 },
              ].map(({ color: c2, angle: a2, delay: d2 }, idx) => (
                <motion.div
                  key={`prism-ray-${idx}`}
                  className="fixed pointer-events-none z-[199]"
                  style={{
                    top: "50%", left: "50%",
                    width: "200vmax", height: 30 + idx * 4,
                    marginTop: -(15 + idx * 2),
                    background: `linear-gradient(90deg, transparent, ${c2}, transparent)`,
                    transformOrigin: "left center",
                    transform: `rotate(${a2}deg)`,
                  }}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: [0, 1, 1], opacity: [0, 0.8, 0] }}
                  transition={{ duration: 1.5, delay: d2, times: [0, 0.4, 1], ease: "easeOut" }}
                />
              ))}

              {/* Phase 3: Full-screen color wash settling */}
              <motion.div
                className="fixed inset-0 pointer-events-none z-[198]"
                style={{
                  background: "conic-gradient(from 0deg at 50% 50%, rgba(255,51,85,0.06), rgba(255,204,34,0.04), rgba(34,238,255,0.06), rgba(136,51,255,0.04), rgba(255,68,204,0.06), rgba(255,51,85,0.06))",
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 0, 0.6, 0], scale: [0.5, 0.5, 1.5, 2] }}
                transition={{ duration: 2, times: [0, 0.3, 0.5, 1], ease: "easeOut" }}
              />

            </>
          ) : (
            <>{/* No default splash — themed effects only */}</>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
