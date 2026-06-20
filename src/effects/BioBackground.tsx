import { motion } from "framer-motion";

export default function BioBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base radial gradient — deep forest void */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 40% 60%, #0a1a0d 0%, #060d06 70%, #030503 100%)
          `,
        }}
      />

      {/* Drifting fog layer 1 */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(ellipse at 20% 40%, rgba(27,94,32,0.06) 0%, transparent 60%)",
            "radial-gradient(ellipse at 60% 60%, rgba(27,94,32,0.06) 0%, transparent 60%)",
            "radial-gradient(ellipse at 30% 70%, rgba(27,94,32,0.06) 0%, transparent 60%)",
            "radial-gradient(ellipse at 20% 40%, rgba(27,94,32,0.06) 0%, transparent 60%)",
          ],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />

      {/* Drifting fog layer 2 */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(ellipse at 70% 30%, rgba(0,135,58,0.04) 0%, transparent 50%)",
            "radial-gradient(ellipse at 40% 50%, rgba(0,135,58,0.04) 0%, transparent 50%)",
            "radial-gradient(ellipse at 80% 70%, rgba(0,135,58,0.04) 0%, transparent 50%)",
            "radial-gradient(ellipse at 70% 30%, rgba(0,135,58,0.04) 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
      />

      {/* Drifting fog layer 3 — subtle jade */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: [
            "radial-gradient(ellipse at 50% 20%, rgba(46,125,70,0.03) 0%, transparent 40%)",
            "radial-gradient(ellipse at 30% 80%, rgba(46,125,70,0.03) 0%, transparent 40%)",
            "radial-gradient(ellipse at 70% 40%, rgba(46,125,70,0.03) 0%, transparent 40%)",
            "radial-gradient(ellipse at 50% 20%, rgba(46,125,70,0.03) 0%, transparent 40%)",
          ],
        }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* Soft vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(6,13,6,0.7) 100%)",
        }}
      />

      {/* Very faint data stream columns — barely visible */}
      <div className="absolute inset-0 opacity-[0.015]">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute top-0 w-[1px]"
            style={{
              left: `${12 + i * 12}%`,
              height: "100%",
              background: `linear-gradient(to top, transparent 0%, #00e676 30%, #00e676 70%, transparent 100%)`,
            }}
            animate={{ y: ["100%", "-100%"] }}
            transition={{
              duration: 15 + i * 3,
              repeat: Infinity,
              ease: "linear",
              delay: i * 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
