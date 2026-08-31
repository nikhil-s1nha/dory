import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  createCoupleWithInvite,
  findOutstandingInvite,
  isCoupleComplete,
  redeemInvite,
} from '@/domain/pairing/repository';
import { signOut } from '@/lib/auth';

import PairScreen from '../pair';

/**
 * The pairing screen's failure surface.
 *
 * Three things used to go wrong here and all of them were invisible. `createCoupleWithInvite`
 * rejecting on the `couples.member_a` unique index rendered the raw Postgres string at the user;
 * the `{ error }` that `signOut()` returns was discarded, so a failed sign-out looked like a dead
 * button; and when the *partner* redeemed the code, this screen never noticed — the inviter sat
 * here until they force-quit the app. None is reproducible by reading the screen — hence these.
 */

jest.mock('@/global.css', () => ({}));

/**
 * Records what the screen subscribed to and hands the test the callback, so a Realtime event can
 * be delivered without a socket. `removed` is what proves the subscription is torn down.
 */
const mockRealtime = {
  channelName: null as string | null,
  filter: null as Record<string, unknown> | null,
  handler: null as (() => void) | null,
  removed: 0,
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => {
      mockRealtime.channelName = name;
      const channel: Record<string, unknown> = {};
      channel.on = (_event: string, filter: Record<string, unknown>, cb: () => void) => {
        mockRealtime.filter = filter;
        mockRealtime.handler = cb;
        return channel;
      };
      channel.subscribe = () => channel;
      return channel;
    },
    removeChannel: () => {
      mockRealtime.removed += 1;
    },
  },
}));

// One stable instance: a fresh jest.fn() per render would change the identity of a dependency of
// the couple-completion effect and tear the subscription down on every re-render.
const mockRefreshProfile = jest.fn(async () => {});
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-a' } }, refreshProfile: mockRefreshProfile }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/lib/auth', () => ({ signOut: jest.fn() }));
jest.mock('@/domain/pairing/repository', () => ({
  findOutstandingInvite: jest.fn(),
  createCoupleWithInvite: jest.fn(),
  isCoupleComplete: jest.fn(),
  redeemInvite: jest.fn(),
}));

const mockFindOutstanding = findOutstandingInvite as jest.Mock;
const mockCreateCouple = createCoupleWithInvite as jest.Mock;
const mockIsCoupleComplete = isCoupleComplete as jest.Mock;
const mockRedeemInvite = redeemInvite as jest.Mock;
const mockSignOut = signOut as jest.Mock;

/** Exactly what supabase-js returns when this account already occupies slot A of a couple. */
const memberASlotTaken = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "couples_member_a_key"',
  details: 'Key (member_a)=(user-a) already exists.',
};

/** The screen's own poll interval; kept here so the test fails loudly if the constant moves. */
const POLL_MS = 5000;

/** Captures the screen's foreground listener so a test can push it to 'active'. */
let appStateHandler: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  mockFindOutstanding.mockReset().mockResolvedValue(null);
  mockCreateCouple
    .mockReset()
    .mockResolvedValue({ coupleId: 'couple-1', invite: { code: 'K7RQ2M', expiresAt: 0 } });
  mockIsCoupleComplete.mockReset().mockResolvedValue(false);
  mockRedeemInvite.mockReset().mockResolvedValue({ ok: true });
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockRefreshProfile.mockClear();
  mockRealtime.channelName = null;
  mockRealtime.filter = null;
  mockRealtime.handler = null;
  mockRealtime.removed = 0;
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: AppStateStatus) => void;
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Render and let the mount-time invite lookup settle. */
async function renderScreen() {
  const view = render(<PairScreen />);
  await act(async () => {});
  return view;
}

/** The inviter's view: an invite already minted and waiting for a partner. */
async function renderWithOutstandingInvite() {
  mockFindOutstanding.mockResolvedValue({ coupleId: 'couple-1', code: 'K7RQ2M', expiresAt: 0 });
  const view = await renderScreen();
  await screen.findByText('K7RQ2M');
  await act(async () => {}); // let the couple-completion effect's first check settle
  return view;
}

function codeInput() {
  return screen.getByPlaceholderText("Enter partner's code");
}

describe('creating an invite', () => {
  it('shows the minted code on success', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));
    expect(await screen.findByText('K7RQ2M')).toBeTruthy();
  });

  it('recovers the existing code instead of reporting a member_a slot collision', async () => {
    mockCreateCouple.mockRejectedValue(memberASlotTaken);
    mockFindOutstanding
      .mockResolvedValueOnce(null) // the mount-time read that missed it
      .mockResolvedValueOnce({ coupleId: 'couple-1', code: 'ZYXWVU', expiresAt: 0 });

    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));

    expect(await screen.findByText('ZYXWVU')).toBeTruthy();
    expect(screen.queryByText(/unique constraint/)).toBeNull();
  });

  it('never puts the raw Postgres text on screen when recovery also fails', async () => {
    mockCreateCouple.mockRejectedValue(memberASlotTaken);

    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));

    expect(await screen.findByText(/already started pairing/i)).toBeTruthy();
    expect(screen.queryByText(/duplicate key|unique constraint|member_a/)).toBeNull();
  });

  it('reports a connection problem as one rather than as a database message', async () => {
    mockCreateCouple.mockRejectedValue(new TypeError('Network request failed'));

    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));

    expect(await screen.findByText(/check your network/i)).toBeTruthy();
  });
});

