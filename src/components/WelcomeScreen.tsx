import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onContinue: () => void;
}

const STORAGE_KEY = "cybervault_username";

const GLOW_COLORS = [
  { color: "#ff1a1a", glow: "rgba(255, 26, 26, 0.15)" },   // Crimson
  { color: "#2196f3", glow: "rgba(33, 150, 243, 0.15)" },   // Blue
  { color: "#00e676", glow: "rgba(0, 230, 118, 0.15)" },    // Green
  { color: "#22eeff", glow: "rgba(34, 238, 255, 0.15)" },   // Cyan
  { color: "#9944ff", glow: "rgba(153, 68, 255, 0.15)" },   // Violet
  { color: "#ff44cc", glow: "rgba(255, 68, 204, 0.15)" },   // Magenta
];

export default function WelcomeScreen({ onContinue }: Props) {
  const [username, setUsername] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [phase, setPhase] = useState<"loading" | "name-entry" | "welcome">("loading");
  const [themeColor] = useState(() => GLOW_COLORS[Math.floor(Math.random() * GLOW_COLORS.length)]);

  // Check localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUsername(saved);
      setPhase("welcome");
    } else {
      setPhase("name-entry");
    }
  }, []);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setUsername(trimmed);
    setPhase("welcome");
  }, [nameInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleNameSubmit();
  }, [handleNameSubmit]);

  const isFirstTime = !localStorage.getItem(STORAGE_KEY) || phase === "name-entry";

  if (phase === "loading") return null;

  return (
    <motion.div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center cursor-pointer select-none"
      onClick={phase === "welcome" ? onContinue : undefined}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <AnimatePresence mode="wait">
        {/* ── Name Entry (first time only) ── */}
        {phase === "name-entry" && (
          <motion.div
            key="name-entry"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-8 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.p
              className="text-[17px] font-light tracking-wide"
              style={{ color: themeColor.color }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              What should we call you?
            </motion.p>

            <motion.input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your name"
              autoFocus
              className="w-72 px-5 py-3 bg-transparent border-b-2 text-center text-[17px] text-white/90 placeholder-white/20 outline-none transition-colors focus:border-current"
              style={{ borderColor: `${themeColor.color}66`, color: "rgba(255,255,255,0.9)" }}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "18rem" }}
              transition={{ delay: 0.4, duration: 0.5 }}
              onFocus={(e) => { e.target.style.borderColor = themeColor.color; e.target.style.animation = "border-glow 2s infinite"; }}
              onBlur={(e) => { e.target.style.borderColor = `${themeColor.color}66`; e.target.style.animation = ""; }}
            />

            <motion.button
              onClick={handleNameSubmit}
              disabled={!nameInput.trim()}
              className="px-8 py-2.5 rounded-full text-[17px] font-medium tracking-wider uppercase transition-all disabled:opacity-20 disabled:cursor-not-allowed"
              style={{
                backgroundColor: `${themeColor.color}22`,
                color: themeColor.color,
                border: `1px solid ${themeColor.color}44`,
              }}
              whileHover={nameInput.trim() ? { scale: 1.05, backgroundColor: `${themeColor.color}33` } : {}}
              whileTap={nameInput.trim() ? { scale: 0.95 } : {}}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Continue
            </motion.button>
          </motion.div>
        )}

        {/* ── Welcome Animation ── */}
        {phase === "welcome" && username && (
          <motion.div
            key="welcome"
            className="flex flex-col items-center justify-center gap-6 relative"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: [0.9, 1, 0.9], scale: [0.97, 1.03, 0.97] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Circular glow ripple */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {[0, 0.6, 1.2].map((delay, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    border: `1px solid ${themeColor.color}`,
                    boxShadow: `0 0 40px ${themeColor.glow}, inset 0 0 40px ${themeColor.glow}`,
                  }}
                  initial={{ width: 0, height: 0, opacity: 0.6 }}
                  animate={{
                    width: [0, 600, 1200],
                    height: [0, 600, 1200],
                    opacity: [0.5, 0.2, 0],
                  }}
                  transition={{
                    duration: 3,
                    delay,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>

            {/* Warm center glow */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 300,
                height: 300,
                background: `radial-gradient(circle, ${themeColor.glow} 0%, transparent 70%)`,
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0.7], scale: [0.5, 1.2, 1] }}
              transition={{ duration: 2, ease: "easeOut" }}
            />

            {/* Welcome text */}
            <motion.h1
              className="text-[17px] font-light tracking-wide text-center relative z-10"
              style={{ color: themeColor.color, animation: "letter-spacing-in 0.8s ease-out" }}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              {isFirstTime ? "Welcome, " : "Welcome back, "}
              <span className="font-medium">{username}</span>
            </motion.h1>

            <motion.p
              className="text-[17px] text-white/40 tracking-wide text-center relative z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              style={{ animation: "fade-in-blur 0.5s ease-out 0.7s both" }}
            >
              {isFirstTime
                ? "Your private space is ready for you"
                : "Your private space is waiting for you"}
            </motion.p>

            {/* Click to continue prompt */}
            <motion.p
              className="absolute bottom-[-120px] text-[17px] text-white/20 tracking-widest uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0.15, 0.4] }}
              transition={{ delay: 1.5, duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ animation: "neon-breathe 3s infinite 1.5s" }}
            >
              Click anywhere to continue
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Credit: only made possible by feris ── */}
      <motion.a
        href="https://mez.ink/ferisooo"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[210] text-center cursor-pointer select-none"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        whileHover={{ scale: 1.06 }}
      >
        <span
          className="block text-[13px] tracking-wide font-semibold"
          style={{ color: themeColor.color, textShadow: `0 0 12px ${themeColor.glow}` }}
        >
          ✨ Only made possible by feris ✨
        </span>
        <span className="block text-[12px] text-white/60 underline decoration-dotted">
          mez.ink/ferisooo
        </span>
      </motion.a>
    </motion.div>
  );
}
