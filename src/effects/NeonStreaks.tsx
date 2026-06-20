import { useEffect, useRef } from "react";

// Fast horizontal light streaks — like neon reflections on wet city streets
interface Streak {
  x: number;
  y: number;
  width: number;
  speed: number;
  opacity: number;
  hue: number;
}

export default function NeonStreaks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const streaks: Streak[] = [];
    const MAX = 12;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;

    const spawn = () => {
      if (streaks.length < MAX) {
        const hue = Math.random() > 0.7 ? 270 : Math.random() > 0.5 ? 200 : 185;
        streaks.push({
          x: -200,
          y: Math.random() * canvas.height,
          width: 80 + Math.random() * 160,
          speed: 2 + Math.random() * 4,
          opacity: 0.04 + Math.random() * 0.08,
          hue,
        });
      }
    };

    const draw = () => {
      animId = requestAnimationFrame(draw);
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (frame % 30 === 0) spawn();

      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.x += s.speed;

        if (s.x > canvas.width + s.width) {
          streaks.splice(i, 1);
          continue;
        }

        const grad = ctx.createLinearGradient(s.x, s.y, s.x + s.width, s.y);
        grad.addColorStop(0, `hsla(${s.hue}, 100%, 60%, 0)`);
        grad.addColorStop(0.3, `hsla(${s.hue}, 100%, 65%, ${s.opacity})`);
        grad.addColorStop(0.5, `hsla(${s.hue}, 100%, 70%, ${s.opacity * 1.5})`);
        grad.addColorStop(0.7, `hsla(${s.hue}, 100%, 65%, ${s.opacity})`);
        grad.addColorStop(1, `hsla(${s.hue}, 100%, 60%, 0)`);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.width, s.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Glow around the streak
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.width, s.y);
        ctx.strokeStyle = `hsla(${s.hue}, 100%, 60%, ${s.opacity * 0.3})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.8 }}
    />
  );
}
