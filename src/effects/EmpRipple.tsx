import { useEffect, useRef } from "react";

interface Ring {
  progress: number; // 0 → 1
  speed: number;
}

// Periodic expanding EMP shockwave rings from screen center
export default function EmpRipple() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const rings: Ring[] = [];
    let lastSpawn = 0;
    let animId: number;

    const draw = (time: number) => {
      animId = requestAnimationFrame(draw);

      // Spawn a new ring every 7 seconds
      if (time - lastSpawn > 7000) {
        rings.push({ progress: 0, speed: 0.0004 });
        lastSpawn = time;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy) * 1.1;

      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].progress += rings[i].speed * 16;
        const p = rings[i].progress;
        if (p >= 1) { rings.splice(i, 1); continue; }

        const r = p * maxR;
        const alpha = (1 - p) * 0.12;

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 26, 26, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner thinner ring (slightly behind)
        if (p > 0.05) {
          const r2 = (p - 0.05) * maxR;
          const a2 = (1 - p) * 0.05;
          ctx.beginPath();
          ctx.arc(cx, cy, r2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 26, 26, ${a2})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
