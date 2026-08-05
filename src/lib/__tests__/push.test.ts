import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureNotificationPermission,
  registerForPushNotifications,
  resolvePushEnvironment,
  saveDevicePushToken,
  unregisterDevicePushToken,
} from '../push';

/**
 * Native surface, reduced to the four answers push.ts actually reads. Mutating `mockNative` between
 * tests is how we walk the branches (denied, simulator, TestFlight) that can't be reproduced here.
 * The getters/async fns defer every read past module init, so the hoisted jest.mock factories don't
 * touch `mockNative` before it exists.
 */
const mockNative = {
  isDevice: true,
  permissions: { granted: true, canAskAgain: true } as Record<string, unknown>,
  requested: { granted: true } as Record<string, unknown>,
  devicePushToken: { type: 'ios', data: 'a1b2c3d4' } as { type: string; data: unknown },
  pushEnvironment: 'development' as 'development' | 'production' | null,
};

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockNative.isDevice;
  },
}));

jest.mock('expo-application', () => ({
  getIosPushNotificationServiceEnvironmentAsync: async () => mockNative.pushEnvironment,
}));

jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3 },
  getPermissionsAsync: async () => mockNative.permissions,
  requestPermissionsAsync: async () => mockNative.requested,
  getDevicePushTokenAsync: async () => mockNative.devicePushToken,
}));

beforeEach(() => {
  mockNative.isDevice = true;
  mockNative.permissions = { granted: true, canAskAgain: true };
  mockNative.requested = { granted: true };
  mockNative.devicePushToken = { type: 'ios', data: 'a1b2c3d4' };
  mockNative.pushEnvironment = 'development';
});

