import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { VaultInfo, VaultFile, AuditEntry } from "../stores/useStore";

export interface LockoutStatus {
  failed_attempts: number;
  locked_until_ms: number;
  self_destruct_enabled: boolean;
  self_destruct_threshold: number;
}

export interface SecurityConfig {
  self_destruct_enabled: boolean;
  self_destruct_threshold: number;
  auto_lock_timeout_secs: number;
  key_file_required: boolean;
  key_file_hash: string | null;
  duress_enabled: boolean;
  clipboard_clear_secs: number;
}

// Wrapper around Tauri invoke calls with fallback for browser dev
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`Tauri command '${cmd}' failed:`, e);
    throw e;
  }
}

export interface VaultSizeInfo {
  total_size: number;
  total_files: number;
  categories: { category: string; size: number; count: number }[];
}

export function useTauri() {
  return {
    listVaults: () => call<VaultInfo[]>("list_vaults"),
    createVault: (
      name: string,
      pin: string,
      selfDestruct?: boolean,
      selfDestructThreshold?: number,
      autoLockTimeoutSecs?: number,
      keyFilePath?: string,
      duressPin?: string,
    ) =>
      call<VaultInfo>("create_vault", {
        name,
        pin,
        selfDestruct,
        selfDestructThreshold,
        autoLockTimeoutSecs,
        keyFilePath,
        duressPin,
      }),
    deleteVault: (vaultId: string) =>
      call<void>("delete_vault", { vaultId }),
    unlockVault: (vaultId: string, pin: string, keyFilePath?: string) =>
      call<boolean>("unlock_vault", { vaultId, pin, keyFilePath }),
    lockVault: () => call<void>("lock_vault"),

    // Security commands
    getLockoutStatus: (vaultId: string) =>
      call<LockoutStatus>("get_lockout_status", { vaultId }),
    vaultRequiresKeyFile: (vaultId: string) =>
      call<boolean>("vault_requires_key_file", { vaultId }),
    getSecurityConfig: (vaultId: string) =>
      call<SecurityConfig>("get_security_config", { vaultId }),
    updateSecurityConfig: (autoLockTimeoutSecs?: number, clipboardClearSecs?: number, selfDestructEnabled?: boolean, selfDestructThreshold?: number) =>
      call<SecurityConfig>("update_security_config", { autoLockTimeoutSecs, clipboardClearSecs, selfDestructEnabled, selfDestructThreshold }),
    checkAutoLock: () => call<boolean>("check_auto_lock"),
    touchActivity: () => call<void>("touch_activity"),

    // Data protection commands
    setDuressPin: (duressPin: string, keyFilePath?: string) =>
      call<void>("set_duress_pin", { duressPin, keyFilePath }),
    secureDeleteFiles: (fileIds: string[]) =>
      call<void>("secure_delete_files", { fileIds }),
    secureCleanupTemp: () => call<number>("secure_cleanup_temp"),
    markClipboardCopied: () => call<number>("mark_clipboard_copied"),
    checkClipboardExpiry: () => call<boolean>("check_clipboard_expiry"),
    clearClipboard: () => call<void>("clear_clipboard"),

    // File commands
    getFiles: (category?: string, search?: string, sortBy?: string, sortAsc?: boolean, folder?: string | null) =>
      call<VaultFile[]>("get_files", { category, search, sortBy, sortAsc, folder }),
    importFiles: (filePaths: string[], folder?: string) =>
      call<VaultFile[]>("import_files", { filePaths, folder }),
    setWatchFolder: (path: string | null) =>
      call<void>("set_watch_folder", { path }),
    getWatchFolder: () => call<string | null>("get_watch_folder"),
    deleteFiles: (fileIds: string[]) =>
      call<void>("delete_files", { fileIds }),
    getTrashedFiles: () => call<VaultFile[]>("get_trashed_files"),
    restoreFromTrash: (fileIds: string[]) =>
      call<void>("restore_from_trash", { fileIds }),
    emptyTrash: () => call<number>("empty_trash"),
    wipeVault: () => call<number>("wipe_vault"),
    exportFiles: (fileIds: string[], destDir: string) =>
      call<void>("export_files", { fileIds, destDir }),
    toggleFavorite: (fileId: string) =>
      call<VaultFile>("toggle_favorite", { fileId }),
    getAuditLog: () => call<AuditEntry[]>("get_audit_log"),
    checkIntegrity: () => call<[string, boolean][]>("check_integrity"),
    getCategories: () => call<string[]>("get_categories"),

    // Folder commands
    listFolders: () => call<string[]>("list_folders"),
    createFolder: (name: string) => call<string[]>("create_folder", { name }),
    deleteFolder: (name: string) => call<string[]>("delete_folder", { name }),
    moveFilesToFolder: (fileIds: string[], folder?: string) =>
      call<void>("move_files_to_folder", { fileIds, folder }),

    // File content decryption
    getFileContent: (fileId: string) => call<[string, string]>("get_file_content", { fileId }),

    // Streaming URL for video/audio (bypasses base64 encoding)
    getStreamUrl: (fileId: string) => convertFileSrc("file/" + fileId, "cvlt"),

    // Vault size & export queue
    getVaultSize: () => call<VaultSizeInfo>("get_vault_size"),
    exportSingleFile: (fileId: string, destDir: string) =>
      call<string>("export_single_file", { fileId, destDir }),

    // Reliability: backup & restore
    backupVault: (destPath: string) =>
      call<{ path: string; file_count: number; size_bytes: number }>("backup_vault", { destPath }),
    restoreVault: (backupPath: string) =>
      call<{ restored_count: number }>("restore_vault", { backupPath }),
    restoreVaultFromFile: (vaultFilePath: string) =>
      call<{ restored_count: number }>("restore_vault_from_file", { vaultFilePath }),

    // Vault location management
    getVaultPath: () => call<string>("get_vault_path"),
    transferVault: (newDir: string) => call<string>("transfer_vault", { newDir }),

    // Secure sharing: encrypted ZIP export
    exportEncryptedZip: (fileIds: string[], destPath: string, zipPassword: string) => call<string>("export_encrypted_zip", { fileIds, destPath, zipPassword }),

    // Vault browser: private incognito window, downloads import into the vault
    browserOpen: (url: string) => call<void>("browser_open", { url }),
    browserBack: () => call<void>("browser_back"),
    browserForward: () => call<void>("browser_forward"),
    browserReload: () => call<void>("browser_reload"),
    browserClose: () => call<void>("browser_close"),
    browserGrab: (url: string, referer?: string) => call<void>("browser_grab", { url, referer }),

    // Phone access: hardened LAN companion server (off by default)
    phoneServerStart: (accessPassword: string) =>
      call<{ running: boolean; url: string | null; port: number | null }>("phone_server_start", { accessPassword }),
    phoneServerStop: () =>
      call<{ running: boolean; url: string | null; port: number | null }>("phone_server_stop"),
    phoneServerStatus: () =>
      call<{ running: boolean; url: string | null; port: number | null }>("phone_server_status"),

    // Encrypted pages storage (passwords, notes, documents)
    savePages: (pagesJson: string) => call<void>("save_pages", { pagesJson }),
    loadPages: () => call<string>("load_pages"),

  };
}
