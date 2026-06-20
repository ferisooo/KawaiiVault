import { useState, useEffect, useCallback } from "react";
import { Smartphone, ShieldAlert, Copy, Check } from "lucide-react";

interface PhoneTauri {
  phoneServerStart: (accessPassword: string) => Promise<{ running: boolean; url: string | null; port: number | null }>;
  phoneServerStop: () => Promise<{ running: boolean; url: string | null; port: number | null }>;
  phoneServerStatus: () => Promise<{ running: boolean; url: string | null; port: number | null }>;
}

interface Props {
  tauri: PhoneTauri;
}

/**
 * Phone Access — controls the hardened LAN companion server. Off by default;
 * enabling it requires a separate access password and exposes a read-only,
 * HTTPS-only view of the UNLOCKED vault to a phone on the same network. The
 * server auto-stops whenever the vault locks.
 */
export default function PhoneAccessCard({ tauri }: Props) {
  const [running, setRunning] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    tauri.phoneServerStatus().then((s) => { setRunning(s.running); setUrl(s.url); }).catch(() => {});
  }, [tauri]);

  useEffect(() => { refresh(); }, [refresh]);

  const start = async () => {
    setError(null);
    if (password.length < 8) { setError("Access password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const s = await tauri.phoneServerStart(password);
      setRunning(s.running); setUrl(s.url);
      setPassword(""); setConfirm("");
    } catch (e) {
      setError(typeof e === "string" ? e : "Could not start phone access.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try { const s = await tauri.phoneServerStop(); setRunning(s.running); setUrl(s.url); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const copyUrl = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div className="rounded-sm border border-[var(--color-cyber-border)] p-4 bg-[var(--color-cyber-black)]/30">
      <h3 className="font-display text-[17px] font-semibold tracking-wider uppercase text-[var(--color-cyber-text)] mb-2 flex items-center gap-2">
        <Smartphone size={15} className="text-[var(--color-neon-primary)]" />
        Phone Access
      </h3>
      <p className="font-mono text-[15px] text-[var(--color-cyber-muted)] leading-relaxed mb-3">
        View this vault from a phone on the same Wi‑Fi. The PC stays unlocked and does all the
        decryption — the phone only receives the stream, encrypted end-to-end over HTTPS. Read-only,
        and it shuts off automatically the moment the vault locks. Your access password is never
        sent over the network (verified by a one-time challenge).
      </p>

      {!running ? (
        <>
          <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-sm border border-amber-500/30 bg-amber-500/5">
            <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="font-mono text-[14px] text-amber-200/80 leading-relaxed">
              This opens an encrypted server on your local network. Use a strong access password,
              different from your vault PIN, and prefer networks you trust. Your phone will show a
              one-time “connection not private” warning for the self-signed certificate — that's
              expected for a private local server; choose Advanced → Proceed.
            </span>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Access password (min 8 chars)"
            className="w-full mb-2 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[16px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] outline-none"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") start(); }}
            placeholder="Confirm access password"
            className="w-full mb-2 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[16px] text-[var(--color-cyber-text)] font-mono focus:border-[var(--color-neon-primary)] outline-none"
          />
          {error && <p className="font-mono text-[14px] text-red-400 mb-2">{error}</p>}
          <button
            onClick={start}
            disabled={busy}
            className="w-full px-4 py-2 bg-[var(--color-neon-primary)]/20 border border-[var(--color-neon-primary)] rounded-sm text-[16px] font-display uppercase tracking-wider text-[var(--color-neon-bright)] hover:bg-[var(--color-neon-primary)]/30 transition-colors disabled:opacity-40"
          >
            {busy ? "Starting…" : "Enable Phone Access"}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[15px] text-emerald-300 uppercase tracking-wider">Active</span>
          </div>
          <p className="font-mono text-[14px] text-[var(--color-cyber-muted)] mb-1">On your phone's browser, go to:</p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-3 py-2 text-[16px] text-[var(--color-neon-bright)] font-mono break-all">
              {url}
            </code>
            <button onClick={copyUrl} title="Copy URL" className="p-2 border border-[var(--color-cyber-border)] rounded-sm text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="font-mono text-[13px] text-[var(--color-cyber-muted)]/80 leading-relaxed mb-3">
            Open that address in your phone's browser. It'll warn about the certificate the first
            time (Advanced → Proceed) — expected for a private server — then enter your access
            password. Keep this window unlocked; access ends the moment the vault locks.
          </p>
          <button
            onClick={stop}
            disabled={busy}
            className="w-full px-4 py-2 bg-red-500/15 border border-red-500/50 rounded-sm text-[16px] font-display uppercase tracking-wider text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-40"
          >
            {busy ? "Stopping…" : "Turn Off"}
          </button>
        </>
      )}
    </div>
  );
}
