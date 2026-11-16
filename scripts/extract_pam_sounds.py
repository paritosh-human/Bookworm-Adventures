#!/usr/bin/env python3
"""Sound ids used by `playsound` commands inside .pam files -> sound file, plus copies into
public/<game>/sounds/fx. Writes src/assets/adventures/pam_sounds[_vol2].json {SOUND_ID: file}."""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decode_pam import decode_pam  # noqa: E402
from extract_sounds import sound_table  # noqa: E402
import extract_sounds  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main(game: str):
    extract_sounds.GAME = game
    table = sound_table()
    raw = ROOT / "raw-assets" / game / "sounds"
    have = {p.stem.lower(): p.name for p in raw.iterdir()}
    used = {}
    for f in (ROOT / "raw-assets" / game / "images/pam").glob("*.pam"):
        try:
            p = decode_pam(f)
        except Exception:
            continue
        for fr in p["main_sprite"]["frame"]:
            for name, arg in fr.get("command", []):
                if name.lower() == "playsound":
                    used[arg.split()[0]] = None
    out = {}
    for sid in used:
        path = table.get(sid) or table.get(sid.replace("SOUND_", "SOUND_UT_", 1))
        if path and path.split("/")[-1].lower() in have:
            out[sid] = have[path.split("/")[-1].lower()]
    dest = ROOT / "public" / game / "sounds/fx"
    dest.mkdir(parents=True, exist_ok=True)
    for fn in set(out.values()):
        if not (dest / fn).exists():
            shutil.copy(raw / fn, dest / fn)
    name = "pam_sounds.json" if game == "adventures" else "pam_sounds_vol2.json"
    (ROOT / "src/assets/adventures" / name).write_text(json.dumps(out, indent=0))
    print(game, len(used), "ids,", len(out), "resolved ->", name)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "adventures")
