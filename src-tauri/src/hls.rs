// ── HLS (.m3u8) stream downloader ──
//
// Pure-Rust saver for ordinary HLS streams: parses master/media playlists,
// picks the highest-bandwidth variant, downloads every segment, decrypts
// standard AES-128 (METHOD=AES-128) segments, and concatenates them into one
// file in the vault's temp dir. The caller then imports that file through the
// normal encrypted pipeline (same as any other browser grab).
//
// Explicitly OUT of scope (cannot be done):
//   • DRM — Widevine / PlayReady / FairPlay (METHOD=SAMPLE-AES-CTR etc.). The
//     content key never leaves the CDM, so no downloader can save these.
//   • DASH (.mpd). Different container/manifest; not handled here.

use std::io::Write;
use std::path::Path;

use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use reqwest::Url;

type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

/// Hard cap on a single stream download (matches browser_grab's cap).
pub const MAX_STREAM_BYTES: u64 = 6 * 1024 * 1024 * 1024;
/// Don't follow master → media → master chains forever.
const MAX_PLAYLIST_DEPTH: u8 = 4;

const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/// AES-128 key reference parsed from an #EXT-X-KEY line.
#[derive(Clone, Debug, PartialEq)]
struct KeyRef {
    /// Absolute key URI.
    uri: String,
    /// Explicit IV if the playlist gave one; otherwise None (derive from seq).
    iv: Option<[u8; 16]>,
}

/// One media segment to download.
#[derive(Clone, Debug, PartialEq)]
struct Segment {
    url: String,
    /// None = cleartext (METHOD=NONE or no key).
    key: Option<KeyRef>,
    /// Media sequence number — used as the IV when the key has no explicit IV.
    seq: u64,
}

/// Resolve a possibly-relative URI against a base URL.
fn resolve(base: &Url, raw: &str) -> Result<String, String> {
    base.join(raw.trim())
        .map(|u| u.to_string())
        .map_err(|e| format!("Bad URL '{}': {}", raw, e))
}

/// Parse `IV=0x...` (32 hex chars → 16 bytes).
fn parse_iv(hex_str: &str) -> Option<[u8; 16]> {
    let s = hex_str.trim();
    let s = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")).unwrap_or(s);
    if s.len() != 32 {
        return None;
    }
    let bytes = hex::decode(s).ok()?;
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&bytes);
    Some(iv)
}

/// Derive the implicit IV from a media sequence number (16-byte big-endian).
fn iv_from_seq(seq: u64) -> [u8; 16] {
    let mut iv = [0u8; 16];
    iv[8..16].copy_from_slice(&seq.to_be_bytes());
    iv
}

/// Pull a quoted or bareword attribute value out of an EXT-X-KEY/STREAM-INF line.
/// e.g. attr("METHOD=AES-128,URI=\"k\"", "URI") -> Some("k").
fn attr(line: &str, name: &str) -> Option<String> {
    let needle = format!("{}=", name);
    let start = line.find(&needle)? + needle.len();
    let rest = &line[start..];
    if let Some(stripped) = rest.strip_prefix('"') {
        // Quoted value: up to the next quote.
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        // Bareword: up to the next comma.
        let end = rest.find(',').unwrap_or(rest.len());
        Some(rest[..end].to_string())
    }
}

/// True if the playlist text is a master playlist (lists variant streams).
fn is_master(text: &str) -> bool {
    text.lines().any(|l| l.trim_start().starts_with("#EXT-X-STREAM-INF"))
}

/// From a master playlist, return the URI of the highest-bandwidth variant.
fn pick_best_variant(text: &str, base: &Url) -> Result<String, String> {
    let mut best: Option<(u64, String)> = None;
    let mut pending_bw: Option<u64> = None;
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with("#EXT-X-STREAM-INF") {
            pending_bw = attr(l, "BANDWIDTH")
                .and_then(|v| v.trim().parse::<u64>().ok())
                .or(Some(0));
        } else if !l.is_empty() && !l.starts_with('#') {
            if let Some(bw) = pending_bw.take() {
                let uri = resolve(base, l)?;
                if best.as_ref().map_or(true, |(b, _)| bw >= *b) {
                    best = Some((bw, uri));
                }
            }
        }
    }
    best.map(|(_, uri)| uri)
        .ok_or_else(|| "No variant streams in master playlist".to_string())
}

