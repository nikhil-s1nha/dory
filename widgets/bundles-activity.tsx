import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  aspectRatio,
  clipped,
  clipShape,
  font,
  foregroundStyle,
  frame,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment, type LiveActivityLayout } from 'expo-widgets';

import type { BundlesActivityProps } from '../src/domain/activity/content-state';

/**
 * The Live Activity: the partner's latest item on the lock screen and in the Dynamic Island.
 *
 * Unlike `createWidget`, a Live Activity component returns a `LiveActivityLayout` **object** whose
 * keys are the presentation slots iOS asks for, not a single element — `banner` is the lock screen /
 * Notification Center card, the rest are Dynamic Island regions
 * (`node_modules/expo-widgets/src/Widgets.types.ts`, and `WidgetLiveActivity.swift`, which looks each
 * slot up by exactly these names and renders `EmptyView()` for any slot we omit).
 *
 * It renders `BundlesActivityProps`, not the raw contract content state: the two differ in exactly
 * one field. `imageFile` travels as an App Group *filename* (contract), but `@expo/ui`'s `Image`
 * resolves `uiImage` with `URL(string:)` + `Data(contentsOf:)`, which needs an absolute `file://`
 * URI or it silently draws nothing. `toActivityProps` does that translation before every start and
 * update.
 *
 * Visual language is the home-screen widget's, so the two read as one product: black ground, white
 * title, `#AEAEB2` second line, the image filling a rounded square. Where there is no image, it
 * falls back to the same SF Symbols the home screen's buttons use.
 */
const BundlesActivity = (
  props: BundlesActivityProps,
  _environment: LiveActivityEnvironment,
): LiveActivityLayout => {
  'widget';

  // Everything the layout reads is declared INSIDE the function: the `'widget'` directive serializes
  // only this function's params and body into the activity runtime, so a module-scope constant is a
  // ReferenceError there.
  const BG = '#000000';
  const TEXT = '#FFFFFF';
  const MUTED = '#AEAEB2';

  // The same symbols the home screen's buttons use (`src/components/home-button.tsx`), so a
  // text-only frame still says which kind of thing arrived.
  const symbol =
    props.kind === 'music' ? 'music.note' : props.kind === 'drawing' ? 'scribble' : 'camera.fill';

  // `sentAt` exists for staleness display. Photos and drawings carry an empty subtitle and show
  // their age instead; music carries the artist and shows that. Computed per render, which is
  // exactly right — an activity is re-rendered on every update and can sit on the lock screen for
  // hours after it was sent.
  const minutes = Math.max(0, Math.floor((Date.now() - props.sentAt) / 60000));
  const age =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}h ago`
          : `${Math.floor(minutes / 1440)}d ago`;
  const secondLine = props.subtitle ? props.subtitle : age;
  const trailingLabel = props.kind === 'music' ? 'Listening' : age;

  // Album art keeps the widget's 8pt corner; a photo or drawing gets a slightly softer one at the
  // larger size it's drawn at.
  const radius = props.kind === 'music' ? 8 : 12;

  return {
    /**
     * Lock screen / Notification Center. `activityBackgroundTint` is the Live Activity equivalent of
     * the widget's `containerBackground` — without it iOS picks its own translucent ground and the
     * white text can land on a pale wallpaper.
     */
    banner: (
      <HStack modifiers={[padding({ all: 14 }), activityBackgroundTint(BG)]}>
        {props.imageFile ? (
          <Image
            uiImage={props.imageFile}
            modifiers={[
              resizable(),
              aspectRatio({ contentMode: 'fill' }),
              frame({ width: 60, height: 60 }),
              clipped(true),
              clipShape('roundedRectangle', radius),
            ]}
          />
        ) : (
          <Image systemName={symbol} size={26} color={TEXT} />
        )}
        <VStack modifiers={[padding({ leading: 12 })]}>
          <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(TEXT)]}>
            {props.title}
          </Text>
          <Text modifiers={[font({ size: 14 }), foregroundStyle(MUTED)]}>{secondLine}</Text>
        </VStack>
        <Spacer />
      </HStack>
    ),

    // Dynamic Island, compact: the pill either side of the camera. Both halves are a few points
    // wide, so the image becomes a circular chip and the text stays short.
    compactLeading: props.imageFile ? (
      <Image
        uiImage={props.imageFile}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ width: 20, height: 20 }),
          clipped(true),
          clipShape('circle'),
        ]}
      />
    ) : (
      <Image systemName={symbol} size={14} color={TEXT} />
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 13 }), foregroundStyle(TEXT)]}>
        {props.kind === 'music' ? props.title : age}
      </Text>
    ),

    // Dynamic Island, minimal: another app's activity is in front of ours and we get one glyph.
    minimal: props.imageFile ? (
      <Image
        uiImage={props.imageFile}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ width: 18, height: 18 }),
          clipped(true),
          clipShape('circle'),
        ]}
      />
    ) : (
      <Image systemName={symbol} size={13} color={TEXT} />
    ),

    // Dynamic Island, expanded (long-press). Leading and trailing flank the camera cutout and the
    // content sits below it — `expandedCenter` is deliberately left empty, because anything placed
    // there is squeezed into the gap beside the sensor housing.
    expandedLeading: props.imageFile ? (
      <Image
        uiImage={props.imageFile}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          frame({ width: 44, height: 44 }),
          clipped(true),
          clipShape('roundedRectangle', radius),
        ]}
      />
    ) : (
      <Image systemName={symbol} size={22} color={TEXT} />
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>{trailingLabel}</Text>
    ),
    expandedBottom: (
      <VStack modifiers={[padding({ top: 4 })]}>
        <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(TEXT)]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>{secondLine}</Text>
      </VStack>
    ),
  };
};

/**
 * `BundlesActivity` is the name in the contract, and the value the APNs `content-state.name` must
 * carry. Registering it here is also what writes the layout into App Group storage under
 * `__expo_widgets_live_activity_BundlesActivity_layout` (`LiveActivityFactory.swift`) — the
 * extension has no other copy of it, so this module must be imported during app startup or a
 * push-started activity renders a red box instead of the layout.
 */
export default createLiveActivity<BundlesActivityProps>('BundlesActivity', BundlesActivity);
