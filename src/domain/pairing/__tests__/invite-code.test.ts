import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_ENTERED_CODE_LENGTH,
  generateInviteCode,
  isEnterableCode,
  isValidCodeFormat,
  normalizeCode,
  normalizeCodeInput,
  type RandomBytes,
} from '../invite-code';

/**
 * A deterministic byte source backed by a fixed queue, so code generation is fully
 * reproducible in tests. Throws if drained — that surfaces an unexpected extra draw
 * (e.g. a rejection-sampling infinite loop) instead of hanging the suite.
 */
function bytesFrom(values: number[]): RandomBytes {
  let offset = 0;
  return (byteCount: number) => {
    if (offset + byteCount > values.length) {
      throw new Error(
        `stub exhausted: wanted ${byteCount} at offset ${offset} of ${values.length}`,
      );
    }
    const slice = Uint8Array.from(values.slice(offset, offset + byteCount));
    offset += byteCount;
    return slice;
  };
}

describe('generateInviteCode', () => {
  it('produces a code of the default length using only alphabet symbols', () => {
    const code = generateInviteCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toHaveLength(CODE_LENGTH);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
  });

  it('maps each byte to its alphabet index (mod 30)', () => {
    // bytes 0,1,2 -> first three symbols; 30 wraps to index 0
    const code = generateInviteCode(bytesFrom([0, 1, 2, 30, 3, 4, 5, 6, 7, 8]), 4);
    expect(code).toBe(CODE_ALPHABET[0] + CODE_ALPHABET[1] + CODE_ALPHABET[2] + CODE_ALPHABET[0]);
  });

  it('is deterministic for a given byte stream', () => {
    const stream = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    expect(generateInviteCode(bytesFrom(stream))).toBe(generateInviteCode(bytesFrom(stream)));
  });

  it('rejection-samples bytes at or above the bias threshold (>= 240)', () => {
    // 250 must be skipped; the over-draw absorbs the rejection.
    const code = generateInviteCode(bytesFrom([250, 0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(code).toHaveLength(CODE_LENGTH);
    // First emitted symbol comes from byte 0, not the rejected 250.
    expect(code[0]).toBe(CODE_ALPHABET[0]);
  });

  it('draws another batch when a whole batch is rejected', () => {
    // First batch all rejected, second batch valid — must not throw/hang.
    const rejected = new Array(10).fill(255);
    const valid = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const code = generateInviteCode(bytesFrom([...rejected, ...valid]));
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('honours a custom length', () => {
    expect(generateInviteCode(bytesFrom([0, 1, 2, 3]), 2)).toHaveLength(2);
  });
});

describe('isValidCodeFormat', () => {
  it('accepts a well-formed code of the length we mint', () => {
    expect(isValidCodeFormat('234567')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidCodeFormat('2345')).toBe(false);
    expect(isValidCodeFormat('2345678')).toBe(false);
  });

  it('rejects confusable / out-of-alphabet characters', () => {
    expect(isValidCodeFormat('23456O')).toBe(false); // O excluded
    expect(isValidCodeFormat('23456I')).toBe(false); // I excluded
    expect(isValidCodeFormat('23456L')).toBe(false); // L excluded
    expect(isValidCodeFormat('234561')).toBe(false); // 1 excluded
    expect(isValidCodeFormat('lowerc')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isValidCodeFormat('', 0)).toBe(false);
  });
});

/**
 * The entry-side check is deliberately looser than the generation-side one. Shortening
 * CODE_LENGTH from 8 to 6 must not strand a partner who is holding a code that was valid when
 * it was sent — those invites sit in the database until they expire, and the server's lookup,
 * not the client, decides whether a code exists.
 */
describe('isEnterableCode', () => {
  it('accepts a code of the length we mint today', () => {
    expect(isEnterableCode('K7RQ2M')).toBe(true);
  });

  it('still accepts an 8-character code issued before the shortening', () => {
    expect('BNDSTEST').toHaveLength(MAX_ENTERED_CODE_LENGTH);
    expect(isEnterableCode('BNDSTEST')).toBe(true);
  });

  it('accepts any length inside the issued window, leaving existence to the lookup', () => {
    expect(isEnterableCode('K7RQ2MX')).toBe(true); // 7: never minted, but not ours to reject
  });

  it('rejects a half-typed code, which could only ever buy a CODE_NOT_FOUND round-trip', () => {
    expect(isEnterableCode('K7RQ2')).toBe(false);
    expect(isEnterableCode('')).toBe(false);
  });

  it('rejects anything longer than the longest code we ever issued', () => {
    expect(isEnterableCode('BNDSTESTX')).toBe(false);
  });

  it('rejects out-of-alphabet characters at any allowed length', () => {
    expect(isEnterableCode('K7RQ2O')).toBe(false); // O excluded
    expect(isEnterableCode('k7rq2m')).toBe(false); // normalisation is the caller's job
  });
});

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  a2b3c4  ')).toBe('A2B3C4');
  });

  it('leaves an already-canonical code unchanged', () => {
    expect(normalizeCode('234567')).toBe('234567');
  });
});

/**
 * What the pairing field runs on every keystroke. `autoCapitalize="characters"` only changes the
 * keyboard's shift state, so a paste or a third-party keyboard leaves lowercase in the box while
 * the uppercase form is what gets submitted — the field must show what will actually be sent.
 */
describe('normalizeCodeInput', () => {
  it('uppercases pasted lowercase text', () => {
    expect(normalizeCodeInput('k7rq2m')).toBe('K7RQ2M');
  });

  it('drops interior whitespace, not just the ends', () => {
    expect(normalizeCodeInput('  k7 rq\t2m ')).toBe('K7RQ2M');
  });

  it('is idempotent', () => {
    const once = normalizeCodeInput(' k7 rq2m ');
    expect(normalizeCodeInput(once)).toBe(once);
  });

  it('produces a fixed point of normalizeCode, so display and submission cannot diverge', () => {
    for (const raw of ['k7rq2m', ' K7RQ2M ', 'bnd lstst', '\tabc def\n']) {
      const shown = normalizeCodeInput(raw);
      expect(normalizeCode(shown)).toBe(shown);
    }
  });

  it('leaves an empty field empty rather than inventing a value', () => {
    expect(normalizeCodeInput('')).toBe('');
    expect(normalizeCodeInput('   ')).toBe('');
  });
});