/**
 * `autoCapitalize="characters"` only sets the keyboard's shift state. A paste, a third-party
 * keyboard or dictation walks straight past it, and the user was then staring at a lowercase code
 * while an uppercase one went to the server — the field has to show what will actually be sent.
 */
describe('entering a partner code', () => {
  it('uppercases as the user types', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), 'k7rq2m');
    expect(codeInput().props.value).toBe('K7RQ2M');
  });

  it('uppercases a pasted code and strips the whitespace it came wrapped in', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), '  k7 rq 2m ');
    expect(codeInput().props.value).toBe('K7RQ2M');
  });

  it('submits exactly the string the field is displaying', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), 'k7rq2m');
    fireEvent.press(screen.getByText('Pair'));
    await waitFor(() =>
      expect(mockRedeemInvite).toHaveBeenCalledWith(expect.anything(), 'K7RQ2M'),
    );
  });

  it('caps entry at the longest code we have ever issued', async () => {
    await renderScreen();
    expect(codeInput().props.maxLength).toBe(8);
  });

  it('turns autocorrect and spellcheck off — a random string is not a word', async () => {
    await renderScreen();
    expect(codeInput().props.autoCorrect).toBe(false);
    expect(codeInput().props.spellCheck).toBe(false);
    expect(codeInput().props.autoCapitalize).toBe('characters');
  });

  it('leaves Pair inert until the code could plausibly exist', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), 'K7R');
    fireEvent.press(screen.getByText('Pair'));
    expect(mockRedeemInvite).not.toHaveBeenCalled();

    fireEvent.changeText(codeInput(), 'K7RQ2M');
    fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(mockRedeemInvite).toHaveBeenCalled());
  });

  // Codes were 8 characters before CODE_LENGTH dropped to 6, and those invites stay redeemable
  // until they expire. The button must not be the thing that rejects them.
  it('still lets an 8-character code issued before the shortening through', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), 'bndstest');
    fireEvent.press(screen.getByText('Pair'));
    await waitFor(() =>
      expect(mockRedeemInvite).toHaveBeenCalledWith(expect.anything(), 'BNDSTEST'),
    );
  });

  it('refreshes the profile on a successful redeem, flipping the root gate', async () => {
    await renderScreen();
    fireEvent.changeText(codeInput(), 'K7RQ2M');
    fireEvent.press(screen.getByText('Pair'));
    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalled());
  });
});

/**
 * The inviter's side. Partner B's redemption happens entirely on the server, so without one of
 * these triggers nothing on A's device ever learns that the couple filled up.
 */
describe('waiting for the partner to redeem', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('subscribes to updates of its own couple row', async () => {
    await renderWithOutstandingInvite();
    expect(mockRealtime.channelName).toBe('couple_paired:couple-1');
    expect(mockRealtime.filter).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'couples',
      filter: 'id=eq.couple-1',
    });
  });

  it('does nothing at all while there is no outstanding invite to wait on', async () => {
    await renderScreen();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(mockRealtime.channelName).toBeNull();
    expect(mockIsCoupleComplete).not.toHaveBeenCalled();
  });

  it('stays put while the second slot is still open', async () => {
    await renderWithOutstandingInvite();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(mockIsCoupleComplete).toHaveBeenCalled();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it('flips the inviter into the app when a Realtime update says the couple is complete', async () => {
    await renderWithOutstandingInvite();
    mockIsCoupleComplete.mockResolvedValue(true);

    await act(async () => {
      mockRealtime.handler?.();
    });
    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalled());
  });

  // The backstop. Realtime is accepted by the client and then silently never fires on some
  // networks, which is exactly the failure that leaves someone stranded on this screen.
  it('flips the inviter into the app on the poll even if Realtime never fires', async () => {
    await renderWithOutstandingInvite();
    mockIsCoupleComplete.mockResolvedValue(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  it('re-checks when the app comes back to the foreground', async () => {
    await renderWithOutstandingInvite();
    mockIsCoupleComplete.mockResolvedValue(true);

    await act(async () => {
      appStateHandler?.('active');
    });
    await waitFor(() => expect(mockRefreshProfile).toHaveBeenCalled());
    // A trip to the background is not a reason to re-read anything.
    const callsAfterActive = mockIsCoupleComplete.mock.calls.length;
    await act(async () => {
      appStateHandler?.('background');
    });
    expect(mockIsCoupleComplete).toHaveBeenCalledTimes(callsAfterActive);
  });

  it('a failed check is a retry, not a verdict — it never reports the partner as absent', async () => {
    await renderWithOutstandingInvite();
    mockIsCoupleComplete.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(mockRefreshProfile).not.toHaveBeenCalled();

    mockIsCoupleComplete.mockResolvedValue(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  it('tears the subscription and the poll down on unmount', async () => {
    const { unmount } = await renderWithOutstandingInvite();
    unmount();

    expect(mockRealtime.removed).toBe(1);
    mockIsCoupleComplete.mockClear().mockResolvedValue(true);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(mockIsCoupleComplete).not.toHaveBeenCalled();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });
});

describe('signing out', () => {
  it('tells the user when sign-out fails instead of silently doing nothing', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('network down') });

    await renderScreen();
    fireEvent.press(screen.getByText('Sign out'));

    expect(await screen.findByText(/could not sign out/i)).toBeTruthy();
    // Pressable again: the failed attempt must not leave the control stuck.
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('says nothing on success — the root gate takes the screen away', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Sign out'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(screen.queryByText(/could not sign out/i)).toBeNull();
  });
});