/// Parse a media playlist into an ordered segment list (with key + sequence).
fn parse_media(text: &str, base: &Url) -> Result<Vec<Segment>, String> {
    let mut segments = Vec::new();
    let mut cur_key: Option<KeyRef> = None;
    let mut seq: u64 = 0;
    let mut seq_initialized = false;

    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        if let Some(rest) = l.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
            seq = rest.trim().parse().unwrap_or(0);
            seq_initialized = true;
        } else if l.starts_with("#EXT-X-KEY") {
            let method = attr(l, "METHOD").unwrap_or_default();
            if method == "NONE" {
                cur_key = None;
            } else if method == "AES-128" {
                let uri = attr(l, "URI").ok_or("EXT-X-KEY missing URI")?;
                cur_key = Some(KeyRef {
                    uri: resolve(base, &uri)?,
                    iv: attr(l, "IV").and_then(|v| parse_iv(&v)),
                });
            } else {
                // SAMPLE-AES / SAMPLE-AES-CTR etc. are DRM-adjacent and not
                // supported — surface a clear error instead of silent garbage.
                return Err(format!(
                    "Unsupported stream encryption '{}' (DRM streams can't be saved)",
                    method
                ));
            }
        } else if !l.starts_with('#') {
            // A URI line = one media segment.
            if !seq_initialized {
                seq = 0;
                seq_initialized = true;
            }
            segments.push(Segment {
                url: resolve(base, l)?,
                key: cur_key.clone(),
                seq,
            });
            seq += 1;
        }
    }

    if segments.is_empty() {
        return Err("No segments found in media playlist".to_string());
    }
    Ok(segments)
}

/// Strip PKCS#7 padding if the trailing bytes form a valid pad; otherwise return
/// the buffer unchanged (some encoders emit unpadded block-aligned segments).
fn strip_pkcs7(mut data: Vec<u8>) -> Vec<u8> {
    if let Some(&pad) = data.last() {
        let p = pad as usize;
        if p >= 1 && p <= 16 && p <= data.len() && data[data.len() - p..].iter().all(|&b| b == pad) {
            data.truncate(data.len() - p);
        }
    }
    data
}

/// AES-128-CBC decrypt one segment (no-padding block pass + manual PKCS#7 strip).
fn decrypt_segment(ct: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Result<Vec<u8>, String> {
    if ct.len() % 16 != 0 {
        return Err("Encrypted segment length is not a multiple of 16".to_string());
    }
    let mut buf = ct.to_vec();
    let dec = Aes128CbcDec::new(key.into(), iv.into());
    let pt = dec
        .decrypt_padded_mut::<NoPadding>(&mut buf)
        .map_err(|e| format!("AES-128 decrypt failed: {}", e))?;
    let len = pt.len();
    buf.truncate(len);
    Ok(strip_pkcs7(buf))
}

fn build_request(client: &reqwest::Client, url: &str, referer: Option<&str>) -> reqwest::RequestBuilder {
    let mut req = client
        .get(url)
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .header(reqwest::header::ACCEPT, "*/*");
    if let Some(r) = referer {
        if let Ok(hv) = reqwest::header::HeaderValue::from_str(r) {
            req = req.header(reqwest::header::REFERER, hv);
        }
    }
    req
}

async fn fetch_text(client: &reqwest::Client, url: &str, referer: Option<&str>) -> Result<String, String> {
    let resp = build_request(client, url, referer)
        .send()
        .await
        .map_err(|e| format!("Fetch playlist failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Playlist HTTP {}", resp.status().as_u16()));
    }
    resp.text().await.map_err(|e| format!("Read playlist: {}", e))
}

async fn fetch_bytes(client: &reqwest::Client, url: &str, referer: Option<&str>) -> Result<Vec<u8>, String> {
    let resp = build_request(client, url, referer)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| format!("Read body: {}", e))
}

