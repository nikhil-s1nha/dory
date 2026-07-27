import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
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
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * The single home-screen widget. It renders whichever smart-stack item is current — a photo, a
 * drawing, or the partner's music — from props the app pushes via `updateSnapshot`. Images are
 * local files the app has already written into the App Group container (see the widget-sync module);
 * the widget never touches the network. Tapping opens the app at `deepLink`.
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

  // Photo & drawing: fill the widget with the image.
  if ((props.kind === 'photo' || props.kind === 'drawing') && props.imageFile) {
    return (
      <Image
        uiImage={props.imageFile}
        modifiers={[resizable(), aspectRatio({ contentMode: 'fill' }), clipped(true)]}
      />
    );
  }

  // Music: album art beside the track + a caption.
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
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.title}</Text>
          {props.subtitle ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle('#8E8E93')]}>{props.subtitle}</Text>
          ) : null}
          <Spacer />
          {props.caption ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#8E8E93')]}>{props.caption}</Text>
          ) : null}
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  // Empty: nothing to show yet.
  return (
    <VStack modifiers={[padding({ all: 16 })]}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>Dory</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#8E8E93')]}>
        Open to see what your partner is up to.
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget('DoryWidget', DoryWidget);
