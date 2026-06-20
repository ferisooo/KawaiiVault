import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// No hardcoded keys, no Gumroad product ID, no trial seed.
// All license logic lives in Rust now.
// Gumroad handles trials — user gets a key from Gumroad, enters it here.

export interface LicenseState {
  isPro: boolean;
  licenseKey: string | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  trialDaysLeft: number | null;
}

export interface LicenseActions {
  activate: (key: string) => Promise<boolean>;
  deactivate: () => void;
  revalidate: () => Promise<boolean>;
}

interface RustLicenseStatus {
  is_pro: boolean;
  license_key: string | null;
  email: string | null;
  needs_revalidation: boolean;
}

/** Clear all pro-feature settings from localStorage on license expiry/deactivation */
function resetProFeatureStorage() {
  // Stealth mode
  localStorage.removeItem("cybervault_stealth_mode");
  localStorage.removeItem("cybervault_stealth_hint");
  // Slideshow — clear all vault-specific slideshow configs
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k.startsWith("cybervault-slideshow-")) {
      localStorage.removeItem(k);
    }
  }
  // Advanced settings — reset to defaults
  localStorage.setItem("cybervault_thumb_resolution", "256");
  localStorage.setItem("cybervault_bypass_chunk_limits", "false");
  localStorage.setItem("cybervault_bypass_thumbnail_cache", "false");
  localStorage.setItem("cybervault_cache_all_thumbnails", "false");
  localStorage.setItem("cybervault_max_thumbnails", "200");
  localStorage.setItem("cybervault_cooldown_ms", "5000");
  localStorage.setItem("cybervault_fullscreen_unload", "true");
  localStorage.setItem("cybervault_clear_video_cache_on_lock", "true");
  localStorage.setItem("cybervault_memory_amber_percent", "1.5");
  localStorage.setItem("cybervault_disable_file_eviction", "false");
}

export function useLicense(): [LicenseState, LicenseActions] {
  // CyberVault is fully free: every Pro feature is unlocked for all users and
  // no license/Gumroad check is performed. isPro is hardcoded true.
  const [isPro] = useState(true);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevIsProRef = useRef(true);

  const applyStatus = useCallback((status: RustLicenseStatus) => {
    // isPro stays true regardless of backend status — app is free.
    setLicenseKey(status.license_key);
    setEmail(status.email);
    prevIsProRef.current = true;
  }, []);

  // Load license status from Rust on mount
  useEffect(() => {
    invoke<RustLicenseStatus>("get_license_status")
      .then((status) => {
        prevIsProRef.current = status.is_pro;
        applyStatus(status);
        // If Rust says we need revalidation, do it silently
        if (status.needs_revalidation) {
          invoke<RustLicenseStatus>("revalidate_license")
            .then(applyStatus)
            .catch(() => {}); // silently fail — offline grace
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(async (key: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const status = await invoke<RustLicenseStatus>("validate_license", { key: key.trim() });
      applyStatus(status);
      setLoading(false);
      return true;
    } catch (e: unknown) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "Verification failed";
      setError(msg);
      setLoading(false);
      return false;
    }
  }, [applyStatus]);

  const deactivate = useCallback(() => {
    setError(null);
    invoke<RustLicenseStatus>("deactivate_license")
      .then(applyStatus)
      .catch(() => {});
  }, [applyStatus]);

  const revalidate = useCallback(async (): Promise<boolean> => {
    try {
      const status = await invoke<RustLicenseStatus>("revalidate_license");
      applyStatus(status);
      return status.is_pro;
    } catch {
      return false;
    }
  }, [applyStatus]);

  return [
    { isPro, licenseKey, email, loading, error, trialDaysLeft: null },
    { activate, deactivate, revalidate },
  ];
}

// ── Feature gate constants ──

export const FREE_LIMITS = {
  maxNotes: 10,
  maxDocuments: 10,
  maxPasswords: 10,
} as const;

export const PRO_FEATURES = [
  "themes",        // All themes (free: Neon Crimson only)
  "slideshow",     // Slideshow mode
  "duress",        // Duress password
  "selfDestruct",  // Self-destruct
  "vaultLocation", // Vault location / transfer
  "stealthMode",   // Stealth mode
  "advanced",      // Advanced settings
] as const;

export type ProFeature = typeof PRO_FEATURES[number];
