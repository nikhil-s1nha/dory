import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchRecentMedia, getSignedUrl } from '@/domain/media/repository';
import { fetchPartnerNowPlaying } from '@/domain/spotify/repository';

import BundlesWidget from '../../../widgets/bundles-widget';
import { syncWidgetOnOpen } from '../widget-sync';

/**
 * What one app open is allowed to do to the widget.
 *
 * Two properties, and the bug lived in the gap between them:
 *
 * 1. **The cursor only moves once a snapshot has landed.** Persisting it before `buildProps` meant a
 *    download timeout advanced past an item that was never rendered.
 * 2. **One trigger, one step.** `syncWidgetOnOpen` has three callers that overlap on a foreground.
 *    Unserialized, two runs either both wrote the same step (one advance for two triggers) or, when
 *    the first committed before the second read, walked *two* steps for one open. Two steps over the
 *    two items the user tested with — a photo and a drawing — lands back on the item already
 *    showing, which is exactly "I have to foreground twice before anything changes".
 */

jest.mock('expo-widgets', () => ({ widgetsDirectory: '/tmp/widgets' }));

/**
 * Just enough of the App Group filesystem for `downloadToAppGroup` to reach its "already small
 * enough, keep it" branch. Nothing here is under test — it exists so that a photo and a drawing can
 * both be *built*, which is what makes the two-item cycle (the reported configuration) exercisable.
 */
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    create() {}
  }
  class File {
    uri: string;
    exists = false;
    constructor(dir: Directory | string, name?: string) {
      const base = typeof dir === 'string' ? dir : dir.uri;
      this.uri = name ? `${base}/${name}` : base;
    }
    delete() {}
    async move(target: File) {
      this.uri = target.uri;
    }
    static async downloadFileAsync() {}
  }
  return { Directory, File };
});

jest.mock('expo-image-manipulator', () => ({
  // 300px square: under WIDGET_RENDER_MAX_DIMENSION, so the download is kept rather than re-encoded.
  ImageManipulator: { manipulate: () => ({ renderAsync: async () => ({ width: 300, height: 300 }) }) },
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('@/domain/media/repository', () => ({
  fetchRecentMedia: jest.fn(),
  getSignedUrl: jest.fn(),
}));
jest.mock('@/domain/spotify/repository', () => ({ fetchPartnerNowPlaying: jest.fn() }));
jest.mock('../../../widgets/bundles-widget', () => ({
  __esModule: true,
  default: { updateSnapshot: jest.fn() },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockFetchRecentMedia = fetchRecentMedia as jest.Mock;
const mockGetSignedUrl = getSignedUrl as jest.Mock;
const mockFetchNowPlaying = fetchPartnerNowPlaying as jest.Mock;
const mockUpdateSnapshot = BundlesWidget.updateSnapshot as jest.Mock;

const CURSOR_KEY = 'bundles.widget.cursor';
const SYNC_COUNT_KEY = 'bundles.widget.syncCount';

/** A photo waiting from the partner. Building it needs a signed URL, which is what we fail. */
const partnerPhoto = {
  id: 'photo-1',
  type: 'photo',
  senderId: 'partner',
  storagePath: 'couple-1/photo-1.jpg',
  createdAt: 2,
};

/** A drawing waiting from the partner, so two items are present — the reported configuration. */
const partnerDrawing = {
  id: 'drawing-1',
  type: 'drawing',
  senderId: 'partner',
  storagePath: 'couple-1/drawing-1.jpg',
  createdAt: 1,
};

/** Music with no album art builds without touching the filesystem — the simplest success path. */
const partnerMusic = { nowPlaying: { title: 'Song', artist: 'Band' }, name: 'Sam' };

/** The persisted keys, as a plain object the fake AsyncStorage reads and writes. */
let stored: Record<string, string>;

/** Every `kind` handed to WidgetKit, in order — the sequence the home screen would have shown. */
const shown = () => mockUpdateSnapshot.mock.calls.map((call) => call[0].kind);

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks only forgets calls — one test replaces this implementation with a throw.
  mockUpdateSnapshot.mockReset();

  stored = {};
  mockGetItem.mockImplementation(async (key: string) => stored[key] ?? null);
  mockSetItem.mockImplementation(async (key: string, value: string) => {
    stored[key] = value;
  });

  mockFetchRecentMedia.mockResolvedValue([]);
  mockFetchNowPlaying.mockResolvedValue(null);
  mockGetSignedUrl.mockResolvedValue('https://signed.example/x.jpg');
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('syncWidgetOnOpen — committing a step', () => {
  it('shows the top of the cycle and records it once the snapshot has landed', async () => {
    mockFetchNowPlaying.mockResolvedValue(partnerMusic);

    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot).toHaveBeenCalledTimes(1);
    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({ kind: 'music', title: 'Song' });
    expect(stored[CURSOR_KEY]).toBe('music');
  });

  it('leaves the cursor untouched when nothing at all can be built', async () => {
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto]);
    mockGetSignedUrl.mockRejectedValue(new Error('widget-sync: signPhoto timed out after 20000ms'));

    await syncWidgetOnOpen('couple-1', 'me');

    // No snapshot means no advance, so the next open retries this same photo rather than skipping
    // past it forever.
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
    expect(stored[CURSOR_KEY]).toBeUndefined();
  });

  it('leaves the cursor and the counter untouched when the snapshot write fails', async () => {
    mockFetchNowPlaying.mockResolvedValue(partnerMusic);
    mockUpdateSnapshot.mockImplementation(() => {
      throw new Error('extension not installed');
    });

    await syncWidgetOnOpen('couple-1', 'me');

    expect(stored[CURSOR_KEY]).toBeUndefined();
    // The counter counts *landed* snapshots. Burning a number here would put an unexplained gap
    // between two device captures, which is exactly the signal it exists to give.
    expect(stored[SYNC_COUNT_KEY]).toBeUndefined();
  });

  it('logs the real error rather than discarding it', async () => {
    const boom = new Error('widget-sync: download timed out after 20000ms');
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto]);
    mockGetSignedUrl.mockRejectedValue(boom);

    await syncWidgetOnOpen('couple-1', 'me');

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('syncWidgetOnOpen failed'),
      expect.any(Error),
    );
  });

  it('never throws into its fire-and-forget callers', async () => {
    mockFetchRecentMedia.mockRejectedValue(new Error('offline'));
    await expect(syncWidgetOnOpen('couple-1', 'me')).resolves.toBeUndefined();
  });

  it('commits an empty snapshot too — nothing present is a real, renderable state', async () => {
    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({ kind: 'empty' });
    // Nothing was shown, so there is nothing to remember having shown.
    expect(stored[CURSOR_KEY]).toBeUndefined();
  });
});

