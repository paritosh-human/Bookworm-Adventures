#!/usr/bin/env python3
"""Audit every extracted game file: is it actually wired into the app?

Writes ASSETS_TRACKER.md (totals per game/category) and ASSETS_UNUSED.txt (every
unused file). Re-run after any change:  python3 scripts/asset_audit.py

A file counts as USED when one of these is true:
  1. LEDGER below says so (assets used via conversion/renaming, e.g. the word
     lists, tile sheet, hearts, battle frame).
  2. It was copied to public/<game>/ under the same name (Deluxe images/sounds,
     Adventures sounds, etc.).
  3. It's a .pam animation that a creature maps to (creature_pam.json), Lex, or a
     Book 1-3 scenery layer — and every body-part image those .pam files reference.
Mask files (`name_.gif`) follow their base image. Native binaries/DRM are N/A.
"""
import fnmatch
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-assets"
PUBLIC = ROOT / "public"
sys.path.insert(0, str(ROOT / "scripts"))
from decode_pam import decode_pam  # noqa: E402

GAMES = ["deluxe", "adventures", "adventures-vol2"]

# (glob relative to raw-assets, where it's used)
LEDGER = [
    ("deluxe/wordlist.txt", "decoded into src/assets/dictionary/words.json"),
    ("deluxe/bonus_word_dictionary.txt", "decoded into src/assets/dictionary/words.json"),
    ("adventures/data/compressed.txt", "decoded into src/assets/dictionary/words.json"),
    ("adventures/scripts/books/*.luc", "decompiled -> game_data.json (chapters, enemy order, boss/checkpoint)"),
    ("adventures/scripts/creatures/Book[123]/*.luc", "decompiled -> game_data.json (hearts, attacks, pam, xp)"),
    ("adventures/scripts/creatures/*.luc", "decompiled; Lex/base-class rules ported to src/game/adventures"),
    ("adventures/scripts/effects/*.luc", "decompiled; effect semantics ported to BattleModel.ts"),
    ("adventures/scripts/tiles/*.luc", "decompiled; gem / tile-status rules ported to LetterGrid + rules.ts"),
    ("adventures/scripts/attacks/*.luc", "decompiled; attack selection ported to rules.ts (urgency)"),
    ("adventures/scripts/BattleEngine.luc", "decompiled; turn flow ported to BattleScene/BattleModel"),
    ("adventures/scripts/TileEngine.luc", "decompiled; tile/gem/word rules ported"),
    ("adventures/scripts/main.luc", "decompiled; LETTER_BONUSES ported to rules.ts"),
    ("adventures/scripts/*.luc", "decompiled into decompiled/ (reference for the rules port)"),
    ("adventures/scripts/*/*.luc", "decompiled into decompiled/ (reference for the rules port)"),
    ("adventures/properties/Book[123].xml", "arena image manifest -> per-chapter arenas"),
    ("adventures/properties/tiles.xml", "tile/gem art manifest -> gem_*.png, tile_*.png"),
    ("adventures/properties/config.xml", "BonusChance gem spawn rates -> rules.ts"),
    ("adventures/properties/resources.xml", "image id -> file manifest (battle UI art)"),
    ("adventures/images/board/hearts.gif", "battle hearts spritesheet"),
    ("adventures/images/board/button_*", "battle Attack / Menu / Scramble buttons"),
    ("adventures/images/board/enemyattacking_button*", "battle 'enemy attacking' button state"),
    ("adventures/images/board/bossbanner*", "boss banner"),
    ("adventures/images/board/bossbattle_text*", "boss banner text"),
    ("adventures/images/board/checkpointreached*", "checkpoint banner"),
    ("adventures/images/board/ui_potion_pedestal*", "potion pedestal"),
    ("adventures/images/board/ui_treasure_pedestal*", "treasure pedestal"),
    ("adventures/images/board/lore_plate.gif", "attack list header plate"),
    ("adventures/images/board/lore_plate_.gif", "attack list header plate (mask)"),
    ("adventures/images/tiles/tile_*", "gem / tile-status tile art"),
    ("adventures/images/tiles/overlay_locked*", "locked tile overlay"),
    ("adventures/scripts/creatures/Book[123]/lore/*.lore", "monster lore -> creatures.json"),
    ("adventures/cutscenes/intro.swf", "intro cutscene (Ruffle), public/adventures/cutscenes"),
    ("deluxe/images/tile.gif", "Deluxe tile art"),
    ("deluxe/images/tile_gold.gif", "Deluxe tile art"),
    ("adventures/images/tutorial/portrait_lex_*", "Lex portraits (loaded, not shown in battle any more)"),
    ("adventures/images/tiles/tile_basic.jpg", "battle tile sheet"),
    ("adventures/images/tiles/pips.jpg", "battle tier pips"),
    ("adventures/images/board/heart_small*.png", "battle hearts"),
    ("adventures/images/board/ui_top.jpg", "battle screen frame"),
    ("adventures/images/board/ui_bottom[12].jpg", "battle screen frame"),
    ("adventures/images/widescreen_*.jpg", "battle side curtains"),
    ("adventures/images/arenas/Book[123]/Sky.jpg", "battle sky per book"),
    ("adventures/sounds/lex_chomp.ogg", "battle attack sfx"),
    ("adventures/sounds/buzzer.ogg", "battle invalid-word sfx"),
    ("adventures/sounds/crowdcheer.ogg", "battle victory sfx"),
    ("deluxe/sounds/buttonclick.ogg", "button click sfx"),
    ("deluxe/sounds/chomp.ogg", "Deluxe sfx"),
    ("deluxe/sounds/bad.ogg", "Deluxe sfx"),
    ("deluxe/sounds/screenburngameover.ogg", "Deluxe sfx"),
]

