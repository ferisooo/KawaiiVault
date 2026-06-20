import { useState, useEffect } from "react";

const LATEST_JSON_URL =
  "https://raw.githubusercontent.com/ferisooo/CybertronUpdate/main/latest.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 8000;

export interface UpdateInfo {
  version: string;
  url: string;
  releaseDate: string;
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export function useUpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(LATEST_JSON_URL, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) return;
      const data: UpdateInfo = await res.json();
      if (isNewer(data.version, __APP_VERSION__)) {
        setUpdateAvailable(data);
        setDismissed(false);
      }
    } catch {
      // No internet or fetch error — silently ignore
    }
  };

  useEffect(() => {
    // Small delay so the app opens instantly before we hit the network
    const startup = setTimeout(check, 3000);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
    };
  }, []);

  return {
    updateAvailable: dismissed ? null : updateAvailable,
    dismiss: () => setDismissed(true),
  };
}
