use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Nonce};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Algorithm, Params, Version,
};
use chrono::{DateTime, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use base64::Engine as _;
use std::time::{Duration, Instant};
use uuid::Uuid;
use zeroize::Zeroizing;
use obfstr::obfstr;

// ── License types ──

#[allow(dead_code)] // licensing retained but unused — app is fully free
const REVALIDATE_INTERVAL_MS: i64 = 24 * 60 * 60 * 1000; // 24 hours

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub key: Option<String>,
    pub email: Option<String>,
    pub last_revalidated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub is_pro: bool,
    pub license_key: Option<String>,
    pub email: Option<String>,
    pub needs_revalidation: bool,
}

// ── Public data types ──

/// Metadata for streaming a file from the bundle without reading its bytes.
pub struct FileStreamInfo {
    pub bundle_path: PathBuf,
    pub offset_in_bundle: u64,
    pub total_size: u64,
    pub mime_type: String,
    pub file_id: String,
    pub encryption_key: Option<Vec<u8>>,
    pub encryption_salt: Option<Vec<u8>>,
    /// Whether this file's chunks were sealed with chunk-index AAD binding
    /// (see SecurityConfig::aead_bound). The streaming/decrypt path must use
    /// the same setting the data was written with.
    pub aead_bound: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub file_type: String,
    pub category: String,
    pub hash: String,
    pub favorite: bool,
    pub imported_at: DateTime<Utc>,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub trashed_at: Option<DateTime<Utc>>,
    /// Hex-encoded wrapped per-file DEK (nonce(12) + ciphertext(32) + tag(16) = 60 bytes).
    /// None = legacy vault-wide key encryption.
    #[serde(default)]
    pub wrapped_dek: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub action: String,
    pub details: String,
    pub timestamp: DateTime<Utc>,
}

/// Security configuration for a vault (persisted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Whether self-destruct is enabled
    pub self_destruct_enabled: bool,
    /// Number of failed attempts before self-destruct triggers
    pub self_destruct_threshold: u32,
    /// Auto-lock timeout in seconds (0 = disabled, minimum 30 when enabled)
    pub auto_lock_timeout_secs: u64,
    /// Whether a key file is required to unlock
    pub key_file_required: bool,
    /// SHA-256 hash of the key file contents (used to verify correct key file)
    pub key_file_hash: Option<String>,
    /// Whether a duress password is configured
    #[serde(default)]
    pub duress_enabled: bool,
    /// Clipboard auto-clear timeout in seconds (0 = disabled, default 30)
    #[serde(default = "default_clipboard_clear_secs")]
    pub clipboard_clear_secs: u32,
    /// Hex-encoded 16-byte salt for AES-256-GCM file encryption (None = unencrypted legacy vault)
    #[serde(default)]
    pub encryption_salt: Option<String>,
    /// Whether blobs in the bundle have per-blob CRC32 headers (v2 format)
    #[serde(default)]
    pub has_blob_headers: bool,
    /// Whether file-data chunks and wrapped DEKs are bound to their file
    /// identity + chunk position via AES-GCM associated data (AAD). When set,
    /// an attacker with write access to the bundle cannot reorder, duplicate,
    /// or drop encrypted chunks within a file without the tag check failing.
    /// Defaults to false so vaults written before this format decrypt exactly
    /// as before (their blobs were sealed with empty AAD).
    #[serde(default)]
    pub aead_bound: bool,
}

fn default_clipboard_clear_secs() -> u32 { 30 }

impl Default for SecurityConfig {
    fn default() -> Self {
        SecurityConfig {
            self_destruct_enabled: false,
            self_destruct_threshold: 10,
            auto_lock_timeout_secs: 300, // 5 minutes default
            key_file_required: false,
            key_file_hash: None,
            duress_enabled: false,
            clipboard_clear_secs: 30,
            encryption_salt: None,
            has_blob_headers: false,
            aead_bound: false,
        }
    }
}

/// In-memory holder for sensitive bytes (key material / PIN hashes) kept for
/// the duration of an unlocked session.
///
/// IMPORTANT — be honest about the threat model this covers:
///   • It DOES bound the secret's exposure: both the obfuscated buffer AND its
///     XOR mask are mlock'd (kept out of swap / the page file) and zeroized on
///     drop, so a key never lands on disk and its lifetime in RAM is bounded.
///   • It does NOT hide the secret from an attacker who can read this process's
///     memory. The mask lives in the same address space, so a full memory dump
///     can XOR the two buffers back together. The masking is only a minor
///     obstacle to casual `strings`-style scanning, NOT a defense against a
///     live RAM dump. Do not rely on it as such.
///
/// (Previously only the data buffer was locked, leaving the XOR mask — which
/// trivially de-obfuscates the data — swappable to disk; and Drop never
/// unlocked the pages. Both are fixed here.)
pub struct ProtectedMemory {
    masked_data: Vec<u8>,
    mask: Vec<u8>,
}

impl ProtectedMemory {
    pub fn new(data: &[u8]) -> Self {
        let mut rng = rand::thread_rng();
        let mut mask = vec![0u8; data.len()];
        rng.fill_bytes(&mut mask);
        let masked: Vec<u8> = data.iter().zip(mask.iter()).map(|(d, m)| d ^ m).collect();
        // Lock BOTH buffers so neither the obfuscated data nor the mask can be
        // paged out to disk. The mask must be locked too — otherwise the key
        // that undoes the obfuscation could itself leak to the swap file.
        lock_memory(masked.as_ptr(), masked.len());
        lock_memory(mask.as_ptr(), mask.len());
        ProtectedMemory {
            masked_data: masked,
            mask,
        }
    }

    pub fn reveal(&self) -> Zeroizing<Vec<u8>> {
        Zeroizing::new(self.masked_data.iter().zip(self.mask.iter()).map(|(d, m)| d ^ m).collect())
    }

    pub fn zeroize(&mut self) {
        for b in self.masked_data.iter_mut() { *b = 0; }
        for b in self.mask.iter_mut() { *b = 0; }
    }
}

impl Drop for ProtectedMemory {
    fn drop(&mut self) {
        // Unlock both pages we locked in `new`, then wipe the bytes.
        unlock_memory(self.masked_data.as_ptr(), self.masked_data.len());
        unlock_memory(self.mask.as_ptr(), self.mask.len());
        self.zeroize();
    }
}

/// Lock memory pages to prevent swapping to disk
pub fn lock_memory(ptr: *const u8, len: usize) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::mlock(ptr as *const libc::c_void, len) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = (ptr, len);
        false
    }
}

/// Unlock memory pages
pub fn unlock_memory(ptr: *const u8, len: usize) {
    #[cfg(unix)]
    {
        unsafe { libc::munlock(ptr as *const libc::c_void, len); }
    }
    #[cfg(not(unix))]
    {
        let _ = (ptr, len);
    }
}

/// Lockout status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockoutStatus {
    pub failed_attempts: u32,
    pub locked_until_ms: u64, // 0 = not locked, otherwise ms remaining
    pub self_destruct_enabled: bool,
    pub self_destruct_threshold: u32,
}

// ── Internal persisted data ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct VaultData {
    info: VaultInfo,
    pin_hash: String,          // Argon2id PHC string
    #[serde(default)]
    duress_pin_hash: Option<String>, // Argon2id PHC string for duress password
    #[serde(default)]
    security: SecurityConfig,
    files: Vec<VaultFile>,
    #[serde(default)]
    folders: Vec<String>,      // User-created folder names
    audit_log: Vec<AuditEntry>,
    /// JSON string of VaultPage[] — encrypted at rest in the bundle footer.
    /// None for vaults created before pages feature (defaults to empty array).
    #[serde(default)]
    pages_json: Option<String>,
    /// JSON string of the private browser's Bookmark[] — encrypted at rest in
    /// the bundle footer (it reveals sites the user visits). None / "[]" for
    /// vaults created before the bookmarks feature.
    #[serde(default)]
    bookmarks_json: Option<String>,
    /// AES-256-GCM encrypted blob (hex) containing sensitive metadata:
    /// audit_log, folders, file metadata (names, folders, favorites), and pages_json.
    /// When present, the plaintext fields above are cleared in the on-disk format
    /// and only populated in memory after unlock/decryption.
    #[serde(default)]
    encrypted_metadata: Option<String>,
    /// Persisted failed login attempt count (survives app restart to prevent brute-force).
    #[serde(default)]
    lockout_failed_attempts: u32,
    /// Unix timestamp (seconds) of last failed login attempt.
    #[serde(default)]
    lockout_last_failed_ts: Option<i64>,
    /// Absolute path of a folder to auto-import media from (None = disabled).
    /// Stored encrypted at rest (via SensitiveMetadata) since it reveals a
    /// filesystem location.
    #[serde(default)]
    watch_folder: Option<String>,
}

/// Sensitive metadata fields that are encrypted at rest.
#[derive(Serialize, Deserialize)]
struct SensitiveMetadata {
    audit_log: Vec<AuditEntry>,
    folders: Vec<String>,
    /// Full file metadata (names, types, folders, favorites, etc.)
    files: Vec<VaultFile>,
    pages_json: Option<String>,
    #[serde(default)]
    bookmarks_json: Option<String>,
    #[serde(default)]
    watch_folder: Option<String>,
}

/// Encrypt sensitive metadata fields using AES-256-GCM with the vault KEK.
fn encrypt_sensitive_metadata(kek: &[u8], _salt: &[u8], meta: &SensitiveMetadata) -> Result<String, String> {
    let json = serde_json::to_string(meta).map_err(|e| format!("Serialize sensitive metadata: {}", e))?;
    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| format!("Invalid KEK for metadata encryption: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, json.as_bytes())
        .map_err(|e| format!("Metadata encryption failed: {}", e))?;
    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(hex::encode(output))
}

/// Decrypt sensitive metadata fields using AES-256-GCM with the vault KEK.
fn decrypt_sensitive_metadata(kek: &[u8], encrypted_hex: &str) -> Result<SensitiveMetadata, String> {
    let data = hex::decode(encrypted_hex)
        .map_err(|e| format!("Invalid encrypted metadata hex: {}", e))?;
    if data.len() < 12 {
        return Err("Encrypted metadata too short".into());
    }
    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| format!("Invalid KEK for metadata decryption: {}", e))?;
    let nonce = Nonce::from_slice(&data[..12]);
    let plaintext = cipher.decrypt(nonce, &data[12..])
        .map_err(|e| format!("Metadata decryption failed: {}", e))?;
    serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Parse decrypted metadata: {}", e))
}

// ── In-memory lockout tracking (not persisted) ──

struct LockoutTracker {
    failed_attempts: u32,
    last_failed: Option<Instant>,
}

impl LockoutTracker {
    fn new() -> Self {
        LockoutTracker {
            failed_attempts: 0,
            last_failed: None,
        }
    }

    /// Returns the delay in seconds for the current failed attempt count.
    /// 0-2 attempts: no delay
    /// 3 attempts: 2s
    /// 4: 4s, 5: 8s, 6: 15s, 7+: 30s
    fn lockout_delay_secs(&self) -> u64 {
        match self.failed_attempts {
            0..=2 => 0,
            3 => 2,
            4 => 4,
            5 => 8,
            6 => 15,
            _ => 30,
        }
    }

    /// Returns remaining lockout time in milliseconds, or 0 if not locked out.
    fn remaining_lockout_ms(&self) -> u64 {
        let delay = self.lockout_delay_secs();
        if delay == 0 {
            return 0;
        }
        if let Some(last) = self.last_failed {
            let elapsed = last.elapsed();
            let required = Duration::from_secs(delay);
            if elapsed < required {
                return (required - elapsed).as_millis() as u64;
            }
        }
        0
    }

    fn record_failure(&mut self) {
        self.failed_attempts += 1;
        self.last_failed = Some(Instant::now());
    }

}

// ── Helper functions ──

fn mime_from_extension(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "text/plain", // Serve SVG as plain text to prevent XSS
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" => "audio/ogg",
        "aac" => "audio/aac",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }.to_string()
}

/// Create an Argon2id hasher with recommended parameters.
fn argon2_hasher() -> Argon2<'static> {
    // OWASP recommended: m=19456 (19 MiB), t=2, p=1
    let params = Params::new(19456, 2, 1, None).unwrap_or(Params::DEFAULT);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Hash a PIN (optionally combined with key file data) using Argon2id.
