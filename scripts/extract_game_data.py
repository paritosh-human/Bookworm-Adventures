#!/usr/bin/env python3
"""Extract structured game data from the decompiled PopLua scripts.

Reads decompiled/<game>/scripts/{books,creatures}/**.lua and writes
src/assets/adventures/game_data.json with, per game:
  books[n]      -> title, chapters[] (title, description, enemies[] in real order
                   with boss / checkpoint flags)
  creatures[id] -> name, hearts, xp, treasure, pam files, attacks[] (effects,
                   min/max urgency, animation label, name, description), defense
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DECOMP = ROOT / "decompiled"
OUT_DIR = ROOT / "src/assets/adventures"


def RAW_PROPS(game):
    return ROOT / "raw-assets" / game / "properties"


def split_top(s: str) -> list[str]:
    parts, depth, cur, q = [], 0, "", False
    i = 0
    while i < len(s):
        ch = s[i]
        if q:
            cur += ch
            if ch == "\\":
                i += 1
                cur += s[i]
            elif ch == '"':
                q = False
        elif ch == '"':
            q = True; cur += ch
        elif ch in "({[":
            depth += 1; cur += ch
        elif ch in ")}]":
            depth -= 1; cur += ch
        elif ch == "," and depth == 0:
            parts.append(cur.strip()); cur = ""
        else:
            cur += ch
        i += 1
    if cur.strip():
        parts.append(cur.strip())
    return parts


def balanced(s: str, start: int) -> int:
    """index just after the ')' matching the '(' at s[start]"""
    depth, q, i = 0, False, start
    while i < len(s):
        ch = s[i]
        if q:
            if ch == "\\":
                i += 1
            elif ch == '"':
                q = False
        elif ch == '"':
            q = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(s)


def val(tok: str, env: dict):
    tok = tok.strip()
    if tok in env:
        return env[tok]
    if tok.startswith('"') and tok.endswith('"'):
        return tok[1:-1].replace("\\n", "\n")
    if tok in ("true", "false"):
        return tok == "true"
    if tok == "nil":
        return None
    try:
        return int(tok)
    except ValueError:
        pass
    try:
        return float(tok)
    except ValueError:
        pass
    m = re.match(r"^(\w+):new\((.*)\)$", tok, re.S)
    if m:
        return {"cls": m.group(1), "args": [val(a, env) for a in split_top(m.group(2))]}
    return {"expr": tok}


def parse_chain(rest: str):
    """':Method(args):Method2(args)' -> [(name, [args])]"""
    out = []
    while rest.startswith(":"):
        m = re.match(r":(\w+)\(", rest)
        if not m:
            break
        end = balanced(rest, m.end() - 1)
        out.append((m.group(1), split_top(rest[m.end():end - 1])))
        rest = rest[end:]
    return out


def parse_creature(path: Path) -> dict | None:
    text = path.read_text()
    c: dict = {"id": path.stem, "attacks": [], "defense": None, "pam": []}
    m = re.search(r"PAMBasedEnemy:Init\(([^)]*)\)", text)
    if not m:
        return None
    first = split_top(m.group(1))
    c["hearts"] = val(first[0], {}) if first else None
    m = re.search(r't\.mName = "([^"]*)"', text)
    c["name"] = m.group(1) if m else path.stem
    xps = re.findall(r"t\.mXP = (\d+)", text)
    c["xp"] = int(xps[-1]) if xps else 0
    m = re.search(r"t\.mTreasure = (\w+):new\(", text)
    c["treasure"] = m.group(1) if m else None
    c["pam"] = list(dict.fromkeys(re.findall(r'"images/pam/([^"]+?)(?:\.pam)?"', text)))

    env: dict = {}
    attack_vars: dict[str, dict] = {}
    last_chain_args = None
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r"local (\w+) = (\w+:new\(.*)$", s)
        if m and not m.group(2).startswith("PAMAttackWrapper"):
            env[m.group(1)] = val(m.group(2), env)
            continue
        expr = None
        var = None
        m = re.match(r"local (\w+) = (PAMAttackWrapper:new\(.*)$", s)
        if m:
            var, expr = m.group(1), m.group(2)
        elif s.startswith("PAMAttackWrapper:new("):
            expr = s
        else:
            m = re.match(r"common\.Append\((PAMAttackWrapper:new\(.*\))\)$", s)
            if m:
                expr = m.group(1)
                if last_chain_args is not None and expr == last_chain_args:
                    last_chain_args = None
                    continue  # duplicate of the chained creation on the previous line
        m2 = re.match(r"t\.mAttacks\[\d+\] = (PAMAttackWrapper:new\(.*\))$", s)
        if m2:
            expr = m2.group(1)
        if expr:
            end = balanced(expr, len("PAMAttackWrapper:new"))
            inner = expr[len("PAMAttackWrapper:new") + 1:end - 1]
            args = split_top(inner)
            chain = parse_chain(expr[end:])
            last_chain_args = expr[:end] if chain else None
            a = [val(x, env) for x in args]
            atk = {
                "effects": [a[0]] if a and a[0] is not None else [],
                "min": a[1] if len(a) > 1 else 0,
                "max": a[2] if len(a) > 2 else 0,
                "frame": a[4] if len(a) > 4 and isinstance(a[4], str) else "attack1",
                "name": a[5] if len(a) > 5 else "",
                "description": a[6] if len(a) > 6 else "",
            }
            for name, cargs in chain:
                if name == "AddEffect" and cargs:
                    atk["effects"].append(val(cargs[0], env))
            c["attacks"].append(atk)
            if var:
                attack_vars[var] = atk
            continue
        m = re.match(r"(\w+):AddEffect\((.*)\)$", s)
        if m and m.group(1) in attack_vars:
            cargs = split_top(m.group(2))
            if cargs:
                attack_vars[m.group(1)]["effects"].append(val(cargs[0], env))
            continue
        m = re.match(r"local (\w+) = PAMDefaultDefend:new\(([^,]*), \"(\w+)\"", s)
        if m:
            c["defense"] = m.group(3)
    return c


def num(expr: str, map_off: int) -> int:
    """'(62 + t.mMapX)' / '210' -> int (screen coordinate of the chapter icon)"""
    e = re.sub(r"t\.mMap[XY]", str(map_off), expr)
    return int(eval(e, {"__builtins__": {}})) if re.fullmatch(r"[\d\s+\-()]+", e) else 0


_LABELS: dict = {}


def pam_labels(game: str, stem: str) -> set[str]:
    key = (game, stem)
    if key not in _LABELS:
        sys.path.insert(0, str(ROOT / "scripts"))
        from decode_pam import decode_pam
        f = ROOT / "raw-assets" / game / "images/pam" / f"{stem}.pam"
        try:
            _LABELS[key] = {fr["label"] for fr in decode_pam(f)["main_sprite"]["frame"] if fr.get("label")} if f.exists() else set()
        except Exception:  # Vol. 2 pams use a newer layout the decoder can't read yet
            _LABELS[key] = set()
    return _LABELS[key]


def best_pam_first(game: str, c: dict) -> None:
    """A creature script can list several pams (cutscene, boss intro...). The battle one is the
    pam that has the labels the fight needs (idle / flinch / death / the attack frames)."""
    need = {"idle", "flinch", "death"} | {a["frame"] for a in c["attacks"]}
    c["pam"].sort(key=lambda st: -len(need & pam_labels(game, st)))


def parse_defenses(text: str) -> list:
    """Named PAMDefaultDefend entries (armor, immunities, bonus word categories) + the creature's
    WordEffect damage multiplier (applies to its 'Bonus category' defense)."""
    out, seen = [], set()
    for m in re.finditer(r'PAMDefaultDefend:new\(mPAM, "[^"]*", [^,]+, [^,]+, "([^"]+)", "([^"]*)"', text):
        if m.group(1) in seen:
            continue
        seen.add(m.group(1))
        out.append({"name": m.group(1), "description": m.group(2)})
    mult = re.search(r"WordEffect:new\(DamageMultiplierEffect:new\(([\d.]+)", text)
    return {"list": out, "bonusMult": float(mult.group(1)) if mult else 2.0}


def parse_wordlists(game: str) -> dict:
    sys.path.insert(0, str(ROOT / "scripts"))
    from luc import load
    res = {}
    for f in (ROOT / "raw-assets" / game / "scripts/wordlists").glob("*.luc"):
        _, proto = load(f)
        words = []
        def walk(pr):
            words.extend(c.lower() for c in pr.consts if isinstance(c, str) and c.isalpha())
            for sp in pr.protos:
                walk(sp)
        walk(proto)
        res[f.stem] = sorted(set(words))
    return res


def parse_dialog(path: Path) -> dict:
    """creatures/BookN/dialog/X.lua -> {intro, attack, death}.
    Each dialog call is preceded by a decompiler comment `-- ALTSELF ... c=N`: N identifies the
    method (AddIntroText / AddAttackText / AddDeathText) within a file. Attack lines carry 3+
    arguments; of the two-argument groups the first (in file order) is intro text and the second
    is death text (what is said when Lex is defeated)."""
    text = path.read_text()
    lines = []
    for m in re.finditer(r'(?:-- ALTSELF a=\d+ b=\d+ c=(\d+) bx=\d+\n\s*)?PAMBasedEnemy\((?:R2|t), ("(?:[^"\\]|\\.)*"), (.*)\)$', text, re.M):
        c = m.group(1)
        t = m.group(2)[1:-1].replace("\\n", "\n")
        args = [a.strip() for a in m.group(3).split(",")]
        lines.append((c, t, args))
    groups = []  # distinct c values of two-argument lines in order of appearance
    for c, _, args in lines:
        if len(args) < 3 and c not in groups:
            groups.append(c)
    d = {"intro": [], "attack": [], "death": []}
    attack_idx = [i for i, (_, _, a) in enumerate(lines) if len(a) >= 3]
    first, last = (attack_idx[0], attack_idx[-1]) if attack_idx else (None, None)
    for i, (c, t, args) in enumerate(lines):
        speaker = "lex" if "DIALOG_LEX" in args else "enemy"
        if len(args) >= 3:
            d["attack"].append({"text": t, "speaker": speaker, "attacker": "lex" if args[0] == "ATTACKER_LEX" else "enemy", "effect": args[2]})
        elif first is not None:
            # authoring order is intro lines, attack lines, death lines
            (d["intro"] if i < first else d["death"]).append({"text": t, "speaker": speaker})
        else:
            # no attack lines to anchor on: the first call group is intro, the next one death
            (d["intro"] if c == groups[0] else d["death"]).append({"text": t, "speaker": speaker})
    return d


def parse_book(path: Path) -> dict:
    text = path.read_text()
    book = {"chapters": {}, "title": None, "mapX": 0, "mapY": 0}
    for key, name in (("mapX", "mMapX"), ("mapY", "mMapY")):
        mm = re.search(rf"t\.{name} = (-?\d+)", text)
        if mm:
            book[key] = int(mm.group(1))
    m = re.search(r't\.mMapScreenHeader = "([^"]*)"', text)
    if m:
        book["title"] = m.group(1)
    for m in re.finditer(r"t:AddChapter\((.*)\)$", text, re.M):
        a = split_top(m.group(1))
        n = int(a[0])
        strs = [val(x, {}) for x in a if x.startswith('"')]
        book["chapters"][n] = {
            "n": n,
            "x": num(a[1], book["mapX"]) if len(a) > 1 else 0,
            "y": num(a[2], book["mapY"]) if len(a) > 2 else 0,
            "title": strs[0] if strs else f"Chapter {n}",
            "description": (strs[1] if len(strs) > 1 else "").strip(),
            "enemies": [],
        }
    for m in re.finditer(r"t:AddEnemy\((.*)\)$", text, re.M):
        a = split_top(m.group(1))
        n = int(a[0])
        e = {
            "id": val(a[1], {}),
            "boss": len(a) > 3 and a[3] == "true",
            "checkpoint": len(a) > 5 and a[5] == "true",
        }
        book["chapters"].setdefault(n, {"n": n, "title": f"Chapter {n}", "description": "", "enemies": []})["enemies"].append(e)
    book["chapters"] = [book["chapters"][k] for k in sorted(book["chapters"])]
    return book


def parse_image_manifest(xml_path: Path) -> dict[str, str]:
    """IMAGE_<prefix><ID> -> image path (no extension), following <SetDefaults>."""
    import xml.etree.ElementTree as ET
    out: dict[str, str] = {}
    if not xml_path.exists():
        return out
    root = ET.parse(xml_path).getroot()
    for res in root.iter("Resources"):
        path_default, prefix = "", ""
        for el in res:
            if el.tag == "SetDefaults":
                path_default = el.get("path", path_default)
                prefix = el.get("idprefix", prefix)
            elif el.tag == "Image":
                out[prefix + el.get("id", "")] = (path_default.rstrip("/") + "/" + el.get("path", "")).lstrip("/")
    return out


def chapter_arenas(game: str, book: int) -> dict[int, str]:
    """chapter -> arena IMAGE_ id, read from the (int, IMAGE_...) constants of SetupStage"""
    sys.path.insert(0, str(ROOT / "scripts"))
    from luc import load
    path = ROOT / "raw-assets" / game / "scripts/books" / f"Book{book}.luc"
    if not path.exists():
        return {}
    _, proto = load(path)
    for sp in proto.protos:
        if any(l[0] == "chap_num" for l in sp.locals):
            ks = sp.consts
            found = {ks[i]: ks[i + 1] for i in range(len(ks) - 1)
                     if isinstance(ks[i], int) and isinstance(ks[i + 1], str) and ks[i + 1].startswith("IMAGE_")}
            if found:
                return found
    return {}


def parse_treasures(base: Path) -> dict:
    out = {}
    for f in sorted((base / "treasures").glob("*.lua")):
        if "Base" in f.stem:
            continue
        t = f.read_text()
        name = re.search(r't\.mName = "([^"]*)"', t)
        lore = re.search(r't\.mRawLore = "([^"]*)"', t)
        b = re.search(r"\.BOOK = (\d+)", t)
        n = re.search(r"\.NUMBER = (\d+)", t)
        if not (name and b and n):
            continue
        out[f.stem] = {
            "id": f.stem, "name": name.group(1), "lore": (lore.group(1) if lore else "").replace("#", "").replace("\\n", " ").strip(),
            "book": int(b.group(1)), "number": int(n.group(1)),
        }
    return out


def main():
    data = {}
    for game in ("adventures", "adventures-vol2"):
        base = DECOMP / game / "scripts"
        g = {"books": {}, "creatures": {}, "treasures": parse_treasures(base), "wordlists": parse_wordlists(game)}
        for bp in sorted((base / "books").glob("Book[0-9].lua")):
            num = int(re.search(r"\d", bp.stem).group())
            book = parse_book(bp)
            if book["chapters"]:
                manifest = parse_image_manifest(RAW_PROPS(game) / f"Book{num}.xml")
                for ch_no, img_id in chapter_arenas(game, num).items():
                    for ch in book["chapters"]:
                        if ch["n"] == ch_no:
                            ch["arena"] = {"id": img_id, "path": manifest.get(img_id)}
                g["books"][num] = book
        for cp in sorted((base / "creatures").glob("Book*/*.lua")):
            c = parse_creature(cp)
            if c:
                best_pam_first(game, c)
                c["defenses"] = parse_defenses(cp.read_text())
                dlg = cp.parent / "dialog" / cp.name
                c["dialog"] = parse_dialog(dlg) if dlg.exists() else {"intro": [], "attack": [], "death": []}
                c["book"] = int(re.search(r"Book(\d+)", str(cp)).group(1))
                g["creatures"][c["id"]] = c
        data[game] = g
        print(f"{game}: {len(g['books'])} books, "
              f"{sum(len(b['chapters']) for b in g['books'].values())} chapters, "
              f"{sum(len(ch['enemies']) for b in g['books'].values() for ch in b['chapters'])} enemies, "
              f"{len(g['creatures'])} creatures")
    for game, g in data.items():
        out = OUT_DIR / ("game_data.json" if game == "adventures" else "game_data_vol2.json")
        out.write_text(json.dumps(g, separators=(",", ":"), ensure_ascii=False))
        print("wrote", out.name, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