describe('syncWidgetOnOpen — one open, one step', () => {
  beforeEach(() => {
    // The reported configuration: a photo and a drawing waiting, no music.
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto, partnerDrawing]);
  });

  it('alternates photo / drawing across sequential opens', async () => {
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'mount' });
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });

    expect(shown()).toEqual(['photo', 'drawing', 'photo', 'drawing']);
  });

  it('collapses overlapping triggers into a single step', async () => {
    // Exactly the shape of the bug: mount and the launch's AppState 'active' fire together, and
    // `usePush` refreshes on top of them. Serialized, that is one visible change, not two or three.
    const first = syncWidgetOnOpen('couple-1', 'me', { trigger: 'mount' });
    const second = syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    const third = syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    await Promise.all([first, second, third]);

    // The follow-up still runs (content may have changed under it) but does not move the cursor a
    // second time, so the widget ends on the *first* step rather than two or three steps along.
    expect(stored[CURSOR_KEY]).toBe('photo');
    expect(new Set(shown())).toEqual(new Set(['photo']));
  });

  it('carries a queued advance across a later non-advancing request', async () => {
    // push (no advance) is running; the user foregrounds (advance) into the slot; a second push
    // (no advance) replaces the slot. The slot is overwritten, not merged, so the foreground's step
    // has to be carried across explicitly — or the open the user actually made produces nothing.
    let releasePush: () => void = () => {};
    const pushRunning = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    mockFetchRecentMedia.mockImplementationOnce(async () => {
      await pushRunning;
      return [partnerPhoto, partnerDrawing];
    });

    const first = syncWidgetOnOpen('couple-1', 'me', { trigger: 'push', advance: false });
    const second = syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    const third = syncWidgetOnOpen('couple-1', 'me', { trigger: 'push', advance: false });
    releasePush();
    await Promise.all([first, second, third]);

    // The photo landed for the push (no step), then the follow-up took the foreground's step.
    expect(shown()).toEqual(['photo', 'drawing']);
    expect(stored[CURSOR_KEY]).toBe('drawing');
  });

  it('lets the follow-up still advance when the run in flight failed to', async () => {
    // An advance that was *attempted* is not an advance that was *spent*: the cursor never moved,
    // so suppressing the retry would eat the app open outright.
    mockFetchRecentMedia
      .mockImplementationOnce(async () => {
        throw new Error('offline');
      })
      .mockResolvedValue([partnerPhoto, partnerDrawing]);

    const first = syncWidgetOnOpen('couple-1', 'me', { trigger: 'mount' });
    const second = syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });
    await Promise.all([first, second]);

    expect(shown()).toEqual(['photo']);
    expect(stored[CURSOR_KEY]).toBe('photo');
  });

  it('does not advance when a push names an item that is not present', async () => {
    // A push races its own content: replication lag, or the Spotify poller nulling now_playing
    // between the send and the read. Falling through to the cycle would spend the user's next step.
    await syncWidgetOnOpen('couple-1', 'me'); // photo
    await syncWidgetOnOpen('couple-1', 'me', { advance: false, show: 'music', trigger: 'push' });

    expect(shown()).toEqual(['photo', 'photo']);
    expect(stored[CURSOR_KEY]).toBe('photo');
  });

  it('hands WidgetKit one snapshot per sync even when the cursor write fails', async () => {
    mockSetItem.mockRejectedValue(new Error('AsyncStorage full'));

    await syncWidgetOnOpen('couple-1', 'me');

    // A commit failure is not a reason to try the next item: the snapshot already went out.
    expect(mockUpdateSnapshot).toHaveBeenCalledTimes(1);
  });

  it('never runs two syncs at once', async () => {
    let concurrent = 0;
    let peak = 0;
    mockFetchRecentMedia.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return [partnerPhoto, partnerDrawing];
    });

    await Promise.all([
      syncWidgetOnOpen('couple-1', 'me'),
      syncWidgetOnOpen('couple-1', 'me'),
      syncWidgetOnOpen('couple-1', 'me'),
    ]);

    expect(peak).toBe(1);
  });

  it('does not advance when asked only to refresh', async () => {
    await syncWidgetOnOpen('couple-1', 'me'); // photo
    await syncWidgetOnOpen('couple-1', 'me', { advance: false, trigger: 'push' });

    expect(shown()).toEqual(['photo', 'photo']);
    expect(stored[CURSOR_KEY]).toBe('photo');
  });

  it('jumps straight to the item a push named, then resumes the cycle from there', async () => {
    await syncWidgetOnOpen('couple-1', 'me'); // photo
    await syncWidgetOnOpen('couple-1', 'me', { advance: false, show: 'drawing', trigger: 'push' });
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });

    expect(shown()).toEqual(['photo', 'drawing', 'photo']);
  });

  it('falls through to the next item rather than wedging on one that will not build', async () => {
    // The photo is permanently unbuildable. Committing nothing is right, but retrying only the
    // photo on every open froze the widget on whatever it happened to be showing.
    mockGetSignedUrl.mockImplementation(async (_client: unknown, path: string) => {
      if (path.includes('photo')) throw new Error('widget-sync: signPhoto timed out after 20000ms');
      return 'https://signed.example/drawing.jpg';
    });

    await syncWidgetOnOpen('couple-1', 'me');

    expect(shown()).toEqual(['drawing']);
    expect(stored[CURSOR_KEY]).toBe('drawing');
  });

  it('restarts the cycle from the top when the persisted cursor is a legacy index', async () => {
    stored[CURSOR_KEY] = '1'; // written by the shipped build's integer cursor

    await syncWidgetOnOpen('couple-1', 'me');

    expect(shown()).toEqual(['photo']);
  });
});