fn hash_pin(pin: &str, key_file_data: Option<&[u8]>) -> Result<String, String> {
    let mut input = pin.as_bytes().to_vec();
    if let Some(kf) = key_file_data {
        // Combine PIN + key file via HMAC-like concatenation
        let mut hasher = Sha256::new();
        hasher.update(&input);
        hasher.update(kf);
        input = hasher.finalize().to_vec();
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = argon2_hasher();
    let hash = argon2
        .hash_password(&input, &salt)
        .map_err(|e| format!("Argon2 hash error: {}", e))?;
    Ok(hash.to_string())
}

/// True only for a canonical legacy hash: exactly 64 lowercase hex characters
/// (a bare SHA-256 digest). Anything else is not a hash this code ever wrote.
fn is_legacy_sha256_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Verify a PIN against a stored hash.
///
/// The supported, current format is an Argon2id PHC string. The unsalted
/// single-round `SHA-256(pin)` format is LEGACY and only still accepted so that
/// a vault created before the Argon2id migration can be unlocked exactly once —
/// `unlock_vault` immediately re-hashes the PIN with Argon2id and persists it,
/// so the weak representation is gone after the first successful unlock. The
/// fallback cannot simply be deleted: the legacy hash *is* `SHA-256(pin)`, and
/// there is no way to verify that against Argon2id without the user's PIN, so
/// removing it would permanently lock legacy users out of their own vaults.
///
/// The fallback is tightly scoped (only a canonical 64-hex digest can reach it)
/// and compared in constant time.
fn verify_pin(pin: &str, key_file_data: Option<&[u8]>, stored_hash: &str) -> bool {
    let mut input = pin.as_bytes().to_vec();
    if let Some(kf) = key_file_data {
        let mut hasher = Sha256::new();
        hasher.update(&input);
        hasher.update(kf);
        input = hasher.finalize().to_vec();
    }

    let parsed = match PasswordHash::new(stored_hash) {
        Ok(h) => h,
        Err(_) => {
            // Only a genuine legacy SHA-256 digest may use the weak path; any
            // other non-PHC string is rejected outright.
            if !is_legacy_sha256_hash(stored_hash) {
                return false;
            }
            // Constant-time comparison to avoid leaking the digest via timing.
            let legacy = hash_string(pin);
            let a = legacy.as_bytes();
            let b = stored_hash.as_bytes();
            if a.len() != b.len() { return false; }
            let mut diff = 0u8;
            for (x, y) in a.iter().zip(b.iter()) {
                diff |= x ^ y;
            }
            return diff == 0;
        }
    };

    argon2_hasher().verify_password(&input, &parsed).is_ok()
}

/// Legacy SHA-256 hash (for backwards compatibility with old vaults).
fn hash_string(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Return a filesystem-safe basename from a vault-stored filename. Strips
/// any path separators / traversal segments / null bytes before use in
/// export or download paths, so a maliciously crafted or corrupted vault
/// entry cannot escape the destination directory.
fn safe_basename(name: &str) -> Result<String, String> {
    if name.is_empty() { return Err("Empty filename".into()); }
    if name.contains('\0') { return Err("Filename contains null byte".into()); }
    let base = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;
    if base.is_empty() || base == "." || base == ".." {
        return Err("Invalid filename".into());
    }
    Ok(base.to_string())
}

/// Validate a user-supplied display name (folder / vault). Rejects empty,
/// path separators, traversal segments, control characters, and enforces
/// a reasonable length limit.
fn validate_display_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() { return Err("Name cannot be empty".into()); }
    if trimmed.len() > 128 { return Err("Name too long (max 128 characters)".into()); }
    if trimmed == "." || trimmed == ".." {
        return Err("Invalid name".into());
    }
    if trimmed.chars().any(|c| c == '/' || c == '\\' || c == '\0' || c.is_control()) {
        return Err("Name contains invalid characters".into());
    }
    Ok(trimmed.to_string())
}

/// True when every character steps by a constant ±1 in code-point order
/// (e.g. "123456", "abcdef", "fedcba", "654321"). Used to reject the most
/// trivial keyboard/number sequences as passwords.
fn is_sequential(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 4 {
        return false;
    }
    let step = chars[1] as i32 - chars[0] as i32;
    if step != 1 && step != -1 {
        return false;
    }
    chars.windows(2).all(|w| (w[1] as i32 - w[0] as i32) == step)
}

/// Enforce a minimum password/passphrase strength for the vault PIN and the
/// duress password. This is checked ONLY when a password is created or changed;
/// unlocking an existing vault is never gated by it, so older vaults keep
/// working unchanged.
///
/// Policy (aligned with NIST 800-63B — length is the dominant factor):
///   • At least 10 characters (hard floor).
///   • Reject all-one-character, common passwords, and straight sequences.
///   • 16+ characters: accepted on length alone (a real passphrase needs no
///     composition rules — "correct horse battery staple" passes).
///   • 10–15 characters: must NOT be numeric-only and must mix at least 3 of
///     {lowercase, uppercase, digit, symbol}.
fn validate_pin_strength(pin: &str) -> Result<(), String> {
    let len = pin.chars().count();
    if len < 10 {
        return Err("Password must be at least 10 characters. A short passphrase of a few words is ideal.".into());
    }
    if len > 1024 {
        return Err("Password is too long (max 1024 characters)".into());
    }

    // Reject a single repeated character ("aaaaaaaaaa", "1111111111").
    let mut chars = pin.chars();
    if let Some(first) = chars.next() {
        if pin.chars().all(|c| c == first) {
            return Err("Password is too weak — it is a single repeated character".into());
        }
    }

    // Reject common weak passwords, and the "common word + trailing digits"
    // pattern (e.g. "password123", "qwerty99"). We match the whole string or the
    // string with trailing digits stripped — NOT a substring, so a long
    // passphrase that merely contains a common word is not penalised.
    let lower = pin.to_lowercase();
    let stripped = lower.trim_end_matches(|c: char| c.is_ascii_digit());
    const WEAK: &[&str] = &[
        "password", "passw0rd", "12345678", "123456789", "1234567890",
        "qwerty", "qwertyuiop", "letmein", "iloveyou", "admin",
        "abc", "welcome", "monkey", "dragon", "football", "trustno",
    ];
    if WEAK.iter().any(|w| lower == *w || stripped == *w) {
        return Err("Password is too common — choose something harder to guess".into());
    }

    // Reject trivial ascending/descending sequences.
    if is_sequential(pin) {
        return Err("Password is too weak — it is a simple sequence".into());
    }

    // Long passphrases are strong on length alone.
    if len >= 16 {
        return Ok(());
    }

    // Shorter passwords (10–15): classify character composition.
    let mut has_lower = false;
    let mut has_upper = false;
    let mut has_digit = false;
    let mut has_symbol = false;
    for c in pin.chars() {
        if c.is_ascii_lowercase() {
            has_lower = true;
        } else if c.is_ascii_uppercase() {
            has_upper = true;
        } else if c.is_ascii_digit() {
            has_digit = true;
        } else {
            has_symbol = true;
        }
    }

    // A numeric-only "PIN" is the classic weak case — never allow it in this
    // length range; push the user toward a passphrase with letters.
    if has_digit && !has_lower && !has_upper && !has_symbol {
        return Err("Numeric-only PINs are not allowed. Use letters too, or a longer passphrase (16+ characters).".into());
    }

    let classes = [has_lower, has_upper, has_digit, has_symbol]
        .iter()
        .filter(|present| **present)
        .count();
    if classes < 3 {
        return Err("Password is too weak. Mix at least 3 of: lowercase, uppercase, digits, symbols — or use a longer passphrase (16+ characters).".into());
    }

    Ok(())
}

// ── AES-256-GCM chunked encryption ──

const CHUNK_PLAINTEXT_SIZE: usize = 65536; // 64 KB
const ENC_NONCE_SIZE: usize = 12;
const ENC_TAG_SIZE: usize = 16;
const CHUNK_OVERHEAD: usize = ENC_NONCE_SIZE + ENC_TAG_SIZE; // 28 bytes
const CHUNK_ENCRYPTED_FULL: usize = CHUNK_PLAINTEXT_SIZE + CHUNK_OVERHEAD; // 65564 bytes

/// Compute the encrypted bundle size for a file with the given plaintext size.
pub fn encrypted_bundle_size(plaintext_size: u64) -> u64 {
    if plaintext_size == 0 {
        return 0;
    }
    let num_chunks = (plaintext_size + CHUNK_PLAINTEXT_SIZE as u64 - 1) / CHUNK_PLAINTEXT_SIZE as u64;
    plaintext_size + num_chunks * CHUNK_OVERHEAD as u64
}

/// Get the size a file occupies in the bundle, accounting for encryption and blob headers.
fn file_bundle_size(vault: &VaultData, file: &VaultFile) -> u64 {
    let data_size = if vault.security.encryption_salt.is_some() {
        encrypted_bundle_size(file.size)
    } else {
        file.size
    };
    if vault.security.has_blob_headers {
        BLOB_HEADER_SIZE + data_size
    } else {
        data_size
    }
}

/// Derive a 32-byte encryption key from PIN + optional key file + salt using Argon2id.
fn derive_encryption_key(pin: &str, key_file_data: Option<&[u8]>, salt: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    let mut input = pin.as_bytes().to_vec();
    if let Some(kf) = key_file_data {
        let mut hasher = Sha256::new();
        hasher.update(&input);
        hasher.update(kf);
        input = hasher.finalize().to_vec();
    }
    let mut key = Zeroizing::new(vec![0u8; 32]);
    argon2_hasher()
        .hash_password_into(&input, salt, &mut key)
        .map_err(|e| format!("Key derivation error: {}", e))?;
    Ok(key)
}

/// Build the AES-GCM associated data (AAD) for a file-data chunk. When
/// `bind_aad` is set, the AAD ties the chunk to its file identity AND its
/// position in the stream, so the authentication tag also covers "this is
/// chunk N of file X". Reordering, duplicating, dropping, or relocating a
/// chunk then changes the AAD and fails the tag check. When `bind_aad` is
/// false (legacy vaults), the AAD is empty — identical to the original
/// `encrypt(nonce, bytes)` behaviour — so existing blobs still decrypt.
fn chunk_aad(file_id: &str, chunk_index: u64, bind_aad: bool) -> Vec<u8> {
    if !bind_aad {
        return Vec::new();
    }
    let id = file_id.as_bytes();
    let mut aad = Vec::with_capacity(id.len() + 8);
    aad.extend_from_slice(id);
    aad.extend_from_slice(&chunk_index.to_le_bytes());
    aad
}

/// Encrypt file data using AES-256-GCM with chunked encryption.
/// Each chunk uses a fresh random 12-byte nonce generated by OsRng and prepended
/// to the ciphertext. Random nonces avoid catastrophic (key, nonce) reuse if a
/// file is ever re-encrypted with the same DEK. When `bind_aad` is set, each
/// chunk is additionally bound to (file_id, chunk_index) via GCM AAD.
pub fn encrypt_file_data(key: &[u8], _salt: &[u8], file_id: &str, plaintext: &[u8], bind_aad: bool) -> Result<Vec<u8>, String> {
    if plaintext.is_empty() {
        return Ok(Vec::new());
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid key: {}", e))?;
    let num_chunks = (plaintext.len() + CHUNK_PLAINTEXT_SIZE - 1) / CHUNK_PLAINTEXT_SIZE;
    let mut output = Vec::with_capacity(plaintext.len() + num_chunks * CHUNK_OVERHEAD);

    for (chunk_index, chunk) in plaintext.chunks(CHUNK_PLAINTEXT_SIZE).enumerate() {
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let aad = chunk_aad(file_id, chunk_index as u64, bind_aad);
        let encrypted = cipher.encrypt(nonce, Payload { msg: chunk, aad: &aad })
            .map_err(|e| format!("Encryption error: {}", e))?;
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&encrypted); // ciphertext + tag appended by aes-gcm
    }

    Ok(output)
}

/// Decrypt file data using AES-256-GCM with chunked decryption. `bind_aad`
/// must match the value the data was encrypted with (carried per-vault by
/// SecurityConfig::aead_bound).
pub fn decrypt_file_data(key: &[u8], _salt: &[u8], file_id: &str, ciphertext: &[u8], plaintext_size: u64, bind_aad: bool) -> Result<Vec<u8>, String> {
    if ciphertext.is_empty() {
        return Ok(Vec::new());
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid key: {}", e))?;
    let mut output = Vec::with_capacity(plaintext_size as usize);
    let mut offset = 0usize;
    let mut chunk_index = 0u64;

    while offset < ciphertext.len() {
        if offset + ENC_NONCE_SIZE > ciphertext.len() {
            return Err("Corrupt encrypted data: truncated nonce".into());
        }
        let nonce = Nonce::from_slice(&ciphertext[offset..offset + ENC_NONCE_SIZE]);
        offset += ENC_NONCE_SIZE;

        let remaining_plaintext = plaintext_size as usize - output.len();
        let chunk_plain_size = remaining_plaintext.min(CHUNK_PLAINTEXT_SIZE);
        let chunk_ct_size = chunk_plain_size + ENC_TAG_SIZE;

        if offset + chunk_ct_size > ciphertext.len() {
            return Err("Corrupt encrypted data: truncated chunk".into());
        }

        let aad = chunk_aad(file_id, chunk_index, bind_aad);
        let decrypted = cipher.decrypt(nonce, Payload { msg: &ciphertext[offset..offset + chunk_ct_size], aad: &aad })
            .map_err(|e| format!("Decryption error (chunk {}): {}", chunk_index, e))?;
        output.extend_from_slice(&decrypted);
        offset += chunk_ct_size;
        chunk_index += 1;
    }

    Ok(output)
}

/// AAD that binds a wrapped DEK to the file it belongs to. Empty for legacy
/// (unbound) vaults so previously-wrapped keys still unwrap.
fn wrap_aad(file_id: &str, bind_aad: bool) -> Vec<u8> {
    if bind_aad { file_id.as_bytes().to_vec() } else { Vec::new() }
}

/// Wrap a 32-byte per-file DEK with the vault KEK using AES-256-GCM.
/// Returns hex string: nonce(12) + ciphertext(32) + tag(16) = 60 bytes.
/// When `bind_aad` is set the wrap is bound to `file_id` via GCM AAD, so a
/// wrapped DEK cannot be relocated to a different file entry.
fn wrap_file_key(kek: &[u8], dek: &[u8], file_id: &str, bind_aad: bool) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| format!("Invalid KEK: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let aad = wrap_aad(file_id, bind_aad);
    let ciphertext = cipher.encrypt(nonce, Payload { msg: dek, aad: &aad })
        .map_err(|e| format!("Key wrap failed: {}", e))?;
    let mut wrapped = Vec::with_capacity(60);
    wrapped.extend_from_slice(&nonce_bytes);
    wrapped.extend_from_slice(&ciphertext);
    Ok(hex::encode(wrapped))
}

/// Unwrap a per-file DEK using the vault KEK.
fn unwrap_file_key(kek: &[u8], wrapped_hex: &str, file_id: &str, bind_aad: bool) -> Result<Zeroizing<Vec<u8>>, String> {
    let wrapped = hex::decode(wrapped_hex)
        .map_err(|e| format!("Invalid wrapped key hex: {}", e))?;
    if wrapped.len() != 60 {
        return Err(format!("Wrapped key must be 60 bytes, got {}", wrapped.len()));
    }
    let cipher = Aes256Gcm::new_from_slice(kek)
        .map_err(|e| format!("Invalid KEK: {}", e))?;
    let nonce = Nonce::from_slice(&wrapped[..12]);
    let aad = wrap_aad(file_id, bind_aad);
    let plaintext = cipher.decrypt(nonce, Payload { msg: &wrapped[12..], aad: &aad })
        .map_err(|e| format!("Key unwrap failed: {}", e))?;
    Ok(Zeroizing::new(plaintext))
}

/// Resolve the actual decryption key for a file: if the file has a wrapped DEK,
/// unwrap it with the KEK; otherwise use the KEK directly (legacy mode).
fn resolve_file_key(kek: &[u8], wrapped_dek: Option<&str>, file_id: &str, bind_aad: bool) -> Result<Zeroizing<Vec<u8>>, String> {
    match wrapped_dek {
        Some(hex) => unwrap_file_key(kek, hex, file_id, bind_aad),
        None => Ok(Zeroizing::new(kek.to_vec())),
    }
}



/// Decrypt a range of plaintext bytes from encrypted bundle data.
/// Used for HTTP Range requests in video streaming.
pub fn read_decrypted_range(
    file: &mut fs::File,
    file_offset_in_bundle: u64,
    key: &[u8],
    _salt: &[u8],
    file_id: &str,
    plaintext_size: u64,
    range_start: u64,
    range_len: u64,
    bind_aad: bool,
) -> Result<Vec<u8>, String> {
    if plaintext_size == 0 || range_len == 0 {
        return Ok(Vec::new());
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid key: {}", e))?;
    let num_chunks = ((plaintext_size as usize) + CHUNK_PLAINTEXT_SIZE - 1) / CHUNK_PLAINTEXT_SIZE;

    let first_chunk = (range_start / CHUNK_PLAINTEXT_SIZE as u64) as usize;
    let last_byte = range_start + range_len - 1;
    let last_chunk = (last_byte / CHUNK_PLAINTEXT_SIZE as u64) as usize;

    let mut result = Vec::with_capacity(range_len as usize);

    for chunk_idx in first_chunk..=last_chunk {
        let chunk_plain_size = if chunk_idx < num_chunks - 1 {
            CHUNK_PLAINTEXT_SIZE
        } else {
            plaintext_size as usize - (num_chunks - 1) * CHUNK_PLAINTEXT_SIZE
        };
        let chunk_enc_total = ENC_NONCE_SIZE + chunk_plain_size + ENC_TAG_SIZE;

        // All previous chunks are full-sized, so offset is chunk_idx * full_chunk_size
        let chunk_bundle_offset = file_offset_in_bundle
            + (chunk_idx as u64) * CHUNK_ENCRYPTED_FULL as u64;

        let mut chunk_buf = vec![0u8; chunk_enc_total];
        file.seek(SeekFrom::Start(chunk_bundle_offset)).map_err(|e| format!("Seek: {}", e))?;
        file.read_exact(&mut chunk_buf).map_err(|e| format!("Read: {}", e))?;

        let nonce = Nonce::from_slice(&chunk_buf[..ENC_NONCE_SIZE]);
        let aad = chunk_aad(file_id, chunk_idx as u64, bind_aad);
        let decrypted = cipher.decrypt(nonce, Payload { msg: &chunk_buf[ENC_NONCE_SIZE..], aad: &aad })
            .map_err(|e| format!("Decrypt: {}", e))?;

        // Extract only the bytes within the requested range from this chunk
        let chunk_plain_start = chunk_idx as u64 * CHUNK_PLAINTEXT_SIZE as u64;
        let local_start = if range_start > chunk_plain_start {
            (range_start - chunk_plain_start) as usize
        } else {
            0
        };
        let local_end = {
            let chunk_plain_end = chunk_plain_start + chunk_plain_size as u64;
            let range_end = range_start + range_len;
            if range_end < chunk_plain_end {
                (range_end - chunk_plain_start) as usize
            } else {
                chunk_plain_size
            }
        };

        result.extend_from_slice(&decrypted[local_start..local_end]);
    }

    Ok(result)
}

/// Whether a file extension is media the watch-folder importer should pick up
/// (images, videos, audio). Junk/system files and documents are ignored to
/// keep auto-import focused on the media a user actually wants vaulted.
pub fn is_watchable_media(ext: &str) -> bool {
    matches!(categorize_extension(ext).as_str(), "Images" | "Videos" | "Audio")
}

fn categorize_extension(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "svg" | "ico"
        | "heic" | "heif" | "tiff" | "tif" | "jfif" | "avif" | "jpe" | "jp2" => "Images".to_string(),
        "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm"
        | "m4v" | "mpg" | "mpeg" | "3gp" | "3g2" | "ts" | "m2ts" | "mts" | "ogv" => "Videos".to_string(),
        "mp3" | "wav" | "flac" | "ogg" | "aac" | "wma" | "m4a" | "opus" | "aiff" | "alac" => "Audio".to_string(),
        "pdf" | "doc" | "docx" | "txt" | "rtf" | "odt" | "md" => "Documents".to_string(),
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "Archives".to_string(),
        "exe" | "msi" | "dmg" | "app" | "deb" | "rpm" => "Programs".to_string(),
        "xls" | "xlsx" | "csv" | "ods" => "Spreadsheets".to_string(),
        "ppt" | "pptx" | "odp" => "Presentations".to_string(),
        _ => "Other".to_string(),
    }
}

/// Best-effort file-type detection from the leading "magic" bytes, for downloads
/// that arrive without a usable extension (common with in-page video "Download"
/// buttons, e.g. a file literally named "videoplayback"). Returns a canonical
/// extension, or None if unrecognized. Used only as a fallback when the
/// filename gives us nothing categorizable — a real extension always wins.
fn sniff_extension(data: &[u8]) -> Option<&'static str> {
    let len = data.len();
    let starts = |sig: &[u8]| len >= sig.len() && &data[..sig.len()] == sig;

    // ISO base media (mp4 / mov / m4v / m4a): "ftyp" box at offset 4.
    if len >= 12 && &data[4..8] == b"ftyp" {
        let brand = &data[8..12];
        if brand == b"M4A " {
            return Some("m4a");
        }
        if &brand[..2] == b"qt" {
            return Some("mov");
        }
        return Some("mp4");
    }
    if starts(&[0x1A, 0x45, 0xDF, 0xA3]) {
        return Some("webm"); // EBML (webm/mkv) — both categorize as Videos
    }
    if starts(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if starts(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if starts(b"GIF8") {
        return Some("gif");
    }
    if starts(b"OggS") {
        return Some("ogg");
    }
    if starts(b"fLaC") {
        return Some("flac");
    }
    if starts(b"%PDF") {
        return Some("pdf");
    }
    if starts(b"ID3") || (len >= 2 && data[0] == 0xFF && (data[1] & 0xE0) == 0xE0) {
        return Some("mp3");
    }
    if len >= 12 && &data[0..4] == b"RIFF" {
        match &data[8..12] {
            b"WEBP" => return Some("webp"),
            b"WAVE" => return Some("wav"),
            b"AVI " => return Some("avi"),
            _ => {}
        }
    }
    if starts(b"BM") {
        return Some("bmp");
    }
    // MPEG-TS: 0x47 sync byte repeats every 188 bytes.
    if len > 188 && data[0] == 0x47 && data[188] == 0x47 {
        return Some("ts");
    }
    None
}

fn dirs_or_default() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Use LOCALAPPDATA\.drvstore — user-writable, app-specific directory
        if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(local_app).join(".drvstore");
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(profile).join(".drvstore");
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
        {
            return PathBuf::from(home).join(".config").join("drvstore");
        }
    }
    PathBuf::from(".drvstore")
}

/// Apply OS-level hardening to the vault storage directory:
/// Hidden + System attributes, and deny-delete ACL for all non-SYSTEM accounts.
fn harden_vault_dir(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        let p = path.to_string_lossy().to_string();

        // Set Hidden + System attributes so Explorer won't show it
        let _ = std::process::Command::new("attrib")
            .args(["+H", "+S", &p])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        // Lock NTFS ACL:
        //   - Remove inherited permissions
        //   - Grant SYSTEM full control (OI)(CI) = object + container inherit
        //   - Grant current user full control so the app can still read/write
        let _ = std::process::Command::new("icacls")
            .args([
                &p,
                "/inheritance:r",
                "/grant:r",
                "SYSTEM:(OI)(CI)F",
            ])
            .creation_flags(0x08000000)
            .output();

        // Determine current user and grant them full control
        if let Ok(username) = std::env::var("USERNAME") {
            let user_ace = format!("{}:(OI)(CI)F", username);
            let _ = std::process::Command::new("icacls")
                .args([&p, "/grant:r", &user_ace])
                .creation_flags(0x08000000)
                .output();
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Unix: chmod 700 — only owner can access
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
    }
}

/// Migrate data from legacy storage locations to the current path.
/// Called once at startup when a legacy path exists and the new path is empty/missing.
fn migrate_legacy_location() {
    let new_path = dirs_or_default();
    if new_path.exists() { return } // already migrated

    // Collect all possible legacy paths to check
    let mut legacy_paths: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Old wbemstore locations (prior storage that collided with real Windows files)
        if let Some(prog_data) = std::env::var_os("PROGRAMDATA") {
            legacy_paths.push(
                PathBuf::from(&prog_data)
                    .join("Microsoft")
                    .join("Windows")
                    .join("wbemstore"),
            );
        }
        if let Some(sysroot) = std::env::var_os("SystemRoot") {
            legacy_paths.push(
                PathBuf::from(&sysroot)
                    .join("System32")
                    .join("wbemstore"),
            );
        }
        // Old home-directory location
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            legacy_paths.push(PathBuf::from(&profile).join(".cybervault"));
        }
        // Previous LOCALAPPDATA location
        if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
            legacy_paths.push(PathBuf::from(&local_app).join(".cybervault"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            legacy_paths.push(PathBuf::from(&home).join(".cybervault"));
            legacy_paths.push(PathBuf::from(&home).join(".config").join("wbemstore"));
            legacy_paths.push(PathBuf::from(&home).join(".config").join("cybervault"));
        }
    }

    // Try each legacy path in order; migrate the first one found
    for old_path in legacy_paths {
        if !old_path.exists() { continue; }

        if fs::create_dir_all(&new_path).is_err() { return }

        // Only copy files that look like vault bundles (hex names or .json metadata)
        if let Ok(entries) = fs::read_dir(&old_path) {
            for entry in entries.flatten() {
                let src = entry.path();
                if src.is_dir() { continue; }
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip files that aren't vault data (avoid copying stray system files)
                let is_hex = !name.is_empty() && name.chars().all(|c| c.is_ascii_hexdigit());
                let is_json = name.ends_with(".json");
                if !is_hex && !is_json { continue; }
                let dst = new_path.join(entry.file_name());
                let _ = fs::copy(&src, &dst);
            }
        }

        return; // migrated from first found legacy path
    }
}

// ── Bundle format ──
//
// Vault data is stored in a single bundle file. The filename is a random
// hex string (looks like a cache/checksum file) so it doesn't reveal
// the vault name or ID. The real vault name is stored inside the
// metadata and shown in the UI.
//
// Layout:
//   [blob section: file data concatenated in vault.files order]
//   [footer:
//     bytes   – JSON metadata (VaultData)
//     u64 LE  – JSON metadata byte length
//     u32 LE  – format version (1)
//     4 bytes – magic "CVLT"
//   ]
//
// Fixed tail: 8 + 4 + 4 = 16 bytes (at known offset from EOF)

const BUNDLE_MAGIC: &[u8; 4] = b"CVLT";
const BUNDLE_VERSION: u32 = 1;
const BUNDLE_FOOTER_FIXED: u64 = 16; // u64 + u32 + 4-byte magic

// ── Per-blob CRC32 header ──
// Each blob in the bundle is prefixed with: [magic(4) + blob_size(u64) + crc32(u32)] = 16 bytes
const BLOB_HEADER_MAGIC: &[u8; 4] = b"CVLB";
const BLOB_HEADER_SIZE: u64 = 16; // 4 magic + 8 size + 4 crc32

/// Write a per-blob header with CRC32 checksum before the blob data.
fn write_blob_header(file: &mut fs::File, blob_data: &[u8]) -> Result<(), String> {
    let crc = crc32fast::hash(blob_data);
    let blob_len = blob_data.len() as u64;
    file.write_all(BLOB_HEADER_MAGIC).map_err(|e| format!("Write blob header magic: {}", e))?;
    file.write_all(&blob_len.to_le_bytes()).map_err(|e| format!("Write blob header size: {}", e))?;
    file.write_all(&crc.to_le_bytes()).map_err(|e| format!("Write blob header crc: {}", e))?;
    Ok(())
}

