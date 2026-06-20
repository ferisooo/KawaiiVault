import { useEffect, useRef } from "react";

// Matrix-style falling hex/binary data columns — cyberpunk theme only
const CHARS = "0123456789ABCDEF▓░▒█▄▀";

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
  opacity: number;
}

export default function DataStream() {
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

    const colWidth = 18;
    const maxCols = Math.floor(window.innerWidth / colWidth);
    const columns: Column[] = [];

    const spawnColumn = () => {
      const length = 6 + Math.floor(Math.random() * 12);
      columns.push({
        x: Math.floor(Math.random() * maxCols) * colWidth,
        y: -length * 14,
        speed: 0.4 + Math.random() * 0.8,
        chars: Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        length,
        opacity: 0.03 + Math.random() * 0.04,
      });
    };

    let frame = 0;
    let animId: number;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      frame++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "11px 'JetBrains Mono', monospace";

      // Spawn new columns occasionally
      if (frame % 18 === 0 && columns.length < 30) spawnColumn();

      for (let i = columns.length - 1; i >= 0; i--) {
        const col = columns[i];
        col.y += col.speed;

        // Randomly mutate a char
        if (frame % 8 === 0) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        for (let j = 0; j < col.chars.length; j++) {
          const charY = col.y + j * 14;
          if (charY < 0 || charY > canvas.height) continue;

          // Head char brighter
          const brightness = j === col.chars.length - 1 ? col.opacity * 3 : col.opacity;
          ctx.fillStyle = `rgba(255, 26, 26, ${brightness})`;
          ctx.fillText(col.chars[j], col.x, charY);
        }

        // Remove when fully off screen
        if (col.y > canvas.height + col.length * 14) {
          columns.splice(i, 1);
        }
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
      style={{ opacity: 1 }}
    />
  );
}
