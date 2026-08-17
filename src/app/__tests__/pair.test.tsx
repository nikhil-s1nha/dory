import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createCoupleWithInvite, findOutstandingInvite } from '@/domain/pairing/repository';

import PairScreen from '../pair';

/**
 * The pairing screen's failure surface.
 *
 * `createCoupleWithInvite` rejecting on the `couples.member_a` unique index used to render the raw
 * Postgres string at the user — a correct diagnosis phrased as an implementation detail, with
 * nothing to do about it. Not reproducible by reading the screen, hence these.
 */

jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-a' } }, refreshProfile: jest.fn() }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/lib/auth', () => ({ signOut: jest.fn(async () => ({ error: null })) }));
jest.mock('@/domain/pairing/repository', () => ({
  findOutstandingInvite: jest.fn(),
  createCoupleWithInvite: jest.fn(),
  redeemInvite: jest.fn(),
}));

const mockFindOutstanding = findOutstandingInvite as jest.Mock;
const mockCreateCouple = createCoupleWithInvite as jest.Mock;

/** Exactly what supabase-js returns when this account already occupies slot A of a couple. */
const memberASlotTaken = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "couples_member_a_key"',
  details: 'Key (member_a)=(user-a) already exists.',
};

beforeEach(() => {
  mockFindOutstanding.mockReset().mockResolvedValue(null);
  mockCreateCouple
    .mockReset()
    .mockResolvedValue({ coupleId: 'couple-1', invite: { code: 'ABCDEFGH', expiresAt: 0 } });
});

/** Render and let the mount-time invite lookup settle. */
async function renderScreen() {
  render(<PairScreen />);
  await act(async () => {});
}

describe('creating an invite', () => {
  it('shows the minted code on success', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));
    expect(await screen.findByText('ABCDEFGH')).toBeTruthy();
  });

  it('recovers the existing code instead of reporting a member_a slot collision', async () => {
    mockCreateCouple.mockRejectedValue(memberASlotTaken);
    mockFindOutstanding
      .mockResolvedValueOnce(null) // the mount-time read that missed it
      .mockResolvedValueOnce({ coupleId: 'couple-1', code: 'ZYXWVUTS', expiresAt: 0 });

    await renderScreen();
    fireEvent.press(screen.getByText('Create a code'));

    expect(await screen.findByText('ZYXWVUTS')).toBeTruthy();
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

