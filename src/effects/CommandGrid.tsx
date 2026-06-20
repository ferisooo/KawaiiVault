import { motion } from "framer-motion";

export default function CommandGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Cosmic void base */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 40%, #0a1628 0%, #060b18 60%, #04070e 100%)
          `,
        }}
      />

      {/* Precision coordinate grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(33, 150, 243, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(33, 150, 243, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Grid intersection markers (+) rendered via tiny dots */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(33, 150, 243, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
          backgroundPosition: "0 0",
        }}
      />

      {/* Slow-drifting depth gradient 1 */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(ellipse at 30% 40%, rgba(13,71,161,0.03) 0%, transparent 50%)",
            "radial-gradient(ellipse at 50% 60%, rgba(13,71,161,0.03) 0%, transparent 50%)",
            "radial-gradient(ellipse at 70% 35%, rgba(13,71,161,0.03) 0%, transparent 50%)",
            "radial-gradient(ellipse at 30% 40%, rgba(13,71,161,0.03) 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      />

      {/* Slow-drifting depth gradient 2 */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(ellipse at 70% 70%, rgba(21,101,192,0.02) 0%, transparent 45%)",
            "radial-gradient(ellipse at 40% 30%, rgba(21,101,192,0.02) 0%, transparent 45%)",
            "radial-gradient(ellipse at 60% 60%, rgba(21,101,192,0.02) 0%, transparent 45%)",
            "radial-gradient(ellipse at 70% 70%, rgba(21,101,192,0.02) 0%, transparent 45%)",
          ],
        }}
        transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
      />

      {/* Holographic spatial ring — very subtle */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vh] h-[120vh] rounded-full border border-[rgba(33,150,243,0.015)] opacity-50"
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vh] h-[80vh] rounded-full border border-[rgba(33,150,243,0.01)] opacity-40"
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 35%, rgba(4,7,14,0.65) 100%)",
        }}
      />
    </div>
  );
}
