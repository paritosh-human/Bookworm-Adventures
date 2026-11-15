#!/usr/bin/env python3
"""Server-side proof-of-concept renderer: composites a .pam creature's named
segment (e.g. "idle") into a single flat PNG, using the same cumulative
frame-simulation logic as PamActor.ts, so the result can be inspected
without round-tripping screenshot bytes through the browser.

This is NOT the real game renderer (no rotation/matrix, no looping, just one
frame) — it exists purely to visually verify decode_pam.py's output against
the real extracted artwork.
"""
import json
import sys
from pathlib import Path

from PIL import Image

from decode_pam import decode_pam

IMAGES_DIR = Path("public/adventures/pam/images_rgba")


def clean_name(name: str) -> str:
    return name[5:] if name.startswith("(add)") else name


def compute_active(frames, start, target):
    active = {}
    end = min(target, len(frames) - 1)
    for f in range(start, end + 1):
        frame = frames[f]
        for rem in frame["remove"]:
            active.pop(rem["index"], None)
        for add in frame["append"]:
            active[add["index"]] = {
                "sprite": add["sprite"], "resource": add["resource"],
                "x": 0.0, "y": 0.0, "birth": f, "time_scale": add["time_scale"],
            }
        for chg in frame["change"]:
            frag = active.get(chg["index"])
            if not frag:
                continue
            t = chg["transform"]
            frag["x"], frag["y"] = t[-2], t[-1]
    return active


def find_label_range(frames, label):
    start = next((i for i, f in enumerate(frames) if f["label"] == label), None)
    if start is None:
        return 0, len(frames) - 1
    end = len(frames) - 1
    for i in range(start + 1, len(frames)):
        if frames[i]["label"] or frames[i]["stop"]:
            end = i
            break
    return start, end


def collect_pieces(pam, sprite, start, target, origin):
    """Returns list of (image_name, abs_x, abs_y), ignoring rotation/scale."""
    pieces = []
    active = compute_active(sprite["frame"], start, target)
    for frag in active.values():
        abs_x, abs_y = origin[0] + frag["x"], origin[1] + frag["y"]
        if frag["sprite"]:
            sub = pam["sprite"][frag["resource"]]
            sub_frame_count = len(sub["frame"]) or 1
            elapsed = int((target - frag["birth"]) * frag["time_scale"])
            sub_target = elapsed % sub_frame_count
            pieces.extend(collect_pieces(pam, sub, 0, sub_target, (abs_x, abs_y)))
        else:
            img = pam["image"][frag["resource"]]
            pieces.append((clean_name(img["name"]), abs_x, abs_y))
    return pieces


def render(pam_path: Path, label: str, out_path: Path, canvas=(500, 500), origin=(250, 350)):
    pam = decode_pam(pam_path)
    main = pam["main_sprite"]
    start, end = find_label_range(main["frame"], label)
    mid_frame = (start + end) // 2
    pieces = collect_pieces(pam, main, 0, mid_frame, origin)

    canvas_img = Image.new("RGBA", canvas, (0, 0, 0, 0))
    for name, x, y in pieces:
        png_path = IMAGES_DIR / f"{name}.png"
        if not png_path.exists():
            continue
        part = Image.open(png_path).convert("RGBA")
        px, py = int(x - part.width / 2), int(y - part.height / 2)
        canvas_img.alpha_composite(part, (px, py))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas_img.save(out_path)
    print(f"rendered {len(pieces)} pieces -> {out_path}")


if __name__ == "__main__":
    render(Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]))
