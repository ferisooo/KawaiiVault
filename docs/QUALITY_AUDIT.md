# CyberVault — Code Quality Audit

Date: 2026-06-10 · Scope: full repository (Rust backend, React/TS frontend, build & repo config)

TypeScript compiles clean (`tsc --noEmit` passes, one deprecation warning). `cargo` could not be run in the audit environment (missing GTK system libraries), so Rust findings come from manual review.

---

## Critical

### 1. Decrypted thumbnails are persisted unencrypted in IndexedDB
`src/hooks/useThumbnails.ts:130-138, 216-221` · `src/utils/thumbnailDB.ts`

The vault encrypts all media with AES-256-GCM, but every generated thumbnail (including first-frame captures of videos) is written as a plaintext `Blob` into the WebView's IndexedDB (`cybervault_thumbnails` DB) where it survives app restarts. Cleanup only happens on explicit lock, only if the `clearVideoCacheOnLock` setting is enabled, and never after a crash or force-kill. For an app whose whole premise is encryption at rest, recognizable plaintext previews of vault content on disk largely defeat that promise.

**Fix:** encrypt cached thumbnails with a key derived from the vault KEK (or store them inside the bundle), or stop persisting them and keep the cache in-memory only.

### 2. Flipping `has_blob_headers` corrupts legacy bundles on next import
`src-tauri/src/vault.rs:2765` (`import_commit`), `:3457` (`restore_vault`), offsets computed in `file_bundle_size` (`:484-495`)

`has_blob_headers` is a single vault-wide flag, and `file_bundle_size` adds `BLOB_HEADER_SIZE` (16 bytes) to **every** file when it is set. A legacy vault migrated via `migrate_legacy_to_bundle` has blobs written **without** headers and the flag false. The first import into such a vault sets `vault.security.has_blob_headers = true` unconditionally, so every pre-existing blob's offset is now computed 16×N bytes off — reads of old files return garbage, and `bundle_validate_and_repair` will CRC-fail the first old blob on next startup and truncate the file list (data loss).

**Fix:** make the header flag per-file (e.g. derive from `wrapped_dek` presence or store per-entry), or rewrite the whole bundle with headers when upgrading the flag.

### 3. Rust test suite does not compile
`src-tauri/src/vault.rs:3653-3666, 3692-3701, 3765-3773`

