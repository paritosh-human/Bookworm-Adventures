#!/usr/bin/env python3
"""Decode PopCap's front-coded (delta/prefix-shared) word list files.

Each line is [prefixLen digits (optional, reuses previous line's prefixLen
if omitted)] + [suffix]. The reconstructed word is:
    previous_word[:prefixLen] + suffix
Lines are sorted, so this is standard front-coding / incremental encoding.
"""
import re
import sys
from pathlib import Path

LINE_RE = re.compile(r"^(\d*)(.*)$")


def decode(path: Path) -> list[str]:
    words = []
    prev_word = ""
    prev_prefix_len = 0
    with path.open("r", encoding="latin1", newline="") as f:
        for raw_line in f:
            line = raw_line.rstrip("\r\n")
            if not line:
                continue
            m = LINE_RE.match(line)
            digits, suffix = m.group(1), m.group(2)
            prefix_len = int(digits) if digits else prev_prefix_len
            word = prev_word[:prefix_len] + suffix
            words.append(word)
            prev_word = word
            prev_prefix_len = prefix_len
    return words


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: decode_wordlist.py <input> <output>")
        sys.exit(1)
    words = decode(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text("\n".join(words) + "\n", encoding="utf-8")
    print(f"{sys.argv[1]}: decoded {len(words)} words -> {sys.argv[2]}")
