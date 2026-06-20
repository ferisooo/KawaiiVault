import { useEffect, useRef } from "react";

// Falling neon rain — thin vertical streaks in cyan/blue/pink
// Plus occasional raindrop hitting the "glass" and running down

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  hue: number;       // 185=cyan, 200=blue, 270=violet, 330=pink
  thickness: number;
}

interface GlassDrop {
  x: number;
  y: number;
  speed: number;
  opacity: number;
  life: number;
  maxLife: number;
}

const MAX_RAIN = 120;
const MAX_GLASS_DROPS = 4;

export default function NeonRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const rain: RainDrop[] = [];
    const glassDrops: GlassDrop[] = [];
    let frame = 0;
    let nextGlassDropFrame = 200 + Math.random() * 300;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const huePool = [185, 185, 185, 200, 200, 270, 330]; // weight toward cyan/blue

    const spawnRain = () => {
      if (rain.length >= MAX_RAIN) return;
      const hue = huePool[Math.floor(Math.random() * huePool.length)];
      rain.push({
        x: Math.random() * (canvas.width + 60) - 30,
        y: -Math.random() * 200,
        speed: 4 + Math.random() * 8,
        length: 15 + Math.random() * 40,
        opacity: 0.08 + Math.random() * 0.25,
        hue,
        thickness: 0.5 + Math.random() * 1,
      });
    };

    const render = () => {
      animId = requestAnimationFrame(render);
      frame++;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Spawn rain batches
      const spawnCount = Math.min(4, MAX_RAIN - rain.length);
      for (let i = 0; i < spawnCount; i++) spawnRain();

      // Spawn glass drops occasionally
      if (frame >= nextGlassDropFrame && glassDrops.length < MAX_GLASS_DROPS) {
        glassDrops.push({
          x: 50 + Math.random() * (w - 100),
          y: Math.random() * h * 0.3,
          speed: 0.2 + Math.random() * 0.4,
          opacity: 0.15 + Math.random() * 0.2,
          life: 0,
          maxLife: 200 + Math.random() * 200,
        });
        nextGlassDropFrame = frame + 300 + Math.random() * 500;
      }

      // ── Rain streaks ──
      for (let i = rain.length - 1; i >= 0; i--) {
        const r = rain[i];
        r.y += r.speed;
        // Slight wind drift
        r.x -= 0.3;

        if (r.y > h + r.length) {
          rain.splice(i, 1);
          continue;
        }

        // Draw streak
        const grad = ctx.createLinearGradient(r.x, r.y - r.length, r.x, r.y);
        grad.addColorStop(0, `hsla(${r.hue}, 100%, 70%, 0)`);
        grad.addColorStop(0.3, `hsla(${r.hue}, 100%, 75%, ${r.opacity * 0.5})`);
        grad.addColorStop(1, `hsla(${r.hue}, 100%, 80%, ${r.opacity})`);

        ctx.beginPath();
        ctx.moveTo(r.x, r.y - r.length);
        ctx.lineTo(r.x - 0.3 * r.length / r.speed, r.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = r.thickness;
        ctx.stroke();

        // Tiny impact glow when hitting bottom
        if (r.y >= h - 5 && r.y < h + 5) {
          const impactAlpha = r.opacity * 0.3;
          const impactGrad = ctx.createRadialGradient(r.x, h, 0, r.x, h, 4);
          impactGrad.addColorStop(0, `hsla(${r.hue}, 100%, 80%, ${impactAlpha})`);
          impactGrad.addColorStop(1, `hsla(${r.hue}, 100%, 70%, 0)`);
          ctx.beginPath();
          ctx.arc(r.x, h, 4, 0, Math.PI * 2);
          ctx.fillStyle = impactGrad;
          ctx.fill();
        }
      }

      // ── Glass drops (rain hitting window, running down slowly) ──
      for (let i = glassDrops.length - 1; i >= 0; i--) {
        const g = glassDrops[i];
        g.y += g.speed;
        g.life++;

        // Slight wobble
        const wobbleX = Math.sin(g.life * 0.08) * 0.5;

        const fadeIn = Math.min(1, g.life / 30);
        const fadeOut = Math.max(0, 1 - g.life / g.maxLife);
        const alpha = g.opacity * fadeIn * fadeOut;

        if (g.life >= g.maxLife || alpha < 0.005) {
          glassDrops.splice(i, 1);
          continue;
        }

        // Drop body
        const dropGrad = ctx.createRadialGradient(g.x + wobbleX, g.y, 0, g.x + wobbleX, g.y, 3);
        dropGrad.addColorStop(0, `rgba(180, 230, 255, ${alpha * 0.6})`);
        dropGrad.addColorStop(1, `rgba(0, 200, 255, 0)`);
        ctx.beginPath();
        ctx.arc(g.x + wobbleX, g.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = dropGrad;
        ctx.fill();

        // Trail
        const trailLen = Math.min(25, g.life * 0.5);
        const trailGrad = ctx.createLinearGradient(g.x + wobbleX, g.y - trailLen, g.x + wobbleX, g.y);
        trailGrad.addColorStop(0, `rgba(0, 200, 255, 0)`);
        trailGrad.addColorStop(1, `rgba(180, 230, 255, ${alpha * 0.3})`);
        ctx.beginPath();
        ctx.moveTo(g.x + wobbleX, g.y - trailLen);
        ctx.lineTo(g.x + wobbleX, g.y);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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
