/**
 * Invite-code generation and format validation.
 *
 * Codes are read aloud, typed, and sometimes sent over a lossy channel between two
 * people, so the alphabet excludes visually confusable characters (0/O, 1/I/L, etc.).
 * The randomness source is injected rather than imported so this module stays pure and
 * deterministically testable — production wires it to a CSPRNG (expo-crypto), tests pass
 * a fixed byte stream. See invite-code.test.ts.
 */

/** Crockford-style base32 minus confusables. 30 symbols. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CODE_LENGTH = 8;

/** A source of cryptographically random bytes, e.g. expo-crypto's getRandomBytes. */
export type RandomBytes = (byteCount: number) => Uint8Array;

/**
 * Generate an invite code by rejection-sampling the alphabet, so every symbol is equally
 * likely (no modulo bias). Draws more bytes than strictly needed to keep rejections rare.
 */
export function generateInviteCode(
  randomBytes: RandomBytes,
  length: number = CODE_LENGTH,
): string {
  const alphabetSize = CODE_ALPHABET.length;
  // Largest multiple of alphabetSize that fits in a byte; values at or above are rejected
  // to avoid modulo bias across the 0–255 range.
  const rejectionThreshold = 256 - (256 % alphabetSize);

  let code = '';
  while (code.length < length) {
    const need = length - code.length;
    // Over-draw to amortise the syscall; ~1.2x covers the expected rejection rate.
    const batch = randomBytes(Math.max(need + Math.ceil(need / 4), 1));
    for (let i = 0; i < batch.length && code.length < length; i++) {
      const byte = batch[i];
      if (byte >= rejectionThreshold) continue;
      code += CODE_ALPHABET[byte % alphabetSize];
    }
  }
  return code;
}

/** True if a string is a structurally valid code (correct length, only allowed symbols). */
export function isValidCodeFormat(code: string, length: number = CODE_LENGTH): boolean {
  if (code.length !== length) return false;
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Normalise user-entered codes before lookup: trim surrounding whitespace and uppercase.
 * No confusable remapping is needed — the alphabet already excludes every confusable pair
 * (0/O, 1/I/L), so a valid code can't contain one. Does not guarantee validity; call
 * isValidCodeFormat after.
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}
