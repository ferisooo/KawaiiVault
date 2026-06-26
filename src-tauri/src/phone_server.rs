// ── Phone Access: hardened LAN companion server ──
//
// Serves a read-only, touch-friendly view of the UNLOCKED vault to a phone on
// the same network. Decryption happens here on the PC (the only place the keys
// exist); the phone just receives the decrypted stream over TLS.
//
// Security posture (off by default, opt-in only):
//   • HTTPS/TLS for ALL traffic via a per-session self-signed cert (rustls with
//     the ring provider + rcgen — pure Rust, builds on stock Windows with no
//     OpenSSL or nasm). File bytes, thumbnails, and cookies are encrypted in
//     transit, so a sniffer on the network sees only ciphertext.
//   • Challenge-response login on top of TLS: the server hands out a one-time
//     nonce and the phone returns SHA-256(nonce ":" password). The access
//     password itself is never transmitted. Constant-time checked, with
//     exponential brute-force lockout.
//   • Separate access password (NOT the vault PIN).
//   • Cookie session tokens (HttpOnly, Secure, SameSite=Strict), sliding 20 min
//     expiry, random 256-bit.
//   • DNS-rebinding defense: the Host header must be a bare IP literal.
//   • Read-only: no command can mutate the vault through this surface.
//   • Cache-Control: no-store on every response so the phone browser doesn't
//     persist decrypted media.
//   • Auto-stops when the vault locks (manual / auto / watchdog) and refuses to
//     start unless a vault is unlocked.
//
// The cert is self-signed (no public CA for a private LAN IP), so the phone
// shows a one-time "not private" warning the user accepts. This widens the
// app's attack surface by design; it is never on unless the user enables it.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use rand::rngs::OsRng;
use rand::RngCore;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::AppState;

// ── Minimal request/response types over a TLS stream ──

struct Req {
    method: String,
    path: String,
    query: String,
    headers: Vec<(String, String)>, // header names lowercased
    body: Vec<u8>,
}

impl Req {
    fn header(&self, name: &str) -> Option<&str> {
        let n = name.to_ascii_lowercase();
        self.headers.iter().find(|(k, _)| *k == n).map(|(_, v)| v.as_str())
    }
}

struct Resp {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Resp {
    fn json(status: u16, body: String) -> Resp {
        Resp { status, headers: vec![("Content-Type".into(), "application/json".into())], body: body.into_bytes() }
    }
    fn bytes(status: u16, content_type: &str, body: Vec<u8>) -> Resp {
        Resp { status, headers: vec![("Content-Type".into(), content_type.to_string())], body }
    }
    fn empty(status: u16) -> Resp {
        Resp { status, headers: Vec::new(), body: Vec::new() }
    }
    fn header(mut self, k: &str, v: &str) -> Resp {
        self.headers.push((k.to_string(), v.to_string()));
        self
    }
}

const SESSION_TTL: Duration = Duration::from_secs(20 * 60);
const CHALLENGE_TTL: Duration = Duration::from_secs(120);
const MIN_PASSWORD_LEN: usize = 12;
const MAX_LOGIN_FAILS: u32 = 5;
/// Upper bound on outstanding (unconsumed, unexpired) login nonces. Without a
/// cap, an unauthenticated client on the LAN could spam GET /challenge and grow
/// the map without bound. 4096 is far more than any legitimate login flow needs.
const MAX_CHALLENGES: usize = 4096;
/// Iteration count for stretching the login proof. The phone hashes
/// SHA-256(nonce ":" password) once, then re-hashes the resulting hex string
/// this many times; the server mirrors it. Cost is trivial for one interactive
/// login but multiplies the work of an offline brute-force against a proof
/// captured via a MITM'd self-signed TLS session.
const PROOF_ITERATIONS: u32 = 100_000;

struct Sessions {
    tokens: HashMap<String, Instant>, // token -> expiry
}

/// Per-client failed-login state.
struct LockoutEntry {
    fails: u32,
    locked_until: Option<Instant>,
}

/// Brute-force lockout is tracked PER CLIENT IP, not globally. A global counter
/// let any device on the LAN lock out the legitimate phone by failing a few
/// logins; keying on the source address contains a bad/hostile client to itself.
struct Lockout {
    by_ip: HashMap<IpAddr, LockoutEntry>,
}

/// Upper bound on tracked client IPs, so a source-spoofing flood can't grow the
/// map without bound. Expired (unlocked) entries are pruned first.
const MAX_LOCKOUT_IPS: usize = 2048;

struct Shared {
    app: tauri::AppHandle,
    password: Vec<u8>,
    sessions: Mutex<Sessions>,
    lockout: Mutex<Lockout>,
    /// One-time login nonces (nonce -> expiry) for challenge-response auth, so
    /// the access password is never transmitted, even over plain HTTP.
    challenges: Mutex<HashMap<String, Instant>>,
}

pub struct PhoneServerHandle {
    pub port: u16,
    pub lan_ip: String,
    /// SHA-256 fingerprint of the session's self-signed TLS certificate,
    /// formatted as colon-separated uppercase hex. Shown in the PC UI so the
    /// user can compare it against what the phone's browser reports and detect
    /// a man-in-the-middle that swapped in its own certificate.
    pub cert_fingerprint: String,
    stop: Arc<AtomicBool>,
    workers: Vec<JoinHandle<()>>,
}

impl PhoneServerHandle {
    /// Signal the workers to stop and wait for them to drain.
    pub fn stop(self) {
        self.stop.store(true, Ordering::SeqCst);
        for w in self.workers {
            let _ = w.join();
        }
    }
}

/// Best-effort primary LAN IPv4: open a UDP socket "toward" a public address
/// (no packets are actually sent) and read back the source IP the OS picks.
fn detect_lan_ip() -> Option<String> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    let addr = sock.local_addr().ok()?;
    match addr.ip() {
        IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
        _ => None,
    }
}

