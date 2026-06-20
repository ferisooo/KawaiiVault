import { useEffect, useRef } from "react";

// Kawaii click burst — every click pops a dramatic little firework of hearts,
// star sparkles, and candy dots from the cursor, plus an expanding pink ring.

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  shape: "heart" | "star" | "dot";
  color: string;
  born: number;
  life: number; // ms
}

interface BurstRing {
  x: number;
  y: number;
  born: number;
}

const COLORS = ["#ff5fa2", "#ffbcd9", "#c79bff", "#7dffd4", "#8ad9ff", "#fff0f6", "#ffcf5c"];
const RING_DURATION = 450;
const MAX_PARTICLES = 220; // hard cap so click-spamming can't run away

function drawHeart(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(0, 0, -size * 0.5, -size * 0.2, -size * 0.5, size * 0.15);
  ctx.bezierCurveTo(-size * 0.5, size * 0.5, 0, size * 0.7, 0, size * 0.95);
  ctx.bezierCurveTo(0, size * 0.7, size * 0.5, size * 0.5, size * 0.5, size * 0.15);
  ctx.bezierCurveTo(size * 0.5, -size * 0.2, 0, 0, 0, size * 0.3);
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.closePath();
}

export default function KawaiiClickBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number | null = null;
    const particles: BurstParticle[] = [];
    const rings: BurstRing[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Expanding rings ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const progress = (now - r.born) / RING_DURATION;
        if (progress >= 1) {
          rings.splice(i, 1);
          continue;
        }
        const eased = 1 - Math.pow(1 - progress, 3);
        ctx.beginPath();
        ctx.arc(r.x, r.y, eased * 46, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 95, 162, ${(1 - progress) * 0.7})`;
        ctx.lineWidth = 2.5 - progress * 2;
        ctx.stroke();
      }

      // ── Particles ──
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = now - p.born;
        if (age >= p.life) {
          particles.splice(i, 1);
          continue;
        }
        const progress = age / p.life;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;       // gentle gravity
        p.vx *= 0.985;      // air drag
        p.rotation += p.spin;

        const alpha = 1 - progress;
        const scale = 1 - progress * 0.4;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        if (p.shape === "heart") {
          drawHeart(ctx, p.size * scale);
          ctx.fill();
        } else if (p.shape === "star") {
          drawStar(ctx, p.size * scale);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.35 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Stop the loop entirely when idle — zero cost between clicks
      if (particles.length > 0 || rings.length > 0) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animId = null;
      }
    };

    const burst = (e: PointerEvent) => {
      const count = 10 + Math.floor(Math.random() * 5);
      const now = performance.now();
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 1.6 + Math.random() * 2.6;
        const roll = Math.random();
        particles.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2, // bias upward for drama
          size: 5 + Math.random() * 7,
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.25,
          shape: roll < 0.4 ? "heart" : roll < 0.75 ? "star" : "dot",
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          born: now,
          life: 600 + Math.random() * 500,
        });
      }
      rings.push({ x: e.clientX, y: e.clientY, born: now });
      if (animId === null) animId = requestAnimationFrame(render);
    };

    window.addEventListener("pointerdown", burst);

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      window.removeEventListener("pointerdown", burst);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[60]"
    />
  );
}
