import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment, type LiveActivityLayout } from 'expo-widgets';

import type { BundlesActivityContentState } from '../src/domain/activity/types';

/**
 * The Live Activity: the partner's latest item on the lock screen and in the Dynamic Island.
 *
 * Unlike `createWidget`, a Live Activity component returns a `LiveActivityLayout` **object** whose
 * keys are the presentation slots iOS asks for, not a single element — `banner` is the lock screen /
 * Notification Center card, the rest are Dynamic Island regions
 * (`node_modules/expo-widgets/src/Widgets.types.ts`, and `WidgetLiveActivity.swift`, which looks each
 * slot up by exactly these names and renders `EmptyView()` for any slot we omit).
 *
 * This is the first spike: **text only**. Images travel by filename through the App Group exactly as
 * the widget's do, but that path isn't wired yet, so `imageFile` is deliberately unread here.
 *
 * Colours: everything but the accent glyph is left to the system's default label colour. A Live
 * Activity is drawn over the user's wallpaper in both light and dark appearance, and a hardcoded
 * white would be invisible on half of them.
 */
const BundlesActivity = (
  props: BundlesActivityContentState,
  _environment: LiveActivityEnvironment,
): LiveActivityLayout => {
  'widget';

  // Declared INSIDE the function: the `'widget'` directive serializes only this function's params
  // and body into the activity runtime, so anything at module scope is a ReferenceError there.
  const ACCENT = '#FF375F';
  const MUTED = '#8E8E93';
  const glyph = props.kind === 'music' ? '♪' : props.kind === 'drawing' ? '✎' : '❤';

  return {
    // Lock screen / Notification Center.
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[font({ size: 28 }), foregroundStyle(ACCENT)]}>{glyph}</Text>
        <VStack modifiers={[padding({ leading: 12 })]}>
          <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{props.title}</Text>
          {props.subtitle ? (
            <Text modifiers={[font({ size: 14 }), foregroundStyle(MUTED)]}>{props.subtitle}</Text>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
    ),

    // Dynamic Island, compact (the pill either side of the camera).
    compactLeading: <Text modifiers={[foregroundStyle(ACCENT)]}>{glyph}</Text>,
    compactTrailing: <Text modifiers={[font({ size: 13 })]}>{props.title}</Text>,

    // Dynamic Island, minimal (a second activity is in front of ours).
    minimal: <Text modifiers={[foregroundStyle(ACCENT)]}>{glyph}</Text>,

    // Dynamic Island, expanded (long-press).
    expandedLeading: <Text modifiers={[font({ size: 22 }), foregroundStyle(ACCENT)]}>{glyph}</Text>,
    expandedTrailing: <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>Bundles</Text>,
    expandedCenter: <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.title}</Text>,
    expandedBottom: <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>{props.subtitle}</Text>,
  };
};

/**
 * `BundlesActivity` is the name in the contract. Registering it here is also what writes the layout
 * into App Group storage under `__expo_widgets_live_activity_BundlesActivity_layout`
 * (`LiveActivityFactory.swift`) — the extension has no other copy of it, so this module must be
 * imported during app startup or a pushed activity renders a red box instead of the layout.
 */
export default createLiveActivity<BundlesActivityContentState>('BundlesActivity', BundlesActivity);
