import { useEffect, useRef } from "react";

// Tactical HUD overlay — comms text, MASTER LOCK watermark, cursor reticle
// All very subtle, supports the radar sweep as hero element

const COMMS_PHRASES = [
  "SIG ACQUIRED",
  "FREQ 142.8MHz",
  "SYNC OK",
  "TGT TRACK 04",
  "SAT LINK UP",
  "CRYPTO VALID",
  "NET SECURE",
  "ACK 200 OK",
  "UPLINK 99.7%",
  "PING 12ms",
  "AUTH VERIFIED",
  "SECTOR CLEAR",
  "RELAY ACTIVE",
  "BRG 247°",
  "LOCK ENGAGED",
];

interface CommsFlash {
  text: string;
  x: number;
  y: number;
  birth: number;
  life: number;
  corner: number; // 0=TL, 1=TR, 2=BL, 3=BR
}

export default function TacticalHUD() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frame = 0;
    const commsFlashes: CommsFlash[] = [];
    let nextCommsFrame = 100 + Math.random() * 200;

    // Watermark angle
    let watermarkOffset = 0;

    // Cursor position tracking
    let cursorX = -100;
    let cursorY = -100;
    const handleMouse = (e: MouseEvent) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouse);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      animId = requestAnimationFrame(render);
      frame++;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // ── Layer 1: MASTER LOCK Watermark ──
      watermarkOffset = (watermarkOffset + 0.15) % (w + 400);
      ctx.save();
      ctx.font = "bold 14px 'Exo 2', monospace";
      ctx.textAlign = "center";
      const wmAlpha = 0.025 + 0.005 * Math.sin(frame * 0.005);
      ctx.fillStyle = `rgba(33, 150, 243, ${wmAlpha})`;

      // Two drifting watermark rows
      const wmY1 = h * 0.35;
      const wmY2 = h * 0.65;
      for (let i = -1; i < 4; i++) {
        const x1 = i * 350 + watermarkOffset - 200;
        ctx.fillText("MASTER LOCK", x1, wmY1);
        ctx.fillText("CLASSIFIED", x1 + 175, wmY2);
      }
      ctx.restore();

      // ── Layer 2: Corner Comms Text Flicker ──
      // Spawn new comms
      if (frame >= nextCommsFrame) {
        const corner = Math.floor(Math.random() * 4);
        const margins = { x: 65 + Math.random() * 40, y: 35 + Math.random() * 25 };
        let cx2: number, cy2: number;
        switch (corner) {
          case 0: cx2 = margins.x; cy2 = margins.y; break;
          case 1: cx2 = w - margins.x; cy2 = margins.y; break;
          case 2: cx2 = margins.x; cy2 = h - margins.y; break;
          default: cx2 = w - margins.x; cy2 = h - margins.y; break;
        }
        commsFlashes.push({
          text: COMMS_PHRASES[Math.floor(Math.random() * COMMS_PHRASES.length)],
          x: cx2,
          y: cy2,
          birth: frame,
          life: 80 + Math.floor(Math.random() * 120),
          corner,
        });
        nextCommsFrame = frame + 200 + Math.random() * 400;
      }

      ctx.font = "9px 'Exo 2', monospace";
      for (let i = commsFlashes.length - 1; i >= 0; i--) {
        const c = commsFlashes[i];
        const age = frame - c.birth;
        if (age >= c.life) {
          commsFlashes.splice(i, 1);
          continue;
        }

        const fadeIn = Math.min(1, age / 8);
        const fadeOut = Math.max(0, 1 - (age - c.life * 0.7) / (c.life * 0.3));
        let alpha = fadeIn * (age > c.life * 0.7 ? fadeOut : 1) * 0.2;

        // Occasional flicker
        if (Math.random() < 0.05) alpha *= 0.3;

        ctx.textAlign = (c.corner === 1 || c.corner === 3) ? "right" : "left";
        ctx.fillStyle = `rgba(100, 181, 246, ${alpha})`;
        ctx.fillText(c.text, c.x, c.y);
      }

      // ── Layer 3: Cursor Targeting Reticle ──
      if (cursorX > 0 && cursorY > 0) {
        const reticleAlpha = 0.12;
        const reticleSize = 14;

        ctx.strokeStyle = `rgba(100, 181, 246, ${reticleAlpha})`;
        ctx.lineWidth = 0.8;

        // Horizontal crosshair lines (gap in middle)
        ctx.beginPath();
        ctx.moveTo(cursorX - reticleSize, cursorY);
        ctx.lineTo(cursorX - 4, cursorY);
        ctx.moveTo(cursorX + 4, cursorY);
        ctx.lineTo(cursorX + reticleSize, cursorY);
        // Vertical crosshair lines
        ctx.moveTo(cursorX, cursorY - reticleSize);
        ctx.lineTo(cursorX, cursorY - 4);
        ctx.moveTo(cursorX, cursorY + 4);
        ctx.lineTo(cursorX, cursorY + reticleSize);
        ctx.stroke();

        // Small corner brackets around cursor
        const br = reticleSize + 2;
        const brLen = 4;
        ctx.strokeStyle = `rgba(33, 150, 243, ${reticleAlpha * 0.7})`;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(cursorX - br, cursorY - br + brLen);
        ctx.lineTo(cursorX - br, cursorY - br);
        ctx.lineTo(cursorX - br + brLen, cursorY - br);
        // Top-right
        ctx.moveTo(cursorX + br - brLen, cursorY - br);
        ctx.lineTo(cursorX + br, cursorY - br);
        ctx.lineTo(cursorX + br, cursorY - br + brLen);
        // Bottom-left
        ctx.moveTo(cursorX - br, cursorY + br - brLen);
        ctx.lineTo(cursorX - br, cursorY + br);
        ctx.lineTo(cursorX - br + brLen, cursorY + br);
        // Bottom-right
        ctx.moveTo(cursorX + br - brLen, cursorY + br);
        ctx.lineTo(cursorX + br, cursorY + br);
        ctx.lineTo(cursorX + br, cursorY + br - brLen);
        ctx.stroke();
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
      window.removeEventListener("mousemove", handleMouse);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[2]"
      style={{ opacity: 0.9 }}
    />
  );
}
