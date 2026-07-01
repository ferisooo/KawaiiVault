mod vault;
mod phone_server;
mod hls;

use vault::{AuditEntry, BackupResult, FileStreamInfo, LicenseStatus, LockoutStatus, RestoreResult, SecurityConfig, VaultFile, VaultInfo, VaultManager, VaultSizeInfo, encrypted_bundle_size, decrypt_file_data, read_decrypted_range, is_watchable_media};
use std::sync::Mutex;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use tauri::{State, Manager, Emitter};
use tauri::http::{header::*, response::Builder as ResponseBuilder, StatusCode};
use http_range::HttpRange;

pub struct AppState {
    pub vault_manager: Mutex<VaultManager>,
    /// Long-running operations (imports) currently in flight. While nonzero,
    /// auto-lock is suppressed — locking the vault mid-import strands the
    /// imported blobs and aborts the rest of the batch.
    busy_ops: std::sync::atomic::AtomicUsize,
    /// Watch-folder importer state: which folder the seen-map corresponds to,
    /// and a path -> (mtime, size) signature of files already handled, so
    /// steady-state polls only touch genuinely new/changed files.
    watch_seen: Mutex<(Option<String>, HashMap<String, (u64, u64)>)>,
    /// In-flight vault-browser downloads: download URL -> temp destination.
    /// Needed because the Finished event's path is unreliable on some
    /// platforms (always empty on macOS).
    browser_downloads: Mutex<HashMap<String, std::path::PathBuf>>,
    /// Active phone-access server handle (None = off). Off by default; only the
    /// user can start it, and it is force-stopped whenever the vault locks.
    phone_server: Mutex<Option<phone_server::PhoneServerHandle>>,
}

/// Stop the phone-access server if running (called on every lock path).
fn stop_phone_server(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let handle = state.phone_server.lock().ok().and_then(|mut h| h.take());
    if let Some(h) = handle {
        h.stop();
    }
}

#[derive(serde::Serialize)]
struct PhoneStatus {
    running: bool,
    url: Option<String>,
    port: Option<u16>,
    /// SHA-256 fingerprint of the session TLS cert (colon-separated hex), for
    /// out-of-band MITM verification against the phone's browser dialog.
    cert_fingerprint: Option<String>,
}

#[tauri::command]
async fn phone_server_start(app: tauri::AppHandle, access_password: String) -> Result<PhoneStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Replace any existing instance.
        if let Some(old) = state.phone_server.lock().map_err(|e| e.to_string())?.take() {
            old.stop();
        }
        let handle = phone_server::start(app.clone(), access_password)?;
        let status = PhoneStatus {
            running: true,
            url: Some(format!("https://{}:{}", handle.lan_ip, handle.port)),
            port: Some(handle.port),
            cert_fingerprint: Some(handle.cert_fingerprint.clone()),
        };
        *state.phone_server.lock().map_err(|e| e.to_string())? = Some(handle);
        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn phone_server_stop(app: tauri::AppHandle) -> Result<PhoneStatus, String> {
    stop_phone_server(&app);
    Ok(PhoneStatus { running: false, url: None, port: None, cert_fingerprint: None })
}

#[tauri::command]
async fn phone_server_status(app: tauri::AppHandle) -> Result<PhoneStatus, String> {
    let state = app.state::<AppState>();
    let guard = state.phone_server.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(h) => PhoneStatus { running: true, url: Some(format!("https://{}:{}", h.lan_ip, h.port)), port: Some(h.port), cert_fingerprint: Some(h.cert_fingerprint.clone()) },
        None => PhoneStatus { running: false, url: None, port: None, cert_fingerprint: None },
    })
}

/// RAII marker for a long-running operation; decrements on every exit path.
struct BusyGuard<'a>(&'a std::sync::atomic::AtomicUsize);

impl<'a> BusyGuard<'a> {
    fn new(counter: &'a std::sync::atomic::AtomicUsize) -> Self {
        counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        BusyGuard(counter)
    }
}

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

// Tauri 2 runs synchronous commands on the main thread. Even a command that
// does almost no work can block there for seconds if it has to WAIT for the
// vault mutex while a long operation (import batch, bundle rebuild) holds
// it — Windows then flags the window as "not responding". So EVERY command
// that touches the vault mutex goes through this helper, which both does
// the work and waits for the lock on a background thread.
async fn with_vm<R, F>(app: tauri::AppHandle, f: F) -> Result<R, String>
where
    R: Send + 'static,
    F: FnOnce(&mut VaultManager) -> Result<R, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        f(&mut vm)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_vaults(app: tauri::AppHandle) -> Result<Vec<VaultInfo>, String> {
    with_vm(app, |vm| Ok(vm.list_vaults())).await
}

#[tauri::command]
async fn create_vault(
    app: tauri::AppHandle,
    name: String,
    pin: String,
    self_destruct: Option<bool>,
    self_destruct_threshold: Option<u32>,
    auto_lock_timeout_secs: Option<u64>,
    key_file_path: Option<String>,
    duress_pin: Option<String>,
) -> Result<VaultInfo, String> {
    // Argon2id derivation takes hundreds of milliseconds by design
    with_vm(app, move |vm| {
        vm.create_vault(
            &name,
            &pin,
            self_destruct.unwrap_or(false),
            self_destruct_threshold.unwrap_or(10),
            auto_lock_timeout_secs.unwrap_or(300),
            key_file_path.as_deref(),
            duress_pin.as_deref(),
        )
    })
    .await
}

#[tauri::command]
async fn delete_vault(app: tauri::AppHandle, vault_id: String) -> Result<(), String> {
    // Overwrites the whole bundle with random bytes before unlinking
    with_vm(app, move |vm| vm.delete_vault(&vault_id)).await
}

#[tauri::command]
async fn unlock_vault(
    app: tauri::AppHandle,
    vault_id: String,
    pin: String,
    key_file_path: Option<String>,
) -> Result<bool, String> {
    // Argon2id derivation takes hundreds of milliseconds by design
    with_vm(app, move |vm| vm.unlock_vault(&vault_id, &pin, key_file_path.as_deref())).await
}

#[tauri::command]
async fn lock_vault(app: tauri::AppHandle) -> Result<(), String> {
    // The private browser and phone server must not outlive the vault session.
    close_browser_window(&app);
    stop_phone_server(&app);
    with_vm(app, |vm| {
        vm.lock_vault();
        Ok(())
    })
    .await
}

#[tauri::command]
async fn get_lockout_status(app: tauri::AppHandle, vault_id: String) -> Result<LockoutStatus, String> {
    with_vm(app, move |vm| vm.get_lockout_status(&vault_id)).await
}

#[tauri::command]
async fn vault_requires_key_file(app: tauri::AppHandle, vault_id: String) -> Result<bool, String> {
    with_vm(app, move |vm| vm.vault_requires_key_file(&vault_id)).await
}

#[tauri::command]
async fn get_security_config(app: tauri::AppHandle, vault_id: String) -> Result<SecurityConfig, String> {
    with_vm(app, move |vm| vm.get_security_config(&vault_id)).await
}

#[tauri::command]
async fn update_security_config(
    app: tauri::AppHandle,
    auto_lock_timeout_secs: Option<u64>,
    clipboard_clear_secs: Option<u32>,
    self_destruct_enabled: Option<bool>,
    self_destruct_threshold: Option<u32>,
) -> Result<SecurityConfig, String> {
    with_vm(app, move |vm| {
        vm.update_security_config(auto_lock_timeout_secs, clipboard_clear_secs, self_destruct_enabled, self_destruct_threshold)
    })
    .await
}