/** Fake covering the table builder surface push.ts uses: from/upsert/delete/eq, awaited. */
function makeClient(opts?: { error?: unknown }) {
  const calls = {
    tables: [] as string[],
    upserts: [] as { values: Record<string, unknown>; options?: { onConflict?: string } }[],
    deletes: 0,
    eqs: [] as [string, unknown][],
  };
  const result = { data: null, error: opts?.error ?? null };
  const builder: Record<string, unknown> = {
    upsert: (values: Record<string, unknown>, options?: { onConflict?: string }) => {
      calls.upserts.push({ values, options });
      return builder;
    },
    delete: () => {
      calls.deletes += 1;
      return builder;
    },
    eq: (c: string, v: unknown) => {
      calls.eqs.push([c, v]);
      return builder;
    },
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  const client = {
    from: (table: string) => {
      calls.tables.push(table);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const registration = { token: 'a1b2c3d4', platform: 'ios', environment: 'sandbox' } as const;

describe('saveDevicePushToken', () => {
  it('maps the registration onto push_tokens and upserts on the device token', async () => {
    const { client, calls } = makeClient();
    await saveDevicePushToken(client, 'user-a', registration);

    expect(calls.tables).toEqual(['push_tokens']);
    expect(calls.upserts).toEqual([
      {
        values: {
          user_id: 'user-a',
          device_token: 'a1b2c3d4',
          platform: 'ios',
          environment: 'sandbox',
          updated_at: expect.any(String),
        },
        options: { onConflict: 'device_token' },
      },
    ]);
  });

  it('refreshes updated_at itself — the table has a default but no moddatetime trigger', async () => {
    const { client, calls } = makeClient();
    await saveDevicePushToken(client, 'user-a', registration);
    expect(Object.keys(calls.upserts[0].values).sort()).toEqual([
      'device_token',
      'environment',
      'platform',
      'updated_at',
      'user_id',
    ]);
    // created_at stays the database's: re-registering must not reset when we first saw this device.
    expect(calls.upserts[0].values).not.toHaveProperty('created_at');
    expect(Date.parse(calls.upserts[0].values.updated_at as string)).not.toBeNaN();
  });

  it('throws when the write fails, so callers can decide', async () => {
    const { client } = makeClient({ error: new Error('rls denied') });
    await expect(saveDevicePushToken(client, 'user-a', registration)).rejects.toThrow('rls denied');
  });
});

describe('resolvePushEnvironment', () => {
  it('is production only for a production aps-environment entitlement', async () => {
    mockNative.pushEnvironment = 'production';
    expect(await resolvePushEnvironment()).toBe('production');
  });

  it('is sandbox for a development entitlement — including a Release build installed by Xcode', async () => {
    mockNative.pushEnvironment = 'development';
    expect(await resolvePushEnvironment()).toBe('sandbox');
  });

  it('falls back to sandbox when the entitlement cannot be read', async () => {
    mockNative.pushEnvironment = null;
    expect(await resolvePushEnvironment()).toBe('sandbox');
  });
});

describe('ensureNotificationPermission', () => {
  it('does not re-prompt when permission is already granted', async () => {
    mockNative.permissions = { granted: true, canAskAgain: true };
    mockNative.requested = { granted: false }; // would fail the assertion if it were consulted
    expect(await ensureNotificationPermission()).toBe(true);
  });

  it('accepts provisional authorization', async () => {
    mockNative.permissions = { granted: false, canAskAgain: true, ios: { status: 3 } };
    mockNative.requested = { granted: false };
    expect(await ensureNotificationPermission()).toBe(true);
  });

  it('returns false without prompting once iOS will no longer ask', async () => {
    mockNative.permissions = { granted: false, canAskAgain: false, ios: { status: 1 } };
    mockNative.requested = { granted: true }; // would wrongly report true if it were consulted
    expect(await ensureNotificationPermission()).toBe(false);
  });

  it('prompts and reports the answer when undetermined', async () => {
    mockNative.permissions = { granted: false, canAskAgain: true, ios: { status: 0 } };
    mockNative.requested = { granted: true };
    expect(await ensureNotificationPermission()).toBe(true);
  });
});

describe('registerForPushNotifications', () => {
  it('stores the APNs token with the environment its entitlement implies', async () => {
    mockNative.pushEnvironment = 'production';
    const { client, calls } = makeClient();

    const result = await registerForPushNotifications(client, 'user-a');

    expect(result).toEqual({ token: 'a1b2c3d4', platform: 'ios', environment: 'production' });
    expect(calls.upserts[0].values).toEqual({
      user_id: 'user-a',
      device_token: 'a1b2c3d4',
      platform: 'ios',
      environment: 'production',
      updated_at: expect.any(String),
    });
  });

  it('is idempotent: re-registering the same device repeats the identical upsert', async () => {
    const { client, calls } = makeClient();
    await registerForPushNotifications(client, 'user-a');
    await registerForPushNotifications(client, 'user-a');

    expect(calls.upserts).toHaveLength(2);
    // Everything but updated_at, which is a wall-clock stamp and would make this flaky.
    const { updated_at: _first, ...firstRow } = calls.upserts[0].values;
    const { updated_at: _second, ...secondRow } = calls.upserts[1].values;
    expect(firstRow).toEqual(secondRow);
    expect(calls.upserts[1].options).toEqual({ onConflict: 'device_token' });
  });

  it('writes nothing when the user declines the prompt', async () => {
    mockNative.permissions = { granted: false, canAskAgain: true, ios: { status: 0 } };
    mockNative.requested = { granted: false };
    const { client, calls } = makeClient();

    expect(await registerForPushNotifications(client, 'user-a')).toBeNull();
    expect(calls.upserts).toHaveLength(0);
    expect(calls.tables).toHaveLength(0);
  });

  it('writes nothing on a simulator, which never gets an APNs token', async () => {
    mockNative.isDevice = false;
    const { client, calls } = makeClient();

    expect(await registerForPushNotifications(client, 'user-a')).toBeNull();
    expect(calls.upserts).toHaveLength(0);
  });

  it('writes nothing when the native token comes back empty', async () => {
    mockNative.devicePushToken = { type: 'ios', data: '' };
    const { client, calls } = makeClient();

    expect(await registerForPushNotifications(client, 'user-a')).toBeNull();
    expect(calls.upserts).toHaveLength(0);
  });

  it('never throws into the UI when the write fails', async () => {
    const { client } = makeClient({ error: new Error('offline') });
    await expect(registerForPushNotifications(client, 'user-a')).resolves.toBeNull();
  });
});

describe('unregisterDevicePushToken', () => {
  it('deletes only this device row for this user', async () => {
    const { client, calls } = makeClient();
    await unregisterDevicePushToken(client, 'user-a');

    expect(calls.tables).toEqual(['push_tokens']);
    expect(calls.deletes).toBe(1);
    expect(calls.eqs).toEqual([
      ['user_id', 'user-a'],
      ['device_token', 'a1b2c3d4'],
    ]);
  });

  it('does nothing when there is no token to remove', async () => {
    mockNative.isDevice = false;
    const { client, calls } = makeClient();
    await unregisterDevicePushToken(client, 'user-a');
    expect(calls.deletes).toBe(0);
  });

  it('never throws into sign-out when the delete fails', async () => {
    const { client } = makeClient({ error: new Error('offline') });
    await expect(unregisterDevicePushToken(client, 'user-a')).resolves.toBeUndefined();
  });
});
