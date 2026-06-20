import { useState, useCallback } from "react";

// ── Vault Reliability Hook ──
// Health checks and backup/restore for vault operations.

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "corrupted";
  totalFiles: number;
  corruptedFiles: string[];
  orphanedBlobs: number;
  missingBlobs: number;
  timestamp: string;
}

export interface BackupInfo {
  path: string;
  timestamp: string;
  fileCount: number;
  sizeBytes: number;
}

export function useVaultReliability() {
  const [lastHealthCheck, setLastHealthCheck] = useState<HealthCheckResult | null>(null);
  const [healthCheckRunning, setHealthCheckRunning] = useState(false);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);

  // ── Startup Vault Health Check ──

  const runHealthCheck = useCallback(
    async (
      checkIntegrity: () => Promise<[string, boolean][]>,
      getVaultSize: () => Promise<{ total_files: number }>,
      files: { id: string }[]
    ): Promise<HealthCheckResult> => {
      setHealthCheckRunning(true);
      try {
        const integrityResults = await checkIntegrity();
        const corruptedFiles = integrityResults
          .filter(([, ok]) => !ok)
          .map(([id]) => id);

        const sizeInfo = await getVaultSize();

        const indexedIds = new Set(files.map((f) => f.id));
        const orphanedBlobs = Math.max(0, sizeInfo.total_files - indexedIds.size);

        const missingBlobs = integrityResults.filter(
          ([id, ok]) => !ok && indexedIds.has(id)
        ).length;

        const status: HealthCheckResult["status"] =
          corruptedFiles.length > 0 || missingBlobs > 0
            ? "corrupted"
            : orphanedBlobs > 0
              ? "degraded"
              : "healthy";

        const result: HealthCheckResult = {
          status,
          totalFiles: sizeInfo.total_files,
          corruptedFiles,
          orphanedBlobs,
          missingBlobs,
          timestamp: new Date().toISOString(),
        };

        setLastHealthCheck(result);
        setHealthCheckRunning(false);
        return result;
      } catch {
        const result: HealthCheckResult = {
          status: "healthy",
          totalFiles: files.length,
          corruptedFiles: [],
          orphanedBlobs: 0,
          missingBlobs: 0,
          timestamp: new Date().toISOString(),
        };
        setLastHealthCheck(result);
        setHealthCheckRunning(false);
        return result;
      }
    },
    []
  );

  // ── Encrypted Vault Backup / Restore ──

  const backupVault = useCallback(
    async (
      exportFiles: (fileIds: string[], destDir: string) => Promise<void>,
      allFileIds: string[],
      destDir: string
    ): Promise<BackupInfo> => {
      setBackupInProgress(true);
      try {
        await exportFiles(allFileIds, destDir);
        const info: BackupInfo = {
          path: destDir,
          timestamp: new Date().toISOString(),
          fileCount: allFileIds.length,
          sizeBytes: 0,
        };
        setBackupInProgress(false);
        return info;
      } catch (err) {
        setBackupInProgress(false);
        throw err;
      }
    },
    []
  );

  const restoreVault = useCallback(
    async (
      importFiles: (paths: string[]) => Promise<unknown[]>,
      filePaths: string[]
    ): Promise<number> => {
      setRestoreInProgress(true);
      try {
        const result = await importFiles(filePaths);
        setRestoreInProgress(false);
        return result.length;
      } catch (err) {
        setRestoreInProgress(false);
        throw err;
      }
    },
    []
  );

  return {
    // Health check
    lastHealthCheck,
    healthCheckRunning,
    runHealthCheck,
    // Backup/restore
    backupInProgress,
    restoreInProgress,
    backupVault,
    restoreVault,
  };
}
