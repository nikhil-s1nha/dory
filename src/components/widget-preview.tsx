import { Host, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  clipped,
  clipShape,
  font,
  foregroundStyle,
  frame,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { parseWidgetDeepLink } from '@/domain/widget/deep-link';
import { useWidgetPreview } from '@/hooks/use-widget-preview';

import type { BundlesWidgetProps } from '../../widgets/bundles-widget';

/**
 * An in-app rendering of the home-screen widget, rotating through the partner's photo, drawing and
 * music every 15 seconds (spec 3.4's stretch goal, in-app-preview form).
 *
 * It mirrors `widgets/bundles-widget.tsx` deliberately, using the same @expo/ui SwiftUI components
 * against the same downscaled App Group files, so what you see here is what the widget shows. It
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
      <HStack modifiers={[padding({ all: 12 })]}>
        {props.imageFile ? (
          <Image
            uiImage={props.imageFile}
            modifiers={[resizable(), frame({ width: 56, height: 56 }), clipShape('roundedRectangle', 8)]}
          />
        ) : null}
        <VStack modifiers={[padding({ leading: 10 })]}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(TEXT)]}>
            {props.title}
          </Text>
          {props.subtitle ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>{props.subtitle}</Text>
          ) : null}
          <Spacer />
          {props.caption ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(MUTED)]}>{props.caption}</Text>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: 16 })]}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(TEXT)]}>Bundles</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>
        Open to see what your partner is up to.
      </Text>
      <Spacer />
    </VStack>
  );
}

/** The muted grey the widget itself uses for secondary text — the frame is always dark. */
const LOADING_TINT = '#AEAEB2';

const styles = StyleSheet.create({
  // A systemMedium widget is 338×158pt on most phones; matching that ratio is what makes this read
  // as "your widget" rather than as a card that happens to hold a photo.
  frame: {
    width: '100%',
    aspectRatio: 338 / 158,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  loading: { alignItems: 'center', justifyContent: 'center' },
});
