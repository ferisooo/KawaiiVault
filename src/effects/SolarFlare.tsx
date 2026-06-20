import { useEffect, useRef } from "react";

// Periodic solar flare — golden rings radiate from a random point every 8-12s
interface Flare {
  x: number;
  y: number;
  startTime: number;
  rings: number; // 2-3 concentric rings
}

const FLARE_DURATION = 3500; // ms per ring expansion
const RING_MAX_RADIUS = 220;

export default function SolarFlare() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const flares: Flare[] = [];
    let nextFlareTime = performance.now() + 3000; // first flare after 3s

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      animId = requestAnimationFrame(render);

      // Spawn new flare at random intervals (8-12s)
      if (now >= nextFlareTime) {
        // Bias toward edges and corners (more cosmic feel)
        const edge = Math.random();
        let x: number, y: number;
        if (edge < 0.3) {
          x = Math.random() * canvas.width * 0.2;
          y = Math.random() * canvas.height;
        } else if (edge < 0.6) {
          x = canvas.width - Math.random() * canvas.width * 0.2;
          y = Math.random() * canvas.height;
        } else {
          x = Math.random() * canvas.width;
          y = Math.random() < 0.5 ? Math.random() * canvas.height * 0.25 : canvas.height - Math.random() * canvas.height * 0.25;
        }
        flares.push({
          x, y,
          startTime: now,
          rings: 2 + Math.floor(Math.random() * 2), // 2-3 rings
        });
        nextFlareTime = now + 8000 + Math.random() * 4000;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i];
        const elapsed = now - f.startTime;

        // Remove when all rings have finished
        if (elapsed > FLARE_DURATION + f.rings * 400) {
          flares.splice(i, 1);
          continue;
        }

        // Draw each ring with staggered delay
        for (let r = 0; r < f.rings; r++) {
          const ringElapsed = elapsed - r * 350;
          if (ringElapsed < 0) continue;

          const progress = Math.min(1, ringElapsed / FLARE_DURATION);
          const eased = 1 - Math.pow(1 - progress, 2); // ease-out
          const radius = eased * RING_MAX_RADIUS;
          const alpha = (1 - progress) * 0.2;

          if (alpha < 0.005) continue;

          // Ring stroke
          ctx.beginPath();
          ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
          ctx.lineWidth = 2 - progress * 1.5;
          ctx.stroke();

          // Soft glow around ring
          const grad = ctx.createRadialGradient(f.x, f.y, radius * 0.85, f.x, f.y, radius * 1.15);
          grad.addColorStop(0, `rgba(255, 200, 0, 0)`);
          grad.addColorStop(0.5, `rgba(255, 200, 0, ${alpha * 0.3})`);
          grad.addColorStop(1, `rgba(255, 200, 0, 0)`);
          ctx.beginPath();
          ctx.arc(f.x, f.y, radius * 1.15, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Bright point at center (fades over time)
        const centerAlpha = Math.max(0, 1 - elapsed / 2000) * 0.3;
        if (centerAlpha > 0.005) {
          const centerGrad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 8);
          centerGrad.addColorStop(0, `rgba(255, 240, 180, ${centerAlpha})`);
          centerGrad.addColorStop(1, `rgba(255, 200, 0, 0)`);
          ctx.beginPath();
          ctx.arc(f.x, f.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = centerGrad;
          ctx.fill();
        }
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
      style={{ opacity: 0.8 }}
    />
  );
}
