import { useEffect, useRef } from "react";

const POOL_SIZE = 50;
const GRID_SPACING = 60;
const GRID_COLOR = "rgba(232, 168, 0, 0.02)";
const CORE_BREATHE_PERIOD = 12; // seconds

// Golden ember color range — amber to bright gold
const COLOR_AMBER: [number, number, number] = [204, 136, 0];
const COLOR_GOLD: [number, number, number] = [255, 216, 58];

interface Ember {
  x: number;
  y: number;
  vy: number;
  wobbleOffset: number;
  wobbleSpeed: number;
  size: number;
  baseOpacity: number;
  warmth: number; // 0 = amber, 1 = bright gold
  sinking: boolean; // true = drifts downward (heavy ash)
}

function createEmber(canvasWidth: number, canvasHeight: number): Ember {
  const sinking = Math.random() < 0.1; // 10% sink downward
  return {
    x: Math.random() * canvasWidth,
    y: sinking
      ? -Math.random() * 20
      : canvasHeight + Math.random() * 20,
    vy: sinking
      ? 0.05 + Math.random() * 0.15  // very slow sinking
      : 0.1 + Math.random() * 0.25,   // lazy upward float
    wobbleOffset: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.15 + Math.random() * 0.25,
    size: 1 + Math.random() * 2.5,
    baseOpacity: 0.08 + Math.random() * 0.14,
    warmth: Math.random(),
    sinking,
  };
}

function recycleEmber(ember: Ember, canvasWidth: number, canvasHeight: number): void {
  ember.sinking = Math.random() < 0.1;
  ember.x = Math.random() * canvasWidth;
  ember.y = ember.sinking ? -Math.random() * 10 : canvasHeight + Math.random() * 10;
  ember.vy = ember.sinking ? 0.05 + Math.random() * 0.15 : 0.1 + Math.random() * 0.25;
  ember.wobbleOffset = Math.random() * Math.PI * 2;
  ember.wobbleSpeed = 0.15 + Math.random() * 0.25;
  ember.size = 1 + Math.random() * 2.5;
  ember.baseOpacity = 0.08 + Math.random() * 0.14;
  ember.warmth = Math.random();
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export default function SolarCoreBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let startTime = performance.now();

    // Fixed-size ember pool — no allocations during render
    const embers: Ember[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Re-initialize pool on resize
      embers.length = 0;
      for (let i = 0; i < POOL_SIZE; i++) {
        const ember = createEmber(canvas.width, canvas.height);
        // Distribute initial positions across the full height
        ember.y = Math.random() * canvas.height;
        embers.push(ember);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // ── Layer 1: Faint Energy Grid ──
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += GRID_SPACING) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += GRID_SPACING) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // ── Layer 2: Core Radiance ──
      const breathe = 0.4 + 0.3 * Math.sin((elapsed / CORE_BREATHE_PERIOD) * Math.PI * 2);
      const coreX = w * 0.5;
      const coreY = h * 0.92;
      const coreRx = w * 0.4;
      const coreRy = h * 0.6;

      ctx.save();
      ctx.translate(coreX, coreY);
      ctx.scale(coreRx, coreRy);
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      coreGrad.addColorStop(0, `rgba(255, 200, 0, ${0.06 * breathe})`);
      coreGrad.addColorStop(0.3, `rgba(232, 168, 0, ${0.03 * breathe})`);
      coreGrad.addColorStop(0.6, `rgba(204, 136, 0, ${0.01 * breathe})`);
      coreGrad.addColorStop(1, "rgba(204, 136, 0, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Layer 3: Golden Dust Particles ──
      for (let i = 0; i < POOL_SIZE; i++) {
        const e = embers[i];

        // Move: sinking particles go down, normal ones float up
        if (e.sinking) {
          e.y += e.vy;
        } else {
          e.y -= e.vy;
        }

        // Wide, slow sine-based horizontal wobble
        const wobble = Math.sin(elapsed * e.wobbleSpeed + e.wobbleOffset) * 1.2;
        const drawX = e.x + wobble;

        // Recycle if off-screen
        if (e.sinking && e.y > h + 10) {
          recycleEmber(e, w, h);
          continue;
        } else if (!e.sinking && e.y < -10) {
          recycleEmber(e, w, h);
          continue;
        }

        // Opacity based on height + gentle breathing
        const heightRatio = e.sinking ? (1 - e.y / h) : (e.y / h);
        const breatheAlpha = 0.8 + 0.2 * Math.sin(elapsed * 0.5 + e.wobbleOffset);
        const alpha = e.baseOpacity * Math.max(0, heightRatio) * breatheAlpha;

        if (alpha < 0.005) continue;

        const [cr, cg, cb] = lerpColor(COLOR_AMBER, COLOR_GOLD, e.warmth);

        // Core dot
        ctx.beginPath();
        ctx.arc(drawX, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha})`;
        ctx.fill();

        // Soft glow halo (larger for cosmic feel)
        const glowGrad = ctx.createRadialGradient(drawX, e.y, 0, drawX, e.y, e.size * 7);
        glowGrad.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha * 0.15})`);
        glowGrad.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`);
        ctx.beginPath();
        ctx.arc(drawX, e.y, e.size * 7, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // Pause when tab is hidden to save CPU
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        startTime = performance.now();
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.85 }}
    />
  );
}
