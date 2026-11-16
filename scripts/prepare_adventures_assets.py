#!/usr/bin/env python3
"""Build web-ready PNGs for the Bookworm Adventures battle screen from raw-assets.

Needs Pillow (see scripts/composite_pam_images.py for the venv used here).
Reads src/assets/adventures/game_data.json for the per-chapter arena paths.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets/adventures"
OUT = ROOT / "public/adventures/images"


def find(rel_no_ext: str) -> Path | None:
    """case-insensitive lookup of <rel>.{jpg,gif,png,jp2}"""
    p = RAW / rel_no_ext
    parent = p.parent
    if not parent.exists():
        return None
    want = p.name.lower()
    for f in parent.iterdir():
        if f.stem.lower() == want and f.suffix.lower() in (".jpg", ".gif", ".png"):
            return f
    return None


def composite(rel_no_ext: str, out_name: str) -> bool:
    color = find(rel_no_ext)
    if color is None:
        print("  missing", rel_no_ext)
        return False
    img = Image.open(color).convert("RGBA")
    mask = find(rel_no_ext + "_")
    if mask is not None:
        m = Image.open(mask).convert("L")
        if m.size != img.size:
            m = m.resize(img.size)
        img.putalpha(m)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / out_name)
    return True


def main():
    data = json.loads((ROOT / "src/assets/adventures/game_data.json").read_text())
    n = 0
    for book, bk in data["books"].items():
        for ch in bk["chapters"]:
            path = (ch.get("arena") or {}).get("path")
            if path and composite(path, f"arena_b{book}c{ch['n']}.png"):
                n += 1
    print("arenas:", n)
    for rel, out in [
        ("images/board/hearts", "hearts.png"),
        ("images/board/button_attack", "btn_attack.png"),
        ("images/board/button_menu", "btn_menu.png"),
        ("images/board/button_scramble", "btn_scramble.png"),
        ("images/board/enemyattacking_button", "btn_enemy_attacking.png"),
        ("images/board/bossbanner", "boss_banner.png"),
        ("images/board/bossbattle_text", "boss_text.png"),
        ("images/board/checkpointreached", "checkpoint_reached.png"),
        *[(f"images/items/item_{k}{nb}", f"item_{k}{nb}.png") for k in ("health", "attack", "purify") for nb in ("", "_nobubble")],
        *[(f"images/treasures/treasure_{b}-{n}_sml", f"treasure_{b}-{n}.png") for b in (1, 2, 3) for n in range(1, 11)],
        ("images/treasures/TreasureBox", "treasure_box.png"),
        ("images/wordscroll/bestword_paper", "bestword_paper.png"),
        ("images/wordscroll/bestword_title", "bestword_title.png"),
        ("images/XPBar_empty", "xp_bar_empty.png"),
        ("images/XPBar_filled", "xp_bar_full.png"),
        ("images/LevelUp/levelup_banner", "levelup_banner.png"),
        ("images/hintarrow_box", "hint_box.png"),
        ("images/hintarrow_title", "hint_title.png"),
        *[(f"images/hintarrow_{d}", f"hint_{d}.png") for d in ("up", "down", "left", "right")],
        ("images/board/ui_potion_pedestal", "ui_potion_pedestal.png"),
        ("images/board/ui_treasure_pedestal", "ui_treasure_pedestal.png"),
        ("images/board/lore_plate", "lore_plate.png"),
        ("images/tiles/tile_smashed", "tile_smashed.png"),
        ("images/tiles/tile_plagued", "tile_plagued.png"),
        ("images/tiles/overlay_locked", "tile_locked.png"),
        ("images/tiles/tile_fire", "tile_fire.png"),
        ("images/tiles/tile_charred", "tile_charred.png"),
        ("images/tiles/tile_fire_glow", "tile_fire_glow.png"),
        *[(f"images/tiles/tile_{g}", f"gem_{g}.png") for g in
          ("amethyst", "crystal", "diamond", "emerald", "garnet", "ruby", "saphire", "topaz")],
    ]:
        print(out, composite(rel, out))


if __name__ == "__main__":
    main()
