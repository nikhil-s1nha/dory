import { Host, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  clipped,
  clipShape,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { WIDGET_ASPECT_RATIO } from '@/constants/app-group';
import { parseWidgetDeepLink } from '@/domain/widget/deep-link';
import { useWidgetPreview } from '@/hooks/use-widget-preview';

import type { BundlesWidgetProps } from '../../widgets/bundles-widget';

/**
 * An in-app rendering of the home-screen widget, rotating through the partner's photo, drawing and
 * music every 15 seconds (spec 3.4's stretch goal, in-app-preview form).
 *
 * It mirrors `widgets/bundles-widget.tsx` deliberately — including the music card's vertical layout,
 * which exists because the real widget is a square `systemSmall` tile — using the same @expo/ui
 * SwiftUI components against the same downscaled App Group files, so what you see here is what the
 * home screen shows. It
 * cannot literally *reuse* that component: babel rewrites a `'widget'`-directive function into a
 * string for the widget runtime, so `BundlesWidget` isn't a callable component in the app bundle.
 *
 * Two modifiers from the widget are intentionally absent — `containerBackground`, which only means
 * anything to WidgetKit, and `widgetURL`, since in-app taps route directly.
 */
export function WidgetPreview() {
  const router = useRouter();
  const { props, isLoading } = useWidgetPreview();

  // `useWidgetPreview` chains up to three network steps, each with a 20s timeout, so this window
  // is tens of seconds wide on a bad connection. An empty frame for that long is pixel-identical
  // to the "indefinite black rectangle" failure this screen was already fixed for once — the
  // spinner is what distinguishes "still working" from "broken".
  if (isLoading || !props) {
    return (
      <View
        style={[styles.frame, styles.loading]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your widget">
        <ActivityIndicator color={LOADING_TINT} />
      </View>
    );
  }

  const route = parseWidgetDeepLink(props.deepLink);

  return (
    <Pressable
      onPress={() => {
        if (route) router.push(route);
      }}
      // Non-interactive when there's nowhere to go, so the empty state doesn't feel broken.
      disabled={!route}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(props)}
      style={styles.frame}>
      <Host style={StyleSheet.absoluteFill} colorScheme="dark">
        <PreviewContent {...props} />
      </Host>
    </Pressable>
  );
}

/** A spoken description of the current frame — the visuals alone say nothing to VoiceOver. */
function accessibilityLabelFor(props: BundlesWidgetProps): string {
  if (props.kind === 'photo') return 'Photo from your partner';
  if (props.kind === 'drawing') return 'Drawing from your partner';
  if (props.kind === 'music') return props.caption ?? 'What your partner is listening to';
  return 'Nothing from your partner yet';
}

/** The widget's own view tree, minus the WidgetKit-only modifiers. */
function PreviewContent(props: BundlesWidgetProps) {
  const TEXT = '#FFFFFF';
  const MUTED = '#AEAEB2';

  if ((props.kind === 'photo' || props.kind === 'drawing') && props.imageFile) {
    return (
      <Image
        uiImage={props.imageFile}
        modifiers={[resizable(), aspectRatio({ contentMode: 'fill' }), clipped(true)]}
      />
    );
  }

  if (props.kind === 'music' && props.title) {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 12 })]}>
        {props.imageFile ? (
          <Image
            uiImage={props.imageFile}
            modifiers={[resizable(), frame({ width: 76, height: 76 }), clipShape('roundedRectangle', 10)]}
          />
        ) : (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(MUTED), lineLimit(2)]}>
            {props.caption ?? 'Now playing'}
          </Text>
        )}
        <Spacer />
        <Text
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            foregroundStyle(TEXT),
            lineLimit(1),
            minimumScaleFactor(0.7),
          ]}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            modifiers={[
              font({ size: 13 }),
              foregroundStyle(MUTED),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}>
            {props.subtitle}
          </Text>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" modifiers={[padding({ all: 16 })]}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(TEXT)]}>Bundles</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED), lineLimit(3)]}>
        Open to see what your partner is up to.
      </Text>
      <Spacer />
    </VStack>
  );
}

/**
 * On-screen size of the preview tile, in points.
 *
 * A `systemSmall` widget is 158x158pt on a 6.1" iPhone (a little larger on a Max, a little smaller
 * on a mini). Hard-coding the common case keeps the preview at roughly life size, which is the whole
 * claim this component makes — that what you see here is what the widget shows.
 */
const WIDGET_PREVIEW_SIZE = 158;

/** The muted grey the widget itself uses for secondary text — the frame is always dark. */
const LOADING_TINT = '#AEAEB2';

const styles = StyleSheet.create({
  // Matching the real widget's shape is what makes this read as "your widget" rather than as a card
  // that happens to hold a photo — and the ratio has to come from the constant, not a literal here:
  // it is the same number the camera crop guide, the drawing canvas and the upload crop use, so a
  // literal would silently disagree with the frame the photo was actually cropped to.
  frame: {
    // Sized like the real tile, not stretched across the screen. At `width: '100%'` a square ratio
    // made the preview as tall as the phone is wide, which ran it under the tab bar — and a widget
    // that overflows its own screen is not a preview of anything. A systemSmall widget is 158pt on
    // this class of iPhone, so drawing it at that size is both the honest scale and one that fits.
    width: WIDGET_PREVIEW_SIZE,
    maxWidth: '100%',
    alignSelf: 'center',
    aspectRatio: WIDGET_ASPECT_RATIO,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  loading: { alignItems: 'center', justifyContent: 'center' },
});
