/**
 * The app-side behaviour that can be checked without a phone: which item the activity shows, how the
 * App Group filename gets into the content state, and — the one the whole architecture turns on —
 * the push-to-start ordering, where the first frame is text-only and the app fills in the image once
 * it wakes up.
 *
 * ActivityKit and the network are mocked at the module seam. What is *not* mocked is the content
 * state construction, so the deep links and titles asserted here are the real ones.
 */

import type { StackContext } from '@/lib/widget-sync';

import {
  buildPartnerActivityState,
  endPartnerActivity,
  getKnownActivityId,
  onActivityTokenReceived,
  resetActivityBookkeeping,
  resolveActivityImage,
  startPartnerActivity,
} from '../service';

const mockNative = {
  running: true,
  starts: [] as unknown[],
  updates: [] as unknown[],
  ends: 0,
};

const mockRepo = {
  updateTokens: [] as [string, string][],
  starts: [] as [string, string | null][],
  ends: [] as string[],
  endError: null as unknown,
};

const mockStack = {
  present: ['photo', 'drawing', 'music'] as string[],
  ctx: null as StackContext | null,
  /** What `buildProps` hands back — the App Group URI `downloadToAppGroup` wrote. */
  imageFile: 'file:///AppGroup/ABC/ExpoWidgets/photo-1.jpg' as string | undefined,
};

jest.mock('@/lib/widget-sync', () => ({
  loadStackSnapshot: async () => ({ ctx: mockStack.ctx, present: mockStack.present }),
  buildProps: async (item: string) => ({ kind: item, imageFile: mockStack.imageFile }),
}));

jest.mock('@/domain/activity/live-activity', () => ({
  describeActivityError: (e: unknown) => String(e),
  getRunningActivity: () => (mockNative.running ? {} : null),
  startBundlesActivity: (state: unknown) => {
    mockNative.starts.push(state);
    return {};
  },
  updateBundlesActivity: async (state: unknown) => {
    mockNative.updates.push(state);
  },
  endBundlesActivity: async () => {
    mockNative.ends += 1;
  },
}));

jest.mock('@/domain/activity/repository', () => ({
  registerActivityUpdateToken: async (activityId: string, token: string) => {
    mockRepo.updateTokens.push([activityId, token]);
  },
  recordActivityStarted: async (activityId: string, mediaId: string | null) => {
    mockRepo.starts.push([activityId, mediaId]);
  },
  recordActivityEnded: async (activityId: string) => {
    if (mockRepo.endError) throw mockRepo.endError;
    mockRepo.ends.push(activityId);
  },
}));

const photo = {
  id: 'photo-1',
  coupleId: 'couple-1',
  senderId: 'partner',
  type: 'photo' as const,
  storagePath: 'couple-1/photo-1.jpg',
  createdAt: 1_700_000_000_000,
  seenAt: null,
};
const drawing = { ...photo, id: 'drawing-1', type: 'drawing' as const };

beforeEach(() => {
  mockNative.running = true;
  mockNative.starts = [];
  mockNative.updates = [];
  mockNative.ends = 0;
  mockRepo.updateTokens = [];
  mockRepo.starts = [];
  mockRepo.ends = [];
  mockRepo.endError = null;
  mockStack.present = ['photo', 'drawing', 'music'];
  mockStack.imageFile = 'file:///AppGroup/ABC/ExpoWidgets/photo-1.jpg';
  mockStack.ctx = {
    latestPhoto: photo,
    latestDrawing: drawing,
    music: {
      trackId: 't1',
      title: 'Nightcall',
      artist: 'Kavinsky',
      albumArtUrl: 'https://x/art.jpg',
      isPlaying: true,
    },
    partnerName: 'Alex',
  };
  resetActivityBookkeeping();
});

describe('buildPartnerActivityState', () => {
  it('shows the top-priority present item, with no rotation', async () => {
    const { item, state } = await buildPartnerActivityState('couple-1', 'user-a');
    expect(item).toBe('photo');
    expect(state?.title).toBe('Alex sent you a photo');
    expect(state?.deepLink).toBe('bundles://media/photo-1');
  });

  it('falls to the next priority when the higher one is absent', async () => {
    mockStack.present = ['drawing', 'music'];
    const { item, state } = await buildPartnerActivityState('couple-1', 'user-a');
    expect(item).toBe('drawing');
    expect(state?.deepLink).toBe('bundles://draw?base=drawing-1');
  });

  it('reduces the App Group URI to the filename the contract puts on the wire', async () => {
    const { state } = await buildPartnerActivityState('couple-1', 'user-a');
    expect(state?.imageFile).toBe('photo-1.jpg');
  });

  it('is a text-only state when there is no image for the item', async () => {
    mockStack.imageFile = undefined;
    const { state } = await buildPartnerActivityState('couple-1', 'user-a');
    expect(state?.imageFile).toBeNull();
  });

  it('reports the media_items row for the instance table', async () => {
    expect((await buildPartnerActivityState('couple-1', 'user-a')).mediaId).toBe('photo-1');
    mockStack.present = ['music'];
    expect((await buildPartnerActivityState('couple-1', 'user-a')).mediaId).toBeNull();
  });

  it('has nothing to show when the partner has sent nothing', async () => {
    mockStack.present = [];
    expect(await buildPartnerActivityState('couple-1', 'user-a')).toEqual({
      item: null,
      state: null,
      mediaId: null,
    });
  });
});