#[tauri::command]
async fn check_auto_lock(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        if state.busy_ops.load(std::sync::atomic::Ordering::SeqCst) > 0 {
            // An import is running — that IS activity. Locking the vault now
            // would strand the files imported so far and fail the rest.
            vm.touch_activity();
            return Ok(false);
        }
        let locked = vm.check_auto_lock();
        drop(vm);
        if locked {
            close_browser_window(&app);
            stop_phone_server(&app);
        }
        Ok(locked)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn touch_activity(app: tauri::AppHandle) -> Result<(), String> {
    with_vm(app, |vm| {
        vm.touch_activity();
        Ok(())
    })
    .await
}

#[tauri::command]
async fn set_duress_pin(
    app: tauri::AppHandle,
    duress_pin: String,
    key_file_path: Option<String>,
) -> Result<(), String> {
    with_vm(app, move |vm| vm.set_duress_pin(&duress_pin, key_file_path.as_deref())).await
}

#[tauri::command]
async fn secure_delete_files(app: tauri::AppHandle, file_ids: Vec<String>) -> Result<(), String> {
    // Prepare under lock (fast: strip keys + metadata update), then run the
    // bundle rebuild with the lock RELEASED. The rebuild is what actually
    // reclaims the deleted blobs' disk space.
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let work = {
            let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
            vm.secure_delete_prepare(&file_ids)?
        };
        if let Some(w) = work {
            let cb = |progress: f64| {
                let _ = app_handle.emit("trash-progress", progress);
            };
            w.execute(Some(&cb))?;
            let _ = app_handle.emit("trash-progress", 1.0);
            // Rebuild wrote a plaintext footer — restore the encrypted one
            let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
            vm.save_active();
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn secure_cleanup_temp(app: tauri::AppHandle) -> Result<u32, String> {
    with_vm(app, |vm| vm.secure_cleanup_temp()).await
}

#[tauri::command]
async fn mark_clipboard_copied(app: tauri::AppHandle) -> Result<u32, String> {
    with_vm(app, |vm| Ok(vm.mark_clipboard_copied())).await
}

#[tauri::command]
async fn check_clipboard_expiry(app: tauri::AppHandle) -> Result<bool, String> {
    with_vm(app, |vm| Ok(vm.should_clear_clipboard())).await
}

#[tauri::command]
fn clear_clipboard() -> Result<(), String> {
    match arboard::Clipboard::new() {
        Ok(mut clipboard) => {
            clipboard.set_text("").map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => Err(format!("Clipboard error: {}", e)),
    }
}

#[tauri::command]
async fn get_files(app: tauri::AppHandle, category: Option<String>, search: Option<String>, sort_by: Option<String>, sort_asc: Option<bool>, folder: Option<String>) -> Result<Vec<VaultFile>, String> {
    with_vm(app, move |vm| vm.get_files(category, search, sort_by, sort_asc.unwrap_or(true), folder)).await
}

#[tauri::command]
async fn import_files(app: tauri::AppHandle, file_paths: Vec<String>, folder: Option<String>) -> Result<Vec<VaultFile>, String> {
    // Three-phase import so the vault mutex is only held for the two fast
    // metadata phases. The slow phase — reading source files (possibly from
    // cloud storage) and encrypting them — runs with the lock RELEASED, so
    // thumbnails, viewing, and every other command stay usable mid-import.
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Suppress auto-lock while this batch runs (see check_auto_lock)
        let _busy = BusyGuard::new(&state.busy_ops);
        let ctx = {
            let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
            vm.import_prepare(folder.as_deref())?
        };
        // Live per-file progress so the UI bar moves during the batch
        let progress = move |done: usize, name: &str| {
            let _ = app_handle.emit("import-progress", serde_json::json!({ "done": done, "name": name }));
        };
        let (new_entries, mut result) = VaultManager::import_process(&ctx, &file_paths, Some(&progress))?;
        let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        let added = vm.import_commit(new_entries)?;
        result.extend(added);
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_watch_folder(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Changing the folder resets the seen-map so the new folder is fully
        // (re)scanned on the next poll.
        if let Ok(mut seen) = state.watch_seen.lock() {
            seen.0 = None;
            seen.1.clear();
        }
        let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        vm.set_watch_folder(path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_watch_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    with_vm(app, |vm| Ok(vm.get_watch_folder())).await
}

/// One bounded watch-folder scan: find new media files in `folder` and import
/// them via the three-phase pipeline. Returns the number imported. Designed to
/// be cheap in steady state — a directory listing plus stat() per entry, only
/// reading/encrypting files whose (mtime,size) signature is new.
fn watch_scan_once(app: &tauri::AppHandle, folder: &str) -> usize {
    const MAX_PER_POLL: usize = 25;
    let state = app.state::<AppState>();

    let dir = std::path::Path::new(folder);
    if !dir.is_dir() {
        return 0;
    }

    // Reset the seen-map if the watched folder changed since last scan.
    {
        if let Ok(mut seen) = state.watch_seen.lock() {
            if seen.0.as_deref() != Some(folder) {
                seen.0 = Some(folder.to_string());
                seen.1.clear();
            }
        }
    }

    // Collect new candidates (top-level only; avoids surprise deep recursion
    // into huge cloud trees). Signature = (modified secs, size).
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if candidates.len() >= MAX_PER_POLL {
                break;
            }
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
            if !is_watchable_media(&ext) {
                continue;
            }
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            // Skip hidden/system/temp files
            if name.starts_with('.') || name.starts_with('~') || name.eq_ignore_ascii_case("Thumbs.db") || name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let size = meta.len();
            let mtime = meta.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let path_str = path.to_string_lossy().to_string();

            let is_new = {
                match state.watch_seen.lock() {
                    Ok(seen) => seen.1.get(&path_str) != Some(&(mtime, size)),
                    Err(_) => false,
                }
            };
            if is_new {
                // Mark seen now so a slow import doesn't cause re-queueing on the
                // next poll. Content-hash dedup in import_process is the final
                // guard against actually storing duplicates.
                if let Ok(mut seen) = state.watch_seen.lock() {
                    seen.1.insert(path_str.clone(), (mtime, size));
                }
                candidates.push(path_str);
            }
        }
    }

    if candidates.is_empty() {
        return 0;
    }

    // Three-phase import (same pipeline as manual import; lock held only briefly).
    let _busy = BusyGuard::new(&state.busy_ops);
    let ctx = {
        let mut vm = match state.vault_manager.lock() { Ok(v) => v, Err(_) => return 0 };
        match vm.import_prepare(None) {
            Ok(c) => c,
            Err(_) => return 0,
        }
    };
    let (new_entries, _dups) = match VaultManager::import_process(&ctx, &candidates, None) {
        Ok(r) => r,
        Err(_) => return 0,
    };
    if new_entries.is_empty() {
        return 0;
    }
    let mut vm = match state.vault_manager.lock() { Ok(v) => v, Err(_) => return 0 };
    match vm.import_commit(new_entries) {
        Ok(added) => added.len(),
        Err(_) => 0,
    }
}

/// Background poller that auto-imports media from the active vault's watch
/// folder. Runs on its own thread (never the UI thread), sleeps between polls,
/// and skips work when no vault is unlocked, no folder is set, or another
/// import is already running.
fn start_watch_thread(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(6));
            let state = app.state::<AppState>();

            // Don't pile onto a manual import in progress.
            if state.busy_ops.load(std::sync::atomic::Ordering::SeqCst) > 0 {
                continue;
            }
            // get_watch_folder returns None when no vault is unlocked.
            let folder = {
                match state.vault_manager.lock() {
                    Ok(vm) => vm.get_watch_folder(),
                    Err(_) => None,
                }
            };
            let Some(folder) = folder else { continue };

            let imported = watch_scan_once(&app, &folder);
            if imported > 0 {
                let _ = app.emit("watch-imported", imported);
            }
        }
    });
}

#[tauri::command]
async fn list_folders(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    with_vm(app, |vm| vm.list_folders()).await
}

#[tauri::command]
async fn create_folder(app: tauri::AppHandle, name: String) -> Result<Vec<String>, String> {
    with_vm(app, move |vm| vm.create_folder(&name)).await
}

#[tauri::command]
async fn delete_folder(app: tauri::AppHandle, name: String) -> Result<Vec<String>, String> {
    with_vm(app, move |vm| vm.delete_folder(&name)).await
}

#[tauri::command]
async fn move_files_to_folder(app: tauri::AppHandle, file_ids: Vec<String>, folder: Option<String>) -> Result<(), String> {
    with_vm(app, move |vm| vm.move_files_to_folder(&file_ids, folder.as_deref())).await
}

#[tauri::command]
async fn delete_files(app: tauri::AppHandle, file_ids: Vec<String>) -> Result<(), String> {
    with_vm(app, move |vm| vm.delete_files(&file_ids)).await
}

