import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  clipped,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * The single home-screen widget. It renders whichever smart-stack item is current — a photo, a
 * drawing, or the partner's music — from props the app pushes via `updateSnapshot`. Images are
 * local files the app has already written into the App Group container (see the widget-sync module);
 * the widget never touches the network. Tapping opens the app at `deepLink`.
 *
 * NOTE: iOS 17+ requires every widget to declare its background via `containerBackground(..'widget')`
 * — without it the widget refuses to render and shows "Please adopt containerBackground API". We use
 * a consistent black background (photos/drawings fill it; text is light for contrast).
 */
export type DoryWidgetProps = {
  kind: 'photo' | 'drawing' | 'music' | 'empty';
  /** App Group file path for the photo/drawing/album art. */
  imageFile?: string;
  /** Music track title. */
  title?: string;
  /** Music artist. */
  subtitle?: string;
  /** e.g. "Alex sent a photo" or "Alex is listening to …". */
  caption?: string;
  /** Deep link opened on tap, e.g. dory://media/<id>. */
  deepLink?: string;
};

const DoryWidget = (props: DoryWidgetProps, _environment: WidgetEnvironment) => {
  'widget';

  // Defined INSIDE the component: the 'widget' directive serializes only the function body into the
  // widget runtime, so module-scope constants aren't visible here (they throw ReferenceError).
  const BG = '#000000';
  const TEXT = '#FFFFFF';
  const MUTED = '#AEAEB2';

  // Photo & drawing: fill the widget with the image.
  if ((props.kind === 'photo' || props.kind === 'drawing') && props.imageFile) {
    return (
      <Image
        uiImage={props.imageFile}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          clipped(true),
          containerBackground(BG, 'widget'),
        ]}
      />
    );
  }

  // Music: album art beside the track + a caption.
  if (props.kind === 'music' && props.title) {
    return (
      <HStack modifiers={[padding({ all: 12 }), containerBackground(BG, 'widget')]}>
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

  // Empty: nothing to show yet.
  return (
    <VStack modifiers={[padding({ all: 16 }), containerBackground(BG, 'widget')]}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(TEXT)]}>Dory</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED)]}>
        Open to see what your partner is up to.
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget('DoryWidget', DoryWidget);
