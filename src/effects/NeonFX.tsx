import { useEffect, useRef, useState, useCallback } from "react";

// Global neon interaction effects:
//  • click  → expanding ring + flying sparks
//  • drag   → glowing trail that follows the cursor while the button is held
type FX =
  | { kind: "ring"; id: number; x: number; y: number }
  | { kind: "spark"; id: number; x: number; y: number; sx: number; sy: number }
  | { kind: "drag"; id: number; x: number; y: number };

export default function NeonFX() {
  const [fx, setFx] = useState<FX[]>([]);
  const idRef = useRef(0);
  const draggingRef = useRef(false);
  const lastDragRef = useRef(0);

  const remove = useCallback((id: number, ms: number) => {
    window.setTimeout(() => setFx((prev) => prev.filter((f) => f.id !== id)), ms);
  }, []);

  useEffect(() => {
    const spawnBurst = (x: number, y: number) => {
      const items: FX[] = [];
      const ringId = idRef.current++;
      items.push({ kind: "ring", id: ringId, x, y });
      remove(ringId, 650);
      const sparks = 6;
      for (let i = 0; i < sparks; i++) {
        const ang = (Math.PI * 2 * i) / sparks + Math.random() * 0.5;
        const dist = 26 + Math.random() * 30;
        const id = idRef.current++;
        items.push({ kind: "spark", id, x, y, sx: Math.cos(ang) * dist, sy: Math.sin(ang) * dist });
        remove(id, 650);
      }
      setFx((prev) => [...prev, ...items]);
    };

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      spawnBurst(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const now = performance.now();
      if (now - lastDragRef.current < 28) return; // throttle the trail
      lastDragRef.current = now;
      const id = idRef.current++;
      setFx((prev) => [...prev, { kind: "drag", id, x: e.clientX, y: e.clientY }]);
      remove(id, 500);
    };
    const onUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [remove]);

  return (
    <div className="neon-fx-layer">
      {fx.map((f) => {
        if (f.kind === "ring") {
          return <span key={f.id} className="neon-click-ring" style={{ left: f.x, top: f.y }} />;
        }
        if (f.kind === "spark") {
          return (
            <span
              key={f.id}
              className="neon-spark"
              style={{ left: f.x, top: f.y, ["--sx" as any]: `${f.sx}px`, ["--sy" as any]: `${f.sy}px` }}
            />
          );
        }
        return <span key={f.id} className="neon-drag-dot" style={{ left: f.x, top: f.y }} />;
      })}
    </div>
  );
}