#[tauri::command]
async fn get_trashed_files(app: tauri::AppHandle) -> Result<Vec<VaultFile>, String> {
    with_vm(app, |vm| vm.get_trashed_files()).await
}

#[tauri::command]
async fn restore_from_trash(app: tauri::AppHandle, file_ids: Vec<String>) -> Result<(), String> {
    with_vm(app, move |vm| vm.restore_from_trash(&file_ids)).await
}

#[tauri::command]
async fn empty_trash(app: tauri::AppHandle) -> Result<u32, String> {
    // Prepare under lock (fast: just metadata update), then do the expensive
    // bundle rebuild with the lock RELEASED, emitting progress events.
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let work = {
            let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
            vm.empty_trash_prepare()?
        };
        match work {
            None => Ok(0),
            Some(w) => {
                let cb = |progress: f64| {
                    let _ = app_handle.emit("trash-progress", progress);
                };
                w.execute(Some(&cb))?;
                let _ = app_handle.emit("trash-progress", 1.0);
                // Rebuild wrote a plaintext footer — restore the encrypted one
                let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
                vm.save_active();
                Ok(w.count)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn wipe_vault(app: tauri::AppHandle) -> Result<u32, String> {
    with_vm(app, |vm| vm.wipe_all_files()).await
}

#[tauri::command]
async fn export_files(app: tauri::AppHandle, file_ids: Vec<String>, dest_dir: String) -> Result<(), String> {
    with_vm(app, move |vm| vm.export_files(&file_ids, &dest_dir)).await
}

#[tauri::command]
async fn toggle_favorite(app: tauri::AppHandle, file_id: String) -> Result<VaultFile, String> {
    with_vm(app, move |vm| vm.toggle_favorite(&file_id)).await
}

#[tauri::command]
async fn get_audit_log(app: tauri::AppHandle) -> Result<Vec<AuditEntry>, String> {
    with_vm(app, |vm| vm.get_audit_log()).await
}

#[tauri::command]
async fn check_integrity(app: tauri::AppHandle) -> Result<Vec<(String, bool)>, String> {
    // Reads and hashes every blob in the bundle
    with_vm(app, |vm| vm.check_integrity()).await
}

#[tauri::command]
async fn get_categories(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    with_vm(app, |vm| vm.get_categories()).await
}

#[tauri::command]
async fn get_vault_size(app: tauri::AppHandle) -> Result<VaultSizeInfo, String> {
    with_vm(app, |vm| vm.get_vault_size()).await
}

#[tauri::command]
async fn export_single_file(app: tauri::AppHandle, file_id: String, dest_dir: String) -> Result<String, String> {
    with_vm(app, move |vm| vm.export_single_file(&file_id, &dest_dir)).await
}

#[tauri::command]
async fn get_file_content(app: tauri::AppHandle, file_id: String) -> Result<(String, String), String> {
    with_vm(app, move |vm| vm.get_file_content(&file_id)).await
}

#[tauri::command]
async fn backup_vault(app: tauri::AppHandle, dest_path: String) -> Result<BackupResult, String> {
    with_vm(app, move |vm| vm.backup_vault(&dest_path)).await
}

#[tauri::command]
async fn restore_vault(app: tauri::AppHandle, backup_path: String) -> Result<RestoreResult, String> {
    with_vm(app, move |vm| vm.restore_vault(&backup_path)).await
}

#[tauri::command]
async fn restore_vault_from_file(app: tauri::AppHandle, vault_file_path: String) -> Result<RestoreResult, String> {
    with_vm(app, move |vm| vm.restore_vault_from_file(&vault_file_path)).await
}

#[tauri::command]
async fn get_vault_path(app: tauri::AppHandle) -> Result<String, String> {
    with_vm(app, |vm| vm.get_vault_path()).await
}

#[tauri::command]
async fn transfer_vault(app: tauri::AppHandle, new_dir: String) -> Result<String, String> {
    with_vm(app, move |vm| vm.transfer_vault(&new_dir)).await
}

#[tauri::command]
async fn export_encrypted_zip(app: tauri::AppHandle, file_ids: Vec<String>, dest_path: String, zip_password: String) -> Result<String, String> {
    with_vm(app, move |vm| vm.export_encrypted_zip(&file_ids, &dest_path, &zip_password)).await
}

#[tauri::command]
async fn get_cache_key(app: tauri::AppHandle) -> Result<String, String> {
    // KEK-derived key (one-way) for encrypting the UI's IndexedDB thumbnail
    // cache. Only available while a vault is unlocked.
    with_vm(app, |vm| vm.get_cache_key()).await
}

#[tauri::command]
async fn save_pages(app: tauri::AppHandle, pages_json: String) -> Result<(), String> {
    with_vm(app, move |vm| vm.save_pages(pages_json)).await
}

#[tauri::command]
async fn load_pages(app: tauri::AppHandle) -> Result<String, String> {
    with_vm(app, |vm| vm.load_pages()).await
}

#[tauri::command]
async fn save_bookmarks(app: tauri::AppHandle, bookmarks_json: String) -> Result<(), String> {
    with_vm(app, move |vm| vm.save_bookmarks(bookmarks_json)).await
}

#[tauri::command]
async fn load_bookmarks(app: tauri::AppHandle) -> Result<String, String> {
    with_vm(app, |vm| vm.load_bookmarks()).await
}

// ── License commands ──

#[tauri::command]
async fn get_license_status(app: tauri::AppHandle) -> Result<LicenseStatus, String> {
    with_vm(app, |vm| Ok(vm.get_license_status())).await
}

// NOTE: Kawaii Vault is fully free — every feature is unlocked for everyone and
// there is no paid tier. The license commands below are kept only so the
// existing frontend keeps compiling, but they deliberately make NO network
// call. The previous implementation contacted api.gumroad.com on activation
// and on a 24h timer; that was dead weight that still produced surprising
// outbound requests (a privacy/network surface) for a product with nothing to
// verify. They now resolve locally and always report the free "pro" status.
#[tauri::command]
async fn validate_license(state: State<'_, AppState>, key: String) -> Result<LicenseStatus, String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        return Err("Enter a license key".into());
    }
    // Record the entered key locally for display only; no server is contacted.
    let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
    vm.set_license_validated(trimmed, None);
    Ok(vm.get_license_status())
}

#[tauri::command]
async fn revalidate_license(state: State<'_, AppState>) -> Result<LicenseStatus, String> {
    // Nothing to revalidate and no network call — just report current status.
    let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
    Ok(vm.get_license_status())
}

#[tauri::command]
async fn deactivate_license(app: tauri::AppHandle) -> Result<LicenseStatus, String> {
    with_vm(app, |vm| {
        vm.deactivate_license();
        Ok(vm.get_license_status())
    })
    .await
}

/// Validate a URL before handing it to the OS shell. Only http(s) is allowed,
/// and any control characters (including those that cmd.exe's argument parser
/// treats specially) are rejected to prevent argument-injection abuse.
fn validate_external_url(url: &str) -> Result<(), String> {
    if url.is_empty() || url.len() > 2048 {
        return Err("Invalid URL length".into());
    }
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("Only http(s) URLs are allowed".into());
    }
    if url.chars().any(|c| c.is_control() || c == '"' || c == '\0') {
        return Err("URL contains forbidden characters".into());
    }
    Ok(())
}

/// Validate a filesystem path before handing it to the OS shell. The path must
/// exist and not contain characters (quotes, control chars) that could confuse
/// the platform-specific shell that opens it.
fn validate_external_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 4096 {
        return Err("Invalid path length".into());
    }
    if path.chars().any(|c| c == '\0' || c == '"' || (c.is_control() && c != '\t')) {
        return Err("Path contains forbidden characters".into());
    }
    if !std::path::Path::new(path).exists() {
        return Err("Path does not exist".into());
    }
    Ok(())
}