/// Download an HLS stream at `url` into `dest` (a single concatenated file).
/// Returns the number of bytes written. `progress` is called with
/// (done_segments, total_segments) as the download advances.
pub async fn download_hls(
    client: &reqwest::Client,
    url: &str,
    referer: Option<&str>,
    dest: &Path,
    progress: Option<&(dyn Fn(usize, usize) + Send + Sync)>,
) -> Result<u64, String> {
    // Resolve master → media playlist (bounded depth).
    let mut playlist_url = url.to_string();
    let segments;
    let mut depth = 0u8;
    loop {
        if depth >= MAX_PLAYLIST_DEPTH {
            return Err("Too many nested playlists".to_string());
        }
        let base = Url::parse(&playlist_url).map_err(|e| format!("Bad playlist URL: {}", e))?;
        let text = fetch_text(client, &playlist_url, referer).await?;
        if is_master(&text) {
            playlist_url = pick_best_variant(&text, &base)?;
            depth += 1;
            continue;
        }
        segments = parse_media(&text, &base)?;
        break;
    }

    let total = segments.len();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("Create temp file: {}", e))?;
    let mut written: u64 = 0;

    // Small key cache so we don't re-download the same key per segment.
    let mut key_cache: std::collections::HashMap<String, [u8; 16]> = std::collections::HashMap::new();

    for (i, seg) in segments.iter().enumerate() {
        let raw = fetch_bytes(client, &seg.url, referer).await?;
        let bytes = if let Some(keyref) = &seg.key {
            let key = match key_cache.get(&keyref.uri) {
                Some(k) => *k,
                None => {
                    let kb = fetch_bytes(client, &keyref.uri, referer).await?;
                    if kb.len() != 16 {
                        return Err(format!("AES-128 key must be 16 bytes, got {}", kb.len()));
                    }
                    let mut k = [0u8; 16];
                    k.copy_from_slice(&kb);
                    key_cache.insert(keyref.uri.clone(), k);
                    k
                }
            };
            let iv = keyref.iv.unwrap_or_else(|| iv_from_seq(seg.seq));
            decrypt_segment(&raw, &key, &iv)?
        } else {
            raw
        };

        written += bytes.len() as u64;
        if written > MAX_STREAM_BYTES {
            let _ = std::fs::remove_file(dest);
            return Err("Stream exceeds 6 GB cap".to_string());
        }
        file.write_all(&bytes).map_err(|e| format!("Write segment: {}", e))?;
        if let Some(cb) = progress {
            cb(i + 1, total);
        }
    }

    file.sync_all().map_err(|e| format!("Flush stream file: {}", e))?;
    if written == 0 {
        let _ = std::fs::remove_file(dest);
        return Err("Stream produced no data".to_string());
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://cdn.example.com/video/index.m3u8").unwrap()
    }

    #[test]
    fn iv_from_sequence_is_big_endian() {
        assert_eq!(iv_from_seq(1), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        assert_eq!(iv_from_seq(256)[14], 1);
    }

    #[test]
    fn parses_explicit_iv() {
        let iv = parse_iv("0x00000000000000000000000000000005").unwrap();
        assert_eq!(iv[15], 5);
        assert!(parse_iv("0x1234").is_none());
    }

    #[test]
    fn attr_handles_quoted_and_bareword() {
        let line = "#EXT-X-KEY:METHOD=AES-128,URI=\"https://k/key.bin\",IV=0xABCD";
        assert_eq!(attr(line, "METHOD").unwrap(), "AES-128");
        assert_eq!(attr(line, "URI").unwrap(), "https://k/key.bin");
        assert_eq!(attr(line, "IV").unwrap(), "0xABCD");
    }

    #[test]
    fn detects_and_picks_best_variant() {
        let master = "#EXTM3U\n\
            #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\n\
            low/index.m3u8\n\
            #EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080\n\
            high/index.m3u8\n";
        assert!(is_master(master));
        let best = pick_best_variant(master, &base()).unwrap();
        assert_eq!(best, "https://cdn.example.com/video/high/index.m3u8");
    }

    #[test]
    fn parses_media_playlist_with_key_and_sequence() {
        let media = "#EXTM3U\n\
            #EXT-X-VERSION:3\n\
            #EXT-X-MEDIA-SEQUENCE:10\n\
            #EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n\
            #EXTINF:6.0,\n\
            seg0.ts\n\
            #EXTINF:6.0,\n\
            seg1.ts\n\
            #EXT-X-ENDLIST\n";
        assert!(!is_master(media));
        let segs = parse_media(media, &base()).unwrap();
        assert_eq!(segs.len(), 2);
        assert_eq!(segs[0].url, "https://cdn.example.com/video/seg0.ts");
        assert_eq!(segs[0].seq, 10);
        assert_eq!(segs[1].seq, 11);
        let k = segs[0].key.as_ref().unwrap();
        assert_eq!(k.uri, "https://cdn.example.com/video/key.bin");
        assert!(k.iv.is_none()); // derived from sequence
    }

    #[test]
    fn cleartext_media_playlist_has_no_keys() {
        let media = "#EXTM3U\n#EXTINF:4.0,\na.ts\n#EXTINF:4.0,\nb.ts\n#EXT-X-ENDLIST\n";
        let segs = parse_media(media, &base()).unwrap();
        assert_eq!(segs.len(), 2);
        assert!(segs[0].key.is_none());
    }

    #[test]
    fn drm_method_is_rejected() {
        let media = "#EXTM3U\n\
            #EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://x\"\n\
            #EXTINF:6.0,\nseg.ts\n";
        let err = parse_media(media, &base()).unwrap_err();
        assert!(err.contains("DRM"));
    }

    #[test]
    fn pkcs7_strip_only_removes_valid_padding() {
        assert_eq!(strip_pkcs7(vec![1, 2, 3, 3, 3, 3]), vec![1, 2, 3]); // 3 bytes of 0x03
        assert_eq!(strip_pkcs7(vec![1, 2, 9]), vec![1, 2, 9]); // invalid pad → unchanged
    }

    #[test]
    fn aes128_cbc_roundtrip() {
        use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut};
        type Enc = cbc::Encryptor<aes::Aes128>;
        let key = [0x11u8; 16];
        let iv = [0x22u8; 16];
        let plain = b"hello hls segment payload";
        let mut buf = vec![0u8; plain.len() + 16];
        buf[..plain.len()].copy_from_slice(plain);
        let ct = Enc::new(&key.into(), &iv.into())
            .encrypt_padded_mut::<Pkcs7>(&mut buf, plain.len())
            .unwrap()
            .to_vec();
        let pt = decrypt_segment(&ct, &key, &iv).unwrap();
        assert_eq!(pt, plain);
    }
}
