import { type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { WIDGET_ASPECT_RATIO } from '@/constants/app-group';
import { centeredCropFraction } from '@/domain/media/crop';
import { Spacing } from '@/constants/theme';

/**
 * Shows where the widget's frame falls on a full-frame photo: the band that survives stays clear,
 * everything the crop discards is dimmed, and a caption says whose view it is.
 *
 * The complaint this answers is "black edges on the left and right, cuts the top and bottom" — the
 * camera captures 4:3 and the widget keeps a ~2.14:1 slice of it, so most of a portrait shot was
 * being thrown away with nothing on screen to predict it. The dimming isn't an approximation: it
 * comes from `centeredCropFraction`, the same function that produces the pixel rectangle `sendImage`
 * actually cuts.
 *
 * `frameAspect` must be the aspect of what the child is *showing* — the capture's own ratio, not the
 * screen's. The child is laid out to exactly that shape so screen geometry and image geometry are
 * the same thing; a preview cropped by its container would put the guide over the wrong pixels.
 */
export function WidgetCropFrame({
  frameAspect,
  label,
  style,
  children,
}: {
  frameAspect: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const keep = centeredCropFraction(frameAspect, WIDGET_ASPECT_RATIO);
  // Percentages rather than measured pixels: the guide then tracks the frame through rotation and
  // any layout pass without a round trip through state. Clamped because a float that lands a hair
  // below zero becomes a negative height, which iOS renders as garbage rather than nothing.
  const pct = (v: number): DimensionValue => `${Math.max(0, v) * 100}%`;

  // Room to sit the caption in the discarded area rather than over the photo. A frame that is
  // already the widget's shape has no such room, and the caption falls back inside the band.
  const bottomDim = 1 - (keep.y + keep.height);
  const captionOutside = bottomDim > 0.08;

  return (
    <View style={[styles.frame, { aspectRatio: frameAspect }, style]}>
      {children}

      {/* Guide only — it must never eat the shutter or a stroke underneath it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="widget-crop-guide">
        {/* Four dimmed margins. Two of them are zero-sized on any given frame (a crop only ever
            loses one axis), which costs nothing and keeps the arithmetic uniform. */}
        <View style={[styles.dim, { top: 0, left: 0, right: 0, height: pct(keep.y) }]} />
        <View style={[styles.dim, { bottom: 0, left: 0, right: 0, height: pct(bottomDim) }]} />
        <View
          style={[styles.dim, { top: pct(keep.y), height: pct(keep.height), left: 0, width: pct(keep.x) }]}
        />
        <View
          style={[
            styles.dim,
            {
              top: pct(keep.y),
              height: pct(keep.height),
              right: 0,
              width: pct(1 - (keep.x + keep.width)),
            },
          ]}
        />

        <View
          style={[
            styles.keep,
            {
              left: pct(keep.x),
              top: pct(keep.y),
              width: pct(keep.width),
              height: pct(keep.height),
            },
          ]}
        />

        {label ? (
          <View
            style={[
              styles.caption,
              captionOutside
                ? { top: pct(keep.y + keep.height), marginTop: Spacing.two }
                : { bottom: Spacing.two },
            ]}>
            <ThemedText type="small" style={styles.captionText}>
              {label}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', backgroundColor: '#000' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  keep: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  caption: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  captionText: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
});