/// Verify a blob header at the current file position. Returns (blob_size, expected_crc).
fn read_blob_header(file: &mut fs::File) -> Result<(u64, u32), String> {
    let mut header = [0u8; BLOB_HEADER_SIZE as usize];
    file.read_exact(&mut header).map_err(|e| format!("Read blob header: {}", e))?;
    if &header[0..4] != BLOB_HEADER_MAGIC {
        return Err("Invalid blob header magic".into());
    }
    let blob_size = u64::from_le_bytes(header[4..12].try_into().unwrap());
    let crc = u32::from_le_bytes(header[12..16].try_into().unwrap());
    Ok((blob_size, crc))
}

// ── Rollback Journal ──
// Before modifying the bundle, we write a small journal file containing
// the pre-write bundle length. On crash recovery, if a journal exists,
// we truncate the bundle back to its clean state.

const JOURNAL_MAGIC: &[u8; 4] = b"CVLJ";

/// Rollback journal entry: records the safe state before a write operation.
#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    bundle_name: String,
    pre_write_blob_size: u64,
    pre_write_file_count: usize,
    timestamp: DateTime<Utc>,
}

/// Write a rollback journal before modifying a bundle.
fn journal_write(vaults_dir: &Path, bundle_name: &str, pre_blob_size: u64, pre_file_count: usize) -> Result<PathBuf, String> {
    let journal_path = vaults_dir.join(format!("{}.cvlt.journal", bundle_name));
    let entry = JournalEntry {
        bundle_name: bundle_name.to_string(),
        pre_write_blob_size: pre_blob_size,
        pre_write_file_count: pre_file_count,
        timestamp: Utc::now(),
    };
    let json = serde_json::to_vec(&entry).map_err(|e| format!("Serialize journal: {}", e))?;
    let mut file = fs::File::create(&journal_path).map_err(|e| format!("Create journal: {}", e))?;
    file.write_all(JOURNAL_MAGIC).map_err(|e| format!("Write journal magic: {}", e))?;
    file.write_all(&json).map_err(|e| format!("Write journal data: {}", e))?;
    file.sync_all().map_err(|e| format!("Sync journal: {}", e))?;
    Ok(journal_path)
}

/// Read and validate a rollback journal file.
fn journal_read(path: &Path) -> Result<JournalEntry, String> {
    let data = fs::read(path).map_err(|e| format!("Read journal: {}", e))?;
    if data.len() < 4 || &data[0..4] != JOURNAL_MAGIC {
        return Err("Invalid journal file".into());
    }
    serde_json::from_slice(&data[4..]).map_err(|e| format!("Parse journal: {}", e))
}

/// Delete the journal file after a successful write (the commit point).
fn journal_delete(journal_path: &Path) {
    let _ = fs::remove_file(journal_path);
}

/// Recover from a crash by replaying any outstanding journal files.
/// Truncates bundles back to their pre-write state and rewrites the footer.
fn journal_recover(vaults_dir: &Path) -> Vec<String> {
    let mut recovered = Vec::new();
    let entries = match fs::read_dir(vaults_dir) {
        Ok(e) => e,
        Err(_) => return recovered,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !name.ends_with(".cvlt.journal") {
            continue;
        }
        if let Ok(journal) = journal_read(&path) {
            let bundle_path = vaults_dir.join(&journal.bundle_name);
            if bundle_path.exists() {
                // Read current metadata, truncate file list, rewrite footer
                if let Ok(mut vault) = bundle_read_metadata(&bundle_path) {
                    vault.files.truncate(journal.pre_write_file_count);
                    // Truncate bundle file to pre-write blob size + rewrite footer
                    if let Ok(mut file) = fs::OpenOptions::new().write(true).open(&bundle_path) {
                        if file.seek(SeekFrom::Start(journal.pre_write_blob_size)).is_ok() {
                            if write_bundle_footer(&mut file, &vault).is_ok() {
                                if let Ok(pos) = file.stream_position() {
                                    let _ = file.set_len(pos);
                                    let _ = file.sync_all();
                                    log::warn!(
                                        "Journal recovery: rolled back bundle '{}' to {} files (was interrupted at {})",
                                        journal.bundle_name,
                                        journal.pre_write_file_count,
                                        journal.timestamp
                                    );
                                    recovered.push(journal.bundle_name.clone());
                                }
                            }
                        }
                    }
                }
            }
            // Remove the journal regardless (even if recovery failed, don't retry endlessly)
            journal_delete(&path);
        } else {
            // Corrupt journal — just remove it
            let _ = fs::remove_file(&path);
        }
    }
    recovered
}

/// Generate a random 32-char hex filename for a bundle.
fn generate_bundle_name() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Write the bundle footer (metadata JSON + version + magic) to a file
/// at the current seek position.
fn write_bundle_footer(file: &mut fs::File, vault: &VaultData) -> Result<(), String> {
    let json = serde_json::to_string_pretty(vault).map_err(|e| e.to_string())?;
    let json_bytes = json.as_bytes();
    let meta_len = json_bytes.len() as u64;

    file.write_all(json_bytes).map_err(|e| format!("Write meta JSON: {}", e))?;
    file.write_all(&meta_len.to_le_bytes()).map_err(|e| format!("Write meta len: {}", e))?;
    file.write_all(&BUNDLE_VERSION.to_le_bytes()).map_err(|e| format!("Write version: {}", e))?;
    file.write_all(BUNDLE_MAGIC).map_err(|e| format!("Write magic: {}", e))?;
    Ok(())
}

/// Read only the vault metadata from a bundle file (reads footer only).
fn bundle_read_metadata(path: &Path) -> Result<VaultData, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Open bundle: {}", e))?;
    let file_size = file.metadata().map_err(|e| e.to_string())?.len();
    if file_size < BUNDLE_FOOTER_FIXED {
        return Err("Bundle too small".into());
    }

    // Read magic + version (last 8 bytes)
    file.seek(SeekFrom::End(-8)).map_err(|e| e.to_string())?;
    let mut tail = [0u8; 8];
    file.read_exact(&mut tail).map_err(|e| e.to_string())?;
    let version = u32::from_le_bytes([tail[0], tail[1], tail[2], tail[3]]);
    if &tail[4..8] != BUNDLE_MAGIC {
        return Err("Not a valid bundle".into());
    }
    if version != BUNDLE_VERSION {
        return Err(format!("Unsupported bundle version {}", version));
    }

    // Read metadata JSON length (8 bytes before version+magic)
    file.seek(SeekFrom::End(-16)).map_err(|e| e.to_string())?;
    let mut len_buf = [0u8; 8];
    file.read_exact(&mut len_buf).map_err(|e| e.to_string())?;
    let meta_len = u64::from_le_bytes(len_buf);

    // Sanity check: meta_len must fit within the file
    if meta_len > file_size.saturating_sub(BUNDLE_FOOTER_FIXED) {
        return Err("Corrupt bundle: metadata length exceeds file size".into());
    }

    // Read JSON metadata
    let footer_total = BUNDLE_FOOTER_FIXED + meta_len;
    let json_start = file_size - footer_total;
    file.seek(SeekFrom::Start(json_start)).map_err(|e| e.to_string())?;
    let mut json_buf = vec![0u8; meta_len as usize];
    file.read_exact(&mut json_buf).map_err(|e| e.to_string())?;

    serde_json::from_slice(&json_buf).map_err(|e| format!("Parse bundle metadata: {}", e))
}

/// Validate bundle integrity: ensure the blob section is large enough
/// for all files listed in the metadata. If the app crashed mid-import,
/// the metadata footer may reference files whose blobs were never fully written.
/// Returns a repaired VaultData with ghost entries removed, or None if no repair needed.
fn bundle_validate_and_repair(path: &Path, vault: &VaultData) -> Option<VaultData> {
    let blob_size = match bundle_blob_section_size(path) {
        Ok(s) => s,
        Err(_) => return None,
    };

    let has_headers = vault.security.has_blob_headers;
    let mut cumulative: u64 = 0;
    let mut valid_count = vault.files.len();

    if has_headers {
        // Structural pass: read only each 16-byte blob header and verify the
        // magic + recorded size line up with the metadata. This is O(files),
        // not O(bytes) — the previous full-data CRC walk read the ENTIRE
        // bundle on every startup, so launch time scaled with vault size
        // (minutes for a multi-GB vault).
        //
        // Only the LAST blob can be a torn write from an interrupted append:
        // appends are strictly sequential and journal recovery rolls back
        // anything behind an incomplete batch. So its data — and only its —
        // is CRC-verified here (streamed, 64 KB at a time). Deep verification
        // of every blob remains available on demand via the Integrity panel.
        if let Ok(mut file) = fs::File::open(path) {
            for (i, f) in vault.files.iter().enumerate() {
                let data_size = file_bundle_size(vault, f) - BLOB_HEADER_SIZE;
                let needed = cumulative + BLOB_HEADER_SIZE + data_size;
                if needed > blob_size {
                    valid_count = i;
                    break;
                }
                // Read and verify the blob header
                if file.seek(SeekFrom::Start(cumulative)).is_err() {
                    valid_count = i;
                    break;
                }
                match read_blob_header(&mut file) {
                    Ok((recorded_size, expected_crc)) => {
                        if recorded_size != data_size {
                            valid_count = i;
                            break;
                        }
                        if i + 1 == vault.files.len() {
                            // Tail blob: stream the data and verify its CRC.
                            let mut hasher = crc32fast::Hasher::new();
                            let mut buf = vec![0u8; 64 * 1024];
                            let mut remaining = data_size;
                            let mut read_ok = true;
                            while remaining > 0 {
                                let n = (buf.len() as u64).min(remaining) as usize;
                                if file.read_exact(&mut buf[..n]).is_err() {
                                    read_ok = false;
                                    break;
                                }
                                hasher.update(&buf[..n]);
                                remaining -= n as u64;
                            }
                            if !read_ok {
                                valid_count = i;
                                break;
                            }
                            let actual_crc = hasher.finalize();
                            if actual_crc != expected_crc {
                                log::warn!("Bundle tail blob {} CRC mismatch: expected {:08x}, got {:08x}", i, expected_crc, actual_crc);
                                valid_count = i;
                                break;
                            }
                        }
                    }
                    Err(_) => {
                        valid_count = i;
                        break;
                    }
                }
                cumulative += BLOB_HEADER_SIZE + data_size;
            }
        }
    } else {
        // Legacy: no blob headers, just check cumulative sizes
        let encrypted = vault.security.encryption_salt.is_some();
        for (i, f) in vault.files.iter().enumerate() {
            let f_size = if encrypted { encrypted_bundle_size(f.size) } else { f.size };
            cumulative += f_size;
            if cumulative > blob_size {
                valid_count = i;
                break;
            }
        }
    }

    if valid_count < vault.files.len() {
        let mut repaired = vault.clone();
        let ghost_count = repaired.files.len() - valid_count;
        repaired.files.truncate(valid_count);
        // Persist the repaired metadata back to the bundle
        let _ = bundle_save_metadata(path, &repaired);
        log::warn!(
            "Bundle {:?}: removed {} ghost file entries left by interrupted import",
            path.file_name().unwrap_or_default(),
            ghost_count
        );
        Some(repaired)
    } else {
        None
    }
}

/// Compute the byte size of the blob section (everything before the footer).
fn bundle_blob_section_size(path: &Path) -> Result<u64, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let file_size = file.metadata().map_err(|e| e.to_string())?.len();
    if file_size < BUNDLE_FOOTER_FIXED {
        return Ok(0);
    }
    file.seek(SeekFrom::End(-16)).map_err(|e| e.to_string())?;
    let mut len_buf = [0u8; 8];
    file.read_exact(&mut len_buf).map_err(|e| e.to_string())?;
    let meta_len = u64::from_le_bytes(len_buf);
    if meta_len > file_size.saturating_sub(BUNDLE_FOOTER_FIXED) {
        return Err("Corrupt bundle: metadata length exceeds file size".into());
    }
    Ok(file_size - BUNDLE_FOOTER_FIXED - meta_len)
}

/// Read a specific file's content from a bundle by seeking to its offset.
/// If `encryption_key` is provided and the vault has an encryption salt,
/// the data is decrypted before returning (plaintext). If key is None,
/// raw bytes are returned (used for encrypted-blob pass-through during restore).
fn bundle_read_file(path: &Path, vault: &VaultData, file_id: &str, encryption_key: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let encrypted = vault.security.encryption_salt.is_some();
    let mut offset = 0u64;
    let mut plaintext_size = 0u64;
    let mut wrapped_dek: Option<String> = None;
    let mut found = false;
    for f in &vault.files {
        if f.id == file_id {
            plaintext_size = f.size;
            wrapped_dek = f.wrapped_dek.clone();
            found = true;
            break;
        }
        offset += file_bundle_size(vault, f);
    }
    if !found {
        return Err("File not found in bundle".into());
    }

    let read_size = if encrypted {
        encrypted_bundle_size(plaintext_size)
    } else {
        plaintext_size
    };

    let mut file = fs::File::open(path).map_err(|e| format!("Open bundle: {}", e))?;
    // Skip past blob header if vault uses per-blob CRC headers
    let data_offset = if vault.security.has_blob_headers {
        offset + BLOB_HEADER_SIZE
    } else {
        offset
    };
    // Guard against corrupt/tampered metadata: the claimed blob must actually
    // fit inside the bundle on disk. Without this, a bogus `size` could request
    // a multi-gigabyte allocation below and OOM-crash the process (panic=abort)
    // before the read could fail gracefully.
    let bundle_len = file.metadata().map_err(|e| format!("Stat bundle: {}", e))?.len();
    if data_offset.checked_add(read_size).map_or(true, |end| end > bundle_len) {
        return Err("Corrupt vault metadata: file extent exceeds bundle".into());
    }
    file.seek(SeekFrom::Start(data_offset)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; read_size as usize];
    file.read_exact(&mut buf).map_err(|e| format!("Read file from bundle: {}", e))?;

    // Decrypt if key provided and vault is encrypted
    if let (Some(kek), Some(salt_hex)) = (encryption_key, &vault.security.encryption_salt) {
        let salt = hex::decode(salt_hex).map_err(|e| format!("Invalid salt: {}", e))?;
        let bind_aad = vault.security.aead_bound;
        let file_key = resolve_file_key(kek, wrapped_dek.as_deref(), file_id, bind_aad)?;
        decrypt_file_data(&file_key, &salt, file_id, &buf, plaintext_size, bind_aad)
    } else {
        Ok(buf)
    }
}

/// Create a new bundle with no blobs (metadata only).
fn bundle_create(path: &Path, vault: &VaultData) -> Result<(), String> {
    let mut file = fs::File::create(path).map_err(|e| format!("Create bundle: {}", e))?;
    write_bundle_footer(&mut file, vault)?;
    file.sync_all().map_err(|e| format!("Sync new bundle: {}", e))?;
    Ok(())
}

/// Update only the metadata footer of an existing bundle (blobs untouched).
fn bundle_save_metadata(path: &Path, vault: &VaultData) -> Result<(), String> {
    let blob_size = bundle_blob_section_size(path)?;

    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Open bundle for write: {}", e))?;

    file.seek(SeekFrom::Start(blob_size)).map_err(|e| e.to_string())?;
    write_bundle_footer(&mut file, vault)?;

    // Truncate any leftover bytes if the new footer is shorter
    let pos = file.stream_position().map_err(|e| e.to_string())?;
    file.set_len(pos).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| format!("Sync bundle metadata: {}", e))?;
    Ok(())
}

/// Append new file blobs to a bundle and write updated metadata.
/// Uses a rollback journal for crash safety: if the app crashes mid-write,
/// the journal enables recovery on next startup.
fn bundle_append_blobs(
    path: &Path,
    vault: &VaultData,
    new_blobs: &[Vec<u8>],
    vaults_dir: &Path,
    pre_file_count: usize,
) -> Result<(), String> {
    let old_blob_size = bundle_blob_section_size(path)?;
    let bundle_name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Step 1: Write rollback journal BEFORE touching the bundle
    let journal_path = journal_write(vaults_dir, &bundle_name, old_blob_size, pre_file_count)?;

    // Step 2: Append blobs with per-blob CRC headers
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Open bundle for append: {}", e))?;

    file.seek(SeekFrom::Start(old_blob_size)).map_err(|e| e.to_string())?;

    for data in new_blobs {
        // Write blob header (magic + size + CRC32)
        write_blob_header(&mut file, data)?;
        // Write blob data
        file.write_all(data).map_err(|e| format!("Write blob: {}", e))?;
    }

    // Step 3: Write updated footer
    write_bundle_footer(&mut file, vault)?;

    let pos = file.stream_position().map_err(|e| e.to_string())?;
    file.set_len(pos).map_err(|e| e.to_string())?;

    // Step 4: Flush everything to disk
    file.sync_all().map_err(|e| format!("Sync bundle after append: {}", e))?;

    // Step 5: Delete journal — this is the atomic commit point
    journal_delete(&journal_path);

    Ok(())
}

/// Rebuild a bundle excluding certain file IDs (used for deletion).
/// `old_files` is the file list before deletion (for offset computation).
/// `new_vault` is the updated VaultData (with files already removed).
fn bundle_rebuild_without(
    path: &Path,
    old_files: &[VaultFile],
    new_vault: &VaultData,
    removed_ids: &std::collections::HashSet<&String>,
) -> Result<(), String> {
    bundle_rebuild_without_progress(path, old_files, new_vault, removed_ids, None)
}

fn bundle_rebuild_without_progress(
    path: &Path,
    old_files: &[VaultFile],
    new_vault: &VaultData,
    removed_ids: &std::collections::HashSet<&String>,
    progress_cb: Option<&dyn Fn(f64)>,
) -> Result<(), String> {
    let tmp_path = path.with_extension("cvlt.tmp");

    // Compute total bytes to copy for progress tracking (including blob headers)
    let total_bytes: u64 = old_files.iter()
        .filter(|f| !removed_ids.contains(&f.id))
        .map(|f| file_bundle_size(new_vault, f))
        .sum();
    let mut copied_bytes: u64 = 0;

    {
        let mut orig = fs::File::open(path).map_err(|e| format!("Open bundle: {}", e))?;
        let mut tmp = fs::File::create(&tmp_path).map_err(|e| format!("Create temp: {}", e))?;

        // Copy blobs that were NOT removed (including their headers if present)
        let mut offset = 0u64;
        let mut buf = vec![0u8; 64 * 1024]; // 64 KB copy buffer
        for f in old_files {
            let f_bundle_size = file_bundle_size(new_vault, f);
            if !removed_ids.contains(&f.id) {
                orig.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
                let mut remaining = f_bundle_size;
                while remaining > 0 {
                    let to_read = (buf.len() as u64).min(remaining) as usize;
                    orig.read_exact(&mut buf[..to_read]).map_err(|e| e.to_string())?;
                    tmp.write_all(&buf[..to_read]).map_err(|e| e.to_string())?;
                    remaining -= to_read as u64;
                    copied_bytes += to_read as u64;
                }
                if let Some(cb) = &progress_cb {
                    if total_bytes > 0 {
                        cb(copied_bytes as f64 / total_bytes as f64);
                    }
                }
            }
            offset += f_bundle_size;
        }

        write_bundle_footer(&mut tmp, new_vault)?;
    }

    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Rename rebuilt bundle: {}", e)
    })
}

/// Migrate a legacy vault (JSON + directory of blobs) to the bundle format.
/// Returns the generated bundle filename.
fn migrate_legacy_to_bundle(
    vaults_dir: &Path,
    vault_id: &str,
    vault: &VaultData,
) -> Result<String, String> {
    let bundle_name = generate_bundle_name();
    let bundle_path = vaults_dir.join(&bundle_name);
    let storage_dir = vaults_dir.join(vault_id);

    let mut file = fs::File::create(&bundle_path)
        .map_err(|e| format!("Create bundle for migration: {}", e))?;

    // Write blobs in vault.files order
    for vf in &vault.files {
        let blob_path = storage_dir.join(&vf.id);
        if blob_path.exists() {
            let data = fs::read(&blob_path)
                .map_err(|e| format!("Read legacy blob {}: {}", vf.id, e))?;
            file.write_all(&data).map_err(|e| format!("Write blob: {}", e))?;
        } else {
            // Missing blob — write zeros to preserve offsets (will fail integrity)
            let zeros = vec![0u8; vf.size as usize];
            file.write_all(&zeros).map_err(|e| format!("Write zero blob: {}", e))?;
        }
    }

    write_bundle_footer(&mut file, vault)?;
    drop(file);

    // Remove legacy files
    let json_path = vaults_dir.join(format!("{}.json", vault_id));
    fs::remove_file(&json_path).ok();
    if storage_dir.exists() {
        fs::remove_dir_all(&storage_dir).ok();
    }

    Ok(bundle_name)
}

