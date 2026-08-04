import { expiryFromExpiresIn, isAccessTokenExpired } from '../auth';
import { hasMeaningfulChange, parseCurrentlyPlaying } from '../nowplaying';
import type { NowPlaying } from '../types';

const np = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  trackId: 't1',
  title: 'Song',
  artist: 'Artist',
  albumArtUrl: 'http://img/1',
  isPlaying: true,
  ...over,
});

describe('parseCurrentlyPlaying', () => {
  it('maps a playing track, joining artists and picking the largest album image', () => {
    const result = parseCurrentlyPlaying({
      is_playing: true,
      item: {
        id: 'abc',
        name: 'Midnight',
        artists: [{ name: 'A' }, { name: 'B' }],
        album: { images: [{ url: 'small', width: 64 }, { url: 'big', width: 640 }] },
      },
    });
    expect(result).toEqual({
      trackId: 'abc',
      title: 'Midnight',
      artist: 'A, B',
      albumArtUrl: 'big',
      isPlaying: true,
    });
  });

  it('returns null when nothing is playing (no item / 204-equivalent)', () => {
    expect(parseCurrentlyPlaying(null)).toBeNull();
    expect(parseCurrentlyPlaying({})).toBeNull();
    expect(parseCurrentlyPlaying({ is_playing: false, item: null })).toBeNull();
  });

  it('returns null for a malformed item missing id or name', () => {
    expect(parseCurrentlyPlaying({ item: { name: 'x' } })).toBeNull();
    expect(parseCurrentlyPlaying({ item: { id: 'x' } })).toBeNull();
  });

  it('tolerates a track with no album art', () => {
    const result = parseCurrentlyPlaying({ is_playing: true, item: { id: 'i', name: 'n' } });
    expect(result).toMatchObject({ trackId: 'i', albumArtUrl: null, artist: '' });
  });
});

describe('hasMeaningfulChange', () => {
  it('is false when nothing was and is playing', () => {
    expect(hasMeaningfulChange(null, null)).toBe(false);
  });

  it('is true when playback starts or stops', () => {
    expect(hasMeaningfulChange(null, np())).toBe(true);
    expect(hasMeaningfulChange(np(), null)).toBe(true);
  });

  it('is true when the track changes', () => {
    expect(hasMeaningfulChange(np({ trackId: 't1' }), np({ trackId: 't2' }))).toBe(true);
  });

  it('is true when play/pause flips on the same track', () => {
    expect(hasMeaningfulChange(np({ isPlaying: true }), np({ isPlaying: false }))).toBe(true);
  });

  it('is false for mere progress within the same playing track', () => {
    // Same track, same play state — only progress advanced. No widget reload.
    expect(hasMeaningfulChange(np(), np())).toBe(false);
  });
});

describe('token lifetime', () => {
  it('flags an expired or near-expiry token (within the skew)', () => {
    expect(isAccessTokenExpired(1000, 1000)).toBe(true); // already at expiry
    expect(isAccessTokenExpired(100_000, 50_000, 60_000)).toBe(true); // within 60s skew
  });

  it('accepts a token comfortably in the future', () => {
    expect(isAccessTokenExpired(100_000, 10_000, 60_000)).toBe(false);
  });

  it('computes absolute expiry from expires_in seconds', () => {
    expect(expiryFromExpiresIn(3600, 1_000)).toBe(1_000 + 3_600_000);
  });
});
