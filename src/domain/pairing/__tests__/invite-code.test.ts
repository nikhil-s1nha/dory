import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateInviteCode,
  isValidCodeFormat,
  normalizeCode,
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
    // 250 must be skipped; the over-draw (10 bytes for length 8) absorbs the rejection.
    const code = generateInviteCode(bytesFrom([250, 0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(code).toHaveLength(CODE_LENGTH);
    // First emitted symbol comes from byte 0, not the rejected 250.
    expect(code[0]).toBe(CODE_ALPHABET[0]);
  });

  it('draws another batch when a whole batch is rejected', () => {
    // First batch (10 bytes) all rejected, second batch valid — must not throw/hang.
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
  it('accepts a well-formed code', () => {
    expect(isValidCodeFormat('23456789')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidCodeFormat('2345')).toBe(false);
    expect(isValidCodeFormat('234567890')).toBe(false);
  });

  it('rejects confusable / out-of-alphabet characters', () => {
    expect(isValidCodeFormat('2345678O')).toBe(false); // O excluded
    expect(isValidCodeFormat('2345678I')).toBe(false); // I excluded
    expect(isValidCodeFormat('2345678L')).toBe(false); // L excluded
    expect(isValidCodeFormat('23456781')).toBe(false); // 1 excluded
    expect(isValidCodeFormat('lowercas')).toBe(false);
  });
});

describe('normalizeCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeCode('  a2b3c4d5  ')).toBe('A2B3C4D5');
  });

  it('leaves an already-canonical code unchanged', () => {
    expect(normalizeCode('23456789')).toBe('23456789');
  });
});
