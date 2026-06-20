import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Plus, Trash2, Lock, Eye, EyeOff, ChevronRight, AlertTriangle, Key, FileKey, Upload } from "lucide-react";
import CyberButton from "./CyberButton";
import GlassPanel from "./GlassPanel";
import type { VaultInfo } from "../stores/useStore";
import { useTauri } from "../hooks/useTauri";
import type { LockoutStatus } from "../hooks/useTauri";
import type { ThemeMode } from "../hooks/useThemeMode";

interface Props {
  onUnlock: (vault: VaultInfo) => void;
  notify: (msg: string, type: "success" | "error" | "warning" | "info") => void;
  themeMode?: ThemeMode;
}

// ── Argon2 Spinner ──
function Argon2Spinner() {
  const segments = 8;
  return (
    <div className="relative w-12 h-12 mx-auto">
      {Array.from({ length: segments }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-4 rounded-full bg-[var(--color-neon-primary)]"
          style={{
            top: "50%", left: "50%",
            marginLeft: "-3px", marginTop: "-8px",
            transformOrigin: "3px 24px",
            rotate: `${(i / segments) * 360}deg`,
          }}
          animate={{ opacity: [0.15, 1, 0.15] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: (i / segments),
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function LoginScreen({ onUnlock, notify, themeMode = "cyberpunk" }: Props) {
  const isBio = themeMode === "biotech";
  const tauri = useTauri();
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultInfo | null>(null);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Animation state
  const [screenShake, setScreenShake] = useState(false);
  const [destructSequence, setDestructSequence] = useState(false);
  const [derivingKey, setDerivingKey] = useState(false);

  // Security state
  const [lockoutStatus, setLockoutStatus] = useState<LockoutStatus | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [requiresKeyFile, setRequiresKeyFile] = useState(false);
  const [keyFilePath, setKeyFilePath] = useState<string | null>(null);
  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    loadVaults();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    lockoutTimerRef.current = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 100) {
          if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
          return 0;
        }
        return prev - 100;
      });
    }, 100);
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutRemaining]);

  const loadVaults = async () => {
    try {
      const v = await tauri.listVaults();
      setVaults(v);
      clearDataIfEmpty(v);
    } catch {
      setVaults([
        { id: "demo-1", name: "Personal Vault", created_at: new Date().toISOString(), file_count: 142 },
        { id: "demo-2", name: "Work Documents", created_at: new Date().toISOString(), file_count: 2847 },
        { id: "demo-3", name: "Archive", created_at: new Date().toISOString(), file_count: 5120 },
      ]);
    }
  };

  const refreshLockoutStatus = async (vaultId: string) => {
    try {
      const status = await tauri.getLockoutStatus(vaultId);
      setLockoutStatus(status);
      if (status.locked_until_ms > 0) {
        setLockoutRemaining(status.locked_until_ms);
      }
    } catch {
      // Demo mode — no lockout
    }
  };

  const handleSelectVault = async (vault: VaultInfo) => {
    setSelectedVault(vault);
    setPin("");
    setError("");
    setKeyFilePath(null);
    setKeyFileName(null);

    // Check if key file is required
    try {
      const needsKey = await tauri.vaultRequiresKeyFile(vault.id);
      setRequiresKeyFile(needsKey);
    } catch {
      setRequiresKeyFile(false);
    }

    // Get lockout status
    await refreshLockoutStatus(vault.id);
  };

  const handleBrowseKeyFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        title: "Select Key File",
      }) as string | null;
      if (selected) {
        const name = selected.split(/[\\/]/).pop() || selected;
        setKeyFilePath(selected);
        setKeyFileName(name);
      }
    } catch {
      // Demo mode
      setKeyFilePath("/demo/key.bin");
      setKeyFileName("yubikey_slot2.bin");
    }
  };

  const handleUnlock = async () => {
    if (!selectedVault || !pin) return;

    // Check lockout
    if (lockoutRemaining > 0) {
      setError(`Locked out. Wait ${(lockoutRemaining / 1000).toFixed(1)}s`);
      return;
    }

    if (requiresKeyFile && !keyFilePath) {
      setError("Key file is required to unlock this vault");
      return;
    }

    setLoading(true);
    setError("");
    setDerivingKey(true);
    try {
      const ok = await tauri.unlockVault(selectedVault.id, pin, keyFilePath || undefined);
      setDerivingKey(false);
      if (ok) {
        onUnlock(selectedVault);
      } else {
        setError("ACCESS DENIED — Invalid PIN");
        setPin("");
        // Screen shake on failure
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 600);
        await refreshLockoutStatus(selectedVault.id);
      }
    } catch (e) {
      setDerivingKey(false);
      const errMsg = String(e);
      if (errMsg.includes("VAULT_DESTROYED_SILENT")) {
        // Duress pin — silently act as if vault doesn't exist
        notify("Vault not found", "error");
        setSelectedVault(null);
        setPin("");
        setLockoutStatus(null);
        await loadVaults();
      } else if (errMsg.includes("SECURITY_VIOLATION")) {
        setError(errMsg.replace("SECURITY_VIOLATION: ", ""));
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 600);
      } else if (errMsg.includes("VAULT_DESTROYED")) {
        // Self-destruct sequence
        setDestructSequence(true);
        setTimeout(async () => {
          setDestructSequence(false);
          notify("VAULT DESTROYED — Self-destruct triggered", "error");
          setSelectedVault(null);
          setPin("");
          setLockoutStatus(null);
          await loadVaults();
        }, 2000);
      } else if (errMsg.includes("Account locked")) {
        setError(errMsg);
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 600);
        await refreshLockoutStatus(selectedVault.id);
      } else {
        // Demo mode fallback
        if (pin.length >= 8) {
          onUnlock(selectedVault);
        } else {
          setError("PIN must be at least 8 characters");
        }
      }
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName || !newPin) return;
    if (newPin.length < 8) {
      setError("PIN must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const vault = await tauri.createVault(
        newName,
        newPin,
        false,
        10,
        300,
        undefined,
        undefined,
      );
      setVaults((prev) => [...prev, vault]);
      resetCreateForm();
      notify("Vault created successfully", "success");
    } catch {
      // Demo mode
      const vault: VaultInfo = {
        id: `demo-${Date.now()}`,
        name: newName,
        created_at: new Date().toISOString(),
        file_count: 0,
      };
      setVaults((prev) => [...prev, vault]);
      resetCreateForm();
      notify("Vault created successfully", "success");
    }
    setLoading(false);
  };

  const resetCreateForm = () => {
    setShowCreate(false);
    setNewName("");
    setNewPin("");
    setError("");
  };

  // Clear stealth mode and saved username when no vaults remain after deletion
  const clearDataIfEmpty = (remaining: VaultInfo[]) => {
    if (remaining.length === 0) {
      localStorage.removeItem("cybervault_stealth_mode");
      localStorage.removeItem("cybervault_stealth_hint");
      localStorage.removeItem("cybervault_username");
    }
  };

  // ── PIN-protected vault deletion ──
  const [deleteTarget, setDeleteTarget] = useState<VaultInfo | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteForgotPin, setDeleteForgotPin] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState("");

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      // Verify PIN by attempting unlock
      const result = await tauri.unlockVault(deleteTarget.id, deletePin);
      if (!result) {
        setDeleteError("Incorrect PIN");
        return;
      }
      // Lock before deleting
      await tauri.lockVault();
      await tauri.deleteVault(deleteTarget.id);
    } catch (e) {
      const errStr = String(e);
      if (errStr.includes("VAULT_DESTROYED")) {
        // Duress PIN was entered — vault already wiped
        setVaults((prev) => {
          const remaining = prev.filter((v) => v.id !== deleteTarget.id);
          clearDataIfEmpty(remaining);
          return remaining;
        });
        setDeleteTarget(null);
        setDeletePin("");
        setDeleteError("");
        notify("Vault destroyed", "warning");
        return;
      }
      setDeleteError("Incorrect PIN");
      return;
    }
    setVaults((prev) => {
      const remaining = prev.filter((v) => v.id !== deleteTarget.id);
      clearDataIfEmpty(remaining);
      return remaining;
    });
    if (selectedVault?.id === deleteTarget.id) {
      setSelectedVault(null);
      setPin("");
    }
    setDeleteTarget(null);
    setDeletePin("");
    setDeleteError("");
    setDeleteForgotPin(false);
    setDeleteConfirmName("");
    setDeleteConfirmPhrase("");
    notify("Vault deleted", "warning");
  };

  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleForgotPinDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmName.trim() !== deleteTarget.name.trim()) {
      setDeleteError("Vault name does not match");
      return;
    }
    if (deleteConfirmPhrase.trim().toLowerCase() !== "permanently delete") {
      setDeleteError('Type "permanently delete" to confirm');
      return;
    }
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await tauri.deleteVault(deleteTarget.id);
    } catch (e) {
      // Continue with local removal even if backend fails (demo mode)
      console.warn("deleteVault error (continuing):", e);
    }
    setVaults((prev) => {
      const remaining = prev.filter((v) => v.id !== deleteTarget.id);
      clearDataIfEmpty(remaining);
      return remaining;
    });
    if (selectedVault?.id === deleteTarget.id) {
      setSelectedVault(null);
      setPin("");
    }
    setDeleteTarget(null);
    setDeletePin("");
    setDeleteError("");
    setDeleteForgotPin(false);
    setDeleteConfirmName("");
    setDeleteConfirmPhrase("");
    setDeleteLoading(false);
    notify("Vault deleted", "warning");
  };

  const isLockedOut = lockoutRemaining > 0;

  return (
    <div
      className="h-screen w-screen flex items-center justify-center relative"
      style={screenShake ? { animation: "screen-shake 0.5s ease, shake-x 0.4s ease" } : undefined}
    >
      {/* Self-destruct red vignette overlay */}
      <AnimatePresence>
        {destructSequence && (
          <motion.div
            className="fixed inset-0 z-[500] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{ boxShadow: ["inset 0 0 80px rgba(255,0,0,0.3)", "inset 0 0 200px rgba(255,0,0,0.8)", "inset 0 0 80px rgba(255,0,0,0.3)"] }}
              transition={{ duration: 0.5, repeat: 3, ease: "easeInOut" }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 2] }}
              transition={{ duration: 2 }}
              className="text-red-500 font-display text-[17px] font-black tracking-[0.5em] uppercase text-center"
              style={{ textShadow: "0 0 30px rgba(255,0,0,0.8), 0 0 60px rgba(255,0,0,0.5)" }}
            >
              VAULT<br />DESTROYED
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Argon2 key derivation overlay */}
      <AnimatePresence>
        {derivingKey && (
          <motion.div
            className="fixed inset-0 z-[400] pointer-events-none flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative z-10 flex flex-col items-center gap-4">
              <Argon2Spinner />
              <div className="text-center">
                <p className="font-display text-[17px] tracking-[0.3em] uppercase text-[var(--color-neon-bright)] animate-[neon-flicker_3s_ease-in-out_infinite]">
                  Deriving Key
                </p>
                <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-1 tracking-widest">
                  Argon2id · please wait
                </p>
              </div>
              <div className="flex gap-1">
                {[0,1,2,3,4].map(i => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-[var(--color-neon-primary)]"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
        className="w-full max-w-lg px-4"
      >
        {/* Logo / Title */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-sm border border-[var(--color-neon-dark)] mb-4 relative"
            animate={{
              boxShadow: [
                "0 0 10px var(--color-neon-glow), 0 0 20px var(--color-neon-glow)",
                "0 0 20px var(--color-neon-glow), 0 0 40px var(--color-neon-glow), 0 0 60px var(--color-neon-glow)",
                "0 0 10px var(--color-neon-glow), 0 0 20px var(--color-neon-glow)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Shield size={36} className="text-[var(--color-neon-primary)]" />
            <span className="absolute top-0 left-0 w-3 h-[2px] bg-[var(--color-neon-primary)]" />
            <span className="absolute top-0 left-0 w-[2px] h-3 bg-[var(--color-neon-primary)]" />
            <span className="absolute bottom-0 right-0 w-3 h-[2px] bg-[var(--color-neon-primary)]" />
            <span className="absolute bottom-0 right-0 w-[2px] h-3 bg-[var(--color-neon-primary)]" />
          </motion.div>

          <h1 className="font-display text-[17px] font-bold tracking-[0.2em] uppercase neon-text animate-[neon-flicker_8s_ease-in-out_infinite]">
            CyberVault
          </h1>
          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-2 tracking-widest">
            SECURE FILE ENCRYPTION SYSTEM v1.0
          </p>
        </motion.div>

        <GlassPanel glow themeMode={themeMode} className="p-6">
          <AnimatePresence mode="wait">
            {showCreate ? (
              /* ── Create Vault Form ── */
              <motion.div
                key="create"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <h2 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)] mb-4 flex items-center gap-2">
                  <Plus size={18} />
                  Initialize New Vault
                </h2>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  {/* Vault name */}
                  <div>
                    <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block">
                      Vault Designation
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Enter vault name..."
                      className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-4 py-2.5 text-[var(--color-cyber-text)] font-body focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_10px_var(--color-neon-glow)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/50"
                      autoFocus
                    />
                  </div>

                  {/* Access PIN */}
                  <div>
                    <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block">
                      Access PIN
                    </label>
                    <input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="Minimum 4 characters..."
                      className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-4 py-2.5 text-[var(--color-cyber-text)] font-body focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_10px_var(--color-neon-glow)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/50"
                    />
                  </div>


                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-red-500 text-[17px] font-mono"
                    >
                      {error}
                    </motion.p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <CyberButton variant="ghost" themeMode={themeMode} onClick={resetCreateForm} className="flex-1">
                      Cancel
                    </CyberButton>
                    <CyberButton variant="primary" themeMode={themeMode} onClick={handleCreate} disabled={loading} className="flex-1">
                      {loading ? "Initializing..." : "Create Vault"}
                    </CyberButton>
                  </div>
                </div>
              </motion.div>
            ) : selectedVault ? (
              /* ── PIN Entry ── */
              <motion.div
                key="pin"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => {
                      setSelectedVault(null);
                      setPin("");
                      setError("");
                      setLockoutStatus(null);
                      setLockoutRemaining(0);
                      setRequiresKeyFile(false);
                      setKeyFilePath(null);
                      setKeyFileName(null);
                    }}
                    className="text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors"
                  >
                    <ChevronRight size={18} className="rotate-180" />
                  </button>
                  <div>
                    <h2 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)] flex items-center gap-2">
                      <Lock size={18} />
                      {selectedVault.name}
                    </h2>
                    <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                      Vault secured
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Lockout warning */}
                  {isLockedOut && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-3 p-3 rounded-sm bg-red-950/40 border border-red-800/40"
                    >
                      <motion.div
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <AlertTriangle size={18} className="text-red-400" />
                      </motion.div>
                      <div>
                        <p className="font-mono text-[17px] text-red-300 font-semibold uppercase tracking-wider">
                          Account Locked
                        </p>
                        <p className="font-mono text-[17px] text-red-400/70">
                          Wait {(lockoutRemaining / 1000).toFixed(1)}s before next attempt
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Failed attempts indicator */}
                  {lockoutStatus && lockoutStatus.failed_attempts > 0 && !isLockedOut && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-yellow-950/30 border border-yellow-800/30">
                      <AlertTriangle size={14} className="text-yellow-500" />
                      <p className="font-mono text-[17px] text-yellow-400">
                        {lockoutStatus.failed_attempts} failed attempt{lockoutStatus.failed_attempts > 1 ? "s" : ""}
                        {lockoutStatus.self_destruct_enabled && (
                          <span className="text-red-400 ml-1">
                            ({lockoutStatus.self_destruct_threshold - lockoutStatus.failed_attempts} remaining before destruction)
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* PIN input */}
                  <div className="relative">
                    <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block">
                      Enter Access PIN
                    </label>
                    <div className="relative">
                      <input
                        type={showPin ? "text" : "password"}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="••••••"
                        className="w-full bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-4 py-3 text-[var(--color-cyber-text)] font-mono text-[17px] tracking-[0.3em] focus:border-[var(--color-neon-primary)] focus:shadow-[0_0_10px_var(--color-neon-glow)] outline-none transition-all placeholder:text-[var(--color-cyber-muted)]/30"
                        autoFocus
                        disabled={isLockedOut}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                        onFocus={e => { (e.target as HTMLElement).style.animation = "border-glow 2s infinite"; }}
                        onBlur={e => { (e.target as HTMLElement).style.animation = ""; }}
                      />
                      <button
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors"
                      >
                        {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Key file input (when required or optionally provided) */}
                  {requiresKeyFile && (
                    <div>
                      <label className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-widest mb-1 block flex items-center gap-1.5">
                        <FileKey size={12} />
                        Key File (Required)
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-[var(--color-cyber-black)] border border-[var(--color-cyber-border)] rounded-sm px-4 py-2.5 text-[17px] font-mono truncate">
                          {keyFileName ? (
                            <span className="text-[var(--color-neon-bright)]">{keyFileName}</span>
                          ) : (
                            <span className="text-[var(--color-cyber-muted)]/50">Select key file...</span>
                          )}
                        </div>
                        <CyberButton
                          variant="ghost"
                          themeMode={themeMode}
                          onClick={() => handleBrowseKeyFile()}
                          className="shrink-0 !px-3"
                        >
                          <Key size={14} />
                        </CyberButton>
                      </div>
                    </div>
                  )}

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-500 text-[17px] font-mono tracking-wider animate-[text-glitch_0.3s_ease]"
                    >
                      ⚠ {error}
                    </motion.p>
                  )}

                  <CyberButton
                    variant="primary"
                    size="lg"
                    onClick={handleUnlock}
                    disabled={loading || !pin || isLockedOut}
                    pulse={!isLockedOut}
                    themeMode={themeMode}
                    className="w-full"
                  >
                    {loading ? "Decrypting..." : isLockedOut ? `Locked (${(lockoutRemaining / 1000).toFixed(1)}s)` : "Unlock Vault"}
                  </CyberButton>
                </div>
              </motion.div>
            ) : (
              /* ── Vault List ── */
              <motion.div
                key="list"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <h2 className="font-display text-[17px] font-bold tracking-[0.2em] uppercase text-[var(--color-cyber-muted)] mb-4">
                  Select Vault
                </h2>

                <div className="space-y-2 max-h-[300px] overflow-y-auto mb-4 pr-1">
                  {vaults.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-cyber-muted)] font-mono text-[17px]">
                      No vaults detected. Create one to begin.
                    </div>
                  ) : (
                    vaults.map((vault, i) => (
                      <motion.div
                        key={vault.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.08 }}
                        className="group flex items-center gap-3 p-3 rounded-sm bg-[var(--color-cyber-black)]/50 border border-[var(--color-cyber-border)] hover:border-[var(--color-neon-dark)] hover:bg-[var(--color-neon-subtle)] cursor-pointer transition-all duration-200"
                        onClick={() => handleSelectVault(vault)}
                      >
                        <div className="w-10 h-10 rounded-sm border border-[var(--color-neon-dark)] flex items-center justify-center bg-[var(--color-neon-subtle)] group-hover:shadow-[0_0_10px_var(--color-neon-glow)] transition-all">
                          <Lock size={18} className="text-[var(--color-neon-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-[17px] font-semibold tracking-wider text-[var(--color-cyber-text)] truncate">
                            {vault.name}
                          </p>
                          <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                            {new Date(vault.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className="text-[var(--color-cyber-muted)] group-hover:text-[var(--color-neon-bright)] transition-colors"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(vault);
                            setDeletePin("");
                            setDeleteError("");
                          }}
                          className="p-1.5 text-[var(--color-cyber-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-sm transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </motion.div>
                    ))
                  )}
                </div>

                <CyberButton
                  variant="secondary"
                  icon={<Plus size={16} />}
                  onClick={() => setShowCreate(true)}
                  themeMode={themeMode}
                  className="w-full"
                  style={{ animation: "pulse-dot 2s infinite" }}
                >
                  Create New Vault
                </CyberButton>
                <CyberButton
                  variant="ghost"
                  icon={<Upload size={16} />}
                  onClick={async () => {
                    try {
                      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
                      const selected = await openDialog({
                        multiple: false,
                        title: "Select Vault Backup File",
                        filters: [{ name: "Vault Backup", extensions: ["vault"] }],
                      }) as string | null;
                      if (selected) {
                        await tauri.restoreVaultFromFile(selected);
                        notify("Vault restored successfully", "success");
                        await loadVaults();
                      }
                    } catch (e) {
                      notify(String(e), "error");
                    }
                  }}
                  themeMode={themeMode}
                  className="w-full mt-2"
                >
                  Restore Vault
                </CyberButton>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassPanel>

        {/* System status bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-4 flex items-center justify-center gap-4 font-mono text-[17px] text-[var(--color-cyber-muted)]/60 tracking-widest uppercase"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
            System Online
          </span>
          <span>•</span>
          <span>Argon2id KDF</span>
          <span>•</span>
          <span>SHA-256 Integrity</span>
        </motion.div>
      </motion.div>

      {/* PIN confirmation modal for vault deletion */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <GlassPanel className="w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle size={18} />
                  <h3 className="font-display text-[17px] font-bold tracking-wider uppercase">
                    Delete Vault
                  </h3>
                </div>

                {!deleteForgotPin ? (
                  <>
                    <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                      Enter the PIN for <span className="text-[var(--color-neon-bright)]">{deleteTarget.name}</span> to confirm deletion. This action cannot be undone.
                    </p>
                    <input
                      type="password"
                      value={deletePin}
                      onChange={(e) => { setDeletePin(e.target.value); setDeleteError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleConfirmDelete(); }}
                      placeholder="Enter vault PIN..."
                      autoFocus
                      className="w-full bg-[var(--color-cyber-black)] border border-red-900/40 rounded-sm px-4 py-2.5 text-red-300 font-mono text-[17px] focus:border-red-500 outline-none transition-all placeholder:text-red-900/50"
                    />
                    {deleteError && (
                      <p className="font-mono text-[17px] text-red-400">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <CyberButton
                        variant="ghost"
                        themeMode={themeMode}
                        onClick={() => setDeleteTarget(null)}
                        className="flex-1"
                      >
                        Cancel
                      </CyberButton>
                      <CyberButton
                        variant="danger"
                        themeMode={themeMode}
                        onClick={handleConfirmDelete}
                        disabled={!deletePin}
                        className="flex-1"
                      >
                        <Trash2 size={14} />
                        Delete
                      </CyberButton>
                    </div>
                    <button
                      onClick={() => { setDeleteForgotPin(true); setDeleteError(""); }}
                      className="w-full text-center font-mono text-[17px] text-[var(--color-cyber-muted)] hover:text-red-400 transition-colors"
                    >
                      Forgot PIN?
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                      To delete <span className="text-[var(--color-neon-bright)]">{deleteTarget.name}</span> without the PIN, type the vault name exactly and the confirmation phrase below.
                    </p>
                    <div>
                      <label className="font-mono text-[17px] text-red-400/70 uppercase tracking-widest mb-1 block">
                        Type vault name: "{deleteTarget.name}"
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmName}
                        onChange={(e) => { setDeleteConfirmName(e.target.value); setDeleteError(""); }}
                        placeholder="Type vault name exactly..."
                        autoFocus
                        className="w-full bg-[var(--color-cyber-black)] border border-red-900/40 rounded-sm px-4 py-2.5 text-red-300 font-mono text-[17px] focus:border-red-500 outline-none transition-all placeholder:text-red-900/50"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[17px] text-red-400/70 uppercase tracking-widest mb-1 block">
                        Type "permanently delete"
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmPhrase}
                        onChange={(e) => { setDeleteConfirmPhrase(e.target.value); setDeleteError(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleForgotPinDelete(); }}
                        placeholder='Type "permanently delete"...'
                        className="w-full bg-[var(--color-cyber-black)] border border-red-900/40 rounded-sm px-4 py-2.5 text-red-300 font-mono text-[17px] focus:border-red-500 outline-none transition-all placeholder:text-red-900/50"
                      />
                    </div>
                    {deleteError && (
                      <p className="font-mono text-[17px] text-red-400">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <CyberButton
                        variant="ghost"
                        themeMode={themeMode}
                        onClick={() => { setDeleteForgotPin(false); setDeleteError(""); setDeleteConfirmName(""); setDeleteConfirmPhrase(""); }}
                        className="flex-1"
                      >
                        Back
                      </CyberButton>
                      <CyberButton
                        variant="danger"
                        themeMode={themeMode}
                        onClick={handleForgotPinDelete}
                        disabled={deleteLoading || deleteConfirmName.trim() !== deleteTarget.name.trim() || deleteConfirmPhrase.trim().toLowerCase() !== "permanently delete"}
                        className="flex-1"
                      >
                        <Trash2 size={14} />
                        {deleteLoading ? "Deleting..." : "Delete"}
                      </CyberButton>
                    </div>
                  </>
                )}
              </GlassPanel>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
