#!/usr/bin/env python3
"""Decode PopCap PAM (PopCap AniMation) v1 files, as used by Bookworm
Adventures / Volume 2. Ported from the versioned Rust reference decoder at
https://github.com/LambdaEd1th/pam-codec (MIT), whose version>=4 fields this
port omits since every .pam file in this project is version 1.
"""
import json
import struct
import sys
from pathlib import Path

PAM_MAGIC = 0xBAF01954

REMOVES, ADDS, MOVES, FRAME_NAME, STOP, COMMANDS = 1, 2, 4, 8, 16, 32
MOVE_SRC_RECT, MOVE_ROTATE, MOVE_COLOR, MOVE_MATRIX, MOVE_LONG_COORDS, MOVE_ANIM_FRAME_NUM = (
    32768, 16384, 8192, 4096, 2048, 1024,
)


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def u8(self):
        v = self.data[self.pos]
        self.pos += 1
        return v

    def i16(self):
        v = struct.unpack_from('<h', self.data, self.pos)[0]
        self.pos += 2
        return v

    def u16(self):
        v = struct.unpack_from('<H', self.data, self.pos)[0]
        self.pos += 2
        return v

    def i32(self):
        v = struct.unpack_from('<i', self.data, self.pos)[0]
        self.pos += 4
        return v

    def string(self):
        n = self.u16()
        s = self.data[self.pos:self.pos + n].decode('latin1')
        self.pos += n
        return s


def read_image_info(r: Reader, version: int = 1):
    name = r.string()
    if version == 1:
        rotation = r.i16() / 1000.0
        x = r.i16() / 20.0
        y = r.i16() / 20.0
        return {"name": name, "transform": [rotation, x, y]}
    # v2+: full 2x2 matrix (16.16) + translation (twips)
    a, b, c, d = (r.i32() / 65536.0 for _ in range(4))
    x = r.i16() / 20.0
    y = r.i16() / 20.0
    return {"name": name, "transform": [a, c, b, d, x, y]}


def read_removes_info(r: Reader):
    num = r.u16()
    index = num & 2047
    if index == 2047:
        index = r.i32()
    return {"index": index}


def read_adds_info(r: Reader):
    num = r.u16()
    index = num & 2047
    if index == 2047:
        index = r.i32()
    sprite = bool(num & 32768)
    additive = bool(num & 16384)
    resource = r.u8()
    preload_frame = r.i16() if (num & 8192) else 0
    name = r.string() if (num & 4096) else None
    time_scale = (r.i32() / 65536.0) if (num & 2048) else 1.0
    return {
        "index": index, "sprite": sprite, "additive": additive,
        "resource": resource, "preload_frame": preload_frame,
        "name": name, "time_scale": time_scale,
    }


def read_moves_info(r: Reader):
    num7 = r.u16()
    index = num7 & 1023
    if index == 1023:
        index = r.i32()
    has_matrix = bool(num7 & MOVE_MATRIX)
    has_rotate = bool(num7 & MOVE_ROTATE)
    if has_matrix:
        a, b, c, d = r.i32() / 65536.0, r.i32() / 65536.0, r.i32() / 65536.0, r.i32() / 65536.0
        transform = [a, c, b, d, 0.0, 0.0]
    elif has_rotate:
        rotation = r.i16() / 1000.0
        transform = [rotation, 0.0, 0.0]
    else:
        transform = [0.0, 0.0]

    if num7 & MOVE_LONG_COORDS:
        x, y = r.i32() / 20.0, r.i32() / 20.0
    else:
        x, y = r.i16() / 20.0, r.i16() / 20.0
    transform[-2] = x
    transform[-1] = y

    source_rectangle = None
    if num7 & MOVE_SRC_RECT:
        source_rectangle = {
            "position": [r.i16() / 20.0, r.i16() / 20.0],
            "size": [r.i16() / 20.0, r.i16() / 20.0],
        }

    color = None
    if num7 & MOVE_COLOR:
        color = [r.u8() / 255.0 for _ in range(4)]

    sprite_frame_number = r.i16() if (num7 & MOVE_ANIM_FRAME_NUM) else None

    return {
        "index": index, "transform": transform, "color": color,
        "source_rectangle": source_rectangle, "sprite_frame_number": sprite_frame_number,
    }


def read_frame_info(r: Reader):
    flags = r.u8()
    frame = {"label": None, "stop": False, "command": [], "remove": [], "append": [], "change": []}

    if flags & REMOVES:
        count = r.u8()
        if count == 255:
            count = r.u16()
        frame["remove"] = [read_removes_info(r) for _ in range(count)]

    if flags & ADDS:
        count = r.u8()
        if count == 255:
            count = r.u16()
        frame["append"] = [read_adds_info(r) for _ in range(count)]

    if flags & MOVES:
        count = r.u8()
        if count == 255:
            count = r.u16()
        frame["change"] = [read_moves_info(r) for _ in range(count)]

    if flags & FRAME_NAME:
        frame["label"] = r.string()

    frame["stop"] = bool(flags & STOP)

    if flags & COMMANDS:
        count = r.u8()
        frame["command"] = [[r.string(), r.string()] for _ in range(count)]

    return frame


def read_sprite_info(r: Reader, version: int):
    name = None
    frame_rate = None
    if version >= 4:
        name = r.string()
        if version >= 6:
            r.string()  # reserved
        frame_rate = r.i32() / 65536.0

    frames_count = r.u16()
    work_area = None
    if version >= 5:
        work_area = [r.i16(), r.i16()]

    frames = [read_frame_info(r) for _ in range(frames_count)]
    return {"name": name, "frame_rate": frame_rate, "work_area": work_area, "frame": frames}


def decode_pam(path: Path):
    data = path.read_bytes()
    r = Reader(data)
    magic = struct.unpack_from('<I', data, 0)[0]
    r.pos = 4
    if magic != PAM_MAGIC:
        raise ValueError(f"bad magic {magic:#x}")
    version = r.i32()
    if not (1 <= version <= 6):
        raise ValueError(f"unsupported version {version}")
    frame_rate = r.u8()
    position = [r.i16() / 20.0, r.i16() / 20.0]
    size = [r.u16() / 20.0, r.u16() / 20.0]

    images_count = r.u16()
    images = [read_image_info(r, version) for _ in range(images_count)]

    sprites_count = r.u16()
    sprites = [read_sprite_info(r, version) for _ in range(sprites_count)]

    has_main_sprite = True if version <= 3 else bool(r.u8())
    main_sprite = read_sprite_info(r, version) if has_main_sprite else None

    return {
        "version": version, "frame_rate": frame_rate, "position": position, "size": size,
        "image": images, "sprite": sprites, "main_sprite": main_sprite,
        "_bytes_consumed": r.pos, "_file_size": len(data),
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: decode_pam.py <input.pam> <output.json>")
        sys.exit(1)
    result = decode_pam(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2))
    print(
        f"{sys.argv[1]}: v{result['version']}, {len(result['image'])} images, "
        f"{len(result['sprite'])} sprites, main_sprite={'yes' if result['main_sprite'] else 'no'}, "
        f"consumed {result['_bytes_consumed']}/{result['_file_size']} bytes"
    )
