import { useEffect, useRef } from "react";

const SPECTRUM: [number, number, number][] = [
  [255, 51,  85],   // red
  [255, 136, 51],   // orange
  [255, 204, 34],   // yellow
  [51,  255, 136],  // green
  [34,  238, 255],  // cyan
  [51,  102, 255],  // blue
  [153, 68,  255],  // violet
  [255, 68,  204],  // magenta
];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
  colorIdx: number;
  life: number;
  sparklePhase: number;
  sparkleSpeed: number;
}

interface AuroraCloud {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  colorIdx: number;
  alpha: number;
}

interface LightRay {
  angle: number;       // radians
  x: number;           // origin x %
  width: number;       // ray width in px
  colorIdx: number;
  alpha: number;
  speed: number;       // drift speed
  length: number;      // % of screen diagonal
}

interface CrystalShape {
  x: number; y: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  sides: number;
  colorIdx: number;
  alpha: number;
}

export default function PrismaticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const particles: Particle[] = [];
    const clouds: AuroraCloud[] = [];
    const rays: LightRay[] = [];
    const crystals: CrystalShape[] = [];
    const MAX_PARTICLES = 55;
    const MAX_CLOUDS = 5;

    // Color wheel rotation angle
    let colorWheelAngle = 0;

    // Prism flash timer
    let nextFlashFrame = 800 + Math.random() * 400;

    // Aurora ribbon phase
    let auroraTime = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Re-seed clouds
      clouds.length = 0;
      for (let i = 0; i < MAX_CLOUDS; i++) {
        clouds.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.6,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.08,
          radius: 250 + Math.random() * 350,
          colorIdx: Math.floor(Math.random() * SPECTRUM.length),
          alpha: 0.02 + Math.random() * 0.025,
        });
      }

      // Initialize light rays
      rays.length = 0;
      for (let i = 0; i < 5; i++) {
        rays.push({
          angle: -0.3 + Math.random() * 0.6, // slight angle variation
          x: Math.random(),
          width: 20 + Math.random() * 60,
          colorIdx: i % SPECTRUM.length,
          alpha: 0.015 + Math.random() * 0.02,
          speed: 0.0002 + Math.random() * 0.0003,
          length: 0.6 + Math.random() * 0.4,
        });
      }

      // Initialize crystal shapes
      crystals.length = 0;
      for (let i = 0; i < 4; i++) {
        crystals.push({
          x: 0.2 + Math.random() * 0.6,
          y: 0.2 + Math.random() * 0.6,
          size: 40 + Math.random() * 80,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.0008,
          sides: 4 + Math.floor(Math.random() * 4), // 4-7 sides
          colorIdx: Math.floor(Math.random() * SPECTRUM.length),
          alpha: 0.012 + Math.random() * 0.01,
        });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnParticle = () => {
      if (particles.length >= MAX_PARTICLES) return;
      const colorIdx = Math.floor(Math.random() * SPECTRUM.length);
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 8,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.4 + 0.12),
        size: 1 + Math.random() * 2.2,
        alpha: 0.1 + Math.random() * 0.18,
        colorIdx,
        life: 350 + Math.random() * 500,
        sparklePhase: Math.random() * Math.PI * 2,
        sparkleSpeed: 0.02 + Math.random() * 0.04,
      });
    };

    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;
      frame++;
      auroraTime += 0.003;
      ctx.clearRect(0, 0, w, h);

      // ── Layer 0: Slow Rotating Color Wheel (barely visible) ──
      colorWheelAngle += (Math.PI * 2) / (60 * 60); // 60s full rotation
      const wheelCx = w * 0.5;
      const wheelCy = h * 0.5;
      const wheelR = Math.max(w, h) * 0.35;

      ctx.save();
      ctx.translate(wheelCx, wheelCy);
      ctx.rotate(colorWheelAngle);
      for (let i = 0; i < SPECTRUM.length; i++) {
        const startAngle = (i / SPECTRUM.length) * Math.PI * 2;
        const endAngle = ((i + 1) / SPECTRUM.length) * Math.PI * 2;
        const [r, g, b] = SPECTRUM[i];
        const grad = ctx.createRadialGradient(0, 0, wheelR * 0.3, 0, 0, wheelR);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},0.012)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, wheelR, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();

      // ── Layer 1: Light Rays (prism refraction) ──
      for (const ray of rays) {
        ray.x += ray.speed;
        if (ray.x > 1.3) ray.x = -0.3;

        const [r, g, b] = SPECTRUM[ray.colorIdx];
        const rx = ray.x * w;
        const diag = Math.sqrt(w * w + h * h) * ray.length;

        ctx.save();
        ctx.translate(rx, 0);
        ctx.rotate(ray.angle);

        const rayGrad = ctx.createLinearGradient(-ray.width / 2, 0, ray.width / 2, 0);
        rayGrad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        rayGrad.addColorStop(0.3, `rgba(${r},${g},${b},${ray.alpha})`);
        rayGrad.addColorStop(0.5, `rgba(${r},${g},${b},${ray.alpha * 1.5})`);
        rayGrad.addColorStop(0.7, `rgba(${r},${g},${b},${ray.alpha})`);
        rayGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = rayGrad;
        ctx.fillRect(-ray.width / 2, -diag * 0.1, ray.width, diag);
        ctx.restore();
      }

      // ── Layer 2: Aurora Borealis Ribbons ──
      for (let ribbon = 0; ribbon < 3; ribbon++) {
        const ribbonColor = SPECTRUM[(ribbon * 2 + Math.floor(auroraTime * 0.5)) % SPECTRUM.length];
        const [r, g, b] = ribbonColor;
        const baseY = h * (0.08 + ribbon * 0.12);
        const ribbonAlpha = 0.03 + 0.01 * Math.sin(auroraTime + ribbon);

        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += 8) {
          const wave1 = Math.sin(x * 0.003 + auroraTime * 0.8 + ribbon * 2) * 30;
          const wave2 = Math.sin(x * 0.006 + auroraTime * 0.5 + ribbon) * 15;
          const wave3 = Math.sin(x * 0.001 + auroraTime * 0.3) * 50;
          ctx.lineTo(x, baseY + wave1 + wave2 + wave3);
        }
        // Close the ribbon band
        for (let x = w; x >= 0; x -= 8) {
          const wave1 = Math.sin(x * 0.003 + auroraTime * 0.8 + ribbon * 2) * 30;
          const wave2 = Math.sin(x * 0.006 + auroraTime * 0.5 + ribbon) * 15;
          const wave3 = Math.sin(x * 0.001 + auroraTime * 0.3) * 50;
          ctx.lineTo(x, baseY + wave1 + wave2 + wave3 + 25 + ribbon * 10);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${ribbonAlpha})`;
        ctx.fill();
      }

      // ── Layer 3: Aurora Clouds (existing, enhanced) ──
      for (const c of clouds) {
        c.x += c.vx;
        c.y += c.vy;
        if (c.x < -c.radius) c.x = w + c.radius;
        if (c.x > w + c.radius) c.x = -c.radius;
        if (c.y < -c.radius) c.vy = Math.abs(c.vy);
        if (c.y > h + c.radius) c.vy = -Math.abs(c.vy);

        const [r, g, b] = SPECTRUM[c.colorIdx];
        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${c.alpha})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${c.alpha * 0.35})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Layer 4: Crystal Geometric Shapes (barely visible) ──
      for (const cs of crystals) {
        cs.rotation += cs.rotSpeed;
        const cx2 = cs.x * w;
        const cy2 = cs.y * h;
        const [r, g, b] = SPECTRUM[cs.colorIdx];

        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(cs.rotation);
        ctx.strokeStyle = `rgba(${r},${g},${b},${cs.alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let i = 0; i <= cs.sides; i++) {
          const a = (i / cs.sides) * Math.PI * 2;
          const px = Math.cos(a) * cs.size;
          const py = Math.sin(a) * cs.size;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }

      // ── Layer 5: Sparkling Crystal Dust Particles ──
      spawnParticle();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.sparklePhase += p.sparkleSpeed;
        p.alpha *= 0.9988;

        if (p.life <= 0 || p.alpha < 0.008 || p.y < -10) {
          particles.splice(i, 1);
          continue;
        }

        const [r, g, b] = SPECTRUM[p.colorIdx];
        // Sparkle: brightness pulsing
        const sparkle = 0.6 + 0.4 * Math.sin(p.sparklePhase);
        const alpha = p.alpha * sparkle;

        if (alpha < 0.005) continue;

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();

        // Soft glow halo
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        glow.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.2})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // ── Layer 6: Occasional Prism Flash (every 15-20s) ──
      if (frame >= nextFlashFrame) {
        // Brief white-rainbow wash
        const flashAge = frame - nextFlashFrame;
        if (flashAge < 20) {
          const flashAlpha = (1 - flashAge / 20) * 0.04;
          const hueShift = flashAge * 18; // rotate through hues quickly
          const flashIdx = Math.floor((hueShift / 360) * SPECTRUM.length) % SPECTRUM.length;
          const [r, g, b] = SPECTRUM[flashIdx];
          ctx.fillStyle = `rgba(${r},${g},${b},${flashAlpha})`;
          ctx.fillRect(0, 0, w, h);
        }
        if (flashAge >= 20) {
          nextFlashFrame = frame + 900 + Math.random() * 600; // 15-25s
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

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
      style={{ opacity: 0.9 }}
    />
  );
}