/// Open a URL or filesystem path with the OS default handler WITHOUT going
/// through a command interpreter.
///
/// On Windows this calls ShellExecuteW("open", target) directly instead of
/// `cmd /c start "" <target>`. The old form invoked cmd.exe, whose argument
/// parser treats `& | ^ < > ( )` as control characters — and those are all
/// legitimate in real URLs (query strings) and filenames, so we could neither
/// safely pass them nor filter them out. ShellExecuteW receives the target as
/// a single wide string handled by the shell API, so there is no command line
/// to inject into. On macOS/Linux the target is already passed as a single
/// argv entry to `open`/`xdg-open` (no shell), which is safe as-is.
#[cfg(target_os = "windows")]
fn shell_open(target: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    const SW_SHOWNORMAL: i32 = 1;
    let op: Vec<u16> = OsStr::new("open").encode_wide().chain(once(0)).collect();
    let file: Vec<u16> = OsStr::new(target).encode_wide().chain(once(0)).collect();
    // ShellExecuteW returns a value > 32 on success.
    let result = unsafe {
        ShellExecuteW(
            0,
            op.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result > 32 {
        Ok(())
    } else {
        Err(format!("Failed to open (ShellExecute code {})", result))
    }
}

#[tauri::command]
fn open_url_in_browser(url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        shell_open(&url)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_file_with_default_app(path: String) -> Result<(), String> {
    validate_external_path(&path)?;
    #[cfg(target_os = "windows")]
    {
        shell_open(&path)?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Build an HTTP response for a streaming file request from the vault bundle.
/// Supports Range requests for efficient video seeking/playback.
fn get_stream_response(
    stream_info: FileStreamInfo,
    request: &tauri::http::Request<Vec<u8>>,
) -> Result<tauri::http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    let len = stream_info.total_size; // plaintext size
    let is_encrypted = stream_info.encryption_key.is_some();
    // CORS header is required: the webview app origin (tauri.localhost) is
    // cross-origin to cvlt.localhost, and fetch() — unlike <img>/<video> —
    // enforces CORS, so without this the viewer's blob fetch silently fails.
    let mut resp = ResponseBuilder::new()
        .header(CONTENT_TYPE, &stream_info.mime_type)
        .header(ACCEPT_RANGES, "bytes")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*");

    let mut file = std::fs::File::open(&stream_info.bundle_path)?;

    let http_response = if let Some(range_header) = request.headers().get("range") {
        let not_satisfiable = || {
            ResponseBuilder::new()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(CONTENT_RANGE, format!("bytes */{len}"))
                .body(vec![])
        };

        let range_str = range_header.to_str()?;
        // Map each parsed range to an inclusive [start, end] pair using checked
        // arithmetic. A range with length 0, or one whose start+length overflows
        // u64, is rejected rather than allowed to underflow/overflow — with
        // `panic = "abort"` set, an unchecked over/underflow here would crash the
        // whole process and is reachable from any webview range request.
        let ranges = if let Ok(ranges) = HttpRange::parse(range_str, len) {
            ranges
                .iter()
                .filter_map(|r| {
                    let end = r.start.checked_add(r.length)?.checked_sub(1)?;
                    Some((r.start, end))
                })
                .collect::<Vec<_>>()
        } else {
            return Ok(not_satisfiable()?);
        };

        /// Maximum bytes we send in one range chunk
        const MAX_LEN: u64 = 1000 * 1024;

        // Only handle single-range requests (covers 99.9% of browser video requests)
        let Some(&(start, mut end)) = ranges.first() else {
            return Ok(not_satisfiable()?);
        };

        if start >= len || end >= len || end < start {
            return Ok(not_satisfiable()?);
        }

        // All operands are now known to satisfy start <= end < len, so these
        // subtractions cannot underflow.
        end = start + (end - start).min(len - start).min(MAX_LEN - 1);
        let bytes_to_read = end + 1 - start;

        let buf = if is_encrypted {
            let key = stream_info.encryption_key.as_ref().unwrap();
            let salt = stream_info.encryption_salt.as_ref().unwrap();
            read_decrypted_range(
                &mut file,
                stream_info.offset_in_bundle,
                key,
                salt,
                &stream_info.file_id,
                stream_info.total_size,
                start,
                bytes_to_read,
                stream_info.aead_bound,
            ).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?
        } else {
            let mut buf = Vec::with_capacity(bytes_to_read as usize);
            file.seek(SeekFrom::Start(stream_info.offset_in_bundle + start))?;
            file.take(bytes_to_read).read_to_end(&mut buf)?;
            buf
        };

        resp = resp.header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
        resp = resp.header(CONTENT_LENGTH, bytes_to_read);
        resp = resp.status(StatusCode::PARTIAL_CONTENT);
        resp.body(buf)
    } else {
        // No Range header — return entire file
        resp = resp.header(CONTENT_LENGTH, len);

        let buf = if is_encrypted {
            let enc_size = encrypted_bundle_size(len);
            let mut enc_buf = vec![0u8; enc_size as usize];
            file.seek(SeekFrom::Start(stream_info.offset_in_bundle))?;
            file.read_exact(&mut enc_buf)?;
            let key = stream_info.encryption_key.as_ref().unwrap();
            let salt = stream_info.encryption_salt.as_ref().unwrap();
            decrypt_file_data(key, salt, &stream_info.file_id, &enc_buf, len, stream_info.aead_bound)
                .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?
        } else {
            let mut buf = vec![0u8; len as usize];
            file.seek(SeekFrom::Start(stream_info.offset_in_bundle))?;
            file.read_exact(&mut buf)?;
            buf
        };

        resp.body(buf)
    };

    http_response.map_err(Into::into)
}

/// Generate a WebP thumbnail from raw image bytes at the given size.
pub(crate) fn generate_thumbnail(
    stream_info: &FileStreamInfo,
    size: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // Read the full image from the bundle (decrypt if encrypted)
    let mut file = std::fs::File::open(&stream_info.bundle_path)?;

    let buf = if let (Some(ref key), Some(ref salt)) = (&stream_info.encryption_key, &stream_info.encryption_salt) {
        let enc_size = encrypted_bundle_size(stream_info.total_size);
        let mut enc_buf = vec![0u8; enc_size as usize];
        file.seek(SeekFrom::Start(stream_info.offset_in_bundle))?;
        file.read_exact(&mut enc_buf)?;
        decrypt_file_data(key, salt, &stream_info.file_id, &enc_buf, stream_info.total_size, stream_info.aead_bound)
            .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?
    } else {
        file.seek(SeekFrom::Start(stream_info.offset_in_bundle))?;
        let mut buf = vec![0u8; stream_info.total_size as usize];
        file.read_exact(&mut buf)?;
        buf
    };

    // Decode the image
    let img = image::load_from_memory(&buf)?;

    // Resize to fit within size x size, preserving aspect ratio. thumbnail()
    // uses progressive box downsampling instead of a full Lanczos3 pass —
    // several times faster on multi-megapixel photos with no visible quality
    // difference at thumbnail sizes.
    let thumb = img.thumbnail(size, size);

    // Encode as WebP
    let mut output = std::io::Cursor::new(Vec::new());
    thumb.write_to(&mut output, image::ImageFormat::WebP)?;

    Ok(output.into_inner())
}

// ── Vault Browser ──
// A separate incognito webview window for private browsing. Every download is
// redirected into the vault's managed temp dir, imported through the normal
// encrypted pipeline, and the plaintext temp file is deleted — nothing lands
// in the user's Downloads folder and no history/cookies persist (incognito).
//
// Security: the window label is NOT listed in any capability, so the external
// pages it loads have no access to Tauri IPC/commands.

const BROWSER_WINDOW_LABEL: &str = "vaultbrowser";

/// Injected into every page the private browser loads (runs at document start
/// on each navigation). Scans the DOM for real media — <video>/<audio>/<source>
/// and direct media links — aggressively filters out ads, trackers, and stream
/// fragments, and reports the rest back to the app via a one-way event.
///
/// Ad filtering mirrors CyberSnatcher's heuristics: an ad-host blocklist, ad
/// path patterns (pagead/vast/preroll/...), stream-segment names, and the
/// classic muted+autoplay+loop "decorative/ad banner" signal.
const MEDIA_SCANNER_JS: &str = r#"
(function () {
  if (window.__cvScanner) return;
  window.__cvScanner = true;

  var AD_HOSTS = [
    "doubleclick.net","googlesyndication.com","googleadservices.com","google-analytics.com",
    "adservice.google.com","2mdn.net","pagead2.googlesyndication.com","imasdk.googleapis.com",
    "adnxs.com","adsrvr.org","amazon-adsystem.com","scorecardresearch.com","moatads.com",
    "teads.tv","taboola.com","outbrain.com","criteo.com","pubmatic.com","rubiconproject.com",
    "openx.net","casalemedia.com","springserve.com","spotxchange.com","spotx.tv","innovid.com",
    "adform.net","yieldmo.com","smartadserver.com","contextweb.com","3lift.com","bidswitch.net",
    "serving-sys.com","flashtalking.com","adsafeprotected.com","quantserve.com","exoclick.com",
    "juicyads.com","trafficjunky.net"," adnium.com","popads.net","poptm.com","mgid.com"
  ];
  var AD_PATH_RE = /(^|[\/._-])(ads?|advert|advertising|adsystem|adserver|adframe|vast|vmap|vpaid|ima|preroll|midroll|postroll|sponsor|banner|promo|doubleclick|pagead|gampad|popunder)([\/._-]|$)/i;
  var SEGMENT_RE = /(^|[\/_-])(seg|segment|chunk|frag|fragment|init|media)[-_]?\d*\.[a-z0-9]+$/i;
  var MEDIA_EXT_RE = /\.(mp4|m4v|webm|mov|mkv|ogv|mp3|m4a|aac|flac|ogg|wav|opus)(\?|#|$)/i;
  var SEGMENT_EXT_RE = /\.(ts|m4s)(\?|#|$)/i;

  function hostOf(u) { try { return new URL(u, location.href).hostname.toLowerCase(); } catch (e) { return ""; } }

  function isAd(url) {
    if (!url) return true;
    if (/^(blob:|data:|about:)/i.test(url)) return true; // can't fetch these
    var h = hostOf(url);
    for (var i = 0; i < AD_HOSTS.length; i++) {
      var d = AD_HOSTS[i].trim();
      if (h === d || h.endsWith("." + d)) return true;
    }
    if (AD_PATH_RE.test(url)) return true;
    if (SEGMENT_RE.test(url) || SEGMENT_EXT_RE.test(url)) return true; // HLS/DASH fragments
    return false;
  }

  function looksDecorative(el) {
    // Muted + autoplay + loop with no controls = background/ad banner clip.
    if (el.muted && el.autoplay && el.loop && !el.controls) return true;
    // Tiny players are almost always ads/thumbnails.
    if (el.videoWidth && el.videoWidth < 200 && el.videoHeight && el.videoHeight < 200) return true;
    // Very short clips that aren't user-controllable are typically bumpers.
    if (el.duration && el.duration > 0 && el.duration < 5 && !el.controls) return true;
    return false;
  }

  function fnameOf(url) {
    try {
      var p = new URL(url, location.href).pathname;
      var n = decodeURIComponent(p.split("/").pop() || "");
      return n || "media";
    } catch (e) { return "media"; }
  }

  // ── HLS stream detection ──
  // Streaming playlists (.m3u8) are fetched by the page's own JS, not present
  // as an element src, so we hook fetch/XHR to capture them. They are saved via
  // the backend HLS downloader (segments stitched server-side), not the
  // direct-file grab path. Lighter ad filter than isAd() so a playlist named
  // "media.m3u8" isn't wrongly dropped as a stream fragment.
  var STREAMS = {};
  function streamIsAd(url) {
    if (/^(blob:|data:|about:)/i.test(url)) return true;
    var h = hostOf(url);
    for (var i = 0; i < AD_HOSTS.length; i++) {
      var d = AD_HOSTS[i].trim();
      if (h === d || h.endsWith("." + d)) return true;
    }
    return false;
  }
  function noteStream(u) {
    try {
      if (!u) return;
      var abs = new URL(u, location.href).href;
      if (/\.m3u8(\?|#|$)/i.test(abs) && !streamIsAd(abs) && !STREAMS[abs]) {
        STREAMS[abs] = 1;
        report();
      }
    } catch (e) {}
  }
  try {
    var _fetch = window.fetch;
    if (_fetch) {
      window.fetch = function (input) {
        try { noteStream(typeof input === "string" ? input : (input && input.url)); } catch (e) {}
        return _fetch.apply(this, arguments);
      };
    }
  } catch (e) {}
  try {
    var _xopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { noteStream(url); } catch (e) {}
      return _xopen.apply(this, arguments);
    };
  } catch (e) {}

  function collect() {
    var out = [];
    var seen = {};
    function push(url, kind, el) {
      if (!url || seen[url]) return;
      if (isAd(url)) return;
      if (!MEDIA_EXT_RE.test(url)) return; // direct-file only (no HLS/streaming)
      if (el && el.tagName && el.tagName.toLowerCase() === "video" && looksDecorative(el)) return;
      seen[url] = 1;
      out.push({
        url: url,
        kind: kind,
        label: fnameOf(url),
        w: (el && el.videoWidth) || 0,
        h: (el && el.videoHeight) || 0,
        dur: (el && el.duration) || 0
      });
    }
    var vids = document.querySelectorAll("video, audio");
    for (var i = 0; i < vids.length; i++) {
      var el = vids[i];
      var kind = el.tagName.toLowerCase() === "audio" ? "audio" : "video";
      push(el.currentSrc || el.src, kind, el);
      var srcs = el.querySelectorAll("source");
      for (var j = 0; j < srcs.length; j++) push(srcs[j].src, kind, el);
    }
    var links = document.querySelectorAll('a[href]');
    for (var k = 0; k < links.length && out.length < 50; k++) {
      var href = links[k].href;
      if (MEDIA_EXT_RE.test(href)) push(href, /\.(mp3|m4a|aac|flac|ogg|wav|opus)/i.test(href) ? "audio" : "video", null);
    }
    // Captured HLS playlists (saved via the backend stream downloader).
    Object.keys(STREAMS).forEach(function (u) {
      if (seen[u] || out.length >= 50) return;
      seen[u] = 1;
      out.push({ url: u, kind: "stream", label: fnameOf(u) || "stream", w: 0, h: 0, dur: 0 });
    });
    return out.slice(0, 50);
  }

  var lastSent = "";
  function report() {
    var items = collect();
    var key = JSON.stringify(items.map(function (m) { return m.url; }));
    if (key === lastSent) return;
    lastSent = key;
    try {
      var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv) inv("plugin:event|emit", { event: "browser-media-found", payload: { url: location.href, items: items } });
    } catch (e) {}
  }

  // Initial scans (catch lazy-loaded players) + observe later DOM changes.
  function schedule() { [400, 1500, 4000, 8000].forEach(function (t) { setTimeout(report, t); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
  try {
    var deb;
    new MutationObserver(function () { clearTimeout(deb); deb = setTimeout(report, 1000); })
      .observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
"#;

/// Injected alongside the media scanner: draws a small floating Back /
/// Forward / Reload pill in the top-left corner of every page, so the
/// browser window has its own navigation controls instead of relying only
/// on the bar in the vault window. Rendered inside a closed shadow root so
/// page CSS can't restyle or hide it; needs no IPC permissions at all.
const NAV_OVERLAY_JS: &str = r#"
(function () {
  if (window.top !== window) return; // main frame only
  if (window.__cvNav) return;
  window.__cvNav = true;
  function make() {
    if (!document.body) { setTimeout(make, 50); return; }
    var host = document.createElement("div");
    host.style.cssText = "position:fixed;top:10px;left:10px;z-index:2147483647;";
    var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:2px;background:rgba(8,8,14,0.85);border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:3px 5px;backdrop-filter:blur(6px);opacity:0.6;transition:opacity .15s;font-family:sans-serif";
    bar.onmouseenter = function () { bar.style.opacity = "1"; };
    bar.onmouseleave = function () { bar.style.opacity = "0.6"; };
    function btn(txt, title, fn) {
      var b = document.createElement("button");
      b.textContent = txt;
      b.title = title;
      b.style.cssText = "all:unset;cursor:pointer;color:#fff;padding:2px 9px;border-radius:7px;font-size:15px;line-height:1.3";
      b.onmouseenter = function () { b.style.background = "rgba(255,255,255,0.18)"; };
      b.onmouseleave = function () { b.style.background = "none"; };
      b.onclick = fn;
      return b;
    }
    bar.appendChild(btn("‹", "Back", function () { history.back(); }));
    bar.appendChild(btn("›", "Forward", function () { history.forward(); }));
    bar.appendChild(btn("⟳", "Reload", function () { location.reload(); }));
    root.appendChild(bar);
    document.body.appendChild(host);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
})();
"#;

/// Injected into the private browser: the vault's auto-lock idle timer lives in
/// the MAIN window and never sees input that happens in this separate browser
/// window, so a long browsing/watching session would auto-lock (and close this
/// window) mid-use. This emits a throttled one-way "browser-activity" event on
/// real user input OR while a video/audio is actually playing, which the app
/// turns into an activity touch. If the user genuinely walks away (no input,
/// nothing playing) the pings stop and auto-lock proceeds as normal.
const ACTIVITY_PING_JS: &str = r#"
(function () {
  if (window.__cvActivity) return;
  window.__cvActivity = true;
  var last = 0;
  function ping() {
    var now = Date.now();
    if (now - last < 8000) return; // throttle: at most once per 8s
    last = now;
    try {
      var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      if (inv) inv("plugin:event|emit", { event: "browser-activity", payload: {} });
    } catch (e) {}
  }
  ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart", "touchmove"].forEach(function (ev) {
    try { window.addEventListener(ev, ping, { passive: true, capture: true }); } catch (e) {}
  });
  // Active media playback counts as activity, so watching a video without
  // touching anything still keeps the vault unlocked. Stops when paused/ended.
  setInterval(function () {
    try {
      var m = document.querySelectorAll("video, audio");
      for (var i = 0; i < m.length; i++) {
        var el = m[i];
        if (!el.paused && !el.ended && el.readyState > 2 && el.currentTime > 0) { ping(); break; }
      }
    } catch (e) {}
  }, 5000);
})();
"#;

fn close_browser_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        let _ = win.close();
    }
}

/// Parse and validate a URL for the in-vault browser. Only http(s) is allowed.
fn parse_browser_url(url: &str) -> Result<tauri::Url, String> {
    let parsed = tauri::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        s => Err(format!("Scheme '{}' is not allowed", s)),
    }
}

/// Import a finished browser download into the active vault, then delete the
/// plaintext temp file (and its per-download temp subdirectory). Runs on its
/// own thread so the download handler never blocks on the vault mutex.
fn import_browser_download(app: tauri::AppHandle, path: std::path::PathBuf) {
    let display = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());

    let imported = (|| -> Result<Vec<String>, String> {
        let state = app.state::<AppState>();
        // Suppress auto-lock while the import runs (same as manual imports).
        let _busy = BusyGuard::new(&state.busy_ops);
        let ctx = {
            let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
            vm.import_prepare(None)?
        };
        let path_str = path.to_string_lossy().to_string();
        let (entries, dups) = VaultManager::import_process(&ctx, &[path_str], None)?;
        if entries.is_empty() {
            // Identical content already vaulted — return the existing id(s) so a
            // re-download still gets routed onto the page the user is viewing.
            return Ok(dups.iter().map(|f| f.id.clone()).collect());
        }
        let mut vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        let added = vm.import_commit(entries)?;
        Ok(added.iter().map(|f| f.id.clone()).collect())
    })();

    // Never leave plaintext behind, success or not. Shred (overwrite + unlink)
    // rather than just unlink, so the plaintext doesn't linger in unallocated
    // disk blocks after the vault has encrypted its own copy.
    vault::shred_file_best_effort(&path);
    if let Some(parent) = path.parent() {
        let _ = std::fs::remove_dir(parent); // per-download subdir, empty now
    }

    match imported {
        Ok(ids) if !ids.is_empty() => {
            // Payload carries the new file id(s) so the UI can drop them onto the
            // page that's currently open instead of the generic orphan-rescue
            // page. `name` keeps the friendly notification text.
            let _ = app.emit("browser-download-imported", serde_json::json!({ "name": display, "ids": ids }));
        }
        Ok(_) => {
            let _ = app.emit("browser-download-failed", format!("{} (file was empty or unreadable)", display));
        }
        Err(e) => {
            let _ = app.emit("browser-download-failed", format!("{}: {}", display, e));
        }
    }
}

#[tauri::command]
async fn browser_open(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = parse_browser_url(&url)?;

    // Browsing is a vault session feature: refuse when locked, since
    // captured downloads could not be imported anyway.
    {
        let state = app.state::<AppState>();
        let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        if !vm.is_unlocked() {
            return Err("No vault unlocked".to_string());
        }
    }

    // Reuse the existing window when open — just navigate it.
    if let Some(win) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        win.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = win.set_focus();
        return Ok(());
    }

    let nav_handle = app.clone();
    let win = tauri::WebviewWindowBuilder::new(
        &app,
        BROWSER_WINDOW_LABEL,
        tauri::WebviewUrl::External(parsed),
    )
    .title("Browser")
    .inner_size(1180.0, 780.0)
    .incognito(true)
    .initialization_script(MEDIA_SCANNER_JS)
    .initialization_script(NAV_OVERLAY_JS)
    .initialization_script(ACTIVITY_PING_JS)
    .on_navigation(move |u| {
        let _ = nav_handle.emit("browser-nav", u.to_string());
        // External pages must never navigate to app-internal schemes.
        matches!(u.scheme(), "http" | "https" | "about" | "blob" | "data")
    })
    .on_download(|webview, event| {
        match event {
            tauri::webview::DownloadEvent::Requested { url, destination } => {
                let app = webview.app_handle();
                let state = app.state::<AppState>();
                // Redirect the download into the vault's managed temp dir —
                // one unique subdir per download so the original filename is
                // preserved for the vault entry.
                let base = state
                    .vault_manager
                    .lock()
                    .ok()
                    .and_then(|vm| vm.get_vault_path().ok());
                let Some(base) = base else {
                    // No unlocked vault to import into — tell the user instead of
                    // cancelling the download silently.
                    let _ = app.emit("browser-download-failed", "unlock the vault first".to_string());
                    return false;
                };
                let fname = destination
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .filter(|n| !n.is_empty())
                    .unwrap_or_else(|| "download.bin".to_string());
                let dir = std::path::PathBuf::from(base)
                    .join("temp")
                    .join(uuid::Uuid::new_v4().to_string());
                if std::fs::create_dir_all(&dir).is_err() {
                    let _ = app.emit("browser-download-failed", format!("{} (could not prepare a temp folder)", fname));
                    return false;
                }
                let dest = dir.join(fname);
                *destination = dest.clone();
                if let Ok(mut pending) = state.browser_downloads.lock() {
                    pending.insert(url.to_string(), dest);
                }
                true
            }
            tauri::webview::DownloadEvent::Finished { url, path, success } => {
                let app = webview.app_handle().clone();
                let dest = {
                    let state = app.state::<AppState>();
                    let from_map = state
                        .browser_downloads
                        .lock()
                        .ok()
                        .and_then(|mut m| m.remove(&url.to_string()));
                    path.or(from_map)
                };
                if let Some(p) = dest {
                    if success {
                        std::thread::spawn(move || import_browser_download(app, p));
                    } else {
                        // The download failed (common when a site streams video in
                        // pieces rather than serving a single file). Clean up and —
                        // crucially — tell the user instead of failing silently.
                        vault::shred_file_best_effort(&p);
                        if let Some(parent) = p.parent() {
                            let _ = std::fs::remove_dir(parent);
                        }
                        let name = p.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| "download".to_string());
                        let _ = app.emit(
                            "browser-download-failed",
                            format!("{} — the browser couldn't save this video. Many sites stream video in pieces that can't be downloaded this way; try the Media button to Grab direct video files.", name),
                        );
                    }
                } else {
                    // No destination was ever recorded for this download.
                    let _ = app.emit("browser-download-failed", "the browser couldn't start this download".to_string());
                }
                true
            }
            _ => true,
        }
    })
    .build()
    .map_err(|e| format!("Failed to open browser window: {}", e))?;

    // Same screenshot/recording protection as the main vault window.
    let _ = win.set_content_protected(true);
    Ok(())
}

#[tauri::command]
fn browser_back(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        win.eval("history.back()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn browser_forward(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        win.eval("history.forward()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn browser_reload(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        win.eval("location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn browser_close(app: tauri::AppHandle) -> Result<(), String> {
    close_browser_window(&app);
    Ok(())
}

/// Derive a safe basename for a grabbed media URL (filename only, no path
/// separators / nulls, with a sane fallback + extension).
fn grab_filename(url: &tauri::Url, kind: &str) -> String {
    let raw = url
        .path_segments()
        .and_then(|s| s.last())
        .map(|s| s.to_string())
        .unwrap_or_default();
    let decoded = percent_encoding::percent_decode_str(&raw).decode_utf8_lossy().to_string();
    // Strip any path separators / nulls defensively.
    let mut name: String = decoded
        .chars()
        .filter(|c| *c != '/' && *c != '\\' && *c != '\0')
        .collect();
    name = name.trim().to_string();
    if name.is_empty() || !name.contains('.') {
        let ext = if kind == "audio" { "mp3" } else { "mp4" };
        let base = if name.is_empty() { "media".to_string() } else { name };
        name = format!("{}.{}", base, ext);
    }
    name.chars().take(180).collect()
}

/// Download a detected media URL straight into the vault. Streams the response
/// into the vault's managed temp dir, imports it through the encrypted
/// pipeline, then deletes the plaintext temp file — same guarantee as a
/// browser download (nothing lands in Downloads).
#[tauri::command]
async fn browser_grab(app: tauri::AppHandle, url: String, referer: Option<String>) -> Result<(), String> {
    let parsed = parse_browser_url(&url)?;
    // SSRF guard: this fetch runs with app privileges, so a page must not be
    // able to point it at loopback/link-local services.
    hls::reject_internal_host(parsed.as_str())?;

    // Resolve temp destination (requires an unlocked vault).
    let (dest, kind_is_audio) = {
        let state = app.state::<AppState>();
        let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        if !vm.is_unlocked() {
            return Err("No vault unlocked".to_string());
        }
        let base = vm.get_vault_path()?;
        drop(vm);
        let kind = if url.to_lowercase().contains(".mp3")
            || url.to_lowercase().contains(".m4a")
            || url.to_lowercase().contains(".aac")
            || url.to_lowercase().contains(".flac")
            || url.to_lowercase().contains(".ogg")
            || url.to_lowercase().contains(".wav")
        { "audio" } else { "video" };
        let dir = std::path::PathBuf::from(base)
            .join("temp")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).map_err(|e| format!("Create temp dir: {}", e))?;
        (dir.join(grab_filename(&parsed, kind)), kind == "audio")
    };
    let _ = kind_is_audio;

    // Stream the download with a browser-like UA + Referer so hotlink-protected
    // direct files are more likely to serve.
    const MAX_BYTES: u64 = 6 * 1024 * 1024 * 1024; // 6 GB safety cap
    let client = reqwest::Client::new();
    let mut req = client
        .get(parsed.clone())
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        .header(reqwest::header::ACCEPT, "*/*");
    if let Some(ref r) = referer {
        if let Ok(hv) = reqwest::header::HeaderValue::from_str(r) {
            req = req.header(reqwest::header::REFERER, hv);
        }
    }

    let cleanup = |dest: &std::path::Path| {
        // Partial downloads are plaintext — shred, don't just unlink.
        vault::shred_file_best_effort(dest);
        if let Some(parent) = dest.parent() { let _ = std::fs::remove_dir(parent); }
    };

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => { cleanup(&dest); return Err(format!("Download failed: {}", e)); }
    };
    if !resp.status().is_success() {
        cleanup(&dest);
        return Err(format!("Download failed: HTTP {}", resp.status().as_u16()));
    }

    // Write streamed chunks to the temp file, enforcing the size cap.
    {
        use std::io::Write as _;
        let mut file = match std::fs::File::create(&dest) {
            Ok(f) => f,
            Err(e) => { cleanup(&dest); return Err(format!("Create temp file: {}", e)); }
        };
        let mut written: u64 = 0;
        let mut resp = resp;
        loop {
            match resp.chunk().await {
                Ok(Some(bytes)) => {
                    written += bytes.len() as u64;
                    if written > MAX_BYTES {
                        drop(file);
                        cleanup(&dest);
                        return Err("Download exceeds 6 GB cap".to_string());
                    }
                    if let Err(e) = file.write_all(&bytes) {
                        drop(file);
                        cleanup(&dest);
                        return Err(format!("Write temp file: {}", e));
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    drop(file);
                    cleanup(&dest);
                    return Err(format!("Download interrupted: {}", e));
                }
            }
        }
        let _ = file.sync_all();
    }

    // Import (and shred the temp) on a blocking thread — same path as a
    // captured browser download, including the imported/failed events.
    tauri::async_runtime::spawn_blocking(move || import_browser_download(app, dest))
        .await
        .map_err(|e| e.to_string())
}

/// Download an HLS (.m3u8) stream into the vault. Fetches + decrypts + stitches
/// the segments into one file in the vault temp dir, then imports it through the
/// same encrypted pipeline as any other grab (nothing lands in Downloads).
/// Emits `browser-download-imported` / `browser-download-failed` like the other
/// download paths, plus `browser-stream-progress` while it runs.
#[tauri::command]
async fn browser_grab_stream(app: tauri::AppHandle, url: String, referer: Option<String>) -> Result<(), String> {
    let parsed = parse_browser_url(&url)?;

    // Resolve temp destination (requires an unlocked vault).
    let dest = {
        let state = app.state::<AppState>();
        let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        if !vm.is_unlocked() {
            return Err("No vault unlocked".to_string());
        }
        let base = vm.get_vault_path()?;
        drop(vm);
        let dir = std::path::PathBuf::from(base)
            .join("temp")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).map_err(|e| format!("Create temp dir: {}", e))?;
        // Concatenated HLS segments are an MPEG-TS stream; .ts imports/plays fine.
        dir.join("stream.ts")
    };

    let cleanup = |dest: &std::path::Path| {
        // Partial stream stitches are plaintext — shred, don't just unlink.
        vault::shred_file_best_effort(dest);
        if let Some(parent) = dest.parent() { let _ = std::fs::remove_dir(parent); }
    };

    let client = reqwest::Client::new();
    let progress_app = app.clone();
    let progress = move |done: usize, total: usize| {
        let _ = progress_app.emit("browser-stream-progress", serde_json::json!({ "done": done, "total": total }));
    };

    let dl = hls::download_hls(&client, parsed.as_str(), referer.as_deref(), &dest, Some(&progress)).await;
    if let Err(e) = dl {
        cleanup(&dest);
        // Report through the same channel the UI already listens on.
        let _ = app.emit("browser-download-failed", format!("stream — {}", e));
        return Err(e);
    }

    // Import (and shred the temp) on a blocking thread — same path as a
    // captured browser download, including the imported/failed events.
    tauri::async_runtime::spawn_blocking(move || import_browser_download(app, dest))
        .await
        .map_err(|e| e.to_string())
}

// ── Security hardening ──

/// Prevent core dumps from leaking sensitive memory
fn disable_core_dumps() {
    #[cfg(unix)]
    unsafe {
        libc::setrlimit(
            libc::RLIMIT_CORE,
            &libc::rlimit { rlim_cur: 0, rlim_max: 0 },
        );
    }
    #[cfg(windows)]
    {
        extern "system" {
            fn SetErrorMode(uMode: u32) -> u32;
        }
        const SEM_NOGPFAULTERRORBOX: u32 = 0x0002;
        const SEM_FAILCRITICALERRORS: u32 = 0x0001;
        unsafe {
            SetErrorMode(SEM_NOGPFAULTERRORBOX | SEM_FAILCRITICALERRORS);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            vault_manager: Mutex::new(VaultManager::new()),
            busy_ops: std::sync::atomic::AtomicUsize::new(0),
            watch_seen: Mutex::new((None, HashMap::new())),
            browser_downloads: Mutex::new(HashMap::new()),
            phone_server: Mutex::new(None),
        })
        .setup(|app| {
            // Core dump prevention: must run before any secrets are loaded
            disable_core_dumps();

            // Watch-folder auto-importer: background poller (no-op until a
            // vault is unlocked and a watch folder is configured).
            start_watch_thread(app.handle().clone());

            // Backend watchdog auto-lock: a frontend that is frozen, killed, or
            // detached can no longer poll check_auto_lock, which used to leave a
            // seized-while-unlocked vault open indefinitely. This thread enforces
            // the idle timeout from the backend regardless of the UI's state, so
            // the keys are wiped from RAM on schedule no matter what.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(5));
                        let state = handle.state::<AppState>();
                        // Never lock in the middle of a long operation (import)
                        if state.busy_ops.load(std::sync::atomic::Ordering::SeqCst) > 0 {
                            continue;
                        }
                        let locked = match state.vault_manager.lock() {
                            Ok(mut vm) => vm.check_auto_lock(),
                            Err(_) => false,
                        };
                        if locked {
                            close_browser_window(&handle);
                            stop_phone_server(&handle);
                            let _ = handle.emit("vault-auto-locked", ());
                        }
                    }
                });
            }

            // NOTE: The previous anti-debugger checks (silent process::exit on
            // detecting a debugger, plus a 2s background re-check) were removed.
            // They did not meaningfully deter an attacker — anyone who can
            // attach a debugger can also patch out the check — yet they would
            // silently kill the app for legitimate users running it under a
            // profiler, crash reporter, or some endpoint security agents.
            // Real protection comes from the encryption + auto-lock, not from
            // refusing to run while observed.

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Screen capture protection: prevent screenshots/screen recording
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_content_protected(true);

                // Windows: SetWindowDisplayAffinity to exclude from capture/recording
                #[cfg(target_os = "windows")]
                {
                    extern "system" {
                        fn SetWindowDisplayAffinity(hWnd: isize, dwAffinity: u32) -> i32;
                    }
                    const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;
                    if let Ok(hwnd) = window.hwnd() {
                        unsafe {
                            SetWindowDisplayAffinity(hwnd.0 as isize, WDA_EXCLUDEFROMCAPTURE);
                        }
                    }
                }
            }

            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("cvlt", |ctx, request, responder| {
            // This handler is invoked on the platform's UI thread (WebView2
            // dispatches WebResourceRequested on the main thread). Do NOTHING
            // here — in particular never wait for the vault mutex, which can
            // be held for a while by an import commit or bundle rebuild —
            // or Windows marks the app "not responding". All work, including
            // the metadata lookup, happens on the spawned thread.
            let app_handle = ctx.app_handle().clone();
            std::thread::spawn(move || {
            // Parse URL path: /file/{id} or /thumb/{id}
            let path = percent_encoding::percent_decode(request.uri().path().as_bytes())
                .decode_utf8_lossy()
                .to_string();

            let (is_thumb, thumb_size, file_id) = if let Some(rest) = path.strip_prefix("/thumb/") {
                if rest.is_empty() {
                    responder.respond(ResponseBuilder::new().status(StatusCode::BAD_REQUEST)
                        .body(b"Bad request: expected /thumb/{id} or /thumb/{size}/{id}".to_vec()).unwrap());
                    return;
                }
                // Support /thumb/{size}/{id} or /thumb/{id} (default 256)
                if let Some(slash_pos) = rest.find('/') {
                    let size_str = &rest[..slash_pos];
                    let id = &rest[slash_pos + 1..];
                    let size = size_str.parse::<u32>().unwrap_or(256).clamp(64, 512);
                    (true, size, id.to_string())
                } else {
                    (true, 256u32, rest.to_string())
                }
            } else if let Some(id) = path.strip_prefix("/file/").or_else(|| path.strip_prefix("/file\\")) {
                if id.is_empty() {
                    responder.respond(ResponseBuilder::new().status(StatusCode::BAD_REQUEST)
                        .body(b"Bad request: expected /file/{id}".to_vec()).unwrap());
                    return;
                }
                (false, 0u32, id.to_string())
            } else {
                responder.respond(ResponseBuilder::new().status(StatusCode::BAD_REQUEST)
                    .header(CONTENT_TYPE, "text/plain")
                    .body(b"Bad request: expected /file/{id} or /thumb/{id}".to_vec()).unwrap());
                return;
            };

            // Lock mutex only for metadata lookup (no file I/O under lock)
            let stream_info = {
                let state = app_handle.state::<AppState>();
                let vm = match state.vault_manager.lock() {
                    Ok(vm) => vm,
                    Err(_) => {
                        responder.respond(ResponseBuilder::new()
                            .status(StatusCode::SERVICE_UNAVAILABLE)
                            .body(b"Lock poisoned".to_vec()).unwrap());
                        return;
                    }
                };
                match vm.get_file_stream_info(&file_id) {
                    Ok(info) => info,
                    Err(e) => {
                        let status = if e.contains("No vault unlocked") {
                            StatusCode::FORBIDDEN
                        } else {
                            StatusCode::NOT_FOUND
                        };
                        responder.respond(ResponseBuilder::new().status(status)
                            .header(CONTENT_TYPE, "text/plain")
                            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                            .body(e.into_bytes()).unwrap());
                        return;
                    }
                }
            }; // mutex released here

                if is_thumb {
                    // Thumbnail route: resize to 128x128 WebP
                    match generate_thumbnail(&stream_info, thumb_size) {
                        Ok(webp_bytes) => {
                            let len = webp_bytes.len();
                            responder.respond(ResponseBuilder::new()
                                .header(CONTENT_TYPE, "image/webp")
                                .header(CONTENT_LENGTH, len.to_string())
                                .header(CACHE_CONTROL, "max-age=604800, immutable")
                                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                                .body(webp_bytes).unwrap());
                        }
                        Err(e) => responder.respond(ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(CONTENT_TYPE, "text/plain")
                            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                            .body(e.to_string().into_bytes()).unwrap()),
                    }
                } else {
                    // File route: stream with Range support
                    match get_stream_response(stream_info, &request) {
                        Ok(response) => responder.respond(response),
                        Err(e) => responder.respond(ResponseBuilder::new()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(CONTENT_TYPE, "text/plain")
                            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                            .body(e.to_string().into_bytes()).unwrap()),
                    }
                }
            });
        })
        .invoke_handler(tauri::generate_handler![
            list_vaults,
            create_vault,
            delete_vault,
            unlock_vault,
            lock_vault,
            get_lockout_status,
            vault_requires_key_file,
            get_security_config,
            update_security_config,
            check_auto_lock,
            touch_activity,
            set_duress_pin,
            secure_delete_files,
            secure_cleanup_temp,
            mark_clipboard_copied,
            check_clipboard_expiry,
            clear_clipboard,
            get_files,
            import_files,
            set_watch_folder,
            get_watch_folder,
            delete_files,
            get_trashed_files,
            restore_from_trash,
            empty_trash,
            wipe_vault,
            export_files,
            toggle_favorite,
            get_audit_log,
            check_integrity,
            get_categories,
            list_folders,
            create_folder,
            delete_folder,
            move_files_to_folder,
            get_vault_size,
            export_single_file,
            get_file_content,
            backup_vault,
            restore_vault,
            restore_vault_from_file,
            get_vault_path,
            transfer_vault,
            open_url_in_browser,
            open_file_with_default_app,
            browser_open,
            browser_back,
            browser_forward,
            browser_reload,
            browser_close,
            phone_server_start,
            phone_server_stop,
            phone_server_status,
            browser_grab,
            browser_grab_stream,
            export_encrypted_zip,
            get_cache_key,
            save_pages,
            load_pages,
            save_bookmarks,
            load_bookmarks,
            get_license_status,
            validate_license,
            revalidate_license,
            deactivate_license,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Wipe key material on shutdown. The OS event loop terminates the
            // process without dropping Tauri's managed state, so without this
            // handler the in-memory KEK would never be explicitly zeroized on
            // app exit — it would just sit in freed RAM until overwritten.
            // lock_vault() re-encrypts session metadata, unlocks the mlock'd
            // pages, and zeroizes both the PIN-hash and encryption-key buffers.
            if let tauri::RunEvent::Exit = event {
                stop_phone_server(app_handle);
                if let Ok(mut vm) = app_handle.state::<AppState>().vault_manager.lock() {
                    if vm.is_unlocked() {
                        vm.lock_vault();
                    }
                }
            }
        });
}
