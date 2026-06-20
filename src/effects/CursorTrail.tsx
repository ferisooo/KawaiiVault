import { useEffect, useRef } from "react";

// Lightweight canvas cursor trail — draws fading red dots behind the cursor
export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const trail: { x: number; y: number; alpha: number }[] = [];
    const MAX_TRAIL = 12;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let lastX = 0, lastY = 0;
    const handleMove = (e: MouseEvent) => {
      // Only add point if cursor moved enough (avoid bunching)
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 64) return; // ~8px minimum distance
      lastX = e.clientX;
      lastY = e.clientY;

      trail.push({ x: e.clientX, y: e.clientY, alpha: 0.4 });
      if (trail.length > MAX_TRAIL) trail.shift();
    };
    window.addEventListener("mousemove", handleMove);

    let animId: number;
    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.alpha *= 0.88;
        if (p.alpha < 0.01) {
          trail.splice(i, 1);
          continue;
        }
        const size = 2 + p.alpha * 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 26, 26, ${p.alpha})`;
        ctx.fill();
        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 26, 26, ${p.alpha * 0.15})`;
        ctx.fill();
      }
    };
    draw();

    // Pause on hidden tab
    const handleVis = () => {
      if (document.hidden) cancelAnimationFrame(animId);
      else animId = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ opacity: 0.7 }}
    />
  );
}
