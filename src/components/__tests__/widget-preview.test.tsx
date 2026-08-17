import { render, screen } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';

import { useWidgetPreview } from '@/hooks/use-widget-preview';

import { WidgetPreview } from '../widget-preview';

/**
 * What the preview shows before it has anything to show.
 *
 * `useWidgetPreview` chains up to three network calls, each bounded at 20 seconds, so the loading
 * window is tens of seconds wide on a bad connection. It used to render a bare `View` for all of
 * it — pixel-identical to the "indefinite black rectangle" failure this component was already
 * fixed for once, and therefore unreadable as progress.
 */

jest.mock('@/hooks/use-widget-preview', () => ({ useWidgetPreview: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text: RNText } = jest.requireActual('react-native');
  return { Host: View, HStack: View, VStack: View, Spacer: View, Image: View, Text: RNText };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => {
  const noop = () => ({});
  return {
    aspectRatio: noop,
    clipped: noop,
    clipShape: noop,
    font: noop,
    foregroundStyle: noop,
    frame: noop,
    padding: noop,
    resizable: noop,
  };
});

const mockUseWidgetPreview = useWidgetPreview as jest.Mock;

const indicator = () => screen.UNSAFE_queryByType(ActivityIndicator);

it('shows a spinner while the preview is loading, not an empty black frame', () => {
  mockUseWidgetPreview.mockReturnValue({ props: null, isLoading: true });
  render(<WidgetPreview />);

  expect(indicator()).not.toBeNull();
  expect(screen.getByLabelText('Loading your widget')).toBeTruthy();
});

it('still shows a spinner when loading settles without props', () => {
  // The other half of the same branch: `props` is null before a couple is known.
  mockUseWidgetPreview.mockReturnValue({ props: null, isLoading: false });
  render(<WidgetPreview />);

  expect(indicator()).not.toBeNull();
});

it('drops the spinner once there is content', () => {
  mockUseWidgetPreview.mockReturnValue({
    props: { kind: 'photo', imageFile: 'file:///photo.jpg', deepLink: 'bundles://media/1' },
    isLoading: false,
  });
  render(<WidgetPreview />);

  expect(indicator()).toBeNull();
  expect(screen.getByLabelText('Photo from your partner')).toBeTruthy();
});

it('drops the spinner for the empty state too — "nothing yet" is a real answer', () => {
  mockUseWidgetPreview.mockReturnValue({ props: { kind: 'empty' }, isLoading: false });
  render(<WidgetPreview />);

  expect(indicator()).toBeNull();
  expect(screen.getByLabelText('Nothing from your partner yet')).toBeTruthy();
});
