#!/usr/bin/env python3
"""Build one labelled contact sheet from many home-screen captures.

Each `shoot.sh` run produces a full-screen PNG per home-screen page, and the Bundles widget occupies
only the top-left corner of one of them. Reading every full page to find it is slow and wasteful, so
this crops the widget region out of each capture and tiles the crops into a single image with
captions.

Usage:
    contact_sheet.py OUT.png "LABEL=path/to/dir_or_png" ["LABEL=..." ...]

A directory argument contributes every *_small.png inside it (a whole capture run).
"""
import sys
import os
import glob
from PIL import Image, ImageDraw

# The widget sits in the upper-left of the home screen. Crop generously so a medium widget and its
# neighbours are visible even if layout shifts.
CROP_FRAC = (0.0, 0.06, 0.62, 0.34)   # left, top, right, bottom as fractions of the page
LABEL_H = 26
COLS = 4
PAD = 8


def crop_widget(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    box = (int(w * CROP_FRAC[0]), int(h * CROP_FRAC[1]),
           int(w * CROP_FRAC[2]), int(h * CROP_FRAC[3]))
    return img.crop(box)


def collect(arg):
    """'LABEL=path' -> [(label, png_path), ...]"""
    label, _, path = arg.partition("=")
    if os.path.isdir(path):
        files = sorted(glob.glob(os.path.join(path, "*_small.png")))
        if not files:
            files = sorted(glob.glob(os.path.join(path, "*.png")))
        return [(f"{label} p{i+1}", f) for i, f in enumerate(files)]
    return [(label, path)]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    out_path = sys.argv[1]
    items = []
    for arg in sys.argv[2:]:
        items.extend(collect(arg))
    if not items:
        print("no images found")
        sys.exit(1)

    tiles = []
    for label, path in items:
        try:
            tiles.append((label, crop_widget(path)))
        except Exception as e:            # a capture can be truncated; skip rather than abort
            print(f"skip {path}: {e}")

    if not tiles:
        print("no readable images")
        sys.exit(1)

    tw = max(t.size[0] for _, t in tiles)
    th = max(t.size[1] for _, t in tiles)
    cols = min(COLS, len(tiles))
    rows = (len(tiles) + cols - 1) // cols

    sheet = Image.new("RGB",
                      (cols * (tw + PAD) + PAD, rows * (th + LABEL_H + PAD) + PAD),
                      (24, 24, 27))
    draw = ImageDraw.Draw(sheet)

    for i, (label, tile) in enumerate(tiles):
        r, c = divmod(i, cols)
        x = PAD + c * (tw + PAD)
        y = PAD + r * (th + LABEL_H + PAD)
        draw.text((x + 2, y + 6), label, fill=(235, 235, 235))
        sheet.paste(tile, (x, y + LABEL_H))

    sheet.save(out_path)
    print(f"{out_path}  ({cols}x{rows}, {len(tiles)} tiles)")


if __name__ == "__main__":
    main()