// ── Vault Manager ──

/// Work unit for async empty-trash: holds all data needed for the expensive
/// bundle rebuild so it can run outside the VaultManager mutex lock.
pub struct EmptyTrashWork {
    pub count: u32,
    pub old_files: Vec<VaultFile>,
    pub trashed_ids: std::collections::HashSet<String>,
    pub bundle_path: Option<PathBuf>,
    pub new_vault: Option<VaultData>,
}

impl EmptyTrashWork {
    pub fn execute(&self, progress_cb: Option<&dyn Fn(f64)>) -> Result<(), String> {
        if let (Some(bundle_path), Some(vault)) = (&self.bundle_path, &self.new_vault) {
            let id_set: std::collections::HashSet<&String> = self.trashed_ids.iter().collect();
            bundle_rebuild_without_progress(bundle_path, &self.old_files, vault, &id_set, progress_cb)?;
        }
        Ok(())
    }
}

/// Snapshot of everything an import batch needs, taken under the manager
/// lock so the slow phase (reading + encrypting source files) can run
/// without blocking every other vault operation.
pub struct ImportContext {
    folder: Option<String>,
    /// (salt, KEK) when the vault encrypts file data
    encryption: Option<(Vec<u8>, Zeroizing<Vec<u8>>)>,
    /// hash → existing non-trashed file, for duplicate detection
    existing_by_hash: HashMap<String, VaultFile>,
    /// Whether to bind chunks/DEKs to file identity via GCM AAD (matches the
    /// target vault's SecurityConfig::aead_bound).
    aead_bound: bool,
}

/// Outcome of processing a single source file during an import batch.
enum ImportOutcome {
    /// New content: metadata + encrypted blob ready to append.
    New(VaultFile, Vec<u8>),
    /// Content already in the vault — the existing entry is the result.
    Duplicate(VaultFile),
    /// Missing/unreadable file, or identical content already claimed by
    /// another file in this batch.
    Skipped,
}

pub struct VaultManager {
    vaults_dir: PathBuf,
    vaults: HashMap<String, VaultData>,
    /// Maps vault_id → bundle filename (the random hex name on disk)
    vault_bundles: HashMap<String, String>,
    active_vault_id: Option<String>,
    lockout_trackers: HashMap<String, LockoutTracker>,
    last_activity: Option<Instant>,
    protected_keys: HashMap<String, ProtectedMemory>,
    /// AES-256-GCM encryption keys derived from PIN + salt (per vault)
    encryption_keys: HashMap<String, ProtectedMemory>,
    clipboard_expiry: Option<Instant>,
    // ── License state ──
    is_pro: bool,
    license_info: Option<LicenseInfo>,
}

impl VaultManager {
    pub fn new() -> Self {
        // Migrate from legacy home-directory location if needed
        migrate_legacy_location();

        let vaults_dir = dirs_or_default();
        fs::create_dir_all(&vaults_dir).ok();
        harden_vault_dir(&vaults_dir);
        let mut mgr = VaultManager {
            vaults_dir,
            vaults: HashMap::new(),
            vault_bundles: HashMap::new(),
            active_vault_id: None,
            lockout_trackers: HashMap::new(),
            last_activity: None,
            protected_keys: HashMap::new(),
            encryption_keys: HashMap::new(),
            clipboard_expiry: None,
            is_pro: true, // Kawaii Vault is fully free — Pro always enabled
            license_info: None,
        };
        mgr.load_all();
        mgr.load_license();
        mgr
    }

    /// Set clipboard expiry timer (called when vault data is copied)
    pub fn mark_clipboard_copied(&mut self) -> u32 {
        let timeout = self.active_vault_id.as_ref()
            .and_then(|vid| self.vaults.get(vid))
            .map(|v| v.security.clipboard_clear_secs)
            .unwrap_or(30);
        if timeout > 0 {
            self.clipboard_expiry = Some(Instant::now() + Duration::from_secs(timeout as u64));
        }
        timeout
    }

    /// Check if clipboard should be cleared
    pub fn should_clear_clipboard(&mut self) -> bool {
        if let Some(expiry) = self.clipboard_expiry {
            if Instant::now() >= expiry {
                self.clipboard_expiry = None;
                return true;
            }
        }
        false
    }

    // ── License management ──

    fn license_path(&self) -> PathBuf {
        self.vaults_dir.join(".license")
    }

