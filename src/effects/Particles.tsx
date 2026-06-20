import { useEffect, useRef } from "react";

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; life: number; maxLife: number;
      r: number; g: number; b: number; // color channels
      wobbleOffset: number; // phase offset for sine wobble
    }
    const particles: Particle[] = [];
    const MAX = 80;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = () => {
      if (particles.length >= MAX) return;

      const isSpark = Math.random() < 0.1; // 10% are bright sparks
      const isLargeEmber = !isSpark && Math.random() < 0.15; // 15% of non-sparks are large
      const isOrange = Math.random() < 0.3; // 30% are orange-tinted

      const life = isSpark
        ? 50 + Math.random() * 50       // sparks: short-lived (50-100 frames)
        : 200 + Math.random() * 400;     // embers: long-lived (200-600 frames)

      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.8 + 0.2),
        size: isSpark ? 0.8 + Math.random() * 1.2
            : isLargeEmber ? 2.5 + Math.random() * 2
            : 0.5 + Math.random() * 2,
        alpha: isSpark ? 0.7 + Math.random() * 0.2
             : Math.random() * 0.5 + 0.1,
        life,
        maxLife: life,
        r: isOrange ? 255 : 255,
        g: isOrange ? 60 + Math.random() * 40 : 26,
        b: isOrange ? 0 : 26,
        wobbleOffset: Math.random() * Math.PI * 2,
      });
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      spawn();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Organic wobble drift
        const wobble = Math.sin((p.maxLife - p.life) * 0.04 + p.wobbleOffset) * 0.3;
        p.x += p.vx + wobble;
        p.y += p.vy;
        p.life--;
        p.alpha *= 0.997;

        if (p.life <= 0 || p.alpha < 0.01) {
          particles.splice(i, 1);
          continue;
        }

        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha})`;
        ctx.fill();

        // Glow halo
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha * 0.15})`;
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
      style={{ opacity: 0.6 }}
    />
  );
}