def _expand(ledger):
    out = []
    for pat, note in ledger:
        out.append((pat, note))
        if pat.startswith("adventures/"):
            out.append(("adventures-vol2/" + pat[len("adventures/"):].replace("Book[123]", "Book[0-9]"), note + " (Vol2)"))
    return out


LEDGER = _expand(LEDGER)

NOT_APPLICABLE = [
    "*.exe", "*.dll", "deluxe/Registration-Key.txt", "deluxe/properties/*",
]


def rel(p: Path) -> str:
    return p.relative_to(RAW).as_posix()


def is_mask(p: Path) -> bool:
    return p.stem.endswith("_") and p.suffix.lower() in (".gif", ".jpg")


def mask_base_stem(p: Path) -> str:
    return p.stem[:-1]


def clean(name: str) -> str:
    return name[5:] if name.startswith("(add)") else name


DATA = {"adventures": "game_data.json", "adventures-vol2": "game_data_vol2.json"}


def used_pam_stems(game: str) -> set[str]:
    data = json.loads((ROOT / "src/assets/adventures" / DATA[game]).read_text())
    stems = {stem for c in data["creatures"].values() for stem in c["pam"]} | {"lex"}
    for p in (RAW / game / "images/pam").glob("*.pam"):
        if re.fullmatch(r"(MG|FG)\d+-\d+", p.stem) or p.stem.lower().startswith(("lex", "dancelex")):
            stems.add(p.stem)
    return stems


def public_stems(game: str) -> set[str]:
    base = PUBLIC / game
    out = set()
    if not base.exists():
        return out
    for f in base.rglob("*"):
        if f.is_file() and "pam" not in f.relative_to(base).parts[:1] and "cutscenes" not in f.relative_to(base).parts[:1]:
            out.add(f.stem.lower())
    return out


def arena_paths(game: str) -> set[str]:
    data = json.loads((ROOT / "src/assets/adventures" / DATA[game]).read_text())
    return {(ch.get("arena") or {}).get("path", "").lower() for b in data["books"].values() for ch in b["chapters"]} - {""}


