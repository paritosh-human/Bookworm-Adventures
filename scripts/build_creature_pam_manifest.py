#!/usr/bin/env python3
"""Map each creature in creatures.json to its real .pam animation file.

Bookworm Adventures' .pam filenames are prefixed with a book/stage number
and use abbreviated/CamelCase names (e.g. "1Troj_Archer.pam" for "Centaur
Archer", "10LesserBasilisk.pam" for the base "Basilisk"), which don't match
the creature roster names 1:1. This does normalized + fuzzy matching, with a
small manual table for known naming quirks, and leaves anything unresolved
out of the manifest (those creatures fall back to text-only display).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAM_DIR = ROOT / "raw-assets/adventures/images/pam"
CREATURES_PATH = ROOT / "src/assets/adventures/creatures.json"
OUT_PATH = ROOT / "src/assets/adventures/creature_pam.json"

ALIASES = {"Trojan": "Troj", "Pharoah": "Pharaoh"}

MANUAL = {
    "Basilisk": "10LesserBasilisk",
    "Ewe": "2AngryEwe",
    "War Hound": "1Hound",
    "Centaur Archer": "1Troj_Archer",
    "Centaur Warrior": "1Troj_Warrior",
    "Helead": "10Medusa",
    "Mountain Goat": "2AngryGoat",
    "Thief1": "2Thief_01",
    "Thief2_3": "2Thief_02_03",
    "Thief4_5": "2Thief_04_05",
    "Polydamas": "1Troj_Polydamas",
    # Fan wikis describe Alexander as a Trojan-armored bow-only attacker
    # (green-fluffed helmet) — the game reuses the generic Trojan archer model.
    "Alexander": "1Troj_Archer",
}


def norm(s: str) -> str:
    s = re.sub(r"^\d+", "", s)
    s = re.sub(r"_0*(\d+)", r"\1", s)
    return re.sub(r"[^a-z0-9]", "", s.lower())


def apply_aliases(name: str) -> str:
    for a, b in ALIASES.items():
        name = name.replace(a, b)
    return name


def main():
    pam_files = [p.stem for p in PAM_DIR.glob("*.pam")]
    pam_lookup: dict[str, list[str]] = {}
    for stem in pam_files:
        pam_lookup.setdefault(norm(stem), []).append(stem)

    creatures = json.loads(CREATURES_PATH.read_text())
    manifest = {}
    unmatched = []
    for c in creatures:
        name = c["name"]
        if name in MANUAL:
            manifest[name] = MANUAL[name]
            continue
        key = norm(apply_aliases(name.replace(" ", "")))
        candidates = pam_lookup.get(key)
        if candidates:
            manifest[name] = candidates[0]
            continue
        # Loose substring fallback, guarded against short names false-matching
        # inside unrelated longer ones (e.g. "Alexander" containing "lex").
        found = None
        for stem_norm, stems in pam_lookup.items():
            if not key or len(key) <= 3:
                continue
            shorter, longer = (key, stem_norm) if len(key) <= len(stem_norm) else (stem_norm, key)
            if shorter in longer and len(shorter) / len(longer) >= 0.7:
                found = stems[0]
                break
        if found:
            manifest[name] = found
        else:
            unmatched.append(name)

    OUT_PATH.write_text(json.dumps(manifest, indent=2))
    print(f"matched {len(manifest)}/{len(creatures)} creatures -> {OUT_PATH}")
    if unmatched:
        print("unmatched (will render text-only):", unmatched)


if __name__ == "__main__":
    main()
