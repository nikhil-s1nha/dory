import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { AuthProvider, useAuth } from '../auth-context';

/**
 * The provider's contract under failure, which is what the root layout routes on.
 *
 * A profile read that fails is not a profile that says "unpaired". Before this was distinguished,
 * one bad request at launch set `profile` to null, the root gate saw `!profile?.coupleId`, and an
 * already-paired couple landed on the pairing screen with no way back except relaunching the app.
 * These tests pin both halves: failure never overwrites what we know, and there is a retry.
 */

/** The one profiles row the fake client returns, and whether reading it currently fails. */
const mockDb = {
  row: { id: 'user-a', display_name: 'Ada', couple_id: 'couple-1' } as {
    id: string;
    display_name: string;
    couple_id: string | null;
  } | null,
  error: null as Error | null,
};

const mockSession = { user: { id: 'user-a' } };

jest.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) builder[m] = () => builder;
  builder.maybeSingle = async () => {
    return mockDb.error ? { data: null, error: mockDb.error } : { data: mockDb.row, error: null };
  };
  return {
    supabase: {
      from: () => builder,
      auth: {
        getSession: async () => ({ data: { session: mockSession } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

/** Renders the three fields the root layout gates on, so assertions read like the gate does. */
function Probe() {
  const { profile, profileError, loading } = useAuth();
  return (
    <Text testID="state">{`${loading ? 'loading' : 'ready'}|${profile?.coupleId ?? 'unpaired'}|${
      profileError ? 'error' : 'ok'
    }`}</Text>
  );
}

/** Foreground handlers registered by the provider, so tests can drive the AppState retry. */
let foregroundHandlers: ((state: string) => void)[] = [];

beforeEach(() => {
  mockDb.row = { id: 'user-a', display_name: 'Ada', couple_id: 'couple-1' };
  mockDb.error = null;
  foregroundHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void,
  ) => {
    foregroundHandlers.push(handler);
    return { remove: () => {} };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const stateText = () => screen.getByTestId('state').props.children;

const foreground = async () => {
  await act(async () => {
    foregroundHandlers.forEach((h) => h('active'));
  });
};

/** Renders and lets the initial getSession + profile read settle, so nothing lands outside act(). */
async function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
}

it('exposes the profile once the initial read lands', async () => {
  await renderProvider();
  await waitFor(() => expect(stateText()).toBe('ready|couple-1|ok'));
});

it('keeps a known-paired user paired when a later read fails', async () => {
  await renderProvider();
  await waitFor(() => expect(stateText()).toBe('ready|couple-1|ok'));

  mockDb.error = new Error('network down');
  await foreground();

  // The couple id survives — this is the assertion that keeps a paired couple out of /pair.
  await waitFor(() => expect(stateText()).toBe('ready|couple-1|error'));
});

it('flags an error rather than reporting "unpaired" when the very first read fails', async () => {
  mockDb.error = new Error('network down');
  await renderProvider();

  // profileError is what sends the root layout to /connection instead of /pair. Both halves
  // matter: we do not claim to know they are unpaired, and we do say the read failed.
  await waitFor(() => expect(stateText()).toBe('ready|unpaired|error'));
});

it('retries on foreground and clears the error once the read succeeds', async () => {
  mockDb.error = new Error('network down');
  await renderProvider();
  await waitFor(() => expect(stateText()).toBe('ready|unpaired|error'));

  mockDb.error = null;
  await foreground();

  await waitFor(() => expect(stateText()).toBe('ready|couple-1|ok'));
});

it('reports an absent profile row as unpaired, with no error', async () => {
  mockDb.row = null;
  await renderProvider();
  await waitFor(() => expect(stateText()).toBe('ready|unpaired|ok'));
});

it('picks up a partner redeeming the invite on the next foreground', async () => {
  mockDb.row = { id: 'user-a', display_name: 'Ada', couple_id: null };
  await renderProvider();
  await waitFor(() => expect(stateText()).toBe('ready|unpaired|ok'));

  mockDb.row = { id: 'user-a', display_name: 'Ada', couple_id: 'couple-1' };
  await foreground();

  await waitFor(() => expect(stateText()).toBe('ready|couple-1|ok'));
});
