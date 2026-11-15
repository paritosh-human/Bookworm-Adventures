#!/usr/bin/env python3
"""Extract PopCap .pak archives (Bookworm Adventures / Volume 2 engine).

Format (whole file is XOR'd with 0xF7):
  magic(4) = C0 4A C0 BA
  version(4) uint32 LE
  repeat:
    marker(1): 0x00 = entry follows, 0x80 = end of entry list
    namelen(1) uint8
    name(namelen) bytes, '\\' path separators
    filesize(4) uint32 LE
    timestamp(8) ignored (Windows FILETIME)
  then each entry's raw (already de-XORed) bytes follow back-to-back,
  in the same order as the entry list, starting right after the 0x80 marker.
"""
import struct
import sys
from pathlib import Path

MAGIC = bytes([0xC0, 0x4A, 0xC0, 0xBA])
XOR_KEY = 0xF7


def extract(pak_path: Path, out_dir: Path) -> list[tuple[str, int]]:
    raw = pak_path.read_bytes()
    data = bytes(b ^ XOR_KEY for b in raw)
    if data[0:4] != MAGIC:
        raise ValueError(f"{pak_path}: bad magic {data[0:4].hex()}")

    pos = 8  # skip magic + version
    entries: list[tuple[str, int]] = []
    while True:
        marker = data[pos]
        pos += 1
        if marker == 0x80:
            break
        namelen = data[pos]
        pos += 1
        name = data[pos:pos + namelen].decode("latin1").replace("\\", "/")
        pos += namelen
        filesize = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        pos += 8  # timestamp
        entries.append((name, filesize))

    for name, filesize in entries:
        chunk = data[pos:pos + filesize]
        pos += filesize
        dest = out_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(chunk)

    return entries


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: extract_pak.py <input.pak> <output_dir>")
        sys.exit(1)
    pak_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = extract(pak_path, out_dir)
    print(f"{pak_path}: extracted {len(entries)} files into {out_dir}")
