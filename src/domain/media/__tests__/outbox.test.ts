import type { SupabaseClient } from '@supabase/supabase-js';
import { Alert } from 'react-native';

import { enqueueSend, pendingSends, setOutboxReporter, whenOutboxIdle } from '../outbox';
import { notifyPartnerOfSend, sendImage } from '../repository';

/**
 * The outbox exists so the screen can leave, so the two things worth pinning down are that
 * `enqueueSend` returns before the upload does, and that a failure after the screen is gone still
 * reaches the user.
 */

jest.mock('../repository', () => ({
  sendImage: jest.fn(),
  notifyPartnerOfSend: jest.fn(),
}));

const mockSendImage = sendImage as jest.MockedFunction<typeof sendImage>;
const mockNotify = notifyPartnerOfSend as jest.MockedFunction<typeof notifyPartnerOfSend>;

const client = {} as SupabaseClient;
const send = {
  coupleId: 'c1',
  senderId: 'me',
  type: 'photo' as const,
  localUri: 'file:///shot.jpg',
  now: 1000,
};
const item = { id: 'm1', type: 'photo' as const };

beforeEach(() => {
  mockSendImage.mockReset().mockResolvedValue(item as never);
  mockNotify.mockReset().mockResolvedValue(undefined);
  setOutboxReporter();
});

afterEach(() => {
  setOutboxReporter();
  jest.restoreAllMocks();
});

it('returns before the upload finishes, and finishes it anyway', async () => {
  let release: (() => void) | undefined;
  mockSendImage.mockImplementation(
    () => new Promise((resolve) => (release = () => resolve(item as never))),
  );

  enqueueSend(client, send);

  // The screen is free to dismiss right here: the upload has not resolved.
  expect(mockSendImage).toHaveBeenCalledWith(client, send);
  expect(pendingSends()).toBe(1);

  release?.();
  await whenOutboxIdle();
  expect(mockNotify).toHaveBeenCalledWith(client, item);
  expect(pendingSends()).toBe(0);
});

it('reports a failed upload rather than dropping it', async () => {
  mockSendImage.mockRejectedValue(new Error('storage denied'));
  const reported: string[] = [];
  setOutboxReporter(({ message }) => reported.push(message));

  enqueueSend(client, send);
  await whenOutboxIdle();

  expect(reported).toEqual(['storage denied']);
});

it('reports a non-Error rejection as something showable', async () => {
  mockSendImage.mockRejectedValue('offline');
  const reported: string[] = [];
  setOutboxReporter(({ message }) => reported.push(message));

  enqueueSend(client, send);
  await whenOutboxIdle();

  expect(reported).toEqual(['offline']);
});

it('offers a retry that really re-sends the same capture', async () => {
  mockSendImage.mockRejectedValueOnce(new Error('offline'));
  let retry: (() => void) | undefined;
  setOutboxReporter((failure) => (retry = failure.retry));

  enqueueSend(client, send);
  await whenOutboxIdle();
  expect(retry).toBeDefined();

  retry?.();
  await whenOutboxIdle();

  expect(mockSendImage).toHaveBeenCalledTimes(2);
  expect(mockSendImage).toHaveBeenLastCalledWith(client, send);
  expect(mockNotify).toHaveBeenCalledWith(client, item);
});

it('never rejects at the call site — the screen has nowhere to catch', async () => {
  mockSendImage.mockRejectedValue(new Error('storage denied'));
  setOutboxReporter(() => {});

  expect(() => enqueueSend(client, send)).not.toThrow();
  await expect(whenOutboxIdle()).resolves.toBeUndefined();
});

it('falls back to an alert, so a failure is visible with no screen subscribed', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockSendImage.mockRejectedValue(new Error('storage denied'));

  enqueueSend(client, send);
  await whenOutboxIdle();

  expect(alert).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alert.mock.calls[0];
  expect(title).toContain('photo');
  expect(message).toBe('storage denied');
  // The alert is the retry surface too, or it is only a tombstone.
  expect(buttons?.map((b) => b.text)).toEqual(['Not now', 'Try again']);
  buttons?.[1].onPress?.();
  await whenOutboxIdle();
  expect(mockSendImage).toHaveBeenCalledTimes(2);
});

it('runs several sends concurrently instead of queueing them behind each other', async () => {
  const releases: (() => void)[] = [];
  mockSendImage.mockImplementation(
    () => new Promise((resolve) => releases.push(() => resolve(item as never))),
  );

  enqueueSend(client, send);
  enqueueSend(client, { ...send, type: 'drawing', localUri: 'file:///draw.png' });

  expect(pendingSends()).toBe(2);
  releases.forEach((r) => r());
  await whenOutboxIdle();
  expect(pendingSends()).toBe(0);
});
