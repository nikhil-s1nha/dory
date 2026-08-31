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

/**
 * Length of a freshly minted code. Six symbols over a 30-symbol alphabet is 7.3e8
 * combinations — far beyond guessable for a personal-scale app whose codes are single-use
 * and expire in a day, and two characters less to read out over the phone.
 */
export const CODE_LENGTH = 6;

/**
 * The longest code we have ever issued. Codes were 8 symbols before CODE_LENGTH dropped to 6,
 * and those invites live in the database until they expire — so anything typed *in* is judged
 * against this window, never against the current CODE_LENGTH. Shortening the code must not
 * strand a partner holding a code that was valid when it was sent.
 */
export const MAX_ENTERED_CODE_LENGTH = 8;

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

/** True if every character of `code` is in the alphabet (an empty string is not a code). */
function isAlphabetOnly(code: string): boolean {
  if (code.length === 0) return false;
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * True if a string is a well-formed code *of the length we mint*. This is the generation-side
 * check (assert what we produced); use isEnterableCode for anything a user typed, which may
 * legitimately be an older, longer code.
 */
export function isValidCodeFormat(code: string, length: number = CODE_LENGTH): boolean {
  if (code.length !== length) return false;
  return isAlphabetOnly(code);
}

/**
 * True if a typed code is worth sending to the server: right alphabet, and a length anywhere
 * in the window we have ever issued. Deliberately *not* an exact-length check — the redemption
 * path must let the database's lookup be the authority on whether a code exists, or the day we
 * change CODE_LENGTH again every outstanding invite becomes unredeemable client-side.
 */
export function isEnterableCode(code: string): boolean {
  if (code.length < CODE_LENGTH || code.length > MAX_ENTERED_CODE_LENGTH) return false;
  return isAlphabetOnly(code);
}

/**
 * Normalise user-entered codes before lookup: trim surrounding whitespace and uppercase.
 * No confusable remapping is needed — the alphabet already excludes every confusable pair
 * (0/O, 1/I/L), so a valid code can't contain one. Does not guarantee validity; call
 * isEnterableCode after.
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Normalise a code *as it is typed*, so the field always displays the exact string that will be
 * submitted. `autoCapitalize="characters"` only sets the keyboard's shift state — a paste, a
 * third-party keyboard, or dictation all sail straight past it and leave lowercase in the box
 * while the uppercase form is what actually gets looked up. Interior whitespace goes too, because
 * a code copied out of a chat app routinely arrives with spaces around or inside it.
 *
 * Idempotent, and a fixed point of normalizeCode: normalizeCode(normalizeCodeInput(x)) === it.
 */
export function normalizeCodeInput(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}
