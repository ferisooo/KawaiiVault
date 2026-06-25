/**
 * Client-side password/passphrase strength check.
 *
 * This MIRRORS the authoritative Rust policy in `validate_pin_strength`
 * (src-tauri/src/vault.rs). The backend always re-validates, so this exists
 * purely to give the user immediate, specific feedback — and, importantly, to
 * stop a weak password from reaching the createVault "demo mode" catch-branch,
 * which would otherwise swallow the backend error and fake success.
 *
 * Policy (NIST 800-63B — length dominates):
 *   • >= 10 characters (hard floor)
 *   • reject all-one-character, common passwords, simple sequences
 *   • 16+ chars: accepted on length alone
 *   • 10–15 chars: not numeric-only, must mix >= 3 of
 *     {lowercase, uppercase, digit, symbol}
 */

const WEAK_PASSWORDS = [
  "password", "passw0rd", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyuiop", "letmein", "iloveyou", "admin",
  "abc", "welcome", "monkey", "dragon", "football", "trustno",
];

/** True for "123456" / "abcdef" / "fedcba" style constant ±1 sequences. */
function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  const step = s.charCodeAt(1) - s.charCodeAt(0);
  if (step !== 1 && step !== -1) return false;
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/**
 * Returns an error message string if the password is too weak, or `null` if it
 * passes. Mirror of the Rust `validate_pin_strength`.
 */
export function validatePinStrength(pin: string): string | null {
  const len = [...pin].length;
  if (len < 10) {
    return "Password must be at least 10 characters. A short passphrase of a few words is ideal.";
  }
  if (len > 1024) {
    return "Password is too long (max 1024 characters)";
  }

  // All one character.
  if ([...pin].every((c) => c === pin[0])) {
    return "Password is too weak — it is a single repeated character";
  }

  // Match the whole string or the string with trailing digits stripped
  // (e.g. "password123") — not a substring, so a long passphrase that merely
  // contains a common word is not penalised.
  const lower = pin.toLowerCase();
  const stripped = lower.replace(/[0-9]+$/, "");
  if (WEAK_PASSWORDS.some((w) => lower === w || stripped === w)) {
    return "Password is too common — choose something harder to guess";
  }

  if (isSequential(pin)) {
    return "Password is too weak — it is a simple sequence";
  }

  // Long passphrases are strong on length alone.
  if (len >= 16) return null;

  let hasLower = false;
  let hasUpper = false;
  let hasDigit = false;
  let hasSymbol = false;
  for (const c of pin) {
    if (c >= "a" && c <= "z") hasLower = true;
    else if (c >= "A" && c <= "Z") hasUpper = true;
    else if (c >= "0" && c <= "9") hasDigit = true;
    else hasSymbol = true;
  }

  if (hasDigit && !hasLower && !hasUpper && !hasSymbol) {
    return "Numeric-only PINs are not allowed. Use letters too, or a longer passphrase (16+ characters).";
  }

  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 3) {
    return "Password is too weak. Mix at least 3 of: lowercase, uppercase, digits, symbols — or use a longer passphrase (16+ characters).";
  }

  return null;
}
