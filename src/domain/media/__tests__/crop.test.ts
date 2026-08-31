import { WIDGET_ASPECT_RATIO } from '@/constants/app-group';

import { centeredCropFraction, centeredCropRect, isNoOpCrop } from '../crop';

/**
 * This arithmetic is what makes the on-screen guide a promise rather than a decoration: the dimmed
 * region and the pixels `sendImage` cuts both come from here, so anything that drifts shows up as
 * "the widget cropped something the app said it would keep".
 */

describe('centeredCropFraction', () => {
  it('keeps the full width and centres vertically when the source is taller than the widget', () => {
    // A 4:3 portrait capture (0.75) against the square small widget: the reported case.
    const f = centeredCropFraction(3 / 4, WIDGET_ASPECT_RATIO);
    expect(f.width).toBe(1);
    expect(f.height).toBeCloseTo(0.75 / WIDGET_ASPECT_RATIO, 10);
    // Centred: equal loss above and below.
    expect(f.y).toBeCloseTo((1 - f.height) / 2, 10);
    expect(f.x).toBe(0);
  });

  it('keeps the full height and centres horizontally when the source is wider', () => {
    const f = centeredCropFraction(4, WIDGET_ASPECT_RATIO);
    expect(f.height).toBe(1);
    expect(f.width).toBeCloseTo(WIDGET_ASPECT_RATIO / 4, 10);
    expect(f.x).toBeCloseTo((1 - f.width) / 2, 10);
    expect(f.y).toBe(0);
  });

  it('keeps everything when the source already is the target ratio', () => {
    expect(centeredCropFraction(WIDGET_ASPECT_RATIO, WIDGET_ASPECT_RATIO)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it.each([0, -1, NaN, Infinity])(
    'falls back to the full frame rather than NaN for a degenerate source ratio (%p)',
    (bad) => {
      expect(centeredCropFraction(bad, WIDGET_ASPECT_RATIO)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    },
  );

  it('falls back to the full frame for a degenerate target ratio', () => {
    expect(centeredCropFraction(0.75, NaN)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('always produces a centred rectangle that fits inside the source', () => {
    for (const sourceAspect of [0.4, 0.5625, 0.75, 1, 1.5, 2, 2.1392, 3, 5]) {
      for (const target of [1, WIDGET_ASPECT_RATIO, 338 / 354]) {
        const f = centeredCropFraction(sourceAspect, target);
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.x + f.width).toBeLessThanOrEqual(1 + 1e-12);
        expect(f.y + f.height).toBeLessThanOrEqual(1 + 1e-12);
        // The result really is the target shape, measured back in source units.
        expect((f.width * sourceAspect) / f.height).toBeCloseTo(target, 10);
      }
    }
  });
});

describe('centeredCropRect', () => {
  it('cuts a portrait capture down to the widget band', () => {
    // 3024x4032 is what the iPhone's back camera hands back at 4:3.
    const rect = centeredCropRect(3024, 4032, WIDGET_ASPECT_RATIO);
    expect(rect.width).toBe(3024);
    expect(rect.height).toBe(Math.round(3024 / WIDGET_ASPECT_RATIO));
    expect(rect.originX).toBe(0);
    expect(rect.originY).toBe(Math.round((4032 - rect.height) / 2));
    // The surviving band is the widget's shape.
    expect(rect.width / rect.height).toBeCloseTo(WIDGET_ASPECT_RATIO, 2);
  });

  it('never runs past the edge of the source, at any size or ratio', () => {
    for (const [w, h] of [
      [3024, 4032],
      [1179, 2556],
      [600, 280],
      [1050, 491],
      [7, 3],
      [1, 1],
      [999, 1000],
    ]) {
      const rect = centeredCropRect(w, h, WIDGET_ASPECT_RATIO);
      expect(rect.originX).toBeGreaterThanOrEqual(0);
      expect(rect.originY).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(w);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(h);
      expect(Number.isInteger(rect.originX)).toBe(true);
      expect(Number.isInteger(rect.originY)).toBe(true);
      expect(Number.isInteger(rect.width)).toBe(true);
      expect(Number.isInteger(rect.height)).toBe(true);
    }
  });

  it('returns an empty rect for unmeasured dimensions instead of NaN', () => {
    expect(centeredCropRect(0, 0, WIDGET_ASPECT_RATIO)).toEqual({
      originX: 0,
      originY: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('isNoOpCrop', () => {
  it('recognises a drawing that was already made at the widget ratio', () => {
    // A Skia snapshot of a WIDGET_ASPECT_RATIO canvas lands a pixel or so off after layout rounding,
    // and that pixel must not cost the drawing a whole extra decode/encode pass.
    const rect = centeredCropRect(1050, 1049, WIDGET_ASPECT_RATIO);
    expect(isNoOpCrop(1050, 1049, rect)).toBe(true);
  });

  it('does not excuse a real photo crop', () => {
    const rect = centeredCropRect(3024, 4032, WIDGET_ASPECT_RATIO);
    expect(isNoOpCrop(3024, 4032, rect)).toBe(false);
  });
});
