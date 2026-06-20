import { useEffect, useRef } from "react";

// Kawaii Dream background — falling sakura petals, twinkling star sparkles,
// and the occasional heart drifting up from the bottom of the screen.

interface Petal {
  x: number;
  y: number;
  size: number;
  angle: number;       // current rotation
  spin: number;        // rotation speed
  fallSpeed: number;
  swayPhase: number;   // horizontal sway offset
  swaySpeed: number;
  color: string;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  phase: number;       // twinkle phase
  speed: number;
  color: string;
}

interface Heart {
  x: number;
  y: number;
  size: number;
  riseSpeed: number;
  swayPhase: number;
  alpha: number;
}

const PETAL_COLORS = ["#ffbcd9", "#ff8ac2", "#ffc0cb", "#ffd6e8", "#ff5fa2"];
const SPARKLE_COLORS = ["#fff0f6", "#ffd6e8", "#c79bff", "#7dffd4", "#8ad9ff"];
const PETAL_COUNT = 36;
const SPARKLE_COUNT = 26;
const MAX_HEARTS = 6;

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.bezierCurveTo(x, y, x - size * 0.5, y - size * 0.2, x - size * 0.5, y + size * 0.15);
  ctx.bezierCurveTo(x - size * 0.5, y + size * 0.5, x, y + size * 0.7, x, y + size * 0.95);
  ctx.bezierCurveTo(x, y + size * 0.7, x + size * 0.5, y + size * 0.5, x + size * 0.5, y + size * 0.15);
  ctx.bezierCurveTo(x + size * 0.5, y - size * 0.2, x, y, x, y + size * 0.3);
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // 4-point sparkle star
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

export default function KawaiiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let petals: Petal[] = [];
    let sparkles: Sparkle[] = [];
    const hearts: Heart[] = [];
    let nextHeartTime = performance.now() + 2500;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const makePetal = (startAnywhere: boolean): Petal => ({
      x: Math.random() * canvas.width,
      y: startAnywhere ? Math.random() * canvas.height : -20,
      size: 5 + Math.random() * 8,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.03,
      fallSpeed: 0.4 + Math.random() * 0.9,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.5 + Math.random() * 0.8,
      color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    });

    petals = Array.from({ length: PETAL_COUNT }, () => makePetal(true));
    sparkles = Array.from({ length: SPARKLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 1.5 + Math.random() * 3.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4,
      color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
    }));

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      const t = now / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ── Sakura petals ──
      for (const p of petals) {
        p.y += p.fallSpeed;
        p.x += Math.sin(t * p.swaySpeed + p.swayPhase) * 0.4;
        p.angle += p.spin;
        if (p.y > canvas.height + 20) {
          Object.assign(p, makePetal(false));
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        // Petal = soft rounded teardrop (two arcs)
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.restore();
      }

      // ── Twinkling sparkles ──
      for (const s of sparkles) {
        const tw = (Math.sin(t * s.speed + s.phase) + 1) / 2; // 0..1
        if (tw < 0.08) {
          // Re-position when fully faded so sparkles wander
          s.x = Math.random() * canvas.width;
          s.y = Math.random() * canvas.height;
        }
        ctx.globalAlpha = tw * 0.65;
        ctx.fillStyle = s.color;
        drawStar(ctx, s.x, s.y, s.size * (0.6 + tw * 0.7));
        ctx.fill();
      }

      // ── Floating hearts ──
      if (now >= nextHeartTime && hearts.length < MAX_HEARTS) {
        hearts.push({
          x: 40 + Math.random() * (canvas.width - 80),
          y: canvas.height + 20,
          size: 10 + Math.random() * 14,
          riseSpeed: 0.5 + Math.random() * 0.6,
          swayPhase: Math.random() * Math.PI * 2,
          alpha: 0.35 + Math.random() * 0.25,
        });
        nextHeartTime = now + 3500 + Math.random() * 4000;
      }
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.y -= h.riseSpeed;
        h.x += Math.sin(t * 0.8 + h.swayPhase) * 0.5;
        const fade = h.y < canvas.height * 0.3 ? Math.max(0, h.y / (canvas.height * 0.3)) : 1;
        if (h.y < -30 || fade <= 0) {
          hearts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = h.alpha * fade;
        ctx.fillStyle = "#ff5fa2";
        ctx.shadowColor = "rgba(255, 95, 162, 0.8)";
        ctx.shadowBlur = 12;
        drawHeart(ctx, h.x, h.y, h.size);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    };

    animId = requestAnimationFrame(render);

    const handleVis = () => {
      if (document.hidden) cancelAnimationFrame(animId);
      else animId = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ opacity: 0.85 }}
    />
  );
}
