import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useWidgetSync } from '@/hooks/use-widget-sync';
import { syncWidgetOnOpen } from '@/lib/widget-sync';

/**
 * Which AppState transitions count as "the user opened the app".
 *
 * This gate is half the shuffle fix. iOS resigns active for anything that puts UI over the app —
 * Control Centre, the notification shade, a permission alert — and every one of those used to
 * advance the widget, spending a step while the user never left. The other half is a launch
 * straight into the background (prewarm, a silent push), where the mount is not an app open at all
 * and advancing there as well makes one real open take two steps.
 */

jest.mock('@/lib/widget-sync', () => ({ syncWidgetOnOpen: jest.fn() }));

let currentState: string;
const listeners: ((state: string) => void)[] = [];

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { coupleId: 'couple-1' } }),
}));

const mockSync = syncWidgetOnOpen as jest.Mock;

/** Drive an AppState transition the way RCTAppState would, dedupe included. */
function transition(...states: string[]) {
  for (const state of states) {
    if (state === currentState) continue;
    currentState = state;
    listeners.forEach((listener) => listener(state));
  }
}

/** Every sync that advanced, in order — the steps the widget actually took. */
const advances = () =>
  mockSync.mock.calls.filter(([, , options]) => options?.advance !== false).map(([, , o]) => o.trigger);

beforeEach(() => {
  jest.clearAllMocks();
  listeners.length = 0;
  currentState = 'inactive'; // what a normal cold launch reports while the bridge is coming up
  mockSync.mockResolvedValue(undefined);

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, handler) => {
    listeners.push(handler as (state: string) => void);
    return { remove: () => {} };
  }) as typeof AppState.addEventListener);
  Object.defineProperty(AppState, 'currentState', { get: () => currentState, configurable: true });
});

it('advances once on a normal cold launch, not twice', () => {
  renderHook(() => useWidgetSync());
  // didBecomeActive lands after the bridge is up. The mount already counted this open.
  transition('active');

  expect(advances()).toEqual(['mount']);
});

it('advances on a real background -> foreground', () => {
  renderHook(() => useWidgetSync());
  transition('active');
  transition('inactive', 'background');
  transition('active');

  expect(advances()).toEqual(['mount', 'foreground']);
});

it('does not advance when Control Centre is pulled down and dismissed', () => {
  renderHook(() => useWidgetSync());
  transition('active');
  // An overlay only reaches 'inactive' — the app never entered the background.
  transition('inactive');
  transition('active');

  expect(advances()).toEqual(['mount']);
});

it('does not advance twice when iOS launches the app into the background', () => {
  currentState = 'background';
  renderHook(() => useWidgetSync());
  // The mount refreshed content but took no step; the user's real open takes exactly one.
  transition('active');

  expect(advances()).toEqual(['foreground']);
  expect(mockSync).toHaveBeenCalledTimes(2);
  expect(mockSync.mock.calls[0][2]).toMatchObject({ trigger: 'mount', advance: false });
});

it('keeps refreshing across many overlays without ever taking a step', () => {
  renderHook(() => useWidgetSync());
  transition('active');
  for (let i = 0; i < 5; i++) transition('inactive', 'active');

  expect(advances()).toEqual(['mount']);
});