/// Constant-time byte comparison (avoids password timing leaks).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Generate a self-signed cert + key (DER) valid for the given IP using rcgen
/// (pure Rust, ring backend — builds on stock Windows/macOS/Linux with no
/// OpenSSL or nasm). Lives only for this server session.
fn gen_cert(ip: &str) -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), String> {
    let certified = rcgen::generate_simple_self_signed(vec![ip.to_string()])
        .map_err(|e| format!("cert generation failed: {}", e))?;
    let cert_der = certified.cert.der().clone();
    let key_der = PrivatePkcs8KeyDer::from(certified.key_pair.serialize_der());
    Ok((cert_der, PrivateKeyDer::Pkcs8(key_der)))
}

/// Start the phone-access server. Requires a vault to already be unlocked.
pub fn start(app: tauri::AppHandle, access_password: String) -> Result<PhoneServerHandle, String> {
    if access_password.len() < MIN_PASSWORD_LEN {
        return Err(format!("Access password must be at least {} characters", MIN_PASSWORD_LEN));
    }
    // Refuse unless a vault is unlocked (nothing to serve otherwise).
    {
        let state = app.state::<AppState>();
        let vm = state.vault_manager.lock().map_err(|e| e.to_string())?;
        if !vm.is_unlocked() {
            return Err("Unlock a vault before enabling phone access".to_string());
        }
    }

    let lan_ip = detect_lan_ip().ok_or("Could not determine this PC's LAN IP address")?;

    // Build the TLS config (self-signed, ring provider).
    let (cert_der, key_der) = gen_cert(&lan_ip)?;

    // Fingerprint the cert so the PC UI can show it for out-of-band comparison
    // against the phone's browser certificate dialog (MITM detection).
    let cert_fingerprint = {
        let digest = Sha256::digest(cert_der.as_ref());
        digest
            .iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(":")
    };

    let provider = rustls::crypto::ring::default_provider();
    let mut tls_config = ServerConfig::builder_with_provider(Arc::new(provider))
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("TLS protocol setup failed: {}", e))?
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)
        .map_err(|e| format!("TLS cert setup failed: {}", e))?;
    // Advertise ONLY HTTP/1.1 via ALPN. This is a hand-rolled HTTP/1.1 server;
    // without an explicit ALPN, an HTTP/2-capable browser can attempt h2 and
    // then reject our HTTP/1.1 reply with ERR_INVALID_HTTP_RESPONSE. Pinning
    // http/1.1 makes every modern browser speak HTTP/1.1 to us.
    tls_config.alpn_protocols = vec![b"http/1.1".to_vec()];
    let tls_config = Arc::new(tls_config);

    // Bind a random high port — ONLY on the detected LAN interface, not
    // 0.0.0.0. This keeps the server off every other interface the host may
    // have (VPNs, virtual adapters, secondary NICs) and narrows exposure to
    // the one subnet the phone is actually on.
    let mut listener: Option<TcpListener> = None;
    let mut chosen_port = 0u16;
    for _ in 0..8 {
        let port = 49152 + (OsRng.next_u32() % 16000) as u16;
        if let Ok(l) = TcpListener::bind((lan_ip.as_str(), port)) {
            if l.set_nonblocking(true).is_ok() {
                listener = Some(l);
                chosen_port = port;
                break;
            }
        }
    }
    let listener = listener.ok_or("Could not bind a local port for phone access")?;

    let shared = Arc::new(Shared {
        app: app.clone(),
        password: access_password.into_bytes(),
        sessions: Mutex::new(Sessions { tokens: HashMap::new() }),
        lockout: Mutex::new(Lockout { by_ip: HashMap::new() }),
        challenges: Mutex::new(HashMap::new()),
    });

    let stop = Arc::new(AtomicBool::new(false));

    // Single accept thread; each accepted connection is handled on its own
    // short-lived thread (one request per connection, then close).
    let acceptor = {
        let shared = Arc::clone(&shared);
        let stop = Arc::clone(&stop);
        let tls_config = Arc::clone(&tls_config);
        std::thread::spawn(move || {
            loop {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                match listener.accept() {
                    Ok((tcp, _)) => {
                        let shared = Arc::clone(&shared);
                        let tls_config = Arc::clone(&tls_config);
                        std::thread::spawn(move || serve_conn(tcp, tls_config, shared));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(50)),
                }
            }
        })
    };

    Ok(PhoneServerHandle { port: chosen_port, lan_ip, cert_fingerprint, stop, workers: vec![acceptor] })
}

