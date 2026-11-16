#!/usr/bin/env python3
"""Build the book map screen art (map, frame pieces, chapter icons) -> public/adventures/images/map/.

Chapter icons are animation strips (N cols); we keep frame 0. Needs Pillow.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Usage: prepare_map_assets.py [GAME]   (adventures | adventures-vol2, default adventures)
GAME = sys.argv[1] if len(sys.argv) > 1 else "adventures"
GAME_DATA = {"adventures": "game_data.json", "adventures-vol2": "game_data_vol2.json"}[GAME]
RAW = ROOT / "raw-assets" / GAME
OUT = ROOT / "public" / GAME / "images/map"
OUT.mkdir(parents=True, exist_ok=True)


def find(parent: Path, stem: str) -> Path | None:
    for f in parent.iterdir():
        if f.stem.lower() == stem.lower() and f.suffix.lower() in (".jpg", ".gif", ".png", ".jp2"):
            return f
    return None


def comp(parent: Path, stem: str, out: str, cols: int = 1, crop_first: bool = False) -> Image.Image | None:
    c = find(parent, stem)
    if c is None:
        print("missing", parent.name, stem)
        return None
    img = Image.open(c).convert("RGBA")
    m = find(parent, stem + "_")
    if m is not None:
        mask = Image.open(m).convert("L")
        if mask.size != img.size:
            mask = mask.resize(img.size)
        img.putalpha(mask)
    if crop_first:
        img = img.crop((0, 0, img.width // cols, img.height))
    img.save(OUT / out)
    return img


def main():
    img = RAW / "images"
    for name in ("top", "bot", "left", "right", "descripbox", "banner_lrg", "maplex", "bookshelf_left", "bookshelf_right"):
        comp(img, f"sharedui_{name}", f"ui_{name}.png")
    comp(img, "checkmark", "checkmark.png")
    comp(img / "books", "button_continue", "btn_continue.png")
    books = json.loads((ROOT / "src/assets/adventures" / GAME_DATA).read_text())["books"]
    for b in map(int, books):
        d = img / "books" / f"book{b}"
        xml = (RAW / "properties" / f"Book{b}.xml").read_text()
        comp(d, "map", f"map_b{b}.png")
        comp(d, "mapscreen_banner", f"banner_b{b}.png")
        # adventures book 2 ships "minimap_icons-2"; vol2 books all use plain "minimap_icons"
        comp(d, "minimap_icons" if find(d, "minimap_icons") else f"minimap_icons-{b}", f"minimap_icons_b{b}.png")
        for n in range(1, 11):
            mm = comp(d, f"minimap_{b}-{n}", f"minimap_b{b}c{n}.png")
            if mm is not None:  # greyscale/sepia twin: the not-yet-beaten part of the strip
                g = mm.convert("LA")
                r, gr, bl = g.convert("RGB").split()
                sep = Image.merge("RGBA", (r.point(lambda v: int(v * 0.85)), gr.point(lambda v: int(v * 0.72)), bl.point(lambda v: int(v * 0.5)), mm.split()[3]))
                sep.save(OUT / f"minimap_b{b}c{n}_sepia.png")
        for n in range(1, 11):
            m = re.search(rf'id="ICONANIM{n}"\s+path="([^"]+)"(?:\s+cols="(\d+)")?', xml)
            if not m:
                continue
            icon = comp(d, m.group(1), f"icon_b{b}c{n}.png", int(m.group(2) or 1), crop_first=True)
            mask = find(d, f"iconmask{n}")
            if icon is not None and mask is not None and find(d, m.group(1) + "_") is None:
                # book 1's animated icons have no alpha of their own; iconmaskN is their shape
                a = Image.open(mask).convert("L").resize(icon.size)
                icon.putalpha(a)
                icon.save(OUT / f"icon_b{b}c{n}.png")
    print("done", len(list(OUT.iterdir())), "files")


if __name__ == "__main__":
    main()
