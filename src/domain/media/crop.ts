/**
 * Where the widget's frame lands on an image, as pure geometry.
 *
 * The widget renders with `aspectRatio({contentMode:'fill'}) + clipped(true)`, i.e. it centre-crops
 * to `WIDGET_ASPECT_RATIO` and throws the rest away. Both halves of the fix depend on predicting
 * that crop exactly: the camera overlay dims what won't survive, and `sendImage` cuts the same
 * rectangle so the widget has nothing left to cut. Doing it in one place is what keeps the guide
 * honest — a guide drawn from different arithmetic than the crop is worse than no guide at all.
 *
 * Deliberately free of any native or React dependency so the arithmetic is exhaustively testable
 * without a device.
 */

/** A crop rectangle in source pixels, in the shape `expo-image-manipulator`'s `crop()` takes. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** The same rectangle as fractions of the source (0..1) — what a layout overlay needs. */
export interface CropFraction {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_FRAME: CropFraction = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The largest centred `targetAspect` rectangle that fits inside a `sourceAspect` one, as fractions.
 *
 * Source taller than the target (the usual case: a 4:3 portrait capture against a square widget
 * tile) keeps the full width and loses height, split evenly top and bottom. Source wider keeps the
 * full height and loses width. Equal ratios keep everything.
 *
 * A degenerate ratio (0, negative, NaN, Infinity — a layout that hasn't measured yet, an image whose
 * dimensions didn't come back) yields the full frame rather than a NaN rectangle: an un-dimmed guide
 * is a visible "we don't know yet", while NaN in a style is how iOS gets handed NaN by CoreGraphics.
 */
export function centeredCropFraction(sourceAspect: number, targetAspect: number): CropFraction {
  if (!isUsableRatio(sourceAspect) || !isUsableRatio(targetAspect)) return FULL_FRAME;

  if (sourceAspect > targetAspect) {
    const width = targetAspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceAspect / targetAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/**
 * The same crop in whole source pixels, ready for `ImageManipulator.crop()`.
 *
 * Rounded rather than floored so a one-pixel rounding error can't systematically shave the image,
 * then clamped so `origin + size` can never exceed the source — a crop rectangle that runs past the
 * edge is rejected natively, and this runs on whatever dimensions a camera or a Skia snapshot
 * happens to produce. Sizes are floored to at least 1px: a zero-width crop is not an image.
 */
export function centeredCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): CropRect {
  if (!isUsableRatio(sourceWidth) || !isUsableRatio(sourceHeight)) {
    return { originX: 0, originY: 0, width: 0, height: 0 };
  }

  const fraction = centeredCropFraction(sourceWidth / sourceHeight, targetAspect);
  const width = clamp(Math.round(fraction.width * sourceWidth), 1, Math.floor(sourceWidth));
  const height = clamp(Math.round(fraction.height * sourceHeight), 1, Math.floor(sourceHeight));
  return {
    originX: clamp(Math.round(fraction.x * sourceWidth), 0, Math.floor(sourceWidth) - width),
    originY: clamp(Math.round(fraction.y * sourceHeight), 0, Math.floor(sourceHeight) - height),
    width,
    height,
  };
}

/**
 * Is this crop worth performing at all?
 *
 * A drawing is already made at the widget's ratio, so its crop is a rounding artefact — and cropping
 * costs a full decode/re-encode. One pixel of tolerance keeps that path free without ever letting a
 * genuinely mis-framed photo through.
 */
export function isNoOpCrop(sourceWidth: number, sourceHeight: number, rect: CropRect): boolean {
  return (
    rect.originX === 0 &&
    rect.originY === 0 &&
    Math.abs(rect.width - sourceWidth) <= 1 &&
    Math.abs(rect.height - sourceHeight) <= 1
  );
}

function isUsableRatio(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