// ── Connection / HTTP plumbing over the TLS stream ──

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Read and parse one HTTP/1.1 request from a stream.
fn read_request(stream: &mut impl Read) -> Option<Req> {
    let mut buf: Vec<u8> = Vec::with_capacity(2048);
    let mut tmp = [0u8; 8192];
    let header_end;
    loop {
        let n = stream.read(&mut tmp).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if buf.len() > 64 * 1024 {
            return None; // header block too large
        }
    }

    let mut headers = [httparse::EMPTY_HEADER; 64];
    let mut preq = httparse::Request::new(&mut headers);
    let parsed = preq.parse(&buf[..header_end]).ok()?;
    if !parsed.is_complete() {
        return None;
    }
    let method = preq.method?.to_string();
    let target = preq.path?.to_string();
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target, String::new()),
    };

    let mut hdrs = Vec::new();
    let mut content_length = 0usize;
    for h in preq.headers.iter() {
        let name = h.name.to_ascii_lowercase();
        let val = String::from_utf8_lossy(h.value).to_string();
        if name == "content-length" {
            content_length = val.trim().parse().unwrap_or(0);
        }
        hdrs.push((name, val));
    }
    content_length = content_length.min(1024 * 1024); // cap request body at 1 MB

    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        let n = stream.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    body.truncate(content_length);

    Some(Req { method, path, query, headers: hdrs, body })
}

fn write_response(stream: &mut impl Write, resp: &Resp) {
    let reason = match resp.status {
        200 => "OK",
        206 => "Partial Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    };
    let mut head = format!("HTTP/1.1 {} {}\r\n", resp.status, reason);
    head.push_str(&format!("Content-Length: {}\r\n", resp.body.len()));
    head.push_str("Cache-Control: no-store\r\n");
    head.push_str("X-Content-Type-Options: nosniff\r\n");
    head.push_str("Connection: close\r\n");
    for (k, v) in &resp.headers {
        head.push_str(&format!("{}: {}\r\n", k, v));
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&resp.body);
    let _ = stream.flush();
}

fn serve_conn(mut tcp: TcpStream, config: Arc<ServerConfig>, shared: Arc<Shared>) {
    // Accepted sockets inherit the listener's non-blocking flag on some
    // platforms — force blocking mode so read/write timeouts apply.
    let _ = tcp.set_nonblocking(false);
    let _ = tcp.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = tcp.set_write_timeout(Some(Duration::from_secs(30)));

    // Source address for per-client brute-force lockout.
    let client_ip = tcp.peer_addr().map(|a| a.ip()).unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));

    let mut conn = match rustls::ServerConnection::new(config) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut tls = rustls::Stream::new(&mut conn, &mut tcp);

    if let Some(req) = read_request(&mut tls) {
        let resp = route(&req, &shared, client_ip);
        write_response(&mut tls, &resp);
    }
}

// ── Routing + handlers (all return Resp) ──

/// Reject requests whose Host is not a bare IP literal (DNS-rebinding defense).
fn host_is_ip(req: &Req) -> bool {
    match req.header("host") {
        Some(h) => {
            let host = h.rsplit_once(':').map(|(a, _)| a).unwrap_or(h);
            host.parse::<IpAddr>().is_ok()
        }
        None => false,
    }
}

fn session_token(req: &Req) -> Option<String> {
    let cookie = req.header("cookie")?;
    for part in cookie.split(';') {
        let part = part.trim();
        if let Some(tok) = part.strip_prefix("cvsession=") {
            return Some(tok.to_string());
        }
    }
    None
}

