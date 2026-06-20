export default function Scanlines() {
  return (
    <>
      {/* Static scanlines */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.03) 2px,
            rgba(0, 0, 0, 0.03) 4px
          )`,
        }}
      />
      {/* Moving scanline */}
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          background: "linear-gradient(transparent 50%, rgba(255, 26, 26, 0.015) 50%)",
          backgroundSize: "100% 4px",
          animation: "scanline 8s linear infinite",
        }}
      />
    </>
  );
}
