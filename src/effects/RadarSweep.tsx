import { useEffect, useRef } from "react";

// Enhanced radar sweep — command theme hero element
// Stronger pulse, afterglow trail, random ping contacts, scrolling topo grid

interface PingContact {
  x: number;
  y: number;
  birth: number; // frame when created
  life: number;  // total frames to live
  size: number;
  type: "blip" | "echo"; // blip = solid dot, echo = ring
}

const MAX_PINGS = 12;
const PING_SPAWN_INTERVAL = 40; // frames between potential spawns

export default function RadarSweep() {
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

    let angle = 0;
    let animId: number;
    let frame = 0;
    const pings: PingContact[] = [];

    // Scrolling grid offset
    let gridOffsetX = 0;
    let gridOffsetY = 0;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      frame++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.max(w, h) * 0.48;

      // ── Layer 0: Scrolling Topographic Grid ──
      gridOffsetX = (gridOffsetX + 0.08) % 60;
      gridOffsetY = (gridOffsetY + 0.05) % 60;

      ctx.strokeStyle = "rgba(33, 150, 243, 0.025)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = -gridOffsetX; x < w; x += 60) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -gridOffsetY; y < h; y += 60) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Finer sub-grid
      ctx.strokeStyle = "rgba(33, 150, 243, 0.012)";
      ctx.beginPath();
      for (let x = -gridOffsetX; x < w; x += 15) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -gridOffsetY; y < h; y += 15) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // ── Layer 1: Concentric Range Rings ──
      for (let i = 1; i <= 5; i++) {
        const r = (i / 5) * maxR;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(33, 150, 243, ${i === 5 ? 0.08 : 0.05})`;
        ctx.lineWidth = i === 5 ? 0.8 : 0.5;
        ctx.stroke();
      }

      // ── Layer 2: Cross Hairs ──
      ctx.strokeStyle = "rgba(33, 150, 243, 0.04)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Diagonal cross hairs (45-degree)
      ctx.strokeStyle = "rgba(33, 150, 243, 0.02)";
      ctx.beginPath();
      const diag = maxR * 0.707;
      ctx.moveTo(cx - diag, cy - diag); ctx.lineTo(cx + diag, cy + diag);
      ctx.moveTo(cx + diag, cy - diag); ctx.lineTo(cx - diag, cy + diag);
      ctx.stroke();

      // ── Layer 3: Enhanced Sweep Arm + Afterglow Trail ──
      const sweepAngle = Math.PI * 0.55; // wider 100° trail

      // Afterglow trail — gradient cone
      for (let t = 0; t < 40; t++) {
        const a = angle - (t / 40) * sweepAngle;
        const alpha = (1 - t / 40) * 0.1;
        if (alpha < 0.002) break;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, a - 0.03, a);
        ctx.closePath();
        ctx.fillStyle = `rgba(33, 150, 243, ${alpha})`;
        ctx.fill();
      }

      // Inner bright afterglow (closer to sweep line)
      for (let t = 0; t < 15; t++) {
        const a = angle - (t / 15) * (sweepAngle * 0.3);
        const alpha = (1 - t / 15) * 0.15;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR * 0.9, a - 0.02, a);
        ctx.closePath();
        ctx.fillStyle = `rgba(100, 181, 246, ${alpha})`;
        ctx.fill();
      }

      // Bright sweep line with glow
      const lineEndX = cx + Math.cos(angle) * maxR;
      const lineEndY = cy + Math.sin(angle) * maxR;

      // Glow halo on sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lineEndX, lineEndY);
      ctx.strokeStyle = "rgba(33, 150, 243, 0.12)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Core sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(lineEndX, lineEndY);
      ctx.strokeStyle = "rgba(100, 181, 246, 0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // ── Layer 4: Sonar pulse ring at sweep tip ──
      const pulsePhase = (frame % 60) / 60;
      const pulseR = 3 + pulsePhase * 12;
      const pulseA = (1 - pulsePhase) * 0.3;
      ctx.beginPath();
      ctx.arc(lineEndX, lineEndY, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(100, 181, 246, ${pulseA})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // ── Layer 5: Center Hub ──
      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(100, 181, 246, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100, 181, 246, 0.5)";
      ctx.fill();

      // ── Layer 6: Radar Ping Contacts ──
      // Spawn new pings
      if (frame % PING_SPAWN_INTERVAL === 0 && pings.length < MAX_PINGS && Math.random() < 0.6) {
        // Random position within radar range
        const pingAngle = Math.random() * Math.PI * 2;
        const pingDist = 0.2 + Math.random() * 0.7; // 20-90% of maxR
        pings.push({
          x: cx + Math.cos(pingAngle) * maxR * pingDist,
          y: cy + Math.sin(pingAngle) * maxR * pingDist,
          birth: frame,
          life: 120 + Math.floor(Math.random() * 180), // 2-5 seconds
          size: 1.5 + Math.random() * 2,
          type: Math.random() < 0.7 ? "blip" : "echo",
        });
      }

      // Draw pings
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i];
        const age = frame - p.birth;

        if (age >= p.life) {
          pings.splice(i, 1);
          continue;
        }

        // Fade in quickly, hold, then fade out
        const fadeIn = Math.min(1, age / 15);
        const fadeOut = Math.max(0, 1 - (age - p.life * 0.6) / (p.life * 0.4));
        const alpha = fadeIn * (age > p.life * 0.6 ? fadeOut : 1);

        if (p.type === "blip") {
          // Solid dot with glow
          const blipGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
          blipGrad.addColorStop(0, `rgba(100, 200, 255, ${alpha * 0.5})`);
          blipGrad.addColorStop(1, `rgba(33, 150, 243, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
          ctx.fillStyle = blipGrad;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(130, 210, 255, ${alpha * 0.8})`;
          ctx.fill();

          // Initial ping flash ring (first 20 frames)
          if (age < 20) {
            const ringR = p.size + (age / 20) * 12;
            const ringA = (1 - age / 20) * alpha * 0.4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 181, 246, ${ringA})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        } else {
          // Echo ring — expanding/fading circle
          const echoR = p.size * 2 + (age / p.life) * 15;
          ctx.beginPath();
          ctx.arc(p.x, p.y, echoR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(33, 150, 243, ${alpha * 0.35})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      // ── Layer 7: Slow Horizontal Scan Line (separate from sonar) ──
      const scanY = ((frame * 0.5) % (h + 40)) - 20;
      const scanGrad = ctx.createLinearGradient(0, scanY - 2, 0, scanY + 2);
      scanGrad.addColorStop(0, "rgba(33, 150, 243, 0)");
      scanGrad.addColorStop(0.5, "rgba(100, 181, 246, 0.06)");
      scanGrad.addColorStop(1, "rgba(33, 150, 243, 0)");
      ctx.fillRect(0, scanY - 2, w, 4);
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 2, w, 4);

      // ── Layer 8: Edge Depth/Altitude Markers ──
      ctx.font = "9px 'Exo 2', monospace";
      ctx.textAlign = "right";
      for (let i = 0; i < 6; i++) {
        const markerY = (h / 7) * (i + 1);
        const val = (1000 + Math.floor(frame * 0.1 + i * 167) % 9000);
        const markerAlpha = 0.12 + 0.03 * Math.sin(frame * 0.01 + i);
        ctx.fillStyle = `rgba(100, 181, 246, ${markerAlpha})`;
        ctx.fillText(`${val}m`, 42, markerY);

        // Small tick mark
        ctx.beginPath();
        ctx.moveTo(46, markerY);
        ctx.lineTo(52, markerY);
        ctx.strokeStyle = `rgba(33, 150, 243, ${markerAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Top edge markers
      ctx.textAlign = "center";
      for (let i = 0; i < 5; i++) {
        const markerX = (w / 6) * (i + 1);
        const bearing = ((Math.floor(frame * 0.05) + i * 72) % 360);
        const markerAlpha = 0.1 + 0.02 * Math.sin(frame * 0.008 + i);
        ctx.fillStyle = `rgba(100, 181, 246, ${markerAlpha})`;
        ctx.fillText(`${bearing.toString().padStart(3, "0")}°`, markerX, 16);

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(markerX, 19);
        ctx.lineTo(markerX, 24);
        ctx.strokeStyle = `rgba(33, 150, 243, ${markerAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      angle += 0.008;
    };

    draw();

    const handleVis = () => {
      if (document.hidden) cancelAnimationFrame(animId);
      else animId = requestAnimationFrame(draw);
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
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
