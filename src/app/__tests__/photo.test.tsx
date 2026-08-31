import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { enqueueSend } from '@/domain/media/outbox';

import { SENT_FLASH_MS } from '@/components/sent-flash';

import PhotoScreen from '../photo';

/**
 * Two failure shapes this screen has had.
 *
 * `takePictureAsync` was called unguarded, so a hardware or permission failure became an unhandled
 * promise rejection and the shutter simply appeared to do nothing — indistinguishable from a slow
 * capture, with nothing on screen and nothing in a log.
 *
 * And Send used to hold the screen open for the whole upload. It now hands the work to the outbox
 * and leaves, so what matters is that the handoff happens without awaiting anything and the screen
 * really does dismiss.
 */

const mockTakePicture = jest.fn();
const mockBack = jest.fn();

jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { coupleId: 'couple-1' } }),
}));
jest.mock('@/domain/media/repository', () => ({
  sendImage: jest.fn(),
  notifyPartnerOfSend: jest.fn(),
}));
jest.mock('@/domain/media/outbox', () => ({ enqueueSend: jest.fn() }));
// One stable router object: the dismiss timer keys off it, and a fresh identity every render would
// restart that timer forever.
jest.mock('expo-router', () => {
  const router = { back: () => mockBack(), push: jest.fn() };
  return { useRouter: () => router };
});
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
  mockTakePicture.mockReset().mockResolvedValue({ uri: 'file:///shot.jpg', width: 3024, height: 4032 });
  mockBack.mockReset();
  (enqueueSend as jest.Mock).mockReset();
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

describe('sending', () => {
  const capture = async () => {
    render(<PhotoScreen />);
    pressShutter();
    await act(async () => {});
  };

  it('hands the send to the outbox and dismisses, without waiting for the upload', async () => {
    jest.useFakeTimers();
    try {
      await capture();

      fireEvent.press(screen.getByText('Send'));

      // Queued synchronously with the captured file — nothing here is awaited.
      expect(enqueueSend).toHaveBeenCalledTimes(1);
      expect((enqueueSend as jest.Mock).mock.calls[0][1]).toMatchObject({
        coupleId: 'couple-1',
        senderId: 'me',
        type: 'photo',
        localUri: 'file:///shot.jpg',
      });

      // A receipt first, so the tap doesn't just blink away…
      expect(screen.getByText('Sent')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();

      // …then the screen leaves on its own.
      act(() => {
        jest.advanceTimersByTime(SENT_FLASH_MS);
      });
      expect(mockBack).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not queue the same capture twice on a double tap', async () => {
    jest.useFakeTimers();
    try {
      await capture();
      const send = screen.getByText('Send');
      fireEvent.press(send);
      fireEvent.press(send);
      expect(enqueueSend).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the crop guide over both the viewfinder and the review shot', async () => {
    render(<PhotoScreen />);
    // The guide has to be on the camera, or the framing decision is made blind.
    expect(screen.getByTestId('widget-crop-guide')).toBeTruthy();

    pressShutter();
    await act(async () => {});

    // …and on the review, or the confirmation is of a framing the user never saw.
    expect(screen.getByTestId('widget-crop-guide')).toBeTruthy();
    expect(screen.getByText(/widget shows/i)).toBeTruthy();
  });
});