`test_manager()` constructs `VaultManager` without the `is_pro` and `license_info` fields, and the `SecurityConfig` literals omit `has_blob_headers`. `cargo test` fails to build, so none of the (security-relevant!) tests — duress wipe, secure overwrite-before-delete — have run since those fields were added. This is also a symptom of CI never building the project (see #13).

---

## High

### 4. Journal recovery leaves ghost entries inside `encrypted_metadata`
`src-tauri/src/vault.rs:946-995` (recovery) vs `:2216-2235` (unlock restore)

Crash recovery truncates the **redacted** footer's `files` list and the blob section, but leaves the `encrypted_metadata` blob untouched. If the crash happened after the new footer was written (the footer write is the last step of `bundle_append_blobs`), that blob still contains the rolled-back file entries. On unlock, `vault.files = sensitive.files` restores the ghost entries whose blobs no longer exist — shifting every subsequent file's computed offset and corrupting reads. Additionally, if the crash corrupted the footer itself, `bundle_read_metadata` fails and the journal is deleted anyway (`:988`), leaving a permanently broken bundle with no retry.

**Fix:** after truncating, decrypt/strip the recovered entries from `encrypted_metadata` too (or drop the blob and force the redacted list to be authoritative), and don't delete the journal when recovery failed.

### 5. `save_vault` swallows all errors
`src-tauri/src/vault.rs:1735, 1743` — `let _ = bundle_save_metadata(...)`

Every metadata save (imports, favorites, folder moves, security-config changes, lockout counters) ignores write failures. On a full disk or permission error the user gets a "success" UI while nothing was persisted; changes silently vanish on relock. The encryption fallback path is worse: if `encrypt_sensitive_metadata` fails, the code falls through to writing the **plaintext** footer with no warning.

**Fix:** return `Result` from `save_vault` and propagate it to commands; never silently fall back from encrypted to plaintext metadata.

### 6. Document "lock" stores the raw PIN in plaintext; note locks use unsalted SHA-256
`src/components/PageCategories.tsx:2307` (`lockHash: lockInput` — no hashing at all), `:2310, 2315` (plaintext comparison); notes at `:192` hash with bare SHA-256; UI label at `:1794` claims "PIN hashed with SHA-256".

The doc-lock PIN is stored verbatim in a field named `lockHash` and round-trips through `pages_json`. These UI locks are inside the encrypted bundle so the at-rest exposure is bounded, but the field is misnamed, the UI claim is false for documents, and unsalted SHA-256 of a short PIN is trivially reversible anyway.

**Fix:** hash both with the same salted scheme (or reuse the backend's Argon2id via a command), and fix the label.

### 7. Whole-file buffering throughout import/export/read paths
`src-tauri/src/vault.rs:2685` (`fs::read` whole source file), `:1199` (whole blob into RAM), `lib.rs` `get_file_content` base64-encodes the entire file for IPC.

Importing a 1 GB video holds plaintext + encrypted copies (~2 GB+) in RAM simultaneously; an import batch holds **all** blobs in `Vec<(VaultFile, Vec<u8>)>` until commit. `check_integrity` and `bundle_validate_and_repair` (startup, `:1095`) also read every blob fully — startup time and memory scale with total vault size. Chunked AES-GCM already exists; the I/O around it isn't chunked.

**Fix:** stream encrypt/append per chunk (the 64 KB chunk format supports this), cap per-batch buffered bytes, and CRC-validate lazily or incrementally rather than full-bundle-at-boot.

---

## Medium

### 8. Dead licensing system still wired everywhere
`src-tauri/src/lib.rs:575-708` (Gumroad HTTP validation), `vault.rs:22-40, 1492-1580`, `src/hooks/useLicense.ts`, plus `is_pro` gates (`vault.rs:2405, 2419, 3515`) that can never fire since `is_pro` is hardcoded `true` in both Rust and TS ("app is fully free"). ~400 lines of reachable-but-pointless code, including a live network call that posts license keys to `api.gumroad.com`, and a `reqwest` dependency kept only for it. Either delete the subsystem or isolate it behind a feature flag.

### 9. Fake/misleading UX artifacts
- `src/components/PageCategories.tsx:2322-2327` — "share link" generates a `cybervault://share/...` URL with a `Math.random()` token that no handler implements; the link does nothing and implies a sharing capability that doesn't exist.
- `src/App.tsx:336-346` — when `performance.memory` is unavailable, DiagBot fabricates memory readings (`usedMB = 50 + Math.random() * 30; // demo approximation`) and presents them as real diagnostics.

### 10. God components / monolithic frontend
`src/components/PageCategories.tsx` (3,763 lines, 85 `useState`), `src/App.tsx` (2,178 lines, 33 `useState`), `src/components/SettingsPanel.tsx` (1,962 lines). The "store" (`src/stores/useStore.ts`) is a plain `useState` hook instantiated once in `App`, so every keystroke/notification re-renders the whole tree, and ~50 props are drilled down. A real store (Zustand is already the naming convention) with selectors would cut both the re-render cost and the prop plumbing. Roughly a dozen `cybervault_*` localStorage settings keys are read/written ad hoc across files (`App.tsx:96-131`, `useLicense.ts:43-52`) — centralize in one typed settings module.

### 11. Windows ACL hardening can lock the user out / has a fragile two-step
`src-tauri/src/vault.rs:750-767` — `icacls /inheritance:r /grant:r SYSTEM:...` removes the user's access first; the user's own grant happens in a *second* `icacls` call that depends on `%USERNAME%` and is silently ignored on failure. If step 2 fails, the vault directory becomes inaccessible to the app itself. Do it in one `icacls` invocation with both grants.

### 12. `transfer_vault` deletes the old directory without verifying the copy
`src-tauri/src/vault.rs:3527-3564` — errors from `read_dir` are ignored (`if let Ok`), then `fs::remove_dir_all(&old_path)` runs unconditionally after reload. A partially failed copy (or an empty `read_dir` due to permissions) still deletes the source. Verify the new location loads the same vault IDs/file counts before removing the old one.

### 13. No CI, no lint, no working tests
The only workflow (`.github/workflows/sync-to-new.yml`) force-syncs branches; nothing ever runs `tsc`, `cargo check`, or tests (which wouldn't compile, see #3). There is no ESLint config and no `test`/`lint` script in `package.json`. Add a CI job: `tsc --noEmit`, `cargo clippy -D warnings`, `cargo test`.

### 14. Frontend production build is obfuscated
`vite.config.ts` runs `rollup-obfuscator` (hex identifiers, base64 string array) on every build, and the Rust release profile uses `strip + panic="abort"` plus runtime anti-debug `process::exit` (`lib.rs:1083-1097`). Combined, field failures are nearly undiagnosable, and JS obfuscation adds parse/startup cost for negligible protection (the crypto is in Rust anyway). Recommend dropping JS obfuscation; keep `obfstr` in Rust if desired.

---

## Low

- **`svg` served as `text/plain` but categorized as "Images"** (`vault.rs:348, 697`) — SVGs imported as images will never render as thumbnails/previews; either render safely (sandboxed `<img>` is already script-inert) or exclude SVG from the Images category.
- **`ProtectedMemory` is mostly theater** (`vault.rs:137-168`): XOR-masking with the mask stored adjacent adds no real protection; `reveal()` copies the secret to unprotected heap on every use; `mlock` covers only `masked_data`, not the mask or revealed copies. Fine to keep, but don't rely on it.
- **`Access-Control-Allow-Origin: *` on the `cvlt:` protocol** (`lib.rs:811` etc.) — any origin loaded in any webview of the app can fetch decrypted vault bytes while unlocked. CSP makes exploitation unlikely; still, echo only the app origin.
- **CSP allows Google Fonts** (`tauri.conf.json`) — a privacy-focused vault should bundle fonts instead of calling `fonts.googleapis.com`.
- **Stealth mode flag is plaintext localStorage** (`cybervault_stealth_mode`) — trivially discoverable, which undercuts the feature's threat model.
- **`useTauri()` rebuilds its ~50-method object every render** (`src/hooks/useTauri.ts:37`) — wrap in `useMemo` or move to module scope; it's stateless.
- **tsconfig `baseUrl` deprecation (TS5101)** — will break on TypeScript 7; switch to `paths`-relative config now.
- **Repo hygiene** — `cybervault tools.zip` (zipped release scripts) and `fresh-clone.bat` (a local helper referencing a user-specific path) don't belong at the repo root; unzip the scripts into `tools/` under version control and drop the zip/bat.
- **3 stray `console.warn/error`** including `useTauri.ts:26` which logs every failed command (fine, but it fires for expected browser-dev fallbacks too).

---

## What's in good shape

The core crypto design is sound and clearly had real thought put into it: Argon2id with OWASP parameters (and constant-time legacy-hash fallback), AES-256-GCM with fresh random nonces per 64 KB chunk, per-file DEKs wrapped by the vault KEK enabling instant cryptographic erasure, sensitive metadata encrypted at rest with a redacted on-disk footer, a rollback journal + CRC blob headers for crash safety, and random-overwrite before vault deletion (with a clever hard-link unit test for it). The three-phase import and the `with_vm`/spawn-blocking pattern show careful attention to never blocking the UI thread on the vault mutex, and path-traversal handling (`safe_basename`, `validate_display_name`, URL/path validation before shelling out) is consistently applied. The weaknesses are at the edges: persistence of derived plaintext (thumbnails), migration-path consistency (`has_blob_headers`, journal vs encrypted metadata), swallowed errors, and the absence of any CI to catch the now-broken tests.
