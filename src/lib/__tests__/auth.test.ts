import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '../auth';

/**
 * The Apple path's two failure modes that are easy to get wrong: a cancel that must not read as
 * an error, and the one-shot name capture that must not clobber an existing profile name.
 */

const mockSignInAsync = jest.fn();
const mockSignInWithIdToken = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
}));

const mockEnsureProfileDisplayName = jest.fn();
jest.mock('@/domain/auth/repository', () => ({
  ensureProfileDisplayName: (...args: unknown[]) => mockEnsureProfileDisplayName(...args),
}));

// signOut's push cleanup drags in expo-notifications, which warns loudly under jest and has
// nothing to do with the Apple path under test.
jest.mock('@/lib/push', () => ({ unregisterDevicePushToken: jest.fn() }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
    },
  },
}));

/** The shape expo-apple-authentication rejects with when the user dismisses the sheet. */
function codedError(code: string) {
  return Object.assign(new Error('The operation was canceled.'), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
});

describe('signInWithApple', () => {
  it('requests both scopes, since the name is only ever offered once', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'tok', fullName: null, email: null });
    await signInWithApple();
    expect(mockSignInAsync).toHaveBeenCalledWith({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  });

  it('reports a cancel as a cancel, not an error to put on screen', async () => {
    mockSignInAsync.mockRejectedValue(codedError('ERR_REQUEST_CANCELED'));
    await expect(signInWithApple()).resolves.toEqual({ canceled: true, error: null });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('surfaces a real Apple failure', async () => {
    mockSignInAsync.mockRejectedValue(codedError('ERR_REQUEST_FAILED'));
    const result = await signInWithApple();
    expect(result.canceled).toBe(false);
    expect(result.error?.message).toBe('The operation was canceled.');
  });

  it('exchanges the identity token and captures the name Apple granted', async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: 'tok',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
      email: 'ada@example.com',
    });
    await expect(signInWithApple()).resolves.toEqual({ canceled: false, error: null });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'tok' });
    expect(mockEnsureProfileDisplayName).toHaveBeenCalledWith(
      expect.anything(),
      'user-a',
      'Ada Lovelace',
    );
  });

  it('does not touch the profile when the token exchange failed', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'tok', fullName: null, email: null });
    mockSignInWithIdToken.mockResolvedValue({ data: {}, error: { message: 'bad audience' } });
    const result = await signInWithApple();
    expect(result.error?.message).toBe('bad audience');
    expect(mockEnsureProfileDisplayName).not.toHaveBeenCalled();
  });
});