def main():
    arenas = {g: arena_paths(g) for g in DATA}
    stems_used = {g: used_pam_stems(g) for g in DATA}
    used_part_images = {g: set() for g in DATA}
    for g in DATA:
        for stem in stems_used[g]:
            f = RAW / g / "images/pam" / f"{stem}.pam"
            if f.exists():
                try:
                    for img in decode_pam(f)["image"]:
                        used_part_images[g].add(clean(img["name"]).lower())
                except Exception:
                    pass

    pub = {g: public_stems(g) for g in GAMES}
    status: dict[str, tuple[str, str]] = {}  # path -> (USED|UNUSED|N/A, note)
    base_status: dict[tuple[str, str], str] = {}

    files = [p for p in RAW.rglob("*") if p.is_file() and p.name != ".DS_Store"]
    for p in sorted(files):
        r = rel(p)
        game = r.split("/", 1)[0]
        parts = r.split("/")
        verdict = None

        if any(fnmatch.fnmatch(r, pat) for pat in NOT_APPLICABLE):
            verdict = ("N/A", "native binary / DRM / metadata")
        if verdict is None:
            for pat, note in LEDGER:
                if fnmatch.fnmatch(r, pat):
                    verdict = ("USED", note)
                    break
        if verdict is None and game in DATA and r.rsplit(".", 1)[0].rstrip("_").lower().replace(game + "/", "", 1) in arenas[game]:
            verdict = ("USED", "composited into a per-chapter arena (arena_bNcM.png)")
        if verdict is None and "images/pam" in r:
            if "images/pam/images/" in r:
                name = p.stem[:-1] if is_mask(p) else p.stem
                if game in DATA and name.lower() in used_part_images[game]:
                    verdict = ("USED", "body part of a rendered .pam animation")
            elif p.suffix == ".pam" and game in DATA and p.stem in stems_used[game]:
                verdict = ("USED", "rendered animation (monster / Lex / scenery)")
        if verdict is None and game in pub and "images/pam" not in r:
            stem = (mask_base_stem(p) if is_mask(p) else p.stem).lower()
            if stem in pub[game] and parts[1] in ("images", "sounds", "music", "fonts"):
                verdict = ("USED", f"copied to public/{game}/")
        status[r] = verdict or ("UNUSED", "")

    # masks inherit their base image's status
    for r, (st, note) in list(status.items()):
        p = RAW / r
        if is_mask(p) and st == "UNUSED":
            for ext in (".jpg", ".gif", ".png"):
                b = p.with_name(p.stem[:-1] + ext)
                if b.exists() and status.get(rel(b), ("", ""))[0] == "USED":
                    status[r] = ("USED", "alpha mask for a used image")
                    break

    # ---- report ----
    def category(r: str) -> str:
        parts = r.split("/")
        if len(parts) <= 2:
            return f"{parts[0]}/(root)"
        if parts[1] == "images" and len(parts) > 3:
            return f"{parts[0]}/images/{parts[2]}"
        if parts[1] == "scripts" and len(parts) > 3:
            return f"{parts[0]}/scripts/{parts[2]}"
        return f"{parts[0]}/{parts[1]}"

    per_cat: dict[str, dict[str, int]] = defaultdict(lambda: {"USED": 0, "UNUSED": 0, "N/A": 0})
    per_game: dict[str, dict[str, int]] = defaultdict(lambda: {"USED": 0, "UNUSED": 0, "N/A": 0})
    for r, (st, _) in status.items():
        per_cat[category(r)][st] += 1
        per_game[r.split("/", 1)[0]][st] += 1

    def pct(d):
        tot = d["USED"] + d["UNUSED"]
        return f"{100 * d['USED'] / tot:.0f}%" if tot else "-"

    lines = [
        "# Asset tracker (generated — do not edit by hand)",
        "",
        "Regenerate with `python3 scripts/asset_audit.py`. A file is **used** only if it is",
        "wired into the app (see the rules at the top of that script). Everything under",
        "**UNUSED** is extracted game content still waiting to be put to use; the full file",
        "list is in `ASSETS_UNUSED.txt`. Notes on *how* each unused group could be used live",
        "in `ASSETS.md`.",
        "",
        "## Totals",
        "",
        "| Game | Used | Unused | N/A | % used |",
        "|---|---:|---:|---:|---:|",
    ]
    for g in GAMES:
        d = per_game[g]
        lines.append(f"| {g} | {d['USED']} | {d['UNUSED']} | {d['N/A']} | {pct(d)} |")
    tot = {k: sum(per_game[g][k] for g in GAMES) for k in ("USED", "UNUSED", "N/A")}
    lines.append(f"| **all** | {tot['USED']} | {tot['UNUSED']} | {tot['N/A']} | {pct(tot)} |")
    lines += ["", "## By category", "", "| Category | Used | Unused | % used |", "|---|---:|---:|---:|"]
    for cat in sorted(per_cat):
        d = per_cat[cat]
        if d["USED"] + d["UNUSED"] == 0:
            continue
        mark = "✅" if d["UNUSED"] == 0 else ("🟡" if d["USED"] else "⬜")
        lines.append(f"| {mark} {cat} | {d['USED']} | {d['UNUSED']} | {pct(d)} |")
    (ROOT / "ASSETS_TRACKER.md").write_text("\n".join(lines) + "\n")

    unused_by_cat: dict[str, list[str]] = defaultdict(list)
    for r, (st, _) in status.items():
        if st == "UNUSED":
            unused_by_cat[category(r)].append(r)
    out = []
    for cat in sorted(unused_by_cat):
        out.append(f"## {cat} ({len(unused_by_cat[cat])} unused)")
        out.extend(sorted(unused_by_cat[cat]))
        out.append("")
    (ROOT / "ASSETS_UNUSED.txt").write_text("\n".join(out))

    print(f"used {tot['USED']} / unused {tot['UNUSED']} / n/a {tot['N/A']}  ({pct(tot)} used)")
    for g in GAMES:
        print(f"  {g:16s} {pct(per_game[g]):>4s}  ({per_game[g]['USED']} used, {per_game[g]['UNUSED']} unused)")


if __name__ == "__main__":
    main()
