#!/usr/bin/env python3
"""Pick, from one capture run, the page image showing the Dory widget.

`shoot.sh` photographs every home-screen page in swipe order, and the exported filenames are UUIDs —
the page each one came from is only recorded in the run's `manifest.json` (as `…-pageN`). On this
phone the Dory widget lives on the **second** home screen, so page 2 is the default.

Usage: pick_widget_page.py RUN_DIR [PAGE]     # prints the chosen png path
"""
import sys
import os
import json
import glob


def main():
    run_dir = sys.argv[1]
    page = sys.argv[2] if len(sys.argv) > 2 else "2"

    manifest = os.path.join(run_dir, "manifest.json")
    if not os.path.exists(manifest):
        sys.exit(1)

    names = {}

    def walk(o):
        if isinstance(o, dict):
            if "exportedFileName" in o:
                names[o["exportedFileName"]] = o.get("suggestedHumanReadableName", "")
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for i in o:
                walk(i)

    walk(json.load(open(manifest)))

    for exported, human in names.items():
        if f"page{page}" in human:
            small = os.path.join(run_dir, exported.replace(".png", "_small.png"))
            print(small if os.path.exists(small) else os.path.join(run_dir, exported))
            return
    sys.exit(1)


if __name__ == "__main__":
    main()
