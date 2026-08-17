import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchRecentMedia, getSignedUrl } from '@/domain/media/repository';
import { fetchPartnerNowPlaying } from '@/domain/spotify/repository';

import BundlesWidget from '../../../widgets/bundles-widget';
import { syncWidgetOnOpen } from '../widget-sync';

/**
 * The smart-stack cursor's commit point.
 *
 * `syncWidgetOnOpen` used to persist the advanced cursor *before* building the item it had just
 * selected. A download timeout then left the cursor pointing one step past an item that was never
 * rendered, so the next open started after it — the partner's photo was skipped permanently, and
 * the bare `catch {}` meant nothing anywhere said so. These tests pin both halves: the cursor only
 * moves once a snapshot has landed, and a failure is logged rather than discarded.
 */

jest.mock('expo-widgets', () => ({ widgetsDirectory: '/tmp/widgets' }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {} }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
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

/** A photo waiting from the partner. Building it requires a signed URL, which is what we fail. */
const partnerPhoto = {
  id: 'photo-1',
  type: 'photo',
  senderId: 'partner',
  storagePath: 'couple-1/photo-1.jpg',
  createdAt: 0,
};

/** Music with no album art builds without touching the filesystem — the simplest success path. */
const partnerMusic = { nowPlaying: { title: 'Song', artist: 'Band' }, name: 'Sam' };

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks only forgets calls — one test replaces this implementation with a throw.
  mockUpdateSnapshot.mockReset();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockFetchRecentMedia.mockResolvedValue([]);
  mockFetchNowPlaying.mockResolvedValue(null);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('syncWidgetOnOpen', () => {
  it('advances and persists the cursor once the snapshot has landed', async () => {
    mockFetchNowPlaying.mockResolvedValue(partnerMusic);

    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot).toHaveBeenCalledTimes(1);
    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({ kind: 'music', title: 'Song' });
    expect(mockSetItem).toHaveBeenCalledWith(CURSOR_KEY, '0');
  });

  it('leaves the cursor untouched when building the item fails', async () => {
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto]);
    mockGetSignedUrl.mockRejectedValue(new Error('widget-sync: signPhoto timed out after 20000ms'));

    await syncWidgetOnOpen('couple-1', 'me');

    // The heart of it: no snapshot means no advance, so the next open retries this same photo
    // instead of skipping past it forever.
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('leaves the cursor untouched when handing the snapshot to the widget fails', async () => {
    mockFetchNowPlaying.mockResolvedValue(partnerMusic);
    mockUpdateSnapshot.mockImplementation(() => {
      throw new Error('extension not installed');
    });

    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('logs the real error rather than discarding it', async () => {
    const boom = new Error('widget-sync: download timed out after 20000ms');
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto]);
    mockGetSignedUrl.mockRejectedValue(boom);

    await syncWidgetOnOpen('couple-1', 'me');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('syncWidgetOnOpen failed'), boom);
  });

  it('never throws into its fire-and-forget callers', async () => {
    mockFetchRecentMedia.mockRejectedValue(new Error('offline'));
    await expect(syncWidgetOnOpen('couple-1', 'me')).resolves.toBeUndefined();
  });

  it('resumes from the stored cursor and wraps, committing only the landed step', async () => {
    // Two items present (drawing has no download when it is not the chosen one), cursor at 0 →
    // advance to 1, which is the music frame.
    mockFetchRecentMedia.mockResolvedValue([partnerPhoto]);
    mockFetchNowPlaying.mockResolvedValue(partnerMusic);
    mockGetItem.mockResolvedValue('0');

    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({ kind: 'music' });
    expect(mockSetItem).toHaveBeenCalledWith(CURSOR_KEY, '1');
    // The photo was never signed: the stack picked music, so nothing downloaded.
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('commits an empty snapshot too — nothing present is a real, renderable state', async () => {
    await syncWidgetOnOpen('couple-1', 'me');

    expect(mockUpdateSnapshot.mock.calls[0][0]).toMatchObject({ kind: 'empty' });
    expect(mockSetItem).toHaveBeenCalledWith(CURSOR_KEY, '0');
  });
});