fn is_authed(req: &Req, shared: &Shared) -> bool {
    let Some(tok) = session_token(req) else { return false };
    let mut s = match shared.sessions.lock() {
        Ok(s) => s,
        Err(_) => return false,
    };
    match s.tokens.get(&tok).copied() {
        Some(exp) if exp > Instant::now() => {
            s.tokens.insert(tok, Instant::now() + SESSION_TTL); // sliding
            true
        }
        _ => false,
    }
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn route(req: &Req, shared: &Shared, client_ip: IpAddr) -> Resp {
    // DNS-rebinding guard on every request.
    if !host_is_ip(req) {
        return Resp::json(403, "{\"error\":\"forbidden host\"}".into());
    }

    let get = req.method.eq_ignore_ascii_case("GET");
    let post = req.method.eq_ignore_ascii_case("POST");

    // Public routes: the app shell, the challenge, and the login endpoint.
    if req.path == "/" && get {
        return Resp::bytes(200, "text/html; charset=utf-8", MOBILE_HTML.as_bytes().to_vec());
    }
    if req.path == "/challenge" && get {
        let nonce = random_token();
        if let Ok(mut c) = shared.challenges.lock() {
            let now = Instant::now();
            c.retain(|_, exp| *exp > now);
            // Bounded so an unauthenticated flood of /challenge can't grow the
            // map without limit. Once full, refuse new nonces until live ones
            // expire or are consumed by a login.
            if c.len() >= MAX_CHALLENGES {
                return Resp::json(503, "{\"error\":\"too many pending challenges\"}".into());
            }
            c.insert(nonce.clone(), now + CHALLENGE_TTL);
        }
        return Resp::json(200, format!("{{\"nonce\":\"{}\"}}", nonce));
    }
    if req.path == "/login" && post {
        return handle_login(req, shared, client_ip);
    }

    // Everything below requires a valid session.
    if !is_authed(req, shared) {
        return Resp::json(401, "{\"error\":\"unauthorized\"}".into());
    }

    if req.path == "/logout" && post {
        if let Some(tok) = session_token(req) {
            if let Ok(mut s) = shared.sessions.lock() {
                s.tokens.remove(&tok);
            }
        }
        return Resp::json(200, "{\"ok\":true}".into());
    }
    if req.path == "/api/files" && get {
        return handle_files(shared);
    }
    if let Some(id) = req.path.strip_prefix("/thumb/") {
        return handle_thumb(shared, id, &req.query);
    }
    if let Some(id) = req.path.strip_prefix("/file/") {
        return handle_file(req, shared, id);
    }
    Resp::json(404, "{\"error\":\"not found\"}".into())
}

fn handle_login(req: &Req, shared: &Shared, client_ip: IpAddr) -> Resp {
    // Brute-force lockout — scoped to THIS client IP, so one bad/hostile device
    // on the LAN can't lock out the legitimate phone.
    {
        let l = shared.lockout.lock().unwrap();
        if let Some(entry) = l.by_ip.get(&client_ip) {
            if let Some(until) = entry.locked_until {
                if until > Instant::now() {
                    let secs = (until - Instant::now()).as_secs() + 1;
                    return Resp::json(429, format!("{{\"error\":\"locked\",\"retry\":{}}}", secs));
                }
            }
        }
    }

    let parsed = serde_json::from_slice::<serde_json::Value>(&req.body).ok();
    let nonce = parsed.as_ref().and_then(|v| v.get("nonce").and_then(|p| p.as_str())).unwrap_or("").to_string();
    let proof = parsed.as_ref().and_then(|v| v.get("proof").and_then(|p| p.as_str())).unwrap_or("").to_string();

    // Validate + consume the one-time nonce (single use, unexpired).
    let nonce_ok = match shared.challenges.lock() {
        Ok(mut c) => match c.remove(&nonce) {
            Some(exp) => exp > Instant::now(),
            None => false,
        },
        Err(_) => false,
    };

    // Expected proof: hex(SHA-256(nonce ":" password)), then re-hash the
    // resulting lowercase-hex string PROOF_ITERATIONS times. The phone computes
    // the identical chain in JS, so the access password is never transmitted
    // and a captured proof is far more expensive to brute-force offline.
    let expected = {
        let mut h = Sha256::new();
        h.update(nonce.as_bytes());
        h.update(b":");
        h.update(&shared.password);
        let mut proof = hex::encode(h.finalize());
        for _ in 0..PROOF_ITERATIONS {
            proof = hex::encode(Sha256::digest(proof.as_bytes()));
        }
        proof
    };

    if nonce_ok && ct_eq(proof.as_bytes(), expected.as_bytes()) {
        {
            let mut l = shared.lockout.lock().unwrap();
            l.by_ip.remove(&client_ip);
        }
        let token = random_token();
        if let Ok(mut s) = shared.sessions.lock() {
            s.tokens.insert(token.clone(), Instant::now() + SESSION_TTL);
        }
        // Secure attribute is valid now that the transport is HTTPS.
        let cookie = format!(
            "cvsession={}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age={}",
            token,
            SESSION_TTL.as_secs()
        );
        Resp::json(200, "{\"ok\":true}".into()).header("Set-Cookie", &cookie)
    } else {
        let mut l = shared.lockout.lock().unwrap();
        let now = Instant::now();
        // Bound the map: if it's at capacity, drop entries that are no longer
        // locked before inserting a new one.
        if l.by_ip.len() >= MAX_LOCKOUT_IPS && !l.by_ip.contains_key(&client_ip) {
            l.by_ip.retain(|_, e| e.locked_until.map_or(false, |u| u > now));
        }
        let entry = l.by_ip.entry(client_ip).or_insert(LockoutEntry { fails: 0, locked_until: None });
        entry.fails += 1;
        if entry.fails >= MAX_LOGIN_FAILS {
            let over = entry.fails - MAX_LOGIN_FAILS;
            let secs = (30u64 << over.min(5)).min(900);
            entry.locked_until = Some(now + Duration::from_secs(secs));
            entry.fails = MAX_LOGIN_FAILS;
        }
        Resp::json(401, "{\"error\":\"wrong password\"}".into())
    }
}

fn handle_files(shared: &Shared) -> Resp {
    let state = shared.app.state::<AppState>();
    let files = {
        let vm = match state.vault_manager.lock() {
            Ok(vm) => vm,
            Err(_) => return Resp::json(503, "{\"error\":\"busy\"}".into()),
        };
        vm.get_files(None, None, Some("date".into()), false, None)
    };
    match files {
        Ok(list) => {
            let items: Vec<serde_json::Value> = list
                .iter()
                .map(|f| serde_json::json!({
                    "id": f.id,
                    "name": f.name,
                    "category": f.category,
                    "type": f.file_type,
                    "size": f.size,
                    "favorite": f.favorite,
                    "date": f.imported_at,
                }))
                .collect();
            Resp::json(200, serde_json::json!({ "files": items }).to_string())
        }
        Err(e) => {
            let code = if e.contains("No vault unlocked") { 503 } else { 500 };
            Resp::json(code, format!("{{\"error\":{:?}}}", e))
        }
    }
}

fn handle_thumb(shared: &Shared, id: &str, query: &str) -> Resp {
    let size: u32 = query_param(query, "s").and_then(|s| s.parse().ok()).unwrap_or(256).clamp(64, 512);
    let state = shared.app.state::<AppState>();
    let info = {
        let vm = match state.vault_manager.lock() { Ok(vm) => vm, Err(_) => return Resp::empty(503) };
        vm.get_file_stream_info(id)
    };
    let Ok(info) = info else { return Resp::empty(404) };
    match crate::generate_thumbnail(&info, size) {
        Ok(bytes) => Resp::bytes(200, "image/webp", bytes),
        Err(_) => Resp::empty(500),
    }
}

/// Stream a file, honoring a single Range request (needed for phone video).
fn handle_file(req: &Req, shared: &Shared, id: &str) -> Resp {
    use std::io::{Seek, SeekFrom};

    let range_hdr = req.header("range").map(|s| s.to_string());

    let state = shared.app.state::<AppState>();
    let info = {
        let vm = match state.vault_manager.lock() { Ok(vm) => vm, Err(_) => return Resp::empty(503) };
        vm.get_file_stream_info(id)
    };
    let Ok(info) = info else { return Resp::empty(404) };

    let total = info.total_size;
    let is_encrypted = info.encryption_key.is_some();

    let mut file = match std::fs::File::open(&info.bundle_path) {
        Ok(f) => f,
        Err(_) => return Resp::empty(500),
    };

    let parse_range = |h: &str| -> Option<(u64, u64)> {
        let spec = h.strip_prefix("bytes=")?;
        let (s, e) = spec.split_once('-')?;
        let start: u64 = s.trim().parse().ok()?;
        let end: u64 = if e.trim().is_empty() { total.saturating_sub(1) } else { e.trim().parse().ok()? };
        if start > end || start >= total { return None; }
        Some((start, end.min(total.saturating_sub(1))))
    };

    if let Some((start, end)) = range_hdr.as_deref().and_then(parse_range) {
        const MAX_CHUNK: u64 = 2 * 1024 * 1024; // 2 MB per range response
        let end = end.min(start + MAX_CHUNK - 1).min(total.saturating_sub(1));
        let len = end + 1 - start;
        let data = if is_encrypted {
            crate::read_decrypted_range(
                &mut file, info.offset_in_bundle,
                info.encryption_key.as_ref().unwrap(), info.encryption_salt.as_ref().unwrap(),
                &info.file_id, total, start, len, info.aead_bound,
            )
        } else {
            let mut buf = vec![0u8; len as usize];
            file.seek(SeekFrom::Start(info.offset_in_bundle + start))
                .and_then(|_| std::io::Read::read_exact(&mut file, &mut buf))
                .map(|_| buf)
                .map_err(|e| e.to_string())
        };
        match data {
            Ok(bytes) => Resp::bytes(206, &info.mime_type, bytes)
                .header("Accept-Ranges", "bytes")
                .header("Content-Range", &format!("bytes {}-{}/{}", start, end, total)),
            Err(_) => Resp::empty(500),
        }
    } else {
        let data = if is_encrypted {
            let enc_size = crate::encrypted_bundle_size(total);
            let mut enc = vec![0u8; enc_size as usize];
            if file.seek(SeekFrom::Start(info.offset_in_bundle)).is_err()
                || std::io::Read::read_exact(&mut file, &mut enc).is_err() {
                return Resp::empty(500);
            }
            crate::decrypt_file_data(info.encryption_key.as_ref().unwrap(), info.encryption_salt.as_ref().unwrap(), &info.file_id, &enc, total, info.aead_bound)
        } else {
            let mut buf = vec![0u8; total as usize];
            file.seek(SeekFrom::Start(info.offset_in_bundle))
                .and_then(|_| std::io::Read::read_exact(&mut file, &mut buf))
                .map(|_| buf)
                .map_err(|e| e.to_string())
        };
        match data {
            Ok(bytes) => Resp::bytes(200, &info.mime_type, bytes).header("Accept-Ranges", "bytes"),
            Err(_) => Resp::empty(500),
        }
    }
}

// ── Embedded mobile web UI (no IPC, plain fetch) ──
const MOBILE_HTML: &str = r#"<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="referrer" content="no-referrer"/>
<title>Kawaii Vault</title>
<style>
  :root { --bg:#0a0a0f; --panel:#15151f; --line:#2a2a3a; --neon:#ff003c; --txt:#e8e8f0; --muted:#7a7a8a;
          --safe-t:env(safe-area-inset-top,0px); --safe-b:env(safe-area-inset-bottom,0px); }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:var(--bg); color:var(--txt); font-family:system-ui,sans-serif; }
  header { position:sticky; top:0; padding:calc(10px + var(--safe-t)) 14px 10px; background:rgba(10,10,15,.94); border-bottom:1px solid var(--line); backdrop-filter:blur(8px); z-index:5; }
  .hrow { display:flex; gap:8px; align-items:center; }
  header b { color:var(--neon); letter-spacing:.15em; font-size:15px; }
  header input { flex:1; background:#000; border:1px solid var(--line); color:var(--txt); border-radius:8px; padding:9px 12px; font-size:16px; }
  header button { background:transparent; border:1px solid var(--line); color:var(--muted); border-radius:8px; padding:9px 12px; font-size:14px; }
  .chips { display:flex; gap:6px; margin-top:8px; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding-bottom:2px; }
  .chips::-webkit-scrollbar { display:none; }
  .chip { flex:0 0 auto; text-align:center; background:transparent; border:1px solid var(--line); color:var(--muted); border-radius:8px; padding:7px 14px; font-size:14px; white-space:nowrap; }
  .chip.on { background:rgba(255,0,60,.16); border-color:var(--neon); color:#ff6680; }
  .sortbar { display:flex; gap:6px; align-items:center; margin-top:8px; }
  .sortbar label { font-size:12px; color:var(--muted); letter-spacing:.05em; text-transform:uppercase; }
  .sortbar select { flex:1; background:#000; border:1px solid var(--line); color:var(--txt); border-radius:8px; padding:8px 10px; font-size:15px; }
  .sortbar .dir { background:transparent; border:1px solid var(--line); color:var(--muted); border-radius:8px; padding:8px 13px; font-size:15px; line-height:1; }
  #login { max-width:340px; margin:18vh auto 0; padding:24px; text-align:center; }
  #login h1 { color:var(--neon); letter-spacing:.2em; font-size:20px; }
  #login input { width:100%; background:#000; border:1px solid var(--line); color:var(--txt); border-radius:10px; padding:13px; font-size:17px; margin:14px 0; }
  #login button { width:100%; background:var(--neon); color:#fff; border:none; border-radius:10px; padding:13px; font-size:16px; font-weight:600; }
  #err { color:#ff6680; font-size:14px; min-height:20px; }
  #grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); gap:6px; padding:6px; }
  .cell { position:relative; aspect-ratio:1; background:var(--panel); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .cell img { width:100%; height:100%; object-fit:cover; display:block; }
  .cell .ph { display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted); font-size:30px; }
  .cell .badge { position:absolute; top:4px; right:4px; font-size:11px; background:rgba(0,0,0,.6); border-radius:5px; padding:1px 4px; }
  .cell .tag { position:absolute; bottom:0; left:0; right:0; font-size:10px; padding:3px 5px; background:linear-gradient(transparent,rgba(0,0,0,.8)); color:#cfcfe0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .hidden { display:none !important; }
  #viewer { position:fixed; inset:0; background:#000; z-index:20; display:flex; flex-direction:column; }
  #vbar { display:flex; align-items:center; gap:10px; padding:calc(8px + var(--safe-t)) 14px 8px; background:rgba(0,0,0,.85); }
  #vbar .name { flex:1; color:#ddd; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #vbar button { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.3); color:#fff; border-radius:9px; padding:9px 16px; font-size:16px; font-weight:600; }
  #vbody { flex:1; overflow:hidden; padding:6px; position:relative; touch-action:pan-x pan-y; }
  #vmedia { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  #vbody img, #vbody video { max-width:100%; max-height:100%; object-fit:contain; }
  #vbody img { transition:transform .15s ease; transform-origin:center center; will-change:transform; }
  #vbody img.zoomed { object-fit:contain; max-width:none; max-height:none; transition:none; }
  #vmsg { color:var(--muted); font-size:15px; }
  #count { color:var(--muted); font-size:12px; padding:8px 14px 10px; }
  .nav { position:absolute; top:50%; transform:translateY(-50%); width:44px; height:64px; display:flex; align-items:center; justify-content:center;
         background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.18); color:#fff; font-size:24px; border-radius:10px; z-index:2; user-select:none; }
  .nav.prev { left:8px; } .nav.next { right:8px; }
  #vpos { position:absolute; bottom:calc(10px + var(--safe-b)); left:50%; transform:translateX(-50%); background:rgba(0,0,0,.55); color:#cfcfe0;
          font-size:12px; padding:3px 10px; border-radius:12px; z-index:2; }
  header button.icon { padding:9px 11px; font-size:16px; line-height:1; }
</style></head>
<body>
<div id="login">
  <h1>KAWAII VAULT</h1>
  <p style="color:var(--muted);font-size:13px">Phone access — enter the access password set on your PC.</p>
  <input id="pw" type="password" inputmode="text" autocomplete="off" placeholder="Access password"/>
  <button onclick="login()">Unlock</button>
  <div id="err"></div>
</div>

<div id="app" class="hidden">
  <header>
    <div class="hrow">
      <b>VAULT</b>
      <input id="q" placeholder="Search…" oninput="render()"/>
      <button class="icon" onclick="load()" title="Refresh" aria-label="Refresh">↻</button>
      <button onclick="logout()">Lock</button>
    </div>
    <div class="chips" id="chips"></div>
    <div class="sortbar">
      <label>Sort</label>
      <select id="sortField" onchange="setSort()">
        <option value="date">Date added</option>
        <option value="name">Name</option>
        <option value="size">Size</option>
        <option value="type">Type</option>
      </select>
      <button class="dir" id="sortDir" onclick="toggleDir()" title="Sort direction" aria-label="Sort direction">↓</button>
    </div>
  </header>
  <div id="count"></div>
  <div id="grid"></div>
</div>

<div id="viewer" class="hidden">
  <div id="vbar">
    <span class="name" id="vname"></span>
    <button onclick="closeViewer()">✕ Close</button>
  </div>
  <div id="vbody">
    <div id="vmedia"></div>
    <div class="nav prev" onclick="step(-1)">‹</div>
    <div class="nav next" onclick="step(1)">›</div>
    <div id="vpos"></div>
  </div>
</div>

<script>
// Minimal pure-JS SHA-256 (WebCrypto's crypto.subtle is unavailable over plain
// HTTP, so the challenge-response proof is hashed here without it).
function sha256hex(ascii){
  function rotr(n,x){return (x>>>n)|(x<<(32-n));}
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=[]; for(let i=0;i<ascii.length;i++){const c=ascii.charCodeAt(i); if(c<128)bytes.push(c); else if(c<2048){bytes.push(192|(c>>6),128|(c&63));} else {bytes.push(224|(c>>12),128|((c>>6)&63),128|(c&63));}}
  const l=bytes.length*8; bytes.push(0x80); while((bytes.length%64)!==56)bytes.push(0);
  for(let i=7;i>=0;i--)bytes.push((l/Math.pow(2,i*8))&0xff);
  const w=new Array(64);
  for(let j=0;j<bytes.length;j+=64){
    for(let i=0;i<16;i++)w[i]=(bytes[j+i*4]<<24)|(bytes[j+i*4+1]<<16)|(bytes[j+i*4+2]<<8)|(bytes[j+i*4+3]);
    for(let i=16;i<64;i++){const s0=rotr(7,w[i-15])^rotr(18,w[i-15])^(w[i-15]>>>3); const s1=rotr(17,w[i-2])^rotr(19,w[i-2])^(w[i-2]>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const S1=rotr(6,e)^rotr(11,e)^rotr(25,e); const ch=(e&f)^(~e&g); const t1=(h+S1+ch+K[i]+w[i])|0; const S0=rotr(2,a)^rotr(13,a)^rotr(22,a); const mj=(a&b)^(a&c)^(b&c); const t2=(S0+mj)|0; h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    H=[(H[0]+a)|0,(H[1]+b)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  return H.map(x=>('00000000'+(x>>>0).toString(16)).slice(-8)).join('');
}

const FAV = '★';     // sentinel filter key for the Favorites chip
let FILES = [];
let FILTER = 'All';       // 'All', FAV, or an exact category string
let SORT_FIELD = 'date';  // name | date | size | type
let SORT_ASC = false;     // date defaults to newest-first (descending)
let curBlob = null;
let VIEW_LIST = [];   // current filtered/sorted list shown in the grid
let curIndex = -1;    // index into VIEW_LIST currently open in the viewer
const isImg = f => f.category === 'Images';
const isVid = f => f.category === 'Videos';
const isViewable = f => isImg(f) || isVid(f);

async function login(){
  const pw = document.getElementById('pw').value;
  const err = document.getElementById('err');
  err.textContent = '';
  try {
    const cr = await fetch('/challenge');
    if (!cr.ok) { err.textContent = 'Connection error.'; return; }
    const { nonce } = await cr.json();
    err.textContent = 'Unlocking…';
    // Must match PROOF_ITERATIONS on the server: hash once, then re-hash the
    // hex string that many times so a captured proof is costly to brute-force.
    let proof = sha256hex(nonce + ':' + pw);
    for (let i = 0; i < 100000; i++) proof = sha256hex(proof);
    const r = await fetch('/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nonce, proof})});
    err.textContent = '';
    if (r.ok) { document.getElementById('login').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); load(); }
    else if (r.status === 429) { const j = await r.json(); err.textContent = 'Too many attempts. Wait ' + (j.retry||30) + 's.'; }
    else { err.textContent = 'Wrong password.'; }
  } catch(e){ err.textContent = 'Connection error.'; }
}
async function logout(){ try{ await fetch('/logout',{method:'POST'}); }catch(e){} location.reload(); }

async function load(){
  try {
    const r = await fetch('/api/files');
    if (!r.ok) { if (r.status===401) location.reload(); return; }
    const j = await r.json();
    FILES = j.files || [];
    buildChips();
    render();
  } catch(e){}
}

// Build the category chip row from the categories actually present in the
// vault (plus All and, if any exist, Favorites). Drops a stale active filter.
function buildChips(){
  const cats = [...new Set(FILES.map(f => f.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const hasFav = FILES.some(f => f.favorite);
  if (FILTER === FAV) { if (!hasFav) FILTER = 'All'; }
  else if (FILTER !== 'All' && !cats.includes(FILTER)) FILTER = 'All';
  const chips = document.getElementById('chips');
  chips.innerHTML = '';
  const add = (key, label) => {
    const b = document.createElement('button');
    b.className = 'chip' + (FILTER === key ? ' on' : '');
    b.dataset.k = key;
    b.textContent = label;
    b.onclick = () => setFilter(key);
    chips.appendChild(b);
  };
  add('All', 'All');
  if (hasFav) add(FAV, '★ Favorites');
  cats.forEach(c => add(c, c));
}

function setFilter(key){
  FILTER = key;
  document.querySelectorAll('#chips .chip').forEach(c => c.classList.toggle('on', c.dataset.k === key));
  render();
}

function setSort(){ SORT_FIELD = document.getElementById('sortField').value; render(); }
function toggleDir(){
  SORT_ASC = !SORT_ASC;
  document.getElementById('sortDir').textContent = SORT_ASC ? '↑' : '↓';
  render();
}

function render(){
  const q = (document.getElementById('q').value||'').toLowerCase();
  const list = FILES.filter(f => {
    if (FILTER === FAV) { if (!f.favorite) return false; }
    else if (FILTER !== 'All' && f.category !== FILTER) return false;
    return !q || (f.name||'').toLowerCase().includes(q);
  });
  const dir = SORT_ASC ? 1 : -1;
  const byName = (a,b) => String(a.name||'').toLowerCase().localeCompare(String(b.name||'').toLowerCase());
  list.sort((a,b) => {
    let r;
    if (SORT_FIELD === 'size') r = (a.size||0) - (b.size||0);
    else if (SORT_FIELD === 'date') r = String(a.date||'').localeCompare(String(b.date||''));
    else if (SORT_FIELD === 'type') r = String(a.type||'').localeCompare(String(b.type||''));
    else r = byName(a,b);
    if (r === 0) r = byName(a,b); // stable tiebreak by name
    return r * dir;
  });
  document.getElementById('count').textContent = list.length + ' file' + (list.length===1?'':'s');
  VIEW_LIST = list;
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  list.forEach((f, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (isImg(f) || isVid(f)){
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = '/thumb/' + f.id + '?s=256';
      cell.appendChild(img);
      if (isVid(f)) { const b = document.createElement('div'); b.className='badge'; b.textContent='▶'; cell.appendChild(b); }
    } else {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = '📄';
      cell.appendChild(ph);
    }
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = f.name;
    cell.appendChild(tag);
    cell.onclick = () => openItem(i);
    grid.appendChild(cell);
  });
}

let loadSeq = 0;          // guards against out-of-order async image loads while swiping fast
let zoomed = false;

function viewerOpen(){ return !document.getElementById('viewer').classList.contains('hidden'); }

// Update the prev/next arrow visibility + the "3 / 12" position pill.
function updateNav(){
  const prev = document.querySelector('.nav.prev'), next = document.querySelector('.nav.next');
  prev.style.display = curIndex > 0 ? 'flex' : 'none';
  next.style.display = curIndex < VIEW_LIST.length - 1 ? 'flex' : 'none';
  document.getElementById('vpos').textContent = VIEW_LIST.length ? (curIndex + 1) + ' / ' + VIEW_LIST.length : '';
}

async function openItem(index){
  if (index < 0 || index >= VIEW_LIST.length) return;
  curIndex = index;
  zoomed = false;
  const f = VIEW_LIST[index];
  const media = document.getElementById('vmedia');
  document.getElementById('vname').textContent = f.name;
  media.innerHTML = '<div id="vmsg">Loading…</div>';
  if (!viewerOpen()){
    document.getElementById('viewer').classList.remove('hidden');
    // Push a history entry so the phone's back gesture closes the viewer
    // instead of leaving the page.
    history.pushState({ viewer: true }, '');
  }
  updateNav();
  const seq = ++loadSeq;
  const url = '/file/' + f.id;
  if (isVid(f)){
    // Video streams via Range; the element handles partial responses.
    media.innerHTML = '';
    const el = document.createElement('video');
    el.src = url; el.controls = true; el.autoplay = true; el.playsInline = true;
    el.onerror = () => { if (seq===loadSeq) media.innerHTML = '<div id="vmsg">Could not play this video.</div>'; };
    media.appendChild(el);
  } else if (isImg(f)){
    // Fetch the FULL image as a blob (a plain <img> can receive a truncated
    // ranged response for large files, which renders as a black screen).
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      const blob = await r.blob();
      if (seq !== loadSeq) return; // a newer navigation superseded this load
      if (curBlob) URL.revokeObjectURL(curBlob);
      curBlob = URL.createObjectURL(blob);
      media.innerHTML = '';
      const el = document.createElement('img');
      el.src = curBlob;
      el.ondblclick = toggleZoom;
      media.appendChild(el);
    } catch(e){
      if (seq===loadSeq) media.innerHTML = '<div id="vmsg">Could not load this image.</div>';
    }
  } else {
    media.innerHTML = '';
    const a = document.createElement('a'); a.href = url; a.textContent = 'Open ' + f.name; a.style.color = '#fff'; media.appendChild(a);
  }
}

// Move to the previous/next VIEWABLE item (skips non-media so swiping stays useful).
function step(dir){
  let i = curIndex + dir;
  while (i >= 0 && i < VIEW_LIST.length && !isViewable(VIEW_LIST[i])) i += dir;
  if (i >= 0 && i < VIEW_LIST.length) openItem(i);
}

function toggleZoom(e){
  const img = document.querySelector('#vmedia img');
  if (!img) return;
  zoomed = !zoomed;
  img.classList.toggle('zoomed', zoomed);
  img.style.transform = zoomed ? 'scale(2.2)' : '';
}

function closeViewer(){
  // If our history entry is still on the stack, pop it (this re-fires popstate
  // with no state, landing in the else-branch below as a no-op).
  if (history.state && history.state.viewer) { history.back(); return; }
  document.getElementById('vmedia').innerHTML = '';
  document.getElementById('viewer').classList.add('hidden');
  curIndex = -1; zoomed = false;
  if (curBlob) { URL.revokeObjectURL(curBlob); curBlob = null; }
}

// Android hardware back / browser back closes the viewer instead of leaving.
window.addEventListener('popstate', () => {
  if (viewerOpen()){
    document.getElementById('vmedia').innerHTML = '';
    document.getElementById('viewer').classList.add('hidden');
    curIndex = -1; zoomed = false;
    if (curBlob) { URL.revokeObjectURL(curBlob); curBlob = null; }
  }
});

// Horizontal swipe in the viewer navigates between items (ignored while zoomed
// or when starting on a video, so its own controls keep working).
(function(){
  const body = document.getElementById('vbody');
  let x0 = null, y0 = null, onVideo = false;
  body.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    onVideo = !!(e.target && e.target.tagName === 'VIDEO');
  }, { passive:true });
  body.addEventListener('touchend', e => {
    if (x0 === null || zoomed || onVideo) { x0 = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive:true });
})();

// Desktop/keyboard niceties (also helps when testing in a browser).
window.addEventListener('keydown', e => {
  if (!viewerOpen()) return;
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Escape') closeViewer();
});
document.getElementById('pw').addEventListener('keydown', e => { if(e.key==='Enter') login(); });
</script>
</body></html>"#;
