import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { INITIAL_CURSOR, type WidgetContentType } from '@/domain/widget/stack';
import { PREVIEW_ROTATION_INTERVAL_MS, nextPreviewFrame } from '@/domain/widget/rotation';
import { useAuth } from '@/lib/auth-context';
import { buildProps, loadStackSnapshot } from '@/lib/widget-sync';

import type { BundlesWidgetProps } from '../../widgets/bundles-widget';

/**
 * Drives the in-app widget preview: the same content the home-screen widget shows, rotating through
 * photo → drawing → music every 15 seconds while you're looking at it (spec 3.4's stretch goal).
 *
 * Two things this deliberately does *not* do:
 *
 * 1. It never touches the persisted widget cursor. That key means "advance one step per app open"
 *    (M5, verified on device); a 15-second writer would leave every app open landing somewhere
 *    arbitrary. The rotation cursor lives in a ref and dies with the screen.
 * 2. It doesn't rebuild props on every tick. `buildProps` downloads and downscales into the App
 *    Group, so per-tick building would re-download the same three files every 15 seconds and race
 *    the widget's own writes to those exact filenames. Instead every present item is built once per
 *    snapshot, and rotation is then pure state cycling over the results.
 */
export function useWidgetPreview(): { props: BundlesWidgetProps | null; isLoading: boolean } {
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  const [frames, setFrames] = useState<Partial<Record<WidgetContentType, BundlesWidgetProps>>>({});
  const [present, setPresent] = useState<WidgetContentType[]>([]);
  const [props, setProps] = useState<BundlesWidgetProps | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const cursor = useRef(INITIAL_CURSOR);

  // Load (and reload on foreground) what the partner currently has waiting.
  useEffect(() => {
    if (!coupleId || !userId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await loadStackSnapshot(coupleId, userId);
        const built = await Promise.all(
          snapshot.present.map(async (item) => [item, await buildProps(item, snapshot.ctx)] as const),
        );
        if (cancelled) return;

        cursor.current = INITIAL_CURSOR;
        setFrames(Object.fromEntries(built));
        setPresent(snapshot.present);

        // Show the top-priority item immediately rather than an empty box for 15 seconds.
        const first = nextPreviewFrame(snapshot.present, INITIAL_CURSOR);
        cursor.current = first.cursor;
        setProps(first.item ? (Object.fromEntries(built)[first.item] ?? null) : { kind: 'empty' });
      } catch {
        // Keep whatever the preview was already showing — a failed refresh shouldn't blank content
        // that's still perfectly good. But if we've never shown anything, fall back to the empty
        // state rather than leaving an indefinite blank rectangle that reads as a broken render.
        if (!cancelled) setProps((prev) => prev ?? { kind: 'empty' });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [coupleId, userId]);

  // Rotate. Nothing to do for zero or one present item — a lone photo doesn't need a timer, and
  // re-rendering it every 15 seconds would just churn a synchronous image read on the main thread.
  useEffect(() => {
    if (present.length < 2) return;

    const tick = () => {
      const frame = nextPreviewFrame(present, cursor.current);
      cursor.current = frame.cursor;
      if (frame.item) setProps(frames[frame.item] ?? null);
    };

    let interval: ReturnType<typeof setInterval> | null = setInterval(
      tick,
      PREVIEW_ROTATION_INTERVAL_MS,
    );

    // Don't rotate a screen nobody is looking at — and don't leak the timer behind a backgrounded
    // app, where the JS runtime is suspended anyway and every missed tick would fire at once.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && interval === null) {
        interval = setInterval(tick, PREVIEW_ROTATION_INTERVAL_MS);
      } else if (state !== 'active' && interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    });

    return () => {
      if (interval !== null) clearInterval(interval);
      subscription.remove();
    };
  }, [present, frames]);

  return { props, isLoading };
}