describe('startPartnerActivity', () => {
  it('starts with the real content, image included', async () => {
    const state = await startPartnerActivity('couple-1', 'user-a');
    expect(mockNative.starts).toHaveLength(1);
    expect(state?.imageFile).toBe('photo-1.jpg');
  });

  it('starts nothing when there is nothing waiting', async () => {
    mockStack.present = [];
    expect(await startPartnerActivity('couple-1', 'user-a')).toBeNull();
    expect(mockNative.starts).toHaveLength(0);
  });
});

describe('resolveActivityImage — the push-to-start ordering fix', () => {
  it('gives a running push-started activity its image', async () => {
    // The push could only carry a text-only state: the image was not in the App Group yet.
    const state = await resolveActivityImage('couple-1', 'user-a');
    expect(state?.imageFile).toBe('photo-1.jpg');
    expect(mockNative.updates).toHaveLength(1);
  });

  it('does nothing when no activity is running — the ordinary app open', async () => {
    mockNative.running = false;
    expect(await resolveActivityImage('couple-1', 'user-a')).toBeNull();
    expect(mockNative.updates).toHaveLength(0);
  });

  it('does not spend an update re-sending an identical state', async () => {
    await resolveActivityImage('couple-1', 'user-a');
    expect(await resolveActivityImage('couple-1', 'user-a')).toBeNull();
    expect(mockNative.updates).toHaveLength(1);
  });

  it('does send again once the content actually changes', async () => {
    await resolveActivityImage('couple-1', 'user-a');
    mockStack.present = ['drawing'];
    mockStack.imageFile = 'file:///AppGroup/ABC/ExpoWidgets/drawing-1.jpg';
    const next = await resolveActivityImage('couple-1', 'user-a');
    expect(next?.kind).toBe('drawing');
    expect(mockNative.updates).toHaveLength(2);
  });

  it('does nothing when the partner has nothing waiting', async () => {
    mockStack.present = [];
    expect(await resolveActivityImage('couple-1', 'user-a')).toBeNull();
    expect(mockNative.updates).toHaveLength(0);
  });
});

describe('onActivityTokenReceived', () => {
  it('writes the update token and the instance row from the one event that knows the id', async () => {
    await startPartnerActivity('couple-1', 'user-a');
    await onActivityTokenReceived({ activityId: 'activity-1', pushToken: 'tok' });

    expect(mockRepo.updateTokens).toEqual([['activity-1', 'tok']]);
    expect(mockRepo.starts).toEqual([['activity-1', 'photo-1']]);
    expect(getKnownActivityId()).toBe('activity-1');
  });

  it('records a null media_id when the activity is showing music', async () => {
    mockStack.present = ['music'];
    await startPartnerActivity('couple-1', 'user-a');
    await onActivityTokenReceived({ activityId: 'activity-2', pushToken: 'tok' });
    expect(mockRepo.starts).toEqual([['activity-2', null]]);
  });
});

/**
 * A device where the token event never fires — push notifications off, Live Activities disabled,
 * iOS below 17.2 — gets no `activityId`, and therefore no `live_activity_instances` row. That is
 * accepted, not designed around: the activity still runs and still renders. What must not happen is
 * a throw, so the missing row degrades into silence rather than a broken screen.
 */
describe('when no push token event ever arrives', () => {
  it('starts, updates and ends without a single database write', async () => {
    await startPartnerActivity('couple-1', 'user-a');
    mockStack.present = ['drawing'];
    mockStack.imageFile = 'file:///AppGroup/ABC/ExpoWidgets/drawing-1.jpg';
    await resolveActivityImage('couple-1', 'user-a');
    await endPartnerActivity();

    expect(mockNative.starts).toHaveLength(1);
    expect(mockNative.updates).toHaveLength(1);
    expect(mockNative.ends).toBe(1);
    expect(mockRepo.updateTokens).toHaveLength(0);
    expect(mockRepo.starts).toHaveLength(0);
    expect(mockRepo.ends).toHaveLength(0);
  });
});

describe('endPartnerActivity', () => {
  it('ends the activity and retires the row once the id is known', async () => {
    await onActivityTokenReceived({ activityId: 'activity-1', pushToken: 'tok' });
    await endPartnerActivity();

    expect(mockNative.ends).toBe(1);
    expect(mockRepo.ends).toEqual(['activity-1']);
    expect(getKnownActivityId()).toBeNull();
  });

  it('still ends when no token event ever told us the id', async () => {
    await endPartnerActivity();
    expect(mockNative.ends).toBe(1);
    expect(mockRepo.ends).toHaveLength(0);
  });

  it('does not report a failed end when only the bookkeeping write failed', async () => {
    await onActivityTokenReceived({ activityId: 'activity-1', pushToken: 'tok' });
    mockRepo.endError = new Error('offline');
    await expect(endPartnerActivity()).resolves.toBeUndefined();
    expect(mockNative.ends).toBe(1);
  });

  it('forgets the last sent state, so the next activity is not suppressed as a repeat', async () => {
    await resolveActivityImage('couple-1', 'user-a');
    await endPartnerActivity();
    await resolveActivityImage('couple-1', 'user-a');
    expect(mockNative.updates).toHaveLength(2);
  });
});
