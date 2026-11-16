#!/usr/bin/env python3
"""Per-creature sound cues (attack / hit / engage / death) from the creature scripts + the
SOUND_* id -> file table in properties/resources.xml. Usage: extract_sounds.py [GAME] [OUT.json]   (GAME = adventures | adventures-vol2, default adventures)
Also copies the referenced sound files into public/<GAME>/sounds/fx/ (existing files untouched).
Default OUT is public/<GAME>/sounds/sounds.json (legacy form `extract_sounds.py OUT.json` still works)."""
import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = "adventures"


def sound_table() -> dict[str, str]:
    out = {}
    for xml in (ROOT / "raw-assets" / GAME / "properties").glob("*.xml"):
        prefix = ""
        for el in ET.parse(xml).getroot().iter():
            if el.tag == "SetDefaults" and el.get("idprefix") is not None:
                prefix = el.get("idprefix")
            elif el.tag == "Sound":
                out.setdefault(prefix + el.get("id", ""), el.get("path", ""))
    return out


def main(out_path: str):
    out_path = out_path or str(ROOT / "public" / GAME / "sounds" / "sounds.json")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    table = sound_table()
    have = {p.stem.lower(): p.name for p in (ROOT / "raw-assets" / GAME / "sounds").iterdir()}

    def resolve(tok: str) -> str | None:
        tok = tok.strip()
        m = re.match(r'GetBossMonsterSound\("([A-Z0-9_]+)"\)', tok)
        name = m.group(1) if m else tok
        for cand in (name, name.replace("SOUND_", "SOUND_UT_", 1)):
            path = table.get(cand)
            if path and path.split("/")[-1].lower() in have:
                return have[path.split("/")[-1].lower()]
        return None

    sound_arg = r'((?:GetBossMonsterSound\("[A-Z0-9_]+"\))|SOUND_[A-Z0-9_]+)'
    data = {}
    for f in sorted((ROOT / "decompiled" / GAME / "scripts/creatures").glob("Book*/*.lua")):
        t = f.read_text()
        d = {"attacks": {}}
        for key, pat in (("engage", "mEngageSound"), ("death", "mDeathSound")):
            m = re.search(rf"t\.{pat} = {sound_arg}", t)
            if m and resolve(m.group(1)):
                d[key] = resolve(m.group(1))
        m = re.search(rf"\w+:AddDefenseSound\({sound_arg}", t)
        if m and resolve(m.group(1)):
            d["hit"] = resolve(m.group(1))
        varname = {}
        for line in t.splitlines():
            s = line.strip()
            m = re.search(r'PAMAttackWrapper:new\(.*?"(attack\d+)", "([^"]*)"', s) or re.search(r'RegenerateHealth:new\(.*?"(attack\d+)", "([^"]*)"', s)
            if m:
                frame, name = m.groups()
                mv = re.match(r"local (\w+) = ", s)
                if mv:
                    varname[mv.group(1)] = name
                ms = re.search(rf"AddAttackSound\({sound_arg}", s)
                if ms and resolve(ms.group(1)):
                    d["attacks"][name] = resolve(ms.group(1))
                continue
            mv = re.match(rf"(\w+):AddAttackSound\({sound_arg}", s)
            if mv and mv.group(1) in varname and resolve(mv.group(2)):
                d["attacks"][varname[mv.group(1)]] = resolve(mv.group(2))
        data[f.stem] = d
    Path(out_path).write_text(json.dumps(data, separators=(",", ":")))
    used = {v for d in data.values() for v in [d.get("engage"), d.get("death"), d.get("hit"), *d["attacks"].values()] if v}
    print(len(data), "creatures,", len(used), "distinct sound files,",
          sum(1 for d in data.values() if d["attacks"]), "with attack sounds")
    (Path(out_path).with_suffix(".files.txt")).write_text("\n".join(sorted(used)))
    fx = ROOT / "public" / GAME / "sounds" / "fx"
    fx.mkdir(parents=True, exist_ok=True)
    copied = 0
    for name in sorted(used):
        src = ROOT / "raw-assets" / GAME / "sounds" / name
        if not (fx / name).exists():
            shutil.copyfile(src, fx / name)
            copied += 1
    print(f"copied {copied} new sound files -> {fx}")


if __name__ == "__main__":
    args = sys.argv[1:]
    out = None
    if args and args[0].endswith(".json"):
        out = args.pop(0)
    if args:
        GAME = args.pop(0)
    if args:
        out = args.pop(0)
    main(out)