describe('syncWidgetOnOpen — the debug channel', () => {
  it('carries a counter that increases by exactly one per landed snapshot', async () => {
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto, partnerDrawing]);

    await syncWidgetOnOpen('couple-1', 'me');
    await syncWidgetOnOpen('couple-1', 'me');

    const counts = mockUpdateSnapshot.mock.calls.map((call) => call[0]._syncCount);
    expect(counts[1] - counts[0]).toBe(1);
    // Persisted, so it keeps counting across a relaunch — "killing the app" is one of the two
    // sequences the shuffle has to be provable against.
    expect(stored[SYNC_COUNT_KEY]).toBe(String(counts[1]));
  });

  it('names the step, the trigger and what was present', async () => {
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto, partnerDrawing]);

    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'mount' });
    await syncWidgetOnOpen('couple-1', 'me', { trigger: 'foreground' });

    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({
      _cursor: 'none->photo',
      _present: 'photo,drawing',
      _trigger: 'mount',
    });
    expect(mockUpdateSnapshot.mock.calls[1][0]).toMatchObject({
      _cursor: 'photo->drawing',
      _trigger: 'foreground',
    });
    expect(mockUpdateSnapshot.mock.calls[1][0]._syncedAt).toEqual(expect.any(String));
  });

  it('says why an empty snapshot is empty', async () => {
    // The distinction that cannot be made from the home screen: no media at all versus media that
    // the partner-only filter removed, which is what a single-account test setup produces.
    mockFetchRecentMedia.mockResolvedValue([{ ...partnerPhoto, senderId: 'me' }]);

    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({
      kind: 'empty',
      _present: 'none',
      _source: 'media=1 partner=0 music=no',
    });
  });
});
