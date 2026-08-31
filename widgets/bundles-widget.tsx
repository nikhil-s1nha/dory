import { Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  aspectRatio,
  clipped,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * The single home-screen widget. It renders whichever shuffle-cycle item is current — a photo, a
 * drawing, or the partner's music — from props the app pushes via `updateSnapshot`. Images are
 * local files the app has already written into the App Group container (see the widget-sync module);
 * the widget never touches the network. Tapping opens the app at `deepLink`.
 *
 * **Laid out for a square tile.** The widget placed on the user's phone is `systemSmall`
 * (158x158pt), not the wide medium family — which is what broke the music card: an HStack put the
 * album art in the middle of the tile and left the track title roughly 70pt of width to squeeze
 * into. Everything here stacks vertically so it works in a square, and still reads correctly if the
 * widget is later placed at medium or large.
 *
 * NOTE: iOS 17+ requires every widget to declare its background via `containerBackground(..'widget')`
 * — without it the widget refuses to render and shows "Please adopt containerBackground API". We use
 * a consistent black background (photos/drawings fill it; text is light for contrast).
 */
export type BundlesWidgetProps = {
  kind: 'photo' | 'drawing' | 'music' | 'empty';
  /** App Group file path for the photo/drawing/album art. */
  imageFile?: string;
  /** Music track title. */
  title?: string;
  /** Music artist. */
  subtitle?: string;
  /** e.g. "Alex sent a photo" or "Alex is listening to …". */
  caption?: string;
  /** Deep link opened on tap, e.g. bundles://media/<id>. */
  deepLink?: string;

  // ---------------------------------------------------------------------------------------------
  // Diagnostics. The component below reads NONE of these — they ride along so that the values are
  // visible in the App Group plist, which is the only channel readable from a host machine (Metro
  // logs don't stream here, and devicectl's app-group domain can't reach ExpoWidgets/). Read them
  // with:
  //   plutil -convert json -o - w.plist | jq '.__expo_widgets_BundlesWidget_timeline[0].props'
  // ---------------------------------------------------------------------------------------------

  /** What the last image downscale produced, e.g. "1200x1600 7.7MB -> 450x600 1.0MB". */
  _imageDebug?: string;
  /** Snapshots handed to WidgetKit so far. Two consecutive foregrounds must differ by exactly 1. */
  _syncCount?: number;
  /** The step this snapshot took, as "<last shown>-><now showing>", e.g. "photo->drawing". */
  _cursor?: string;
  /** The content types present this run, comma-separated in cycle order, or "none". */
  _present?: string;
  /** How `_present` was arrived at, e.g. "media=4 partner=0 music=no" — why empty is empty. */
  _source?: string;
  /** What triggered the sync: mount | foreground | push | manual. */
  _trigger?: string;
  /** ISO time of the write, so a re-run is distinguishable from a snapshot that never changed. */
  _syncedAt?: string;
};

const BundlesWidget = (props: BundlesWidgetProps, _environment: WidgetEnvironment) => {
  'widget';

  // Defined INSIDE the component: the 'widget' directive serializes only the function body into the
  // widget runtime, so module-scope constants aren't visible here (they throw ReferenceError).
  const BG = '#000000';
  const TEXT = '#FFFFFF';
  const MUTED = '#AEAEB2';

  // Tapping the widget opens the item, not just the app (spec 3.1/3.2 — the drawing round-trip
  // depends on it). SwiftUI honours exactly one widgetURL per view hierarchy, so it goes on the
  // root of whichever branch renders and nowhere else; the empty state has nothing to open.
  const link = props.deepLink ? [widgetURL(props.deepLink)] : [];

  // Photo & drawing: fill the widget with the image. No explicit ratio — `fill` preserves the
  // image's own and crops the overflow, which is right whatever family the widget is placed at.
  // The app now crops sends to `WIDGET_ASPECT_RATIO` before upload, so there is usually nothing
  // left to crop; this stays as the safety net for media uploaded before that landed.
  if ((props.kind === 'photo' || props.kind === 'drawing') && props.imageFile) {
    return (
      <Image
        uiImage={props.imageFile}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: 'fill' }),
          clipped(true),
          containerBackground(BG, 'widget'),
          ...link,
        ]}
      />
    );
  }

  // Music: album art across the top, track and artist along the bottom.
  //
  // The art is deliberately not centred — pinning it to the top and letting the Spacer push the
  // text to the bottom edge is what keeps the two apart on a square tile. Both text rows are
  // single-line: wrapping "Everybody Talks / Neon Trees" onto four lines is the same squish in a
  // different direction, so a long title shrinks to fit instead.
  if (props.kind === 'music' && props.title) {
    return (
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[padding({ all: 12 }), containerBackground(BG, 'widget'), ...link]}>
        {props.imageFile ? (
          <Image
            uiImage={props.imageFile}
            modifiers={[resizable(), frame({ width: 76, height: 76 }), clipShape('roundedRectangle', 10)]}
          />
        ) : (
          // No album art: the caption ("Alex is listening to …") is the only thing that says whose
          // music this is, and with the artwork gone there is finally room for it.
          <Text
            modifiers={[font({ size: 12 }), foregroundStyle(MUTED), lineLimit(2)]}>
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

  // Empty: nothing to show yet.
  return (
    <VStack alignment="leading" modifiers={[padding({ all: 16 }), containerBackground(BG, 'widget')]}>
      <Spacer />
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(TEXT)]}>Bundles</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(MUTED), lineLimit(3)]}>
        Open to see what your partner is up to.
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget('BundlesWidget', BundlesWidget);
