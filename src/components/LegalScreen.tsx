import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

interface Props {
  onAccept: () => void;
}

const LS_ACCEPTED = "cybervault_tos_accepted";

export function hasAcceptedTOS(): boolean {
  return localStorage.getItem(LS_ACCEPTED) === "1";
}

export default function LegalScreen({ onAccept }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" when within 20px of the end
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 20) {
      setScrolledToBottom(true);
    }
  }, []);

  useEffect(() => {
    // In case content fits without scrolling
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight) {
      setScrolledToBottom(true);
    }
  }, []);

  const handleAccept = useCallback(() => {
    localStorage.setItem(LS_ACCEPTED, "1");
    onAccept();
  }, [onAccept]);

  return (
    <motion.div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col w-full max-w-2xl max-h-[80vh] mx-4">
        {/* Header */}
        <motion.h1
          className="text-center text-lg font-medium tracking-wider uppercase text-white/80 mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Terms of Service &amp; Privacy Policy
        </motion.h1>

        {/* Scrollable content */}
        <motion.div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] px-6 py-5 text-[17px] leading-relaxed text-white/60 scroll-smooth"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wide">Terms of Service</h2>

          <p className="mb-3">
            <strong className="text-white/70">1. The Basics</strong><br />
            By using Kawaii Vault, you're agreeing to these terms. If that doesn't work for you, no hard feelings — just don't use the app.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">2. Your License</strong><br />
            You're free to use Kawaii Vault for personal use. Just don't try to reverse-engineer, decompile, resell, or take it apart — that's off limits.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">3. Free &amp; Pro</strong><br />
            There's a free tier with some limits and a Pro tier you can unlock with a Gumroad license key. If you want a refund, you've got 7 days from purchase — after that, it's final. If you do get a refund, Pro features go away and you're back on free. I might tweak what's included in each tier over time.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">4. Your Stuff, Your Responsibility</strong><br />
            Your vault password, key files, and backups are on you. Kawaii Vault encrypts everything locally — which is great for privacy, but it also means if you lose your password, I can't help you get back in. There is a "forgot password" option, but it will wipe all your data and start fresh.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">5. No Guarantees</strong><br />
            I'm building this as best I can, but the app is provided "as is." I can't promise it'll be perfect, bug-free, or never crash. Use it at your own risk.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">6. Liability</strong><br />
            If something goes wrong — lost data, corrupted files, whatever — I'm not liable for damages. I know that sounds harsh, but that's the deal with local-only encrypted software.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">7. Updates</strong><br />
            I may update the app or these terms from time to time. If you keep using Kawaii Vault after a change, that counts as accepting the new terms.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">8. Cutting Access</strong><br />
            Since Kawaii Vault runs entirely on your device with no accounts or servers, there's no access to revoke. Your data is yours — always.
          </p>

          <div className="border-t border-white/10 my-5" />

          <h2 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wide">Privacy Policy</h2>

          <p className="mb-3">
            <strong className="text-white/70">1. Everything Stays on Your Device</strong><br />
            Kawaii Vault is local-first. Your vault data, passwords, notes, documents, and media are encrypted and stored entirely on your machine. I don't run any servers that hold your stuff.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">2. License Check</strong><br />
            When you activate a Pro key, the app pings Gumroad's API (<code className="text-white/50">api.gumroad.com</code>) to verify it. That request includes your license key and your IP address — that's it. No vault data ever leaves your device.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">3. What I Don't Collect</strong><br />
            I don't collect, send, or store any of your: vault contents, passwords, encryption keys, file names, analytics, telemetry, crash reports, or personal info. The only external call is the Gumroad license check.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">4. Local Storage</strong><br />
            The app saves your preferences (theme, name, license status) in your browser's localStorage. None of that ever leaves your device.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">5. Third-Party Services</strong><br />
            Gumroad is the only outside service Kawaii Vault talks to, and only for license verification. You might want to check out their privacy policy too.
          </p>

          <p className="mb-3">
            <strong className="text-white/70">6. Kids</strong><br />
            This app isn't made for children under 13, and I don't knowingly collect any info from minors.
          </p>

          <p className="mb-4">
            <strong className="text-white/70">7. Questions?</strong><br />
            If you have any questions about this stuff, feel free to reach out at{" "}
            <a href="https://bio.link/cybero" target="_blank" rel="noopener noreferrer" className="text-white/80 underline underline-offset-2 hover:text-white transition-colors">bio.link/cybero</a>.
          </p>

          {/* Scroll marker */}
          <div className="text-center text-white/20 text-xs pt-2 pb-1 tracking-widest uppercase">
            — End of document —
          </div>
        </motion.div>

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <motion.p
            className="text-center text-white/25 text-xs mt-3 tracking-wider"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Scroll to the bottom to continue
          </motion.p>
        )}

        {/* Accept button */}
        <motion.div
          className="flex justify-center mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={handleAccept}
            disabled={!scrolledToBottom}
            className="px-10 py-2.5 rounded-full text-sm font-medium tracking-wider uppercase transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            style={{
              backgroundColor: scrolledToBottom ? "rgba(255,255,255,0.08)" : "transparent",
              color: scrolledToBottom ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
              border: `1px solid ${scrolledToBottom ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            I Accept
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
