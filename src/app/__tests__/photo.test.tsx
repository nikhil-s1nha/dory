import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PhotoScreen from '../photo';

/**
 * The shutter's failure path.
 *
 * `takePictureAsync` was called unguarded, so a hardware or permission failure became an unhandled
 * promise rejection and the shutter simply appeared to do nothing — indistinguishable from a slow
 * capture, with nothing on screen and nothing in a log. `send()` on the same screen already had
 * the right shape; this makes capture match it.
 */

const mockTakePicture = jest.fn();

jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { coupleId: 'couple-1' } }),
}));
jest.mock('@/domain/media/repository', () => ({
  sendImage: jest.fn(),
  notifyPartnerOfSend: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: View };
});
jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const CameraView = React.forwardRef((props: object, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: (...args: unknown[]) => mockTakePicture(...args),
    }));
    return React.createElement(View, props);
  });
  CameraView.displayName = 'CameraView';
  return { useCameraPermissions: () => [{ granted: true }, jest.fn()], CameraView };
});

beforeEach(() => {
  mockTakePicture.mockReset().mockResolvedValue({ uri: 'file:///shot.jpg' });
});

const pressShutter = () => fireEvent.press(screen.getByLabelText('Take photo'));

it('moves to the review screen after a successful capture', async () => {
  render(<PhotoScreen />);
  pressShutter();
  await act(async () => {});

  expect(screen.getByText('Send')).toBeTruthy();
  expect(screen.getByText('Retake')).toBeTruthy();
});

it('shows the failure instead of leaving a dead shutter', async () => {
  mockTakePicture.mockRejectedValue(new Error('Camera unavailable'));
  render(<PhotoScreen />);

  pressShutter();

  expect(await screen.findByText('Camera unavailable')).toBeTruthy();
  // Still on the camera, so the user can simply try again.
  expect(screen.getByLabelText('Take photo')).toBeTruthy();
  expect(screen.queryByText('Send')).toBeNull();
});

it('does not reject into the void — the screen absorbs the failure', async () => {
  mockTakePicture.mockRejectedValue(new Error('Camera unavailable'));
  render(<PhotoScreen />);

  // An unhandled rejection here is the original bug; this passes only because capture() catches.
  await expect(
    act(async () => {
      pressShutter();
    }),
  ).resolves.toBeUndefined();
});

it('says so when the camera hands back no image at all', async () => {
  mockTakePicture.mockResolvedValue(undefined);
  render(<PhotoScreen />);

  pressShutter();

  await waitFor(() => expect(screen.getByText(/camera returned nothing/i)).toBeTruthy());
});

it('clears a previous capture error when the next attempt succeeds', async () => {
  mockTakePicture.mockRejectedValueOnce(new Error('Camera unavailable'));
  render(<PhotoScreen />);

  pressShutter();
  expect(await screen.findByText('Camera unavailable')).toBeTruthy();

  pressShutter();
  await waitFor(() => expect(screen.getByText('Send')).toBeTruthy());
});
