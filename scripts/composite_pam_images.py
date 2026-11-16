#!/usr/bin/env python3
"""Composite PAM body-part images into proper RGBA PNGs.

This engine stores each part as a color image (.jpg or plain .gif) plus a
separate grayscale alpha mask (`<name>_.gif`), since JPEG has no alpha
channel. This recombines each pair into a single transparent PNG so the
pieces render correctly over any background instead of as opaque boxes.
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

# Usage: composite_pam_images.py [GAME]   (GAME = adventures | adventures-vol2, default adventures)
GAME = sys.argv[1] if len(sys.argv) > 1 else "adventures"
ROOT = Path(__file__).resolve().parent.parent
PAM_SRC = ROOT / "raw-assets" / GAME / "images/pam"
SRC = PAM_SRC / "images"
PAM_DST = ROOT / "public" / GAME / "pam"
DST = PAM_DST / "images_rgba"


def composite_one(base_name: str) -> bool:
    mask_path = SRC / f"{base_name}_.gif"
    color_path = None
    for ext in (".jpg", ".gif", ".png"):
        candidate = SRC / f"{base_name}{ext}"
        if candidate.exists():
            color_path = candidate
            break
    if color_path is None:
        return False

    src = Image.open(color_path)
    color = src.convert("RGB")
    if not mask_path.exists() and "A" in src.getbands():
        mask = src.convert("RGBA").getchannel("A")  # already-RGBA png: keep its own alpha
    elif mask_path.exists():
        mask = Image.open(mask_path).convert("L")
        if mask.size != color.size:
            mask = mask.resize(color.size)
    else:
        mask = Image.new("L", color.size, 255)

    out = Image.merge("RGBA", (*color.split(), mask))
    DST.mkdir(parents=True, exist_ok=True)
    out.save(DST / f"{base_name}.png")
    return True


def main():
    DST.mkdir(parents=True, exist_ok=True)
    base_names = sorted({
        p.stem[:-1] if p.stem.endswith("_") else p.stem
        for p in SRC.glob("*.jpg")
    } | {
        p.stem[:-1] for p in SRC.glob("*_.gif")
    } | {
        p.stem for p in SRC.glob("*.gif") if not p.stem.endswith("_")
    } | {
        p.stem for p in SRC.glob("*.png")
    })
    # copy the .pam animation files next to the composited parts
    copied = 0
    for p in sorted(PAM_SRC.glob("*.pam")):
        d = PAM_DST / p.name
        if not d.exists() or d.read_bytes() != p.read_bytes():
            shutil.copyfile(p, d)
            copied += 1
    print(f"copied {copied} new/changed .pam files -> {PAM_DST}")
    done = 0
    for name in base_names:
        if composite_one(name):
            done += 1
    print(f"composited {done}/{len(base_names)} images -> {DST}")


if __name__ == "__main__":
    sys.exit(main())
