import { useState, useCallback, useRef } from "react";

export type DiagSeverity = "critical" | "warning" | "info";
export type DiagCategory = "crash" | "performance" | "error" | "warning" | "info";

export interface DiagEntry {
  id: string;
  timestamp: string;
  severity: DiagSeverity;
  category: DiagCategory;
  operation: string;
  message: string;
  duration_ms?: number;
  probable_cause?: string;
  metrics?: Record<string, number>;
}

export interface MemorySnapshot {
  timestamp: string;
  usedMB: number;
  totalMB: number;
  percent: number;
}

export interface VaultIntegrity {
  fileCount: number;
  orphanedBlobs: number;
  lastHealthCheck: string | null;
  healthStatus: "healthy" | "degraded" | "unknown";
}

export interface DiagState {
  logs: DiagEntry[];
  memorySnapshots: MemorySnapshot[];
  memoryWarning: boolean;
  memoryAmberWarning: boolean;
  vaultIntegrity: VaultIntegrity;
  unreadCount: number;
  isOpen: boolean;
  showReport: boolean;
  healthScore: number;
}

const initialState: DiagState = {
  logs: [],
  memorySnapshots: [],
  memoryWarning: false,
  memoryAmberWarning: false,
  vaultIntegrity: {
    fileCount: 0,
    orphanedBlobs: 0,
    lastHealthCheck: null,
    healthStatus: "unknown",
  },
  unreadCount: 0,
  isOpen: false,
  showReport: false,
  healthScore: 100,
};

let entryCounter = 0;

function generateId(): string {
  return `diag-${Date.now()}-${++entryCounter}`;
}

function calculateHealthScore(logs: DiagEntry[]): number {
  let score = 100;
  const recent = logs.filter(
    (l) => Date.now() - new Date(l.timestamp).getTime() < 300000
  );
  for (const entry of recent) {
    if (entry.category === "crash") score -= 20;
    else if (entry.category === "performance") score -= 5;
    else if (entry.category === "error") score -= 10;
    else if (entry.category === "warning") score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

export function useDiagStore() {
  const [state, setState] = useState<DiagState>(initialState);
  const logsRef = useRef<DiagEntry[]>([]);

  const addLog = useCallback(
    (
      category: DiagCategory,
      severity: DiagSeverity,
      operation: string,
      message: string,
      extra?: {
        duration_ms?: number;
        probable_cause?: string;
        metrics?: Record<string, number>;
      }
    ) => {
      const entry: DiagEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        severity,
        category,
        operation,
        message,
        ...extra,
      };
      logsRef.current = [entry, ...logsRef.current].slice(0, 500);
      const newLogs = logsRef.current;
      setState((prev) => ({
        ...prev,
        logs: newLogs,
        unreadCount: prev.isOpen ? 0 : prev.unreadCount + 1,
        healthScore: calculateHealthScore(newLogs),
      }));
    },
    []
  );

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    setState((prev) => ({
      ...prev,
      logs: [],
      unreadCount: 0,
      healthScore: 100,
    }));
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setState((prev) => ({
      ...prev,
      isOpen: open,
      unreadCount: open ? 0 : prev.unreadCount,
    }));
  }, []);

  const setShowReport = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showReport: show }));
  }, []);

  const addMemorySnapshot = useCallback((snapshot: MemorySnapshot, amberPercent = 1.5) => {
    setState((prev) => {
      const snapshots = [snapshot, ...prev.memorySnapshots].slice(0, 60);
      const leakThresholdMB = snapshot.totalMB * 0.05;
      const warning =
        snapshot.percent > 85 ||
        (snapshots.length >= 5 &&
          snapshots[0].usedMB - snapshots[4].usedMB > leakThresholdMB);
      const amberWarning = !warning && snapshot.percent > amberPercent;
      return { ...prev, memorySnapshots: snapshots, memoryWarning: warning, memoryAmberWarning: amberWarning };
    });
  }, []);

  const updateVaultIntegrity = useCallback(
    (integrity: Partial<VaultIntegrity>) => {
      setState((prev) => ({
        ...prev,
        vaultIntegrity: { ...prev.vaultIntegrity, ...integrity },
      }));
    },
    []
  );

  return {
    ...state,
    addLog,
    clearLogs,
    setOpen,
    setShowReport,
    addMemorySnapshot,
    updateVaultIntegrity,
  };
}
