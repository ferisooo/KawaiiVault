import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  isBright: boolean;
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const stars: Star[] = [];
    const STAR_COUNT = 100;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize stars — fixed positions, no movement
    for (let i = 0; i < STAR_COUNT; i++) {
      const isBright = i < 3; // first 3 are bright stars
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: isBright ? 1.5 + Math.random() * 1.5 : 0.5 + Math.random() * 1.2,
        baseAlpha: isBright ? 0.4 + Math.random() * 0.2 : 0.08 + Math.random() * 0.2,
        twinkleSpeed: 0.003 + Math.random() * 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
        isBright,
      });
    }

    let time = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time++;

      for (const star of stars) {
        star.twinklePhase += star.twinkleSpeed;
        const twinkle = 0.6 + 0.4 * Math.sin(star.twinklePhase);
        const alpha = star.baseAlpha * twinkle;

        // Bright star glow halo
        if (star.isBright) {
          const glowGrad = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.size * 6
          );
          glowGrad.addColorStop(0, `rgba(100, 181, 246, ${alpha * 0.3})`);
          glowGrad.addColorStop(0.4, `rgba(33, 150, 243, ${alpha * 0.1})`);
          glowGrad.addColorStop(1, "rgba(33, 150, 243, 0)");
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 6, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        // Star core
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = star.isBright
          ? `rgba(179, 229, 252, ${alpha})`
          : `rgba(200, 218, 240, ${alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    // Pause when tab is hidden to save CPU
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(animate);
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
    />
  );
}