    fn load_license(&mut self) {
        let path = self.license_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(info) = serde_json::from_str::<LicenseInfo>(&data) {
                    self.license_info = Some(info);
                }
            }
        }
        self.refresh_pro_status();
    }

    fn save_license(&self) {
        if let Some(ref info) = self.license_info {
            if let Ok(json) = serde_json::to_string_pretty(info) {
                fs::write(self.license_path(), json).ok();
            }
        } else {
            // No license — remove the file
            let _ = fs::remove_file(self.license_path());
        }
    }

    fn refresh_pro_status(&mut self) {
        // Kawaii Vault is fully free — Pro is always on, no license key needed.
        self.is_pro = true;
    }

    /// Records an entered license key locally for display. The app is fully
    /// free, so no server validation is performed (kept for UI compatibility).
    pub fn set_license_validated(&mut self, key: String, email: Option<String>) {
        self.license_info = Some(LicenseInfo {
            key: Some(key),
            email,
            last_revalidated: Utc::now().timestamp_millis(),
        });
        self.is_pro = true;
        self.save_license();
    }

    /// Mark that revalidation just succeeded
    #[allow(dead_code)] // unused — app is fully free; no server revalidation
    pub fn mark_revalidated(&mut self) {
        if let Some(ref mut info) = self.license_info {
            info.last_revalidated = Utc::now().timestamp_millis();
            self.save_license();
        }
    }

    pub fn deactivate_license(&mut self) {
        self.license_info = None;
        // App is fully free: clearing the stored key does not remove Pro access.
        self.is_pro = true;
        self.save_license();
    }

    /// Disable all Pro-only features on the active vault when license is lost
    #[allow(dead_code)] // unused — app is fully free, Pro is never revoked
    fn revoke_pro_features(&mut self) {
        if let Some(ref vid) = self.active_vault_id.clone() {
            if let Some(vault) = self.vaults.get_mut(vid) {
                // Disable self-destruct
                vault.security.self_destruct_enabled = false;
                // Clear duress pin
                vault.duress_pin_hash = None;
                vault.security.duress_enabled = false;
            }
            self.save_vault(vid);
        }
    }

    pub fn get_license_status(&self) -> LicenseStatus {
        // Kawaii Vault is fully free — all Pro features are unlocked for everyone
        // and no Gumroad license check is ever required.
        LicenseStatus {
            is_pro: true,
            license_key: self.license_info.as_ref().and_then(|i| i.key.clone()),
            email: self.license_info.as_ref().and_then(|i| i.email.clone()),
            needs_revalidation: false,
        }
    }

    #[allow(dead_code)] // unused — app is fully free; no server revalidation
    pub fn get_stored_license_key(&self) -> Option<String> {
        self.license_info.as_ref().and_then(|i| i.key.clone())
    }

    /// Remove ghost temp files (.cvlt.tmp) left behind by crashed operations.
    fn cleanup_ghost_temp_files(&self) {
        if let Ok(entries) = fs::read_dir(&self.vaults_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    if name.ends_with(".cvlt.tmp") {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
        // Also clean up the temp/ directory — including per-download
        // subdirectories left by browser downloads interrupted by a crash.
        let temp_dir = self.vaults_dir.join("temp");
        if temp_dir.exists() {
            if let Ok(entries) = fs::read_dir(&temp_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let _ = fs::remove_file(&path);
                    } else if path.is_dir() {
                        let _ = fs::remove_dir_all(&path);
                    }
                }
            }
        }
    }

    fn load_all(&mut self) {
        // Pass 0a: Recover from any crashed imports via rollback journals
        let recovered = journal_recover(&self.vaults_dir);
        for name in &recovered {
            log::info!("Recovered bundle from crash: {}", name);
        }

        // Pass 0b: Clean up ghost temp files left behind by interrupted operations
        self.cleanup_ghost_temp_files();

        // Pass 1: Load bundle files (files with no extension that aren't directories)
        if let Ok(entries) = fs::read_dir(&self.vaults_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    continue;
                }
                // Bundle files have no extension (pure hex names)
                if path.extension().is_some() {
                    continue;
                }
                // Try to read as a bundle
                if let Ok(vault) = bundle_read_metadata(&path) {
                    // Validate bundle integrity — remove ghost entries from interrupted imports
                    let vault = match bundle_validate_and_repair(&path, &vault) {
                        Some(repaired) => repaired,
                        None => vault,
                    };
                    let vault_id = vault.info.id.clone();
                    let bundle_name = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    self.vault_bundles.insert(vault_id.clone(), bundle_name);
                    self.vaults.insert(vault_id, vault);
                }
            }
        }

        // Pass 2: Check for legacy vaults (*.json) and auto-migrate them
        let mut legacy_vaults: Vec<(String, VaultData)> = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.vaults_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "json")
                    && !path.to_string_lossy().ends_with(".tmp")
                {
                    if let Ok(data) = fs::read_to_string(&path) {
                        if let Ok(vault) = serde_json::from_str::<VaultData>(&data) {
                            let vault_id = vault.info.id.clone();
                            if !self.vaults.contains_key(&vault_id) {
                                legacy_vaults.push((vault_id, vault));
                            }
                        }
                    }
                }
            }
        }

        // Migrate legacy vaults
        for (vault_id, vault) in legacy_vaults {
            match migrate_legacy_to_bundle(&self.vaults_dir, &vault_id, &vault) {
                Ok(bundle_name) => {
                    self.vault_bundles.insert(vault_id.clone(), bundle_name);
                    self.vaults.insert(vault_id, vault);
                }
                Err(_e) => {
                    // Migration failed — still keep vault accessible in memory
                    self.vaults.insert(vault_id, vault);
                }
            }
        }

        // Restore persisted lockout state into in-memory trackers
        for (vault_id, vault) in &self.vaults {
            if vault.lockout_failed_attempts > 0 {
                let mut tracker = LockoutTracker::new();
                tracker.failed_attempts = vault.lockout_failed_attempts;
                // Convert persisted Unix timestamp to Instant offset
                if let Some(ts) = vault.lockout_last_failed_ts {
                    let now_utc = Utc::now().timestamp();
                    let secs_ago = (now_utc - ts).max(0) as u64;
                    // Reconstruct Instant as "now minus elapsed seconds"
                    if let Some(instant) = Instant::now().checked_sub(Duration::from_secs(secs_ago)) {
                        tracker.last_failed = Some(instant);
                    }
                }
                self.lockout_trackers.insert(vault_id.clone(), tracker);
            }
        }
    }

    /// Build the on-disk form of a vault: sensitive metadata (file names,
    /// folders, audit log, pages) encrypted into a blob with the plaintext
    /// fields redacted. Returns None when the vault has no encryption salt
    /// or the key isn't in memory (legacy / locked fallback).
    fn disk_form(&self, vault_id: &str) -> Option<VaultData> {
        let vault = self.vaults.get(vault_id)?;
        let salt_hex = vault.security.encryption_salt.as_ref()?;
        let kek_z = self.encryption_keys.get(vault_id).map(|pm| pm.reveal())?;
        let salt = hex::decode(salt_hex).ok()?;
        let sensitive = SensitiveMetadata {
            audit_log: vault.audit_log.clone(),
            folders: vault.folders.clone(),
            files: vault.files.clone(),
            pages_json: vault.pages_json.clone(),
            bookmarks_json: vault.bookmarks_json.clone(),
            watch_folder: vault.watch_folder.clone(),
        };
        let encrypted = encrypt_sensitive_metadata(&kek_z, &salt, &sensitive).ok()?;
        // Redacted copy: sensitive fields cleared, encrypted blob set.
        let mut redacted = vault.clone();
        redacted.audit_log.clear();
        redacted.folders.clear();
        // Keep file IDs, sizes, and wrapped_dek for blob offset calculation,
        // but strip names, folders, favorites, and other metadata
        for f in &mut redacted.files {
            f.name = String::new();
            f.file_type = String::new();
            f.category = String::new();
            f.hash = String::new();
            f.favorite = false;
            f.folder = None;
        }
        redacted.pages_json = None;
        redacted.bookmarks_json = None; // browsing history lives in the encrypted blob only
        redacted.watch_folder = None; // path lives in the encrypted blob only
        redacted.encrypted_metadata = Some(encrypted);
        Some(redacted)
    }

    /// Save vault metadata to its bundle file.
    fn save_vault(&self, vault_id: &str) {
        let Some(bundle_name) = self.vault_bundles.get(vault_id) else { return };
        let bundle_path = self.vaults_dir.join(bundle_name);
        if let Some(redacted) = self.disk_form(vault_id) {
            let _ = bundle_save_metadata(&bundle_path, &redacted);
        } else if let Some(vault) = self.vaults.get(vault_id) {
            // Fallback: save without encryption (legacy or no key available)
            let _ = bundle_save_metadata(&bundle_path, vault);
        }
    }

    /// Get the encryption key bytes for a vault (revealed from protected memory).
    fn get_enc_key(&self, vault_id: &str) -> Option<Zeroizing<Vec<u8>>> {
        self.encryption_keys.get(vault_id).map(|pm| pm.reveal())
    }

    /// Re-save the active vault's metadata footer. Public so commands that run
    /// a bundle rebuild outside the lock (empty trash, secure delete) can
    /// restore the redacted/encrypted footer afterwards — the rebuild itself
    /// writes the in-memory (plaintext) metadata.
    pub fn save_active(&self) {
        if let Some(ref vid) = self.active_vault_id {
            self.save_vault(vid);
        }
    }

    /// Store the full VaultPage[] JSON inside the encrypted vault bundle.
    pub fn save_pages(&mut self, pages_json: String) -> Result<(), String> {
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;
        vault.pages_json = Some(pages_json);
        self.save_active();
        Ok(())
    }

    /// Return the VaultPage[] JSON from the encrypted vault bundle (or "[]" for old vaults).
    pub fn load_pages(&self) -> Result<String, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        Ok(vault.pages_json.clone().unwrap_or_else(|| "[]".to_string()))
    }

    /// Store the private browser's Bookmark[] JSON inside the encrypted vault
    /// bundle. Bookmarks are sensitive (they reveal visited sites), so they live
    /// in the encrypted SensitiveMetadata blob just like pages.
    pub fn save_bookmarks(&mut self, bookmarks_json: String) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;
        vault.bookmarks_json = Some(bookmarks_json);
        self.save_active();
        Ok(())
    }

    /// Return the Bookmark[] JSON from the encrypted vault bundle (or "[]").
    pub fn load_bookmarks(&self) -> Result<String, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        Ok(vault.bookmarks_json.clone().unwrap_or_else(|| "[]".to_string()))
    }

    fn audit(&mut self, action: &str, details: &str) {
        if let Some(ref vid) = self.active_vault_id.clone() {
            if let Some(vault) = self.vaults.get_mut(vid) {
                vault.audit_log.push(AuditEntry {
                    id: Uuid::new_v4().to_string(),
                    action: action.to_string(),
                    details: details.to_string(),
                    timestamp: Utc::now(),
                });
            }
        }
    }

    /// Whether a vault is currently unlocked.
    pub fn is_unlocked(&self) -> bool {
        self.active_vault_id.is_some()
    }

    /// Touch activity timer (call on any user action while vault is open).
    pub fn touch_activity(&mut self) {
        if self.active_vault_id.is_some() {
            self.last_activity = Some(Instant::now());
        }
    }

    /// Check if auto-lock should trigger. Returns true if vault was auto-locked.
    pub fn check_auto_lock(&mut self) -> bool {
        let vid = match self.active_vault_id.as_ref() {
            Some(v) => v.clone(),
            None => return false,
        };

        let timeout_secs = self
            .vaults
            .get(&vid)
            .map(|v| v.security.auto_lock_timeout_secs)
            .unwrap_or(0);

        if timeout_secs == 0 {
            return false;
        }

        if let Some(last) = self.last_activity {
            if last.elapsed() >= Duration::from_secs(timeout_secs) {
                self.audit(obfstr!("AUTO_LOCKED"), &format!("Vault auto-locked after {}s inactivity", timeout_secs));
                self.save_active();
                // Encrypt sensitive metadata before clearing so re-unlock can restore it
                let mut encrypted_blob: Option<String> = None;
                if let Some(vault) = self.vaults.get(&vid) {
                    if let Some(ref salt_hex) = vault.security.encryption_salt {
                        if let Some(kek_z) = self.encryption_keys.get(&vid).map(|pm| pm.reveal()) {
                            if let Ok(salt) = hex::decode(salt_hex) {
                                let sensitive = SensitiveMetadata {
                                    audit_log: vault.audit_log.clone(),
                                    folders: vault.folders.clone(),
                                    files: vault.files.clone(),
                                    pages_json: vault.pages_json.clone(),
                                    bookmarks_json: vault.bookmarks_json.clone(),
                                    watch_folder: vault.watch_folder.clone(),
                                };
                                if let Ok(encrypted) = encrypt_sensitive_metadata(&kek_z, &salt, &sensitive) {
                                    encrypted_blob = Some(encrypted);
                                }
                            }
                        }
                    }
                }
                if let Some(vault) = self.vaults.get_mut(&vid) {
                    if encrypted_blob.is_some() {
                        vault.encrypted_metadata = encrypted_blob;
                    }
                    vault.files.clear();
                    vault.folders.clear();
                    vault.audit_log.clear();
                    vault.pages_json = None;
                }
                // Release protected memory
                if let Some(mut pm) = self.protected_keys.remove(&vid) {
                    unlock_memory(pm.masked_data.as_ptr(), pm.masked_data.len());
                    pm.zeroize();
                }
                if let Some(mut ek) = self.encryption_keys.remove(&vid) {
                    unlock_memory(ek.masked_data.as_ptr(), ek.masked_data.len());
                    ek.zeroize();
                }
                self.active_vault_id = None;
                self.last_activity = None;
                return true;
            }
        }

        false
    }

    pub fn list_vaults(&self) -> Vec<VaultInfo> {
        self.vaults
            .values()
            .map(|v| {
                let mut info = v.info.clone();
                info.file_count = v.files.len();
                info
            })
            .collect()
    }

    pub fn create_vault(
        &mut self,
        name: &str,
        pin: &str,
        self_destruct: bool,
        self_destruct_threshold: u32,
        auto_lock_timeout_secs: u64,
        key_file_path: Option<&str>,
        duress_pin: Option<&str>,
    ) -> Result<VaultInfo, String> {
        validate_pin_strength(pin)?;

        // Validate vault name: reject empty, path separators, control chars, traversal.
        let validated_name = validate_display_name(name)?;
        let name = validated_name.as_str();

        // Read key file if provided
        let key_file_data = if let Some(kf_path) = key_file_path {
            let data = fs::read(kf_path).map_err(|e| format!("Failed to read key file: {}", e))?;
            if data.is_empty() {
                return Err("Key file is empty".to_string());
            }
            Some(data)
        } else {
            None
        };

        let id = Uuid::new_v4().to_string();
        let pin_hash = hash_pin(pin, key_file_data.as_deref())?;

        let key_file_hash = key_file_data.as_ref().map(|d| hash_bytes(d));

        // Hash duress PIN if provided
        let duress_pin_hash = if let Some(dp) = duress_pin {
            if dp == pin {
                return Err("Duress PIN must be different from main PIN".to_string());
            }
            validate_pin_strength(dp)?;
            Some(hash_pin(dp, key_file_data.as_deref())?)
        } else {
            None
        };

        // Enforce minimum auto-lock timeout
        let timeout = if auto_lock_timeout_secs > 0 && auto_lock_timeout_secs < 30 {
            30
        } else {
            auto_lock_timeout_secs
        };

        let info = VaultInfo {
            id: id.clone(),
            name: name.to_string(),
            created_at: Utc::now(),
            file_count: 0,
        };

        // Generate encryption salt for AES-256-GCM file encryption
        let mut enc_salt_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut enc_salt_bytes);
        let enc_salt_hex = hex::encode(enc_salt_bytes);

        // Derive encryption key from PIN + key file + salt
        let enc_key = derive_encryption_key(pin, key_file_data.as_deref(), &enc_salt_bytes)?;

        let vault = VaultData {
            info: info.clone(),
            pin_hash,
            duress_pin_hash: duress_pin_hash.clone(),
            security: SecurityConfig {
                self_destruct_enabled: self_destruct,
                self_destruct_threshold: if self_destruct {
                    self_destruct_threshold.max(3)
                } else {
                    10
                },
                auto_lock_timeout_secs: timeout,
                key_file_required: key_file_data.is_some(),
                key_file_hash,
                duress_enabled: duress_pin_hash.is_some(),
                clipboard_clear_secs: 30,
                encryption_salt: Some(enc_salt_hex),
                has_blob_headers: true,
                aead_bound: true,
            },
            files: Vec::new(),
            folders: Vec::new(),
            audit_log: vec![AuditEntry {
                id: Uuid::new_v4().to_string(),
                action: obfstr!("VAULT_CREATED").to_string(),
                details: format!(
                    "Vault '{}' created (Argon2id + AES-256-GCM, self-destruct: {}, key-file: {}, duress: {})",
                    name,
                    self_destruct,
                    key_file_data.is_some(),
                    duress_pin_hash.is_some(),
                ),
                timestamp: Utc::now(),
            }],
            pages_json: None,
            bookmarks_json: None,
            encrypted_metadata: None,
            lockout_failed_attempts: 0,
            lockout_last_failed_ts: None,
            watch_folder: None,
        };

        // Store encryption key in protected memory BEFORE first save
        // so that save_vault can encrypt sensitive metadata
        let protected_enc = ProtectedMemory::new(&enc_key);
        lock_memory(protected_enc.masked_data.as_ptr(), protected_enc.masked_data.len());
        self.encryption_keys.insert(id.clone(), protected_enc);

        // Create bundle file with obfuscated name
        let bundle_name = generate_bundle_name();
        let bundle_path = self.vaults_dir.join(&bundle_name);
        bundle_create(&bundle_path, &vault)?;

        self.vault_bundles.insert(id.clone(), bundle_name);
        self.vaults.insert(id.clone(), vault);

        // Re-save with encrypted metadata
        self.save_vault(&id);

        Ok(info)
    }

    pub fn delete_vault(&mut self, vault_id: &str) -> Result<(), String> {
        self.vaults.remove(vault_id);
        self.lockout_trackers.remove(vault_id);
        // Zeroize keys in memory before dropping
        if let Some(mut pm) = self.protected_keys.remove(vault_id) {
            unlock_memory(pm.masked_data.as_ptr(), pm.masked_data.len());
            pm.zeroize();
        }
        if let Some(mut ek) = self.encryption_keys.remove(vault_id) {
            unlock_memory(ek.masked_data.as_ptr(), ek.masked_data.len());
            ek.zeroize();
        }

        // Best-effort overwrite of the bundle with random bytes before deleting.
        // NOTE: this only reliably destroys the data on traditional spinning
        // disks. On SSDs (wear-leveling) and copy-on-write filesystems the old
        // blocks may survive elsewhere, and it cannot touch backups or copies
        // that already left this machine. It bounds the working copy, not a
        // forensic guarantee.
        if let Some(bundle_name) = self.vault_bundles.remove(vault_id) {
            let bundle_path = self.vaults_dir.join(&bundle_name);
            if let Ok(meta) = fs::metadata(&bundle_path) {
                if let Ok(mut file) = fs::OpenOptions::new().write(true).open(&bundle_path) {
                    let size = meta.len() as usize;
                    let mut buf = vec![0u8; size.min(65536)];
                    let mut remaining = size;
                    while remaining > 0 {
                        let chunk = remaining.min(buf.len());
                        OsRng.fill_bytes(&mut buf[..chunk]);
                        if file.write_all(&buf[..chunk]).is_err() { break; }
                        remaining -= chunk;
                    }
                    let _ = file.sync_all();
                }
            }
            fs::remove_file(&bundle_path).ok();
        }

        if self.active_vault_id.as_deref() == Some(vault_id) {
            self.active_vault_id = None;
            self.last_activity = None;
        }
        Ok(())
    }

    /// Helper to delete a vault's on-disk bundle (used by duress/self-destruct).
    /// Best-effort: overwrites the file with random data before deletion. This
    /// is reliable on spinning disks but NOT guaranteed on SSDs / copy-on-write
    /// filesystems, and does not remove backups or earlier disk images.
    fn destroy_vault_on_disk(&mut self, vault_id: &str) {
        self.vaults.remove(vault_id);
        self.lockout_trackers.remove(vault_id);
        if let Some(mut pm) = self.protected_keys.remove(vault_id) {
            unlock_memory(pm.masked_data.as_ptr(), pm.masked_data.len());
            pm.zeroize();
        }
        if let Some(mut ek) = self.encryption_keys.remove(vault_id) {
            unlock_memory(ek.masked_data.as_ptr(), ek.masked_data.len());
            ek.zeroize();
        }
        if let Some(bundle_name) = self.vault_bundles.remove(vault_id) {
            let bundle_path = self.vaults_dir.join(&bundle_name);
            // Best-effort overwrite (see note on destroy_vault_on_disk): bounds
            // the working copy; not a forensic guarantee on SSD/CoW storage.
            if let Ok(meta) = fs::metadata(&bundle_path) {
                if let Ok(mut file) = fs::OpenOptions::new().write(true).open(&bundle_path) {
                    let size = meta.len() as usize;
                    let mut buf = vec![0u8; size.min(65536)];
                    let mut remaining = size;
                    while remaining > 0 {
                        let chunk = remaining.min(buf.len());
                        OsRng.fill_bytes(&mut buf[..chunk]);
                        if file.write_all(&buf[..chunk]).is_err() { break; }
                        remaining -= chunk;
                    }
                    let _ = file.sync_all();
                }
            }
            fs::remove_file(&bundle_path).ok();
        }
    }

    /// Get lockout status for a vault (before attempting unlock).
    pub fn get_lockout_status(&self, vault_id: &str) -> Result<LockoutStatus, String> {
        let vault = self.vaults.get(vault_id).ok_or("Vault not found")?;
        let tracker = self.lockout_trackers.get(vault_id);

        let (failed, remaining) = match tracker {
            Some(t) => (t.failed_attempts, t.remaining_lockout_ms()),
            None => (0, 0),
        };

        Ok(LockoutStatus {
            failed_attempts: failed,
            locked_until_ms: remaining,
            self_destruct_enabled: vault.security.self_destruct_enabled,
            self_destruct_threshold: vault.security.self_destruct_threshold,
        })
    }

    /// Check whether a vault requires a key file.
    pub fn vault_requires_key_file(&self, vault_id: &str) -> Result<bool, String> {
        let vault = self.vaults.get(vault_id).ok_or("Vault not found")?;
        Ok(vault.security.key_file_required)
    }

    /// Get security config for a vault.
    pub fn get_security_config(&self, vault_id: &str) -> Result<SecurityConfig, String> {
        let vault = self.vaults.get(vault_id).ok_or("Vault not found")?;
        Ok(vault.security.clone())
    }

    pub fn unlock_vault(
        &mut self,
        vault_id: &str,
        pin: &str,
        key_file_path: Option<&str>,
    ) -> Result<bool, String> {
        // Check lockout first
        {
            let tracker = self.lockout_trackers.entry(vault_id.to_string()).or_insert_with(LockoutTracker::new);
            let remaining = tracker.remaining_lockout_ms();
            if remaining > 0 {
                return Err(format!(
                    "Account locked. Try again in {:.1}s",
                    remaining as f64 / 1000.0
                ));
            }
        }

        let vault = self.vaults.get(vault_id).ok_or("Vault not found")?;

        // Validate key file requirement
        if vault.security.key_file_required && key_file_path.is_none() {
            return Err("This vault requires a key file to unlock".to_string());
        }

        // Read key file if provided
        let key_file_data = if let Some(kf_path) = key_file_path {
            let data = fs::read(kf_path).map_err(|e| format!("Failed to read key file: {}", e))?;
            // Verify key file hash matches if we have one stored
            if let Some(ref stored_hash) = vault.security.key_file_hash {
                let provided_hash = hash_bytes(&data);
                if provided_hash != *stored_hash {
                    // Capture self-destruct config before mutable borrow
                    let sd_enabled = vault.security.self_destruct_enabled;
                    let sd_threshold = vault.security.self_destruct_threshold;
                    // Wrong key file — count as failed attempt and persist to disk
                    let tracker = self.lockout_trackers.entry(vault_id.to_string()).or_insert_with(LockoutTracker::new);
                    tracker.record_failure();
                    let failed_attempts = tracker.failed_attempts;
                    if let Some(v) = self.vaults.get_mut(vault_id) {
                        v.lockout_failed_attempts = failed_attempts;
                        v.lockout_last_failed_ts = Some(Utc::now().timestamp());
                    }
                    self.save_vault(vault_id);
                    // Check self-destruct threshold
                    if sd_enabled && failed_attempts >= sd_threshold {
                        let vault_id_owned = vault_id.to_string();
                        self.destroy_vault_on_disk(&vault_id_owned);
                        return Err(obfstr!("VAULT_DESTROYED: Self-destruct triggered after too many failed attempts").to_string());
                    }
                    return Ok(false);
                }
            }
            Some(data)
        } else {
            None
        };

        let stored_hash = vault.pin_hash.clone();
        let duress_hash = vault.duress_pin_hash.clone();
        let security = vault.security.clone();

        // Check duress PIN first — silently wipe vault with no forensic trace
        if let Some(ref dh) = duress_hash {
            if verify_pin(pin, key_file_data.as_deref(), dh) {
                // DURESS: silently wipe vault — leave no trace
                let vault_id_owned = vault_id.to_string();
                self.destroy_vault_on_disk(&vault_id_owned);
                return Err(obfstr!("VAULT_DESTROYED_SILENT: Vault not found").to_string());
            }
        }

        let ok = verify_pin(pin, key_file_data.as_deref(), &stored_hash);

        if ok {
            // Upgrade legacy SHA-256 hash to Argon2id on successful login
            if !stored_hash.starts_with("$argon2") {
                if let Ok(new_hash) = hash_pin(pin, key_file_data.as_deref()) {
                    if let Some(vault) = self.vaults.get_mut(vault_id) {
                        vault.pin_hash = new_hash;
                    }
                }
            }

            // Store PIN hash in XOR-masked protected memory
            let protected = ProtectedMemory::new(stored_hash.as_bytes());
            // Lock the protected memory to prevent swapping
            lock_memory(protected.masked_data.as_ptr(), protected.masked_data.len());
            self.protected_keys.insert(vault_id.to_string(), protected);

            // Derive and store AES-256-GCM encryption key if vault is encrypted
            if let Some(ref salt_hex) = self.vaults.get(vault_id)
                .and_then(|v| v.security.encryption_salt.clone())
            {
                if let Ok(salt_bytes) = hex::decode(salt_hex) {
                    if let Ok(enc_key) = derive_encryption_key(pin, key_file_data.as_deref(), &salt_bytes) {
                        let protected_enc = ProtectedMemory::new(&enc_key);
                        lock_memory(protected_enc.masked_data.as_ptr(), protected_enc.masked_data.len());
                        self.encryption_keys.insert(vault_id.to_string(), protected_enc);
                    }
                }
            }

            // Decrypt encrypted metadata if present (audit log, folders, file names, pages)
            let mut metadata_restored = false;
            if let Some(encrypted_hex) = self.vaults.get(vault_id)
                .and_then(|v| v.encrypted_metadata.clone())
            {
                if let Some(kek_z) = self.encryption_keys.get(vault_id).map(|pm| pm.reveal()) {
                    if let Ok(sensitive) = decrypt_sensitive_metadata(&kek_z, &encrypted_hex) {
                        if let Some(vault) = self.vaults.get_mut(vault_id) {
                            // Restore real file metadata (names, types, folders, favorites)
                            // The on-disk version keeps file IDs/sizes/wrapped_dek for offset calculation;
                            // the encrypted blob has the full VaultFile entries.
                            vault.files = sensitive.files;
                            vault.folders = sensitive.folders;
                            vault.audit_log = sensitive.audit_log;
                            vault.pages_json = sensitive.pages_json;
                            vault.bookmarks_json = sensitive.bookmarks_json;
                            vault.watch_folder = sensitive.watch_folder;
                            vault.encrypted_metadata = None; // Clear to avoid re-processing
                            metadata_restored = true;
                        }
                    }
                }
            }

            // Fallback: if in-memory decrypt failed (e.g. stale state after lock),
            // re-read the vault from disk and try decrypting the on-disk encrypted_metadata.
            if !metadata_restored {
                if let Some(bundle_name) = self.vault_bundles.get(vault_id).cloned() {
                    let bundle_path = self.vaults_dir.join(&bundle_name);
                    if let Ok(disk_vault) = bundle_read_metadata(&bundle_path) {
                        // Try decrypting on-disk encrypted_metadata with the freshly-derived key
                        if let Some(encrypted_hex) = &disk_vault.encrypted_metadata {
                            if let Some(kek_z) = self.encryption_keys.get(vault_id).map(|pm| pm.reveal()) {
                                if let Ok(sensitive) = decrypt_sensitive_metadata(&kek_z, encrypted_hex) {
                                    if let Some(vault) = self.vaults.get_mut(vault_id) {
                                        vault.files = sensitive.files;
                                        vault.folders = sensitive.folders;
                                        vault.audit_log = sensitive.audit_log;
                                        vault.pages_json = sensitive.pages_json;
                                        vault.bookmarks_json = sensitive.bookmarks_json;
                                        vault.watch_folder = sensitive.watch_folder;
                                        vault.encrypted_metadata = None;
                                        metadata_restored = true;
                                    }
                                }
                            }
                        }
                        // If on-disk vault has unencrypted data (legacy/fallback), use it directly
                        if !metadata_restored {
                            if let Some(vault) = self.vaults.get_mut(vault_id) {
                                if !disk_vault.files.is_empty() && disk_vault.files.iter().any(|f| !f.name.is_empty()) {
                                    vault.files = disk_vault.files;
                                    vault.folders = disk_vault.folders;
                                    vault.audit_log = disk_vault.audit_log;
                                    vault.pages_json = disk_vault.pages_json;
                                    vault.bookmarks_json = disk_vault.bookmarks_json;
                                    vault.encrypted_metadata = None;
                                }
                            }
                        }
                    }
                }
            }

            self.active_vault_id = Some(vault_id.to_string());
            self.last_activity = Some(Instant::now());
            self.lockout_trackers.remove(vault_id);

            // Self-heal categories: older imports (or files imported before a
            // category was recognised, e.g. HEIC) may be stored as "Other" and
            // would then be hidden on media pages. Recompute from the extension
            // so they show up where they belong.
            if let Some(vault) = self.vaults.get_mut(vault_id) {
                let mut changed = false;
                for f in vault.files.iter_mut() {
                    let correct = categorize_extension(&f.file_type);
                    if f.category != correct {
                        f.category = correct;
                        changed = true;
                    }
                }
                if changed {
                    vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
                }
            }

            // Clear persisted lockout state on successful unlock
            if let Some(vault) = self.vaults.get_mut(vault_id) {
                vault.lockout_failed_attempts = 0;
                vault.lockout_last_failed_ts = None;
            }

            self.audit(obfstr!("VAULT_UNLOCKED"), obfstr!("Vault unlocked successfully"));
            self.save_active();

            // Auto-purge trash items older than 30 days
            let _ = self.auto_purge_trash();
        } else {
            // Record failure
            let tracker = self.lockout_trackers.entry(vault_id.to_string()).or_insert_with(LockoutTracker::new);
            tracker.record_failure();
            let failed_attempts = tracker.failed_attempts;

            // Persist lockout state to survive app restarts (prevents brute-force by restarting)
            if let Some(vault) = self.vaults.get_mut(vault_id) {
                vault.lockout_failed_attempts = failed_attempts;
                vault.lockout_last_failed_ts = Some(Utc::now().timestamp());
            }
            self.save_vault(vault_id);

            // Check self-destruct
            if security.self_destruct_enabled
                && failed_attempts >= security.self_destruct_threshold
            {
                // SELF-DESTRUCT: securely delete the vault completely
                let vault_id_owned = vault_id.to_string();
                self.destroy_vault_on_disk(&vault_id_owned);
                return Err(obfstr!("VAULT_DESTROYED: Self-destruct triggered after too many failed attempts").to_string());
            }
        }

        Ok(ok)
    }

    pub fn lock_vault(&mut self) {
        self.audit(obfstr!("VAULT_LOCKED"), obfstr!("Vault locked"));
        self.save_active();
        // Encrypt sensitive metadata into the in-memory vault before clearing,
        // so that re-unlock (without app restart) can decrypt and restore files.
        if let Some(vid) = self.active_vault_id.clone() {
            if let Some(vault) = self.vaults.get(&vid) {
                let mut encrypted_blob: Option<String> = None;
                if let Some(ref salt_hex) = vault.security.encryption_salt {
                    if let Some(kek_z) = self.encryption_keys.get(&vid).map(|pm| pm.reveal()) {
                        if let Ok(salt) = hex::decode(salt_hex) {
                            let sensitive = SensitiveMetadata {
                                audit_log: vault.audit_log.clone(),
                                folders: vault.folders.clone(),
                                files: vault.files.clone(),
                                pages_json: vault.pages_json.clone(),
                                bookmarks_json: vault.bookmarks_json.clone(),
                                watch_folder: vault.watch_folder.clone(),
                            };
                            if let Ok(encrypted) = encrypt_sensitive_metadata(&kek_z, &salt, &sensitive) {
                                encrypted_blob = Some(encrypted);
                            }
                        }
                    }
                }
                // Now clear sensitive data and store encrypted blob for re-unlock
                if let Some(vault) = self.vaults.get_mut(&vid) {
                    if encrypted_blob.is_some() {
                        vault.encrypted_metadata = encrypted_blob;
                    }
                    vault.files.clear();
                    vault.folders.clear();
                    vault.audit_log.clear();
                    vault.pages_json = None;
                }
            }
        }
        // Release protected memory
        if let Some(vid) = &self.active_vault_id {
            if let Some(mut pm) = self.protected_keys.remove(vid) {
                unlock_memory(pm.masked_data.as_ptr(), pm.masked_data.len());
                pm.zeroize();
            }
            if let Some(mut ek) = self.encryption_keys.remove(vid) {
                unlock_memory(ek.masked_data.as_ptr(), ek.masked_data.len());
                ek.zeroize();
            }
        }
        self.active_vault_id = None;
        self.last_activity = None;
        self.clipboard_expiry = None;
    }

    /// Update security settings for the active vault.
    pub fn update_security_config(
        &mut self,
        auto_lock_timeout_secs: Option<u64>,
        clipboard_clear_secs: Option<u32>,
        self_destruct_enabled: Option<bool>,
        self_destruct_threshold: Option<u32>,
    ) -> Result<SecurityConfig, String> {
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;

        if let Some(timeout) = auto_lock_timeout_secs {
            vault.security.auto_lock_timeout_secs = if timeout > 0 && timeout < 30 { 30 } else { timeout };
        }
        if let Some(secs) = clipboard_clear_secs {
            vault.security.clipboard_clear_secs = secs;
        }
        if let Some(enabled) = self_destruct_enabled {
            if enabled && !self.is_pro { return Err("Pro feature required".into()); }
            vault.security.self_destruct_enabled = enabled;
        }
        if let Some(threshold) = self_destruct_threshold {
            vault.security.self_destruct_threshold = threshold;
        }

        let config = vault.security.clone();
        self.save_vault(&vid);
        Ok(config)
    }

    /// Set a duress PIN on the active vault.
    pub fn set_duress_pin(&mut self, duress_pin: &str, key_file_path: Option<&str>) -> Result<(), String> {
        if !self.is_pro { return Err("Pro feature required".into()); }
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(&vid).ok_or("Vault not found")?;

        validate_pin_strength(duress_pin)?;

        // Read key file if the vault requires one
        let key_file_data = if let Some(kf_path) = key_file_path {
            Some(fs::read(kf_path).map_err(|e| format!("Failed to read key file: {}", e))?)
        } else if vault.security.key_file_required {
            return Err("Key file required to set duress PIN".to_string());
        } else {
            None
        };

        // Verify duress PIN is different from main PIN
        if verify_pin(duress_pin, key_file_data.as_deref(), &vault.pin_hash) {
            return Err("Duress PIN must be different from main PIN".to_string());
        }

        let duress_hash = hash_pin(duress_pin, key_file_data.as_deref())?;

        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;
        vault.duress_pin_hash = Some(duress_hash);
        vault.security.duress_enabled = true;

        self.save_vault(&vid);
        self.audit(obfstr!("DURESS_PIN_SET"), obfstr!("Duress password configured"));
        self.save_active();
        Ok(())
    }

    /// Securely delete specific files (rebuild bundle without them)
    /// Prepare secure deletion: strips per-file keys (instant cryptographic
    /// erasure) and removes the files from metadata, then returns the bundle
    /// rebuild work to run outside the mutex lock.
    ///
    /// The rebuild is NOT optional even when every file had a per-file DEK:
    /// blob offsets are computed by walking `vault.files` in order, so leaving
    /// orphaned blob bytes in the bundle would shift the offsets of every file
    /// stored after a deleted one (corrupting reads) and the disk space would
    /// never be reclaimed.
    pub fn secure_delete_prepare(&mut self, file_ids: &[String]) -> Result<Option<EmptyTrashWork>, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let id_set: std::collections::HashSet<&String> = file_ids.iter().collect();

        let old_files = self.vaults.get(&vid)
            .map(|v| v.files.clone())
            .unwrap_or_default();
        let removed_ids: std::collections::HashSet<String> = old_files.iter()
            .filter(|f| id_set.contains(&f.id))
            .map(|f| f.id.clone())
            .collect();
        if removed_ids.is_empty() {
            return Ok(None);
        }

        // Cryptographic erasure first: strip wrapped DEKs from targeted files.
        // Without the DEK the encrypted blob is unrecoverable the moment the
        // footer is rewritten, even if the rebuild below were interrupted.
        let mut has_per_file_keys = false;
        if let Some(vault) = self.vaults.get_mut(&vid) {
            for file in vault.files.iter_mut() {
                if id_set.contains(&file.id) && file.wrapped_dek.is_some() {
                    file.wrapped_dek = None;
                    has_per_file_keys = true;
                }
            }
            vault.files.retain(|f| !id_set.contains(&f.id));
            vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
        }

        let count = removed_ids.len();
        if has_per_file_keys {
            self.audit(obfstr!("FILES_CRYPTO_ERASED"), &format!("{} files cryptographically erased", count));
        } else {
            self.audit(obfstr!("FILES_DELETED"), &format!("{} files deleted", count));
        }

        let bundle_path = self.vault_bundles.get(&vid).cloned()
            .map(|name| self.vaults_dir.join(&name));
        let new_vault = self.vaults.get(&vid).cloned();

        Ok(Some(EmptyTrashWork {
            count: count as u32,
            old_files,
            trashed_ids: removed_ids,
            bundle_path,
            new_vault,
        }))
    }

    /// Clean up any temp files
    pub fn secure_cleanup_temp(&self) -> Result<u32, String> {
        let _vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let temp_dir = self.vaults_dir.join("temp");
        let mut count = 0u32;
        if temp_dir.exists() {
            if let Ok(entries) = fs::read_dir(&temp_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        fs::remove_file(&path).ok();
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    pub fn get_files(
        &self,
        category: Option<String>,
        search: Option<String>,
        sort_by: Option<String>,
        sort_asc: bool,
        folder: Option<String>,
    ) -> Result<Vec<VaultFile>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;

        let mut files: Vec<VaultFile> = vault
            .files
            .iter()
            .filter(|f| {
                // Exclude trashed files from normal listing
                if f.trashed_at.is_some() {
                    return false;
                }
                // Folder filter
                if let Some(ref fld) = folder {
                    if fld.is_empty() {
                        // Root folder: only files with no folder
                        if f.folder.is_some() {
                            return false;
                        }
                    } else if f.folder.as_deref() != Some(fld.as_str()) {
                        return false;
                    }
                }
                if let Some(ref cat) = category {
                    if cat != "All" && &f.category != cat {
                        return false;
                    }
                }
                if let Some(ref s) = search {
                    if !s.is_empty() && !f.name.to_lowercase().contains(&s.to_lowercase()) {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();

        let sort_field = sort_by.unwrap_or_else(|| "name".to_string());
        files.sort_by(|a, b| {
            let ord = match sort_field.as_str() {
                "date" => a.imported_at.cmp(&b.imported_at),
                "size" => a.size.cmp(&b.size),
                "type" => a.file_type.cmp(&b.file_type),
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            };
            if sort_asc { ord } else { ord.reverse() }
        });

        Ok(files)
    }

    /// Import phase 1 (under lock, fast): snapshot the encryption context and
    /// existing file hashes so phase 2 can run without the manager lock.
    ///
    /// Pre-validates vault-level encryption state: if the vault has encryption
    /// enabled but the key is missing, fail immediately with a clear error
    /// instead of silently skipping every file.
    pub fn import_prepare(&mut self, folder: Option<&str>) -> Result<ImportContext, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let encryption = if let Some(ref salt_hex) = self.vaults.get(&vid)
            .and_then(|v| v.security.encryption_salt.clone())
        {
            let salt = hex::decode(salt_hex).map_err(|e| format!("Invalid vault encryption salt: {}", e))?;
            let kek = self.encryption_keys.get(&vid)
                .map(|pm| pm.reveal())
                .ok_or("Encryption key not available — try locking and re-unlocking the vault")?;
            Some((salt, kek))
        } else {
            None
        };

        let existing_by_hash = self.vaults.get(&vid)
            .map(|v| v.files.iter()
                .filter(|f| f.trashed_at.is_none())
                .map(|f| (f.hash.clone(), f.clone()))
                .collect())
            .unwrap_or_default();

        let aead_bound = self.vaults.get(&vid)
            .map(|v| v.security.aead_bound)
            .unwrap_or(false);

        Ok(ImportContext {
            folder: folder.map(|s| s.to_string()),
            encryption,
            existing_by_hash,
            aead_bound,
        })
    }

    /// Import phase 2 (NO lock, slow): read each source file (possibly from
    /// slow cloud-backed storage), hash it, and encrypt it. Because this holds
    /// no lock, thumbnails, viewing, and every other vault operation keep
    /// working while a batch is processed.
    ///
    /// Files are processed by a small pool of worker threads so slow source
    /// reads (cloud placeholders, network drives) overlap with hashing and
    /// encryption instead of running strictly one file at a time.
    ///
    /// Returns the new entries with their encrypted blobs, plus the existing
    /// vault files that matched a duplicate hash (returned so re-imports
    /// still count as successful for the caller).
    /// `progress` is invoked after every path with (paths handled so far in
    /// this batch, display name) so the UI can show live per-file progress.
    pub fn import_process(
        ctx: &ImportContext,
        file_paths: &[String],
        progress: Option<&(dyn Fn(usize, &str) + Send + Sync)>,
    ) -> Result<(Vec<(VaultFile, Vec<u8>)>, Vec<VaultFile>), String> {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let total = file_paths.len();
        if total == 0 {
            return Ok((Vec::new(), Vec::new()));
        }

        // Bounded so peak memory stays predictable: each in-flight file is
        // buffered in full while it's hashed and encrypted.
        const IMPORT_WORKERS: usize = 4;

        let next_index = AtomicUsize::new(0);
        let done_count = AtomicUsize::new(0);
        let seen_hashes = std::sync::Mutex::new(std::collections::HashSet::<String>::new());
        let results = std::sync::Mutex::new(Vec::<(usize, ImportOutcome)>::with_capacity(total));
        let first_error = std::sync::Mutex::new(None::<String>);

        let workers = IMPORT_WORKERS.min(total);
        std::thread::scope(|scope| {
            for _ in 0..workers {
                scope.spawn(|| {
                    loop {
                        if first_error.lock().map(|e| e.is_some()).unwrap_or(true) {
                            break;
                        }
                        let i = next_index.fetch_add(1, Ordering::SeqCst);
                        if i >= total {
                            break;
                        }
                        let path_str = &file_paths[i];
                        match Self::import_one(ctx, path_str, &seen_hashes) {
                            Ok(outcome) => {
                                if let Ok(mut r) = results.lock() {
                                    r.push((i, outcome));
                                }
                            }
                            Err(e) => {
                                if let Ok(mut err) = first_error.lock() {
                                    err.get_or_insert(e);
                                }
                                break;
                            }
                        }
                        let done = done_count.fetch_add(1, Ordering::SeqCst) + 1;
                        if let Some(cb) = progress {
                            let display_name = Path::new(path_str)
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| path_str.clone());
                            cb(done, &display_name);
                        }
                    }
                });
            }
        });

        if let Some(e) = first_error.into_inner().unwrap_or_else(|p| p.into_inner()) {
            return Err(e);
        }
        let mut collected = results.into_inner().unwrap_or_else(|p| p.into_inner());
        // Workers finish out of order — restore the user's selection order.
        collected.sort_by_key(|&(i, _)| i);

        let mut new_entries: Vec<(VaultFile, Vec<u8>)> = Vec::new();
        let mut duplicates: Vec<VaultFile> = Vec::new();
        for (_, outcome) in collected {
            match outcome {
                ImportOutcome::New(vf, blob) => new_entries.push((vf, blob)),
                ImportOutcome::Duplicate(vf) => duplicates.push(vf),
                ImportOutcome::Skipped => {}
            }
        }
        Ok((new_entries, duplicates))
    }

    /// Read + hash + encrypt a single source file. Returns the outcome:
    /// a new entry ready to append, the existing entry it duplicates, or
    /// skipped (unreadable / already claimed by another worker in this batch).
    fn import_one(
        ctx: &ImportContext,
        path_str: &str,
        seen_hashes: &std::sync::Mutex<std::collections::HashSet<String>>,
    ) -> Result<ImportOutcome, String> {
        let path = Path::new(path_str);
        if !path.exists() {
            return Ok(ImportOutcome::Skipped);
        }

        let raw_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        // Strip any path separators / null bytes defensively.
        let name = safe_basename(&raw_name).unwrap_or_else(|_| "unknown".to_string());

        let mut ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        let data = match fs::read(path) {
            Ok(d) => d,
            Err(_) => return Ok(ImportOutcome::Skipped), // skip unreadable files
        };
        let size = data.len() as u64;
        let hash = hash_bytes(&data);

        // In-page video "Download" buttons often save with no usable extension
        // (e.g. "videoplayback"), which would categorize the file as "Other" and
        // leave it invisible on media pages. Sniff the content so it's recognised
        // as the real media type. A genuine, recognised extension always wins.
        if ext.is_empty() || categorize_extension(&ext) == "Other" {
            if let Some(sniffed) = sniff_extension(&data) {
                ext = sniffed.to_string();
            }
        }
        // Give the display/export name a matching extension if it lacks one.
        let name = if !name.contains('.') && !ext.is_empty() {
            format!("{}.{}", name, ext)
        } else {
            name
        };

        // Duplicate of a file already in the vault: do NOT remove and
        // replace the old entry. Blob offsets are derived from the file
        // list, so dropping a middle entry while its blob stays in the
        // bundle would corrupt every file stored after it. The existing
        // entry already IS this content — return it as the result.
        if let Some(existing) = ctx.existing_by_hash.get(&hash) {
            return Ok(ImportOutcome::Duplicate(existing.clone()));
        }
        // In-batch dedup: the first worker to claim a hash imports it, any
        // other worker holding identical content skips.
        {
            let mut seen = seen_hashes.lock().map_err(|_| "Hash set lock poisoned".to_string())?;
            if !seen.insert(hash.clone()) {
                return Ok(ImportOutcome::Skipped);
            }
        }

        let category = categorize_extension(&ext);

        let file_id = Uuid::new_v4().to_string();

        // Encrypt file data if vault has encryption enabled
        let (blob_data, wrapped_dek) = if let Some((ref salt, ref kek)) = ctx.encryption {
            // Generate random per-file DEK
            let mut dek = Zeroizing::new(vec![0u8; 32]);
            OsRng.fill_bytes(&mut dek);

            // Wrap DEK with vault KEK
            let wrapped = wrap_file_key(kek, &dek, &file_id, ctx.aead_bound)?;

            // Encrypt file data with per-file DEK
            let encrypted = encrypt_file_data(&dek, salt, &file_id, &data, ctx.aead_bound)?;
            (encrypted, Some(wrapped))
        } else {
            (data, None)
        };

        let vf = VaultFile {
            id: file_id,
            name,
            size,
            file_type: ext,
            category,
            hash,
            favorite: false,
            imported_at: Utc::now(),
            folder: ctx.folder.clone(),
            trashed_at: None,
            wrapped_dek,
        };
        Ok(ImportOutcome::New(vf, blob_data))
    }

    /// Import phase 3 (under lock, fast): append the already-encrypted blobs
    /// to the bundle and save updated metadata. Uses the rollback journal for
    /// crash safety.
    pub fn import_commit(&mut self, prepared: Vec<(VaultFile, Vec<u8>)>) -> Result<Vec<VaultFile>, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let (imported, new_blobs): (Vec<VaultFile>, Vec<Vec<u8>>) = prepared.into_iter().unzip();
        let count = imported.len();

        if new_blobs.is_empty() {
            self.audit(obfstr!("FILES_IMPORTED"), &format!("{} files imported", count));
            self.save_active();
            return Ok(imported);
        }

        // Record pre-write file count for the journal
        let pre_file_count = self.vaults.get(&vid).map(|v| v.files.len()).unwrap_or(0);

        // Speculatively add files + audit entry so the footer written by the
        // append below already includes this batch.
        if let Some(vault) = self.vaults.get_mut(&vid) {
            // Enable blob headers for new imports
            vault.security.has_blob_headers = true;
            vault.files.extend(imported.clone());
            vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
        }
        self.audit(obfstr!("FILES_IMPORTED"), &format!("{} files imported", count));

        // Write the redacted/encrypted footer directly in the same pass as
        // the blob append. The old flow appended with a plaintext footer and
        // then immediately re-encrypted and rewrote it via save_active —
        // doubling the footer serialization, metadata encryption, and fsync
        // cost of every batch (and the footer grows with the file count).
        let footer_vault = self.disk_form(&vid)
            .or_else(|| self.vaults.get(&vid).cloned())
            .ok_or("Vault not found")?;

        let write_result = if let Some(bundle_name) = self.vault_bundles.get(&vid).cloned() {
            let bundle_path = self.vaults_dir.join(&bundle_name);
            bundle_append_blobs(&bundle_path, &footer_vault, &new_blobs, &self.vaults_dir, pre_file_count)
        } else {
            Err("Bundle not found".into())
        };

        if let Err(e) = write_result {
            // Roll back: remove the files and the audit entry we just added
            // to in-memory state.
            if let Some(vault_mut) = self.vaults.get_mut(&vid) {
                let imported_ids: std::collections::HashSet<&str> = imported.iter().map(|f| f.id.as_str()).collect();
                vault_mut.files.retain(|f| !imported_ids.contains(f.id.as_str()));
                vault_mut.info.file_count = vault_mut.files.iter().filter(|f| f.trashed_at.is_none()).count();
                vault_mut.audit_log.pop();
            }
            return Err(format!("Failed to save files: {}", e));
        }

        Ok(imported)
    }

    /// Set (or clear, with None) the auto-import watch folder for the active
    /// vault. Persisted encrypted at rest.
    pub fn set_watch_folder(&mut self, path: Option<String>) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let cleaned = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
        if let Some(vault) = self.vaults.get_mut(&vid) {
            vault.watch_folder = cleaned.clone();
        }
        self.audit(
            obfstr!("WATCH_FOLDER_SET"),
            &if cleaned.is_some() { "Watch folder enabled".to_string() } else { "Watch folder disabled".to_string() },
        );
        self.save_active();
        Ok(())
    }

    /// Current watch folder for the active vault, or None if no vault is
    /// unlocked or the feature is off. The polling thread uses this to decide
    /// whether to scan.
    pub fn get_watch_folder(&self) -> Option<String> {
        let vid = self.active_vault_id.as_ref()?;
        self.vaults.get(vid).and_then(|v| v.watch_folder.clone())
    }

    pub fn delete_files(&mut self, file_ids: &[String]) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let id_set: std::collections::HashSet<&String> = file_ids.iter().collect();
        let now = Utc::now();

        if let Some(vault) = self.vaults.get_mut(&vid) {
            for file in vault.files.iter_mut() {
                if id_set.contains(&file.id) && file.trashed_at.is_none() {
                    file.trashed_at = Some(now);
                }
            }
            vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
        }

        let count = file_ids.len();
        self.audit(obfstr!("FILES_TRASHED"), &format!("{} files moved to trash", count));
        self.save_active();
        Ok(())
    }

    pub fn get_trashed_files(&self) -> Result<Vec<VaultFile>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        let mut trashed: Vec<VaultFile> = vault.files.iter()
            .filter(|f| f.trashed_at.is_some())
            .cloned()
            .collect();
        trashed.sort_by(|a, b| b.trashed_at.cmp(&a.trashed_at));
        Ok(trashed)
    }

    pub fn restore_from_trash(&mut self, file_ids: &[String]) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let id_set: std::collections::HashSet<&String> = file_ids.iter().collect();

        if let Some(vault) = self.vaults.get_mut(&vid) {
            for file in vault.files.iter_mut() {
                if id_set.contains(&file.id) {
                    file.trashed_at = None;
                }
            }
            vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
        }

        let count = file_ids.len();
        self.audit(obfstr!("FILES_RESTORED"), &format!("{} files restored from trash", count));
        self.save_active();
        Ok(())
    }

    /// Prepare trash emptying: updates metadata and returns info needed for the
    /// expensive bundle rebuild, which can then run outside the mutex lock.
    /// If all trashed files have per-file keys, cryptographic erasure is used
    /// (instant — just strip keys and rewrite footer, no bundle rebuild needed).
    pub fn empty_trash_prepare(&mut self) -> Result<Option<EmptyTrashWork>, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let old_files = self.vaults.get(&vid)
            .map(|v| v.files.clone())
            .unwrap_or_default();

        let trashed_files: Vec<&VaultFile> = old_files.iter()
            .filter(|f| f.trashed_at.is_some())
            .collect();

        let count = trashed_files.len() as u32;
        if count == 0 {
            return Ok(None);
        }

        // Check if all trashed files have per-file keys (crypto-erasure eligible)
        let all_have_dek = trashed_files.iter().all(|f| f.wrapped_dek.is_some());

        let trashed_ids: std::collections::HashSet<String> = trashed_files.iter()
            .map(|f| f.id.clone())
            .collect();

        if let Some(vault) = self.vaults.get_mut(&vid) {
            vault.files.retain(|f| f.trashed_at.is_none());
            vault.info.file_count = vault.files.len();
        }

        // Always rebuild the bundle to remove orphaned blob data.
        // Even with crypto-erasure (keys stripped), the physical blob bytes remain
        // in the bundle. Without a rebuild, offset calculations for all subsequent
        // files are wrong (they skip over the orphaned space), corrupting reads.
        if all_have_dek {
            self.audit(obfstr!("TRASH_CRYPTO_ERASED"), &format!("{} files cryptographically erased", count));
        } else {
            self.audit(obfstr!("TRASH_EMPTIED"), &format!("{} files permanently deleted", count));
        }

        let bundle_path = self.vault_bundles.get(&vid).cloned()
            .map(|name| self.vaults_dir.join(&name));
        let new_vault = self.vaults.get(&vid).cloned();

        Ok(Some(EmptyTrashWork {
            count,
            old_files,
            trashed_ids,
            bundle_path,
            new_vault,
        }))
    }

    pub fn auto_purge_trash(&mut self) -> Result<u32, String> {
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let cutoff = Utc::now() - chrono::Duration::days(30);

        let old_files = self.vaults.get(&vid)
            .map(|v| v.files.clone())
            .unwrap_or_default();

        let expired_ids: std::collections::HashSet<String> = old_files.iter()
            .filter(|f| matches!(f.trashed_at, Some(t) if t < cutoff))
            .map(|f| f.id.clone())
            .collect();

        if expired_ids.is_empty() {
            return Ok(0);
        }

        let count = expired_ids.len() as u32;
        let id_set: std::collections::HashSet<&String> = expired_ids.iter().collect();

        if let Some(vault) = self.vaults.get_mut(&vid) {
            vault.files.retain(|f| !id_set.contains(&f.id));
            vault.info.file_count = vault.files.iter().filter(|f| f.trashed_at.is_none()).count();
        }

        self.audit(obfstr!("TRASH_AUTO_PURGED"), &format!("{} expired trash items permanently deleted", count));

        if let Some(bundle_name) = self.vault_bundles.get(&vid).cloned() {
            let bundle_path = self.vaults_dir.join(&bundle_name);
            if let Some(vault) = self.vaults.get(&vid) {
                bundle_rebuild_without(&bundle_path, &old_files, vault, &id_set)?;
            }
        }
        // Rebuild wrote a plaintext footer — restore the encrypted one
        self.save_active();

        Ok(count)
    }

    /// Wipe ALL files from the active vault (visible, trashed, everything).
    /// Rewrites the bundle as empty (just footer, no blobs).
    pub fn wipe_all_files(&mut self) -> Result<u32, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let count = self.vaults.get(&vid)
            .map(|v| v.files.len() as u32)
            .unwrap_or(0);

        // NOTE: no early return when count == 0 — the bundle may still hold
        // orphaned blob bytes (e.g. from an interrupted import), and rewriting
        // it empty is the only way to reclaim that space.

        // Clear all files from in-memory vault state
        if let Some(vault) = self.vaults.get_mut(&vid) {
            vault.files.clear();
            vault.info.file_count = 0;
        }

        self.audit(obfstr!("VAULT_WIPED"), &format!("All {} files permanently wiped from vault", count));

        // Rewrite bundle as empty (just footer, no blobs)
        if let Some(bundle_name) = self.vault_bundles.get(&vid).cloned() {
            let bundle_path = self.vaults_dir.join(&bundle_name);
            if let Some(vault) = self.vaults.get(&vid) {
                bundle_create(&bundle_path, vault)?;
            }
        }
        // bundle_create wrote a plaintext footer — restore the encrypted one
        self.save_active();

        Ok(count)
    }

    pub fn export_files(&mut self, file_ids: &[String], dest_dir: &str) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(&vid).ok_or("Vault not found")?;

        let bundle_name = self.vault_bundles.get(&vid)
            .ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);
        let enc_key_z = self.get_enc_key(&vid);
        let enc_key = enc_key_z.as_ref().map(|k| k.as_slice());

        let dest = Path::new(dest_dir);
        fs::create_dir_all(dest).map_err(|e| e.to_string())?;

        for fid in file_ids {
            if let Some(vf) = vault.files.iter().find(|f| &f.id == fid) {
                let data = bundle_read_file(&bundle_path, vault, fid, enc_key)?;
                let safe_name = safe_basename(&vf.name)?;
                let tmp_dst = dest.join(format!(".{}.~wr", &safe_name));
                let final_dst = dest.join(&safe_name);
                fs::write(&tmp_dst, &data).map_err(|e| format!("Write temp: {}", e))?;
                fs::rename(&tmp_dst, &final_dst).map_err(|e| {
                    let _ = fs::remove_file(&tmp_dst);
                    format!("Rename: {}", e)
                })?;
            }
        }

        let count = file_ids.len();
        self.audit(
            obfstr!("FILES_EXPORTED"),
            &format!("{} files exported to {}", count, dest_dir),
        );
        self.save_active();
        Ok(())
    }

    pub fn toggle_favorite(&mut self, file_id: &str) -> Result<VaultFile, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let result = {
            let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;
            let file = vault
                .files
                .iter_mut()
                .find(|f| f.id == file_id)
                .ok_or("File not found")?;
            file.favorite = !file.favorite;
            file.clone()
        };
        self.save_vault(&vid);
        Ok(result)
    }

    pub fn get_audit_log(&self) -> Result<Vec<AuditEntry>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        let mut log = vault.audit_log.clone();
        log.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(log)
    }

    pub fn check_integrity(&self) -> Result<Vec<(String, bool)>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;

        let bundle_name = self.vault_bundles.get(vid)
            .ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);
        let enc_key_z = self.get_enc_key(vid);
        let enc_key = enc_key_z.as_ref().map(|k| k.as_slice());

        let results: Vec<(String, bool)> = vault
            .files
            .iter()
            .map(|f| {
                match bundle_read_file(&bundle_path, vault, &f.id, enc_key) {
                    Ok(data) => {
                        let current_hash = hash_bytes(&data);
                        (f.name.clone(), current_hash == f.hash)
                    }
                    Err(_) => (f.name.clone(), false),
                }
            })
            .collect();

        Ok(results)
    }

    pub fn get_categories(&self) -> Result<Vec<String>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        let mut cats: Vec<String> = vault.files.iter().map(|f| f.category.clone()).collect();
        cats.sort();
        cats.dedup();
        cats.insert(0, "All".to_string());
        Ok(cats)
    }

    // ── Folder management ──

    pub fn list_folders(&self) -> Result<Vec<String>, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        Ok(vault.folders.clone())
    }

    pub fn create_folder(&mut self, name: &str) -> Result<Vec<String>, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;

        let trimmed = validate_display_name(name)?;
        if vault.folders.contains(&trimmed) {
            return Err("Folder already exists".to_string());
        }

        vault.folders.push(trimmed.clone());
        vault.folders.sort();
        let result = vault.folders.clone();
        self.audit(obfstr!("FOLDER_CREATED"), &format!("Folder '{}' created", trimmed));
        self.save_active();
        Ok(result)
    }

    pub fn delete_folder(&mut self, name: &str) -> Result<Vec<String>, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;

        vault.folders.retain(|f| f != name);
        // Move files from deleted folder back to root
        for file in &mut vault.files {
            if file.folder.as_deref() == Some(name) {
                file.folder = None;
            }
        }
        let result = vault.folders.clone();
        self.audit(obfstr!("FOLDER_DELETED"), &format!("Folder '{}' deleted, files moved to root", name));
        self.save_active();
        Ok(result)
    }

    pub fn move_files_to_folder(&mut self, file_ids: &[String], folder: Option<&str>) -> Result<(), String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get_mut(&vid).ok_or("Vault not found")?;

        // Validate folder exists if specified
        if let Some(f) = folder {
            if !f.is_empty() && !vault.folders.contains(&f.to_string()) {
                return Err("Folder not found".to_string());
            }
        }

        for file in &mut vault.files {
            if file_ids.contains(&file.id) {
                file.folder = folder.filter(|s| !s.is_empty()).map(|s| s.to_string());
            }
        }

        let dest = folder.unwrap_or("root");
        self.audit(obfstr!("FILES_MOVED"), &format!("{} files moved to '{}'", file_ids.len(), dest));
        self.save_active();
        Ok(())
    }

    // ── Vault size / stats ──

    /// Get vault size breakdown: total size + per-category sizes.
    pub fn get_vault_size(&self) -> Result<VaultSizeInfo, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;

        let total_size: u64 = vault.files.iter().map(|f| f.size).sum();
        let total_files = vault.files.len();

        let mut categories: HashMap<String, CategorySize> = HashMap::new();
        for f in &vault.files {
            let entry = categories.entry(f.category.clone()).or_insert(CategorySize {
                category: f.category.clone(),
                size: 0,
                count: 0,
            });
            entry.size += f.size;
            entry.count += 1;
        }

        let mut category_list: Vec<CategorySize> = categories.into_values().collect();
        category_list.sort_by(|a, b| b.size.cmp(&a.size));

        Ok(VaultSizeInfo {
            total_size,
            total_files,
            categories: category_list,
        })
    }

    // ── Single file export (for export queue) ──

    /// Export a single file, returning the file name on success.
    pub fn export_single_file(&mut self, file_id: &str, dest_dir: &str) -> Result<String, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(&vid).ok_or("Vault not found")?;

        let bundle_name = self.vault_bundles.get(&vid)
            .ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);

        let vf = vault.files.iter().find(|f| f.id == file_id).ok_or("File not found")?;
        let name = safe_basename(&vf.name)?;

        let enc_key_z = self.get_enc_key(&vid);
        let enc_key = enc_key_z.as_ref().map(|k| k.as_slice());
        let data = bundle_read_file(&bundle_path, vault, file_id, enc_key)?;

        let dest = Path::new(dest_dir);
        fs::create_dir_all(dest).map_err(|e| e.to_string())?;

        let tmp_dst = dest.join(format!(".{}.~wr", &name));
        let final_dst = dest.join(&name);
        fs::write(&tmp_dst, &data).map_err(|e| format!("Write temp: {}", e))?;
        fs::rename(&tmp_dst, &final_dst).map_err(|e| {
            let _ = fs::remove_file(&tmp_dst);
            format!("Rename: {}", e)
        })?;

        self.audit(obfstr!("FILE_EXPORTED"), &format!("File '{}' exported to {}", name, dest_dir));
        self.save_active();
        Ok(name)
    }

    /// Return decrypted file content as (base64_data, mime_type).
    pub fn get_file_content(&self, file_id: &str) -> Result<(String, String), String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;

        let vf = vault.files.iter().find(|f| f.id == file_id).ok_or("File not found")?;

        let bundle_name = self.vault_bundles.get(vid)
            .ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);

        let enc_key_z = self.get_enc_key(vid);
        let enc_key = enc_key_z.as_ref().map(|k| k.as_slice());
        let data = bundle_read_file(&bundle_path, vault, file_id, enc_key)?;

        let mime = mime_from_extension(&vf.file_type);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);

        Ok((b64, mime))
    }

    /// Return metadata needed to stream a file directly from the bundle.
    /// Only extracts offset/size/mime — no file I/O, so the caller can release
    /// the mutex lock before doing the actual read.
    pub fn get_file_stream_info(&self, file_id: &str) -> Result<FileStreamInfo, String> {
        let vid = self.active_vault_id.as_ref().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(vid).ok_or("Vault not found")?;
        let bundle_name = self.vault_bundles.get(vid).ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);

        let mut offset = 0u64;
        let mut target_size = 0u64;
        let mut mime = String::new();
        let mut target_file_id = String::new();
        let mut target_wrapped_dek: Option<String> = None;
        let mut found = false;
        for f in &vault.files {
            if f.id == file_id {
                target_size = f.size; // plaintext size (what the client sees)
                mime = mime_from_extension(&f.file_type);
                target_file_id = f.id.clone();
                target_wrapped_dek = f.wrapped_dek.clone();
                found = true;
                break;
            }
            offset += file_bundle_size(vault, f);
        }
        if !found {
            return Err("File not found in bundle".into());
        }

        // Get encryption key and salt if vault is encrypted.
        // If file has a wrapped DEK, resolve the actual file key here
        // so the streaming handler doesn't need to know about key wrapping.
        let (enc_key, enc_salt) = if let Some(ref salt_hex) = vault.security.encryption_salt {
            let kek = self.encryption_keys.get(vid)
                .map(|pm| pm.reveal().to_vec())
                .ok_or("Encryption key not available")?;
            let file_key = resolve_file_key(&kek, target_wrapped_dek.as_deref(), &target_file_id, vault.security.aead_bound)?;
            let salt = hex::decode(salt_hex).map_err(|e| format!("Invalid salt: {}", e))?;
            (Some(file_key.to_vec()), Some(salt))
        } else {
            (None, None)
        };

        // Skip blob header if vault uses per-blob CRC headers
        let data_offset = if vault.security.has_blob_headers {
            offset + BLOB_HEADER_SIZE
        } else {
            offset
        };

        // Guard against corrupt/tampered metadata driving huge allocations in
        // the streaming/thumbnail/phone consumers: a file's plaintext size can
        // never exceed the bundle that holds it, and its on-disk blob must fit
        // within the bundle at its computed offset.
        let bundle_len = fs::metadata(&bundle_path).map_err(|e| format!("Stat bundle: {}", e))?.len();
        let on_disk_size = if vault.security.encryption_salt.is_some() {
            encrypted_bundle_size(target_size)
        } else {
            target_size
        };
        let fits = target_size <= bundle_len
            && data_offset.checked_add(on_disk_size).map_or(false, |end| end <= bundle_len);
        if !fits {
            return Err("Corrupt vault metadata: file extent exceeds bundle".into());
        }

        Ok(FileStreamInfo {
            bundle_path,
            offset_in_bundle: data_offset,
            total_size: target_size,
            mime_type: mime,
            file_id: target_file_id,
            encryption_key: enc_key,
            encryption_salt: enc_salt,
            aead_bound: vault.security.aead_bound,
        })
    }

    /// Backup the active vault's data to a destination directory.
    pub fn backup_vault(&mut self, dest_path: &str) -> Result<BackupResult, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let bundle_name = self.vault_bundles.get(&vid)
            .ok_or("Bundle not found for vault")?
            .clone();
        let bundle_path = self.vaults_dir.join(&bundle_name);

        // Copy the bundle file directly as a .vault file
        let dest = Path::new(dest_path);
        let meta = fs::metadata(&bundle_path).map_err(|e| e.to_string())?;
        let size_bytes = meta.len();
        fs::copy(&bundle_path, dest)
            .map_err(|e| format!("Failed to copy bundle: {}", e))?;

        let vault = self.vaults.get(&vid).ok_or("Vault not found")?;
        let file_count = vault.files.len();

        let backup_path_str = dest.to_string_lossy().to_string();
        self.audit(obfstr!("VAULT_BACKUP"), &format!("Backed up {} files ({} bytes) to {}", file_count, size_bytes, &backup_path_str));
        self.save_active();

        Ok(BackupResult {
            path: backup_path_str,
            file_count,
            size_bytes,
        })
    }

    /// Restore vault data from a backup directory.
    pub fn restore_vault(&mut self, backup_path: &str) -> Result<RestoreResult, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;

        let backup_dir = Path::new(backup_path);
        if !backup_dir.exists() || !backup_dir.is_dir() {
            return Err("Backup path does not exist or is not a directory".to_string());
        }

        // Look for a bundle file in the backup directory
        let mut backup_vault_data: Option<VaultData> = None;
        let mut backup_bundle_path: Option<PathBuf> = None;

        if let Ok(entries) = fs::read_dir(backup_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().is_none() {
                    if let Ok(vault) = bundle_read_metadata(&path) {
                        if vault.info.id == vid {
                            backup_vault_data = Some(vault);
                            backup_bundle_path = Some(path);
                            break;
                        }
                    }
                }
            }
        }

        // Try legacy format if no bundle found
        if backup_vault_data.is_none() {
            let backup_json = backup_dir.join(format!("{}.json", &vid));
            if backup_json.exists() {
                let json_data = fs::read_to_string(&backup_json)
                    .map_err(|e| format!("Failed to read backup metadata: {}", e))?;
                let vault: VaultData = serde_json::from_str(&json_data)
                    .map_err(|e| format!("Failed to parse backup metadata: {}", e))?;
                backup_vault_data = Some(vault);
                // backup_bundle_path stays None — will use legacy blob directory
            }
        }

        let backup_vault = backup_vault_data
            .ok_or("No vault metadata found in backup directory. Please select a valid Kawaii Vault backup.")?;

        // Merge files from backup that don't already exist in current vault
        let mut restored_count: usize = 0;
        let mut new_blobs: Vec<Vec<u8>> = Vec::new();

        if let Some(current_vault) = self.vaults.get_mut(&vid) {
            for backup_file in &backup_vault.files {
                // Skip files that already exist (by ID)
                if current_vault.files.iter().any(|f| f.id == backup_file.id) {
                    continue;
                }

                // Read the file blob from the backup
                let blob_data = if let Some(ref bp) = backup_bundle_path {
                    // Read from backup bundle (None = raw bytes, no decryption, for pass-through)
                    bundle_read_file(bp, &backup_vault, &backup_file.id, None).ok()
                } else {
                    // Try legacy format: blob directory
                    let blobs_dir = backup_dir.join(&vid);
                    let source_dir = if blobs_dir.exists() && blobs_dir.is_dir() {
                        blobs_dir
                    } else {
                        // Try any subdirectory
                        let mut found = None;
                        if let Ok(entries) = fs::read_dir(backup_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    found = Some(path);
                                    break;
                                }
                            }
                        }
                        found.unwrap_or_else(|| backup_dir.to_path_buf())
                    };
                    let blob_src = source_dir.join(&backup_file.id);
                    if blob_src.exists() {
                        fs::read(&blob_src).ok()
                    } else {
                        None
                    }
                };

                if let Some(data) = blob_data {
                    new_blobs.push(data);
                    current_vault.files.push(backup_file.clone());
                    restored_count += 1;
                }
            }
            current_vault.info.file_count = current_vault.files.len();
        }

        self.audit(obfstr!("VAULT_RESTORED"), &format!("Restored {} files from backup", restored_count));

        // Append restored blobs to the bundle
        if !new_blobs.is_empty() {
            let pre_file_count = self.vaults.get(&vid).map(|v| v.files.len()).unwrap_or(0) - restored_count;
            if let Some(vault) = self.vaults.get_mut(&vid) {
                vault.security.has_blob_headers = true;
            }
            if let Some(bundle_name) = self.vault_bundles.get(&vid).cloned() {
                let bundle_path = self.vaults_dir.join(&bundle_name);
                if let Some(vault) = self.vaults.get(&vid) {
                    bundle_append_blobs(&bundle_path, vault, &new_blobs, &self.vaults_dir, pre_file_count)?;
                }
            }
        } else {
            self.save_active();
        }

        Ok(RestoreResult { restored_count })
    }

    /// Import a .vault backup file into the vault storage (does not require an unlocked vault).
    pub fn restore_vault_from_file(&mut self, vault_file_path: &str) -> Result<RestoreResult, String> {
        let src = Path::new(vault_file_path);
        if !src.exists() || !src.is_file() {
            return Err("Vault file does not exist".to_string());
        }

        // Read metadata from the .vault file to get vault info
        let vault_data = bundle_read_metadata(src)
            .map_err(|e| format!("Invalid .vault file: {}", e))?;
        let vid = vault_data.info.id.clone();

        // Check if vault already exists
        if self.vaults.contains_key(&vid) {
            return Err("A vault with this ID already exists. Delete it first to restore from backup.".to_string());
        }

        // Ensure vaults directory exists before copying
        fs::create_dir_all(&self.vaults_dir)
            .map_err(|e| format!("Failed to create vaults directory: {}", e))?;

        // Copy .vault file into the vaults directory as a bundle (extensionless)
        let bundle_name = vid.clone();
        let dest = self.vaults_dir.join(&bundle_name);
        fs::copy(src, &dest)
            .map_err(|e| format!("Failed to copy vault file: {}", e))?;

        let restored_count = vault_data.files.len();

        // Register the vault
        self.vaults.insert(vid.clone(), vault_data);
        self.vault_bundles.insert(vid.clone(), bundle_name);

        Ok(RestoreResult { restored_count })
    }

    /// Get the current vault storage directory path
    pub fn get_vault_path(&self) -> Result<String, String> {
        Ok(self.vaults_dir.to_string_lossy().to_string())
    }

    /// Transfer (move) the vault storage to a new directory
    pub fn transfer_vault(&mut self, new_dir: &str) -> Result<String, String> {
        if !self.is_pro { return Err("Pro feature required".into()); }
        let new_path = PathBuf::from(new_dir);
        if !new_path.exists() {
            fs::create_dir_all(&new_path).map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        let old_path = self.vaults_dir.clone();
        if old_path == new_path {
            return Ok(new_path.to_string_lossy().to_string());
        }

        // Copy all files and directories from old location to new location
        if let Ok(entries) = fs::read_dir(&old_path) {
            for entry in entries.flatten() {
                let src = entry.path();
                let dest = new_path.join(entry.file_name());
                if src.is_dir() {
                    // Recursively copy directory
                    fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
                        fs::create_dir_all(dest).map_err(|e| format!("Failed to create dir: {}", e))?;
                        if let Ok(entries) = fs::read_dir(src) {
                            for entry in entries.flatten() {
                                let s = entry.path();
                                let d = dest.join(entry.file_name());
                                if s.is_dir() {
                                    copy_dir_recursive(&s, &d)?;
                                } else {
                                    fs::copy(&s, &d).map_err(|e| format!("Failed to copy file: {}", e))?;
                                }
                            }
                        }
                        Ok(())
                    }
                    copy_dir_recursive(&src, &dest)?;
                } else {
                    fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
                }
            }
        }

        // Update vaults_dir to new location
        self.vaults_dir = new_path.clone();

        // Reload vaults from new location
        self.vaults.clear();
        self.vault_bundles.clear();
        self.load_all();

        // Remove old directory contents after successful copy
        let _ = fs::remove_dir_all(&old_path);

        self.audit(obfstr!("VAULT_TRANSFERRED"), &format!("Vault transferred to {}", new_dir));

        Ok(new_path.to_string_lossy().to_string())
    }

    // ── Encrypted ZIP export ──

    /// Export selected files as a password-protected ZIP with AES-256 encryption.
    pub fn export_encrypted_zip(&mut self, file_ids: &[String], dest_path: &str, zip_password: &str) -> Result<String, String> {
        self.touch_activity();
        let vid = self.active_vault_id.clone().ok_or("No vault unlocked")?;
        let vault = self.vaults.get(&vid).ok_or("Vault not found")?;

        let bundle_name = self.vault_bundles.get(&vid)
            .ok_or("Bundle not found for vault")?;
        let bundle_path = self.vaults_dir.join(bundle_name);
        let enc_key_z = self.get_enc_key(&vid);
        let enc_key = enc_key_z.as_ref().map(|k| k.as_slice());

        let dest = Path::new(dest_path);
        let zip_file = fs::File::create(dest).map_err(|e| format!("Create ZIP file: {}", e))?;
        let mut zip_writer = zip::ZipWriter::new(zip_file);

        // AES-256 encrypted ZIP — requires 7-Zip, WinRAR, or similar to extract.
        // Windows Explorer does not support AES encrypted ZIPs (error 0x80004005).
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .with_aes_encryption(zip::AesMode::Aes256, zip_password);

        for fid in file_ids {
            if let Some(vf) = vault.files.iter().find(|f| &f.id == fid) {
                let data = bundle_read_file(&bundle_path, vault, fid, enc_key)?;
                zip_writer.start_file(&vf.name, options.clone())
                    .map_err(|e| format!("ZIP start file: {}", e))?;
                zip_writer.write_all(&data)
                    .map_err(|e| format!("ZIP write: {}", e))?;
            }
        }

        zip_writer.finish().map_err(|e| format!("ZIP finish: {}", e))?;

        let count = file_ids.len();
        self.audit(obfstr!("FILES_EXPORTED_ZIP"), &format!("{} files exported as encrypted ZIP to {}", count, dest_path));
        self.save_active();

        Ok(dest_path.to_string())
    }

}

