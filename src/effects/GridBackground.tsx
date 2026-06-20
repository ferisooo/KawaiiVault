export default function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Static vertical grid lines only */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(255,26,26,0.04) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      {/* Radial gradient fog */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(139,0,0,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, rgba(139,0,0,0.05) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 0%, rgba(255,26,26,0.03) 0%, transparent 40%)
          `,
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />
    </div>
  );
}
