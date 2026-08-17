import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  deleteItem,
  fetchItems,
  setItemChecked,
  setItemText,
} from '@/domain/shitlist/repository';
import type { ShitlistItem } from '@/domain/shitlist/types';

import ShitlistScreen from '../shitlist';

/**
 * Optimistic writes on the shared list, and what happens when the server says no.
 *
 * `onToggle` has always reverted on failure. Text saves and deletes did not — they updated local
 * state and then discarded the write error, so a rejected edit looked saved and a rejected delete
 * looked gone, until a later fetch or the partner's Realtime echo silently put things back. On a
 * list two people are reading, that desync surfaces to each of them at a different moment.
 */

jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { coupleId: 'couple-1' } }),
}));
jest.mock('@/domain/shitlist/repository', () => ({
  fetchItems: jest.fn(),
  addItem: jest.fn(),
  deleteItem: jest.fn(),
  setItemChecked: jest.fn(),
  setItemText: jest.fn(),
  subscribeToItems: jest.fn(() => () => {}),
}));

const mockFetchItems = fetchItems as jest.Mock;
const mockDeleteItem = deleteItem as jest.Mock;
const mockSetItemChecked = setItemChecked as jest.Mock;
const mockSetItemText = setItemText as jest.Mock;

const item = (over: Partial<ShitlistItem> & { id: string }): ShitlistItem => ({
  text: '',
  isChecked: false,
  createdBy: 'partner',
  createdAt: 1,
  ...over,
});

beforeEach(() => {
  mockFetchItems.mockReset().mockResolvedValue([]);
  mockDeleteItem.mockReset().mockResolvedValue(undefined);
  mockSetItemChecked.mockReset().mockResolvedValue(undefined);
  mockSetItemText.mockReset().mockResolvedValue(undefined);
});

/** Render and let the initial fetch settle. */
async function renderScreen(items: ShitlistItem[]) {
  mockFetchItems.mockResolvedValue(items);
  render(<ShitlistScreen />);
  await act(async () => {});
}

describe('editing an item', () => {
  it('keeps the edit when the save succeeds', async () => {
    await renderScreen([item({ id: 'i1', text: 'milk', createdAt: 1 })]);
    const input = screen.getByDisplayValue('milk');

    fireEvent.changeText(input, 'oat milk');
    fireEvent(input, 'blur');

    await waitFor(() => expect(mockSetItemText).toHaveBeenCalledWith({}, 'i1', 'oat milk'));
    expect(screen.getByDisplayValue('oat milk')).toBeTruthy();
  });

  it('reverts to the server text when the save fails', async () => {
    mockSetItemText.mockRejectedValue(new Error('offline'));
    await renderScreen([item({ id: 'i1', text: 'milk', createdAt: 1 })]);
    const input = screen.getByDisplayValue('milk');

    fireEvent.changeText(input, 'oat milk');
    expect(screen.getByDisplayValue('oat milk')).toBeTruthy(); // optimistic, as before
    fireEvent(input, 'blur');

    // The row goes back to what the database actually holds instead of lying until the next fetch.
    await waitFor(() => expect(screen.getByDisplayValue('milk')).toBeTruthy());
  });

  it('reverts to the last successful save, not to the original text', async () => {
    await renderScreen([item({ id: 'i1', text: 'milk', createdAt: 1 })]);
    const input = screen.getByDisplayValue('milk');

    fireEvent.changeText(input, 'oat milk');
    fireEvent(input, 'blur');
    await waitFor(() => expect(screen.getByDisplayValue('oat milk')).toBeTruthy());

    mockSetItemText.mockRejectedValue(new Error('offline'));
    fireEvent.changeText(screen.getByDisplayValue('oat milk'), 'oat milk and bread');
    fireEvent(screen.getByDisplayValue('oat milk and bread'), 'blur');

    await waitFor(() => expect(screen.getByDisplayValue('oat milk')).toBeTruthy());
  });

  it('saves on the debounce timer too, and reverts that failure the same way', async () => {
    jest.useFakeTimers();
    try {
      mockSetItemText.mockRejectedValue(new Error('offline'));
      await renderScreen([item({ id: 'i1', text: 'milk', createdAt: 1 })]);

      fireEvent.changeText(screen.getByDisplayValue('milk'), 'oat milk');
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(mockSetItemText).toHaveBeenCalledWith({}, 'i1', 'oat milk');
      expect(screen.getByDisplayValue('milk')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('deleting an item', () => {
  const backspaceOnEmpty = (input: ReturnType<typeof screen.getAllByPlaceholderText>[number]) =>
    fireEvent(input, 'keyPress', { nativeEvent: { key: 'Backspace' } });

  it('stays deleted when the server accepts it', async () => {
    await renderScreen([
      item({ id: 'i1', text: 'milk', createdAt: 1 }),
      item({ id: 'i2', text: '', createdAt: 2 }),
    ]);
    expect(screen.getAllByPlaceholderText('List item')).toHaveLength(2);

    backspaceOnEmpty(screen.getAllByPlaceholderText('List item')[1]);

    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith({}, 'i2'));
    expect(screen.getAllByPlaceholderText('List item')).toHaveLength(1);
  });

  it('brings the row back when the delete fails', async () => {
    mockDeleteItem.mockRejectedValue(new Error('offline'));
    await renderScreen([
      item({ id: 'i1', text: 'milk', createdAt: 1 }),
      item({ id: 'i2', text: '', createdAt: 2 }),
    ]);

    backspaceOnEmpty(screen.getAllByPlaceholderText('List item')[1]);

    // A row that disappears and silently returns on the next fetch is the desync being fixed.
    await waitFor(() => expect(screen.getAllByPlaceholderText('List item')).toHaveLength(2));
  });

  it('restores an item deleted by pressing Return on an empty row when that write fails', async () => {
    mockDeleteItem.mockRejectedValue(new Error('offline'));
    await renderScreen([item({ id: 'i1', text: '', createdAt: 1 })]);

    fireEvent.changeText(screen.getAllByPlaceholderText('List item')[0], '\n');

    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith({}, 'i1'));
    await waitFor(() => expect(screen.getAllByPlaceholderText('List item')).toHaveLength(1));
  });
});

describe('checking an item', () => {
  // The pattern the two fixes above were made to match — pinned so it can't quietly regress.
  it('reverts the checkbox when the write fails', async () => {
    mockSetItemChecked.mockRejectedValue(new Error('offline'));
    await renderScreen([item({ id: 'i1', text: 'milk', createdAt: 1 })]);

    fireEvent.press(screen.getByRole('checkbox'));

    await waitFor(() => expect(mockSetItemChecked).toHaveBeenCalledWith({}, 'i1', true));
    await waitFor(() =>
      expect(screen.getByRole('checkbox').props.accessibilityState.checked).toBe(false),
    );
  });
});
