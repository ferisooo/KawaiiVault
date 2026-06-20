import { useEffect, useRef } from "react";

// Organic living effects — DNA helix, bioluminescent pulses, cell division, binary drift
// All very organic and breathing, supports neural web + spores as hero elements

interface BiolumPulse {
  x: number;
  y: number;
  birth: number;
  maxRadius: number;
  life: number;
}

interface CellDivision {
  x: number;
  y: number;
  birth: number;
  radius: number;
  splitPhase: number; // 0 = whole, 1 = fully split
  life: number;
}

interface BinaryChar {
  x: number;
  y: number;
  char: string;
  alpha: number;
  speed: number;
  life: number;
  maxLife: number;
}

const BASE_PAIRS = ["A", "T", "G", "C"];

export default function BioOrganicFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const pulses: BiolumPulse[] = [];
    const divisions: CellDivision[] = [];
    const binaryChars: BinaryChar[] = [];

    let nextPulseFrame = 120 + Math.random() * 180;
    let nextDivisionFrame = 500 + Math.random() * 400;
    let nextBinaryBatch = 60;

    // DNA helix parameters
    let helixOffset = 0;

    // Breathing phase
    let breathPhase = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      animId = requestAnimationFrame(render);
      frame++;
      breathPhase += Math.PI * 2 / (8 * 60); // 8s cycle
      helixOffset += 0.015;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Global breathing radiance
      const breathAlpha = 0.015 + 0.01 * Math.sin(breathPhase);
      ctx.fillStyle = `rgba(0, 230, 118, ${breathAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // ── Layer 1: DNA Double Helix ──
      const helixCx = w * 0.5;
      const helixAmplitude = 35;
      const helixSpacing = 12; // pixels between rungs
      const helixHeight = h + 100;
      const strandAlpha = 0.08;

      // Draw two intertwined strands with base pairs
      ctx.lineWidth = 1;
      for (let strand = 0; strand < 2; strand++) {
        const phaseOffset = strand * Math.PI;
        ctx.beginPath();

        for (let y = -50; y < helixHeight; y += 2) {
          const adjustedY = y + (helixOffset * 30) % helixSpacing;
          const sineVal = Math.sin(adjustedY * 0.025 + phaseOffset + helixOffset);
          const px = helixCx + sineVal * helixAmplitude;
          const depthAlpha = 0.5 + 0.5 * Math.cos(adjustedY * 0.025 + phaseOffset + helixOffset);

          if (y === -50) ctx.moveTo(px, adjustedY);
          else ctx.lineTo(px, adjustedY);
        }

        ctx.strokeStyle = `rgba(0, 230, 118, ${strandAlpha})`;
        ctx.stroke();
      }

      // Base pair connections (rungs)
      for (let y = -50; y < helixHeight; y += helixSpacing) {
        const adjustedY = y + (helixOffset * 30) % helixSpacing;
        const sine1 = Math.sin(adjustedY * 0.025 + helixOffset);
        const sine2 = Math.sin(adjustedY * 0.025 + Math.PI + helixOffset);
        const x1 = helixCx + sine1 * helixAmplitude;
        const x2 = helixCx + sine2 * helixAmplitude;

        // Depth-based alpha (closer rungs brighter)
        const depth = 0.5 + 0.5 * Math.sin(adjustedY * 0.025 + helixOffset);
        const rungAlpha = depth * 0.05;

        ctx.beginPath();
        ctx.moveTo(x1, adjustedY);
        ctx.lineTo(x2, adjustedY);
        ctx.strokeStyle = `rgba(105, 240, 174, ${rungAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ── Layer 2: Bioluminescent Pulse Waves ──
      if (frame >= nextPulseFrame) {
        pulses.push({
          x: Math.random() * w,
          y: Math.random() * h,
          birth: frame,
          maxRadius: 80 + Math.random() * 120,
          life: 180 + Math.floor(Math.random() * 120),
        });
        nextPulseFrame = frame + 200 + Math.random() * 300; // ~3-8s
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        const age = frame - p.birth;
        if (age >= p.life) { pulses.splice(i, 1); continue; }

        const progress = age / p.life;
        const radius = progress * p.maxRadius;
        const alpha = (1 - progress) * 0.08;

        // Expanding ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 230, 118, ${alpha})`;
        ctx.lineWidth = 1.5 - progress;
        ctx.stroke();

        // Soft glow at center (fading)
        if (age < p.life * 0.3) {
          const centerAlpha = (1 - age / (p.life * 0.3)) * 0.06;
          const centerGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 15);
          centerGrad.addColorStop(0, `rgba(105, 240, 174, ${centerAlpha})`);
          centerGrad.addColorStop(1, `rgba(0, 230, 118, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
          ctx.fillStyle = centerGrad;
          ctx.fill();
        }
      }

      // ── Layer 3: Cell Division ──
      if (frame >= nextDivisionFrame && divisions.length < 2) {
        divisions.push({
          x: 0.15 + Math.random() * 0.7,
          y: 0.15 + Math.random() * 0.7,
          birth: frame,
          radius: 12 + Math.random() * 16,
          splitPhase: 0,
          life: 300 + Math.floor(Math.random() * 200),
        });
        nextDivisionFrame = frame + 600 + Math.random() * 600; // 10-20s
      }

      for (let i = divisions.length - 1; i >= 0; i--) {
        const d = divisions[i];
        const age = frame - d.birth;
        if (age >= d.life) { divisions.splice(i, 1); continue; }

        const progress = age / d.life;
        d.splitPhase = Math.min(1, progress * 2); // split happens in first half

        const cx2 = d.x * w;
        const cy2 = d.y * h;
        const fadeAlpha = progress > 0.7 ? (1 - (progress - 0.7) / 0.3) : 1;
        const alpha = 0.04 * fadeAlpha;

        const splitDist = d.splitPhase * d.radius * 1.5;

        // Two halves
        for (const sign of [-1, 1]) {
          const offsetX = sign * splitDist;
          const cellX = cx2 + offsetX;

          ctx.beginPath();
          ctx.arc(cellX, cy2, d.radius * (1 - d.splitPhase * 0.2), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 230, 118, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Inner glow
          const cellGrad = ctx.createRadialGradient(cellX, cy2, 0, cellX, cy2, d.radius);
          cellGrad.addColorStop(0, `rgba(105, 240, 174, ${alpha * 0.4})`);
          cellGrad.addColorStop(1, `rgba(0, 230, 118, 0)`);
          ctx.beginPath();
          ctx.arc(cellX, cy2, d.radius, 0, Math.PI * 2);
          ctx.fillStyle = cellGrad;
          ctx.fill();
        }

        // Membrane bridge during split
        if (d.splitPhase > 0.1 && d.splitPhase < 0.8) {
          const bridgeAlpha = alpha * (1 - Math.abs(d.splitPhase - 0.45) / 0.35);
          ctx.beginPath();
          ctx.moveTo(cx2 - splitDist + d.radius * 0.5, cy2);
          ctx.lineTo(cx2 + splitDist - d.radius * 0.5, cy2);
          ctx.strokeStyle = `rgba(105, 240, 174, ${bridgeAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // ── Layer 4: Binary/Hex Drift (very subtle matrix) ──
      if (frame >= nextBinaryBatch) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          const isBinary = Math.random() < 0.6;
          binaryChars.push({
            x: Math.random() * w,
            y: h + 10,
            char: isBinary
              ? (Math.random() < 0.5 ? "0" : "1")
              : BASE_PAIRS[Math.floor(Math.random() * 4)],
            alpha: 0,
            speed: 0.15 + Math.random() * 0.3,
            life: 0,
            maxLife: 300 + Math.floor(Math.random() * 300),
          });
        }
        nextBinaryBatch = frame + 40 + Math.random() * 80;
      }

      ctx.font = "9px 'Exo 2', monospace";
      ctx.textAlign = "center";
      for (let i = binaryChars.length - 1; i >= 0; i--) {
        const bc = binaryChars[i];
        bc.y -= bc.speed;
        bc.life++;

        const fadeIn = Math.min(1, bc.life / 30);
        const fadeOut = Math.max(0, 1 - (bc.life - bc.maxLife * 0.7) / (bc.maxLife * 0.3));
        bc.alpha = fadeIn * (bc.life > bc.maxLife * 0.7 ? fadeOut : 1) * 0.06;

        if (bc.life >= bc.maxLife || bc.y < -10) {
          binaryChars.splice(i, 1);
          continue;
        }

        // DNA base pairs get teal tint, binary gets green
        const isBasePair = "ATGC".includes(bc.char);
        ctx.fillStyle = isBasePair
          ? `rgba(0, 229, 204, ${bc.alpha})`
          : `rgba(0, 230, 118, ${bc.alpha})`;
        ctx.fillText(bc.char, bc.x, bc.y);
      }

      // ── Layer 5: Edge DNA Labels (A T G C flicker) ──
      if (Math.random() < 0.003) {
        const label = BASE_PAIRS[Math.floor(Math.random() * 4)];
        const edge = Math.floor(Math.random() * 4);
        let lx: number, ly: number;
        switch (edge) {
          case 0: lx = 20 + Math.random() * 40; ly = 30 + Math.random() * 30; break;
          case 1: lx = w - 20 - Math.random() * 40; ly = 30 + Math.random() * 30; break;
          case 2: lx = 20 + Math.random() * 40; ly = h - 20 - Math.random() * 30; break;
          default: lx = w - 20 - Math.random() * 40; ly = h - 20 - Math.random() * 30; break;
        }
        ctx.font = "bold 11px 'Exo 2', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(105, 240, 174, 0.12)`;
        ctx.fillText(label, lx, ly);
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
