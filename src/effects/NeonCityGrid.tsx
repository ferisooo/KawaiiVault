export default function NeonCityGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Illuminated city-block grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.05) 1px, transparent 1px),
            linear-gradient(rgba(0,200,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,200,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />
      {/* Intense city glow from below — neon sign reflections */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 15% 100%, rgba(0,150,255,0.15) 0%, transparent 40%),
            radial-gradient(ellipse at 80% 95%, rgba(0,255,255,0.12) 0%, transparent 35%),
            radial-gradient(ellipse at 50% 100%, rgba(0,100,255,0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 30% 70%, rgba(119,68,255,0.06) 0%, transparent 30%),
            radial-gradient(ellipse at 90% 60%, rgba(255,68,170,0.04) 0%, transparent 25%)
          `,
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Wet street reflection band at bottom */}
      <div className="nc-wet-street" />

      {/* Slow horizontal fog/haze layer */}
      <div className="nc-fog-layer" />

      {/* Distant neon sign flickers — brief color points */}
      <div
        className="nc-distant-sign"
        style={{
          left: "12%", top: "22%",
          width: 6, height: 3,
          background: "rgba(0, 255, 255, 0.8)",
          boxShadow: "0 0 8px rgba(0, 255, 255, 0.6), 0 0 20px rgba(0, 255, 255, 0.3)",
          animation: "nc-distant-sign-1 7s linear infinite",
        }}
      />
      <div
        className="nc-distant-sign"
        style={{
          left: "68%", top: "15%",
          width: 8, height: 3,
          background: "rgba(255, 68, 170, 0.7)",
          boxShadow: "0 0 8px rgba(255, 68, 170, 0.5), 0 0 20px rgba(255, 68, 170, 0.2)",
          animation: "nc-distant-sign-2 9s linear infinite",
        }}
      />
      <div
        className="nc-distant-sign"
        style={{
          left: "42%", top: "28%",
          width: 5, height: 3,
          background: "rgba(119, 68, 255, 0.7)",
          boxShadow: "0 0 8px rgba(119, 68, 255, 0.5), 0 0 20px rgba(119, 68, 255, 0.2)",
          animation: "nc-distant-sign-3 11s linear infinite",
        }}
      />
      <div
        className="nc-distant-sign"
        style={{
          left: "85%", top: "35%",
          width: 7, height: 2,
          background: "rgba(0, 200, 255, 0.6)",
          boxShadow: "0 0 6px rgba(0, 200, 255, 0.4)",
          animation: "nc-distant-sign-1 13s linear infinite 3s",
        }}
      />
      <div
        className="nc-distant-sign"
        style={{
          left: "25%", top: "40%",
          width: 4, height: 3,
          background: "rgba(0, 255, 255, 0.5)",
          boxShadow: "0 0 6px rgba(0, 255, 255, 0.3)",
          animation: "nc-distant-sign-2 6s linear infinite 2s",
        }}
      />
    </div>
  );
}