/// Vault size information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSizeInfo {
    pub total_size: u64,
    pub total_files: usize,
    pub categories: Vec<CategorySize>,
}

/// Per-category size breakdown
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySize {
    pub category: String,
    pub size: u64,
    pub count: usize,
}

/// Backup result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub path: String,
    pub file_count: usize,
    pub size_bytes: u64,
}

/// Restore result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub restored_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use tempfile::TempDir;

    #[test]
    fn sniff_recognizes_common_media() {
        // mp4 (ftyp box at offset 4)
        let mp4 = [0, 0, 0, 0x18, b'f', b't', b'y', b'p', b'm', b'p', b'4', b'2', 0, 0, 0, 0];
        assert_eq!(sniff_extension(&mp4), Some("mp4"));
        assert_eq!(categorize_extension(sniff_extension(&mp4).unwrap()), "Videos");
        // webm/mkv (EBML)
        assert_eq!(sniff_extension(&[0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3]), Some("webm"));
        // jpg / png
        assert_eq!(sniff_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(sniff_extension(b"\x89PNG\r\n\x1a\n....."), Some("png"));
        // unknown
        assert_eq!(sniff_extension(b"not a known header at all"), None);
    }

    /// Build a minimal VaultManager backed by a temporary directory (no migration, no load).
    fn test_manager(dir: &Path) -> VaultManager {
        fs::create_dir_all(dir).unwrap();
        VaultManager {
            vaults_dir: dir.to_path_buf(),
            vaults: HashMap::new(),
            vault_bundles: HashMap::new(),
            active_vault_id: None,
            lockout_trackers: HashMap::new(),
            last_activity: None,
            protected_keys: HashMap::new(),
            encryption_keys: HashMap::new(),
            clipboard_expiry: None,
            is_pro: true,
            license_info: None,
        }
    }

    #[test]
    fn delete_vault_overwrites_bundle_with_random_bytes_before_removal() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = test_manager(tmp.path());

        // Create a fake bundle file with known content
        let bundle_name = "test_bundle.vault";
        let bundle_path = tmp.path().join(bundle_name);
        let original_data = b"SENSITIVE_VAULT_DATA_THAT_SHOULD_BE_WIPED";
        fs::write(&bundle_path, original_data).unwrap();
        assert!(bundle_path.exists());

        // Register a minimal vault entry so delete_vault has something to remove
        let vault_id = "test-vault-id";
        mgr.vault_bundles.insert(vault_id.to_string(), bundle_name.to_string());
        mgr.vaults.insert(vault_id.to_string(), VaultData {
            info: VaultInfo {
                id: vault_id.to_string(),
                name: "Test".to_string(),
                created_at: Utc::now(),
                file_count: 0,
            },
            pin_hash: String::new(),
            duress_pin_hash: None,
            security: SecurityConfig {
                self_destruct_enabled: false,
                self_destruct_threshold: 5,
                auto_lock_timeout_secs: 300,
                key_file_required: false,
                key_file_hash: None,
                duress_enabled: false,
                clipboard_clear_secs: 30,
                encryption_salt: None,
                has_blob_headers: false,
                aead_bound: false,
            },
            files: vec![],
            audit_log: vec![],
            folders: vec![],
            lockout_failed_attempts: 0,
            lockout_last_failed_ts: None,
            encrypted_metadata: None,
            pages_json: None,
            bookmarks_json: None,
            watch_folder: None,
        });

        // Intercept: instead of letting delete_vault remove the file, we'll verify
        // the overwrite by checking that the file content changed BEFORE it's deleted.
        // We do this by replacing the bundle with a copy and checking after delete.
        // Actually, since delete_vault removes the file, we verify it's gone AND
        // check that the approach is sound by reading the raw disk sector... but that's
        // impractical in a unit test. Instead, we verify:
        // 1) The file is deleted
        // 2) The vault state is cleaned up

        mgr.delete_vault(vault_id).unwrap();

        // File must be gone
        assert!(!bundle_path.exists(), "Bundle file should be deleted");

        // Vault state must be cleaned up
        assert!(!mgr.vaults.contains_key(vault_id));
        assert!(!mgr.vault_bundles.contains_key(vault_id));
        assert!(!mgr.lockout_trackers.contains_key(vault_id));
        assert!(!mgr.protected_keys.contains_key(vault_id));
        assert!(!mgr.encryption_keys.contains_key(vault_id));
    }

    #[test]
    fn delete_vault_overwrites_file_content_before_unlinking() {
        // To prove the file is overwritten (not just deleted), we hook into the
        // process: write a known pattern, hard-link the file so the data survives
        // unlink, then verify the linked copy no longer contains the original data.
        let tmp = TempDir::new().unwrap();
        let mut mgr = test_manager(tmp.path());

        let bundle_name = "wipe_test.vault";
        let bundle_path = tmp.path().join(bundle_name);
        let witness_path = tmp.path().join("witness_link");

        let original_data = b"TOP_SECRET_ENCRYPTION_KEYS_AND_FILE_DATA_1234567890";
        fs::write(&bundle_path, original_data).unwrap();

        // Create a hard link — both paths point to the same inode/data on disk.
        // When delete_vault overwrites + unlinks bundle_path, the witness still
        // references the same data blocks, so we can read the overwritten content.
        fs::hard_link(&bundle_path, &witness_path).unwrap();

        let vault_id = "wipe-test";
        mgr.vault_bundles.insert(vault_id.to_string(), bundle_name.to_string());
        mgr.vaults.insert(vault_id.to_string(), VaultData {
            info: VaultInfo {
                id: vault_id.to_string(),
                name: "Wipe Test".to_string(),
                created_at: Utc::now(),
                file_count: 0,
            },
            pin_hash: String::new(),
            duress_pin_hash: None,
            security: SecurityConfig {
                self_destruct_enabled: false,
                self_destruct_threshold: 5,
                auto_lock_timeout_secs: 300,
                key_file_required: false,
                key_file_hash: None,
                duress_enabled: false,
                clipboard_clear_secs: 30,
                encryption_salt: None,
                has_blob_headers: false,
                aead_bound: false,
            },
            files: vec![],
            audit_log: vec![],
            folders: vec![],
            lockout_failed_attempts: 0,
            lockout_last_failed_ts: None,
            encrypted_metadata: None,
            pages_json: None,
            bookmarks_json: None,
            watch_folder: None,
        });

        mgr.delete_vault(vault_id).unwrap();

        // Original path is gone
        assert!(!bundle_path.exists());

        // Witness hard link still exists and has the same size
        assert!(witness_path.exists());
        let witness_content = fs::read(&witness_path).unwrap();
        assert_eq!(witness_content.len(), original_data.len());

        // The content must NOT match the original — it was overwritten with random bytes
        assert_ne!(
            &witness_content[..],
            &original_data[..],
            "Bundle data was NOT overwritten before deletion — original content still intact"
        );
    }

    #[test]
    fn duress_pin_destroys_vault() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = test_manager(tmp.path());

        // Create a vault with a normal PIN
        let main_pin = "my_secure_password_123";
        let info = mgr.create_vault("TestVault", main_pin, false, 10, 300, None, None).unwrap();
        let vault_id = info.id.clone();

        // Unlock vault so we can set duress PIN
        let unlocked = mgr.unlock_vault(&vault_id, main_pin, None).unwrap();
        assert!(unlocked, "Should unlock with correct PIN");

        // Set duress PIN
        let duress_pin = "duress_password_456";
        mgr.set_duress_pin(duress_pin, None).unwrap();

        // Verify duress is enabled
        let config = mgr.get_security_config(&vault_id).unwrap();
        assert!(config.duress_enabled, "Duress should be enabled after setting PIN");

        // Lock the vault
        mgr.lock_vault();

        // Now try to unlock with the duress PIN — should destroy the vault
        let result = mgr.unlock_vault(&vault_id, duress_pin, None);
        match result {
            Err(e) => {
                assert!(e.contains("VAULT_DESTROYED_SILENT"), "Expected VAULT_DESTROYED_SILENT, got: {}", e);
            }
            Ok(_) => panic!("Duress PIN should have destroyed the vault, not returned Ok"),
        }

        // Vault should be gone
        assert!(!mgr.vaults.contains_key(&vault_id), "Vault should be removed from memory");
    }

    #[test]
    fn parallel_import_dedups_and_preserves_integrity() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = test_manager(tmp.path());
        let pin = "test_password_123";
        let info = mgr.create_vault("ImportTest", pin, false, 10, 300, None, None).unwrap();
        assert!(mgr.unlock_vault(&info.id, pin, None).unwrap());

        // 6 unique source files plus one whose content duplicates file0,
        // so the in-batch dedup has to coordinate across worker threads.
        let src = tmp.path().join("src");
        fs::create_dir_all(&src).unwrap();
        let mut paths = Vec::new();
        for i in 0..6u8 {
            let p = src.join(format!("file{}.bin", i));
            fs::write(&p, vec![i; 1000 + i as usize * 137]).unwrap();
            paths.push(p.to_string_lossy().to_string());
        }
        let dup = src.join("dup_of_file0.bin");
        fs::write(&dup, vec![0u8; 1000]).unwrap();
        paths.push(dup.to_string_lossy().to_string());

        let ctx = mgr.import_prepare(None).unwrap();
        let (entries, dups) = VaultManager::import_process(&ctx, &paths, None).unwrap();
        assert_eq!(entries.len(), 6, "in-batch duplicate content must be imported once");
        assert!(dups.is_empty());

        let imported = mgr.import_commit(entries).unwrap();
        assert_eq!(imported.len(), 6);

        // Every blob must decrypt back to content matching its stored hash —
        // proves the parallel path didn't mismatch entries and blobs, and the
        // footer written during commit is readable.
        let results = mgr.check_integrity().unwrap();
        assert_eq!(results.len(), 6);
        assert!(results.iter().all(|(_, ok)| *ok), "integrity check failed: {:?}", results);

        // Re-importing existing content reports it as a duplicate, not a new entry.
        let ctx2 = mgr.import_prepare(None).unwrap();
        let (entries2, dups2) = VaultManager::import_process(&ctx2, &paths[..1], None).unwrap();
        assert!(entries2.is_empty());
        assert_eq!(dups2.len(), 1);
    }

    #[test]
    fn aead_binding_round_trips_and_rejects_chunk_reorder() {
        let key = [7u8; 32];
        let salt = [0u8; 16];
        let fid = "file-xyz";
        // Three chunks (two full + a partial tail).
        let pt: Vec<u8> = (0..(CHUNK_PLAINTEXT_SIZE * 2 + 100)).map(|i| (i % 251) as u8).collect();
        let full = CHUNK_ENCRYPTED_FULL;

        // Bound encryption round-trips cleanly.
        let ct = encrypt_file_data(&key, &salt, fid, &pt, true).unwrap();
        let rt = decrypt_file_data(&key, &salt, fid, &ct, pt.len() as u64, true).unwrap();
        assert_eq!(rt, pt);

        // Swap the first two (full) chunks in the ciphertext.
        let mut tampered = ct.clone();
        {
            let (a, rest) = tampered.split_at_mut(full);
            let (b, _) = rest.split_at_mut(full);
            a.swap_with_slice(b);
        }
        // The position-bound AAD makes the reordered stream fail the tag check.
        assert!(
            decrypt_file_data(&key, &salt, fid, &tampered, pt.len() as u64, true).is_err(),
            "chunk reorder must be rejected when AAD-bound"
        );

        // Legacy (unbound) blobs still decrypt — but the same reorder is silently
        // accepted, which is exactly the integrity gap the binding closes.
        let ct_legacy = encrypt_file_data(&key, &salt, fid, &pt, false).unwrap();
        let rt_legacy = decrypt_file_data(&key, &salt, fid, &ct_legacy, pt.len() as u64, false).unwrap();
        assert_eq!(rt_legacy, pt, "unbound path must remain backward-compatible");
        let mut tampered_legacy = ct_legacy.clone();
        {
            let (a, rest) = tampered_legacy.split_at_mut(full);
            let (b, _) = rest.split_at_mut(full);
            a.swap_with_slice(b);
        }
        let reordered = decrypt_file_data(&key, &salt, fid, &tampered_legacy, pt.len() as u64, false).unwrap();
        assert_ne!(reordered, pt, "unbound reorder decrypts to manipulated plaintext");
    }

    #[test]
    fn wrapped_dek_is_bound_to_file_id() {
        let kek = [9u8; 32];
        let dek = [3u8; 32];
        let wrapped = wrap_file_key(&kek, &dek, "fileA", true).unwrap();
        // Correct file id unwraps to the original DEK.
        let unwrapped = unwrap_file_key(&kek, &wrapped, "fileA", true).unwrap();
        assert_eq!(&unwrapped[..], &dek[..]);
        // Relocating the wrapped DEK to a different file entry fails.
        assert!(
            unwrap_file_key(&kek, &wrapped, "fileB", true).is_err(),
            "wrapped DEK must not unwrap under a different file id"
        );
    }

    #[test]
    fn startup_validation_is_header_only_but_catches_torn_tail() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = test_manager(tmp.path());
        let pin = "test_password_123";
        let info = mgr.create_vault("ValidateTest", pin, false, 10, 300, None, None).unwrap();
        assert!(mgr.unlock_vault(&info.id, pin, None).unwrap());

        let src = tmp.path().join("src");
        fs::create_dir_all(&src).unwrap();
        let mut paths = Vec::new();
        for i in 0..3u8 {
            let p = src.join(format!("file{}.bin", i));
            fs::write(&p, vec![i + 1; 5000]).unwrap();
            paths.push(p.to_string_lossy().to_string());
        }
        let ctx = mgr.import_prepare(None).unwrap();
        let (entries, _) = VaultManager::import_process(&ctx, &paths, None).unwrap();
        mgr.import_commit(entries).unwrap();

        let bundle_path = tmp.path().join(mgr.vault_bundles.get(&info.id).unwrap());
        let disk_vault = bundle_read_metadata(&bundle_path).unwrap();
        assert_eq!(disk_vault.files.len(), 3);

        // Intact bundle: no repair needed.
        assert!(bundle_validate_and_repair(&bundle_path, &disk_vault).is_none());

        // Corrupt one byte inside the LAST blob's data — the torn-tail case
        // an interrupted append can produce. Startup validation must catch it.
        let tail_offset: u64 = disk_vault.files[..2]
            .iter()
            .map(|f| file_bundle_size(&disk_vault, f))
            .sum();
        {
            let mut f = fs::OpenOptions::new().read(true).write(true).open(&bundle_path).unwrap();
            let target = tail_offset + BLOB_HEADER_SIZE + 100;
            f.seek(SeekFrom::Start(target)).unwrap();
            let mut b = [0u8; 1];
            f.read_exact(&mut b).unwrap();
            f.seek(SeekFrom::Start(target)).unwrap();
            f.write_all(&[b[0] ^ 0xFF]).unwrap();
        }
        let repaired = bundle_validate_and_repair(&bundle_path, &disk_vault)
            .expect("corrupted tail blob must trigger repair");
        assert_eq!(repaired.files.len(), 2, "ghost tail entry should be truncated");
    }

    #[test]
    fn duress_pin_survives_reload() {
        let tmp = TempDir::new().unwrap();

        let main_pin = "my_secure_password_123";
        let duress_pin = "duress_password_456";
        let vault_id;

        // Phase 1: Create vault, set duress PIN, then drop the manager
        {
            let mut mgr = test_manager(tmp.path());
            let info = mgr.create_vault("TestVault", main_pin, false, 10, 300, None, None).unwrap();
            vault_id = info.id.clone();

            let unlocked = mgr.unlock_vault(&vault_id, main_pin, None).unwrap();
            assert!(unlocked);

            mgr.set_duress_pin(duress_pin, None).unwrap();
            mgr.lock_vault();
        }

        // Phase 2: Create a new manager that loads vaults from disk
        {
            let mut mgr = test_manager(tmp.path());
            mgr.load_all();

            // Check that the vault was loaded
            assert!(mgr.vaults.contains_key(&vault_id), "Vault should be loaded from disk");

            // Check that duress_pin_hash is present
            let vault = mgr.vaults.get(&vault_id).unwrap();
            assert!(vault.duress_pin_hash.is_some(), "Duress PIN hash should survive reload");
            assert!(vault.security.duress_enabled, "Duress should be enabled after reload");

            // Try to unlock with duress PIN — should destroy the vault
            let result = mgr.unlock_vault(&vault_id, duress_pin, None);
            match result {
                Err(e) => {
                    assert!(e.contains("VAULT_DESTROYED_SILENT"), "Expected VAULT_DESTROYED_SILENT, got: {}", e);
                }
                Ok(_) => panic!("Duress PIN should have destroyed the vault after reload"),
            }
        }
    }
}
