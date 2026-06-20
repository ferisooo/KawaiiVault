import { useEffect, useRef } from "react";

interface Spore {
  x: number;
  y: number;
  vy: number;
  sineOffset: number;
  sineSpeed: number;
  sineAmp: number;
  size: number;
  alpha: number;
  glowSize: number;
  life: number;
  maxLife: number;
}

export default function BioParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const spores: Spore[] = [];
    const MAX_SPORES = 35;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = () => {
      if (spores.length < MAX_SPORES && Math.random() < 0.03) {
        const maxLife = 600 + Math.random() * 400;
        spores.push({
          x: Math.random() * canvas.width,
          y: canvas.height + 20,
          vy: -(0.15 + Math.random() * 0.4),
          sineOffset: Math.random() * Math.PI * 2,
          sineSpeed: 0.01 + Math.random() * 0.02,
          sineAmp: 15 + Math.random() * 30,
          size: 1 + Math.random() * 2.5,
          alpha: 0,
          glowSize: 6 + Math.random() * 10,
          life: 0,
          maxLife,
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time++;
      spawn();

      for (let i = spores.length - 1; i >= 0; i--) {
        const s = spores[i];
        s.life++;
        s.y += s.vy;

        // Sine-wave horizontal drift
        const sineX = Math.sin(s.sineOffset + time * s.sineSpeed) * s.sineAmp;

        // Fade in/out lifecycle
        const lifePct = s.life / s.maxLife;
        if (lifePct < 0.1) {
          s.alpha = (lifePct / 0.1) * 0.2;
        } else if (lifePct > 0.8) {
          s.alpha = ((1 - lifePct) / 0.2) * 0.2;
        } else {
          s.alpha = 0.15 + Math.sin(time * 0.02 + s.sineOffset) * 0.05;
        }

        if (s.life >= s.maxLife || s.y < -30) {
          spores.splice(i, 1);
          continue;
        }

        const drawX = s.x + sineX;

        // Outer glow halo
        const glowGrad = ctx.createRadialGradient(
          drawX, s.y, 0,
          drawX, s.y, s.glowSize
        );
        glowGrad.addColorStop(0, `rgba(105, 240, 174, ${s.alpha * 0.4})`);
        glowGrad.addColorStop(0.5, `rgba(0, 230, 118, ${s.alpha * 0.15})`);
        glowGrad.addColorStop(1, "rgba(0, 230, 118, 0)");
        ctx.beginPath();
        ctx.arc(drawX, s.y, s.glowSize, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(drawX, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(105, 240, 174, ${s.alpha * 1.5})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
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
