#!/usr/bin/env python3
"""Parser + disassembler for PopCap "PopLua" (.luc) bytecode.

Format reverse-engineered from the file layout and cross-checked against
https://github.com/wxarmstrong/PopLua-Disassembler (opcode names / chunk order).
Instruction: op=bits 0-5, C=6-14, B=15-23, A=24-31, Bx=6-23. In RK operands a
value >= 250 means constant (value-250).
"""
import struct
import sys
from pathlib import Path

OPS = ["MOVE", "LOADK", "LOADBOOL", "LOADNIL", "GETUPVAL", "GETGLOBAL", "GETTABLE", "SETGLOBAL",
       "SETUPVAL", "SETTABLE", "NEWTABLE", "SELF", "ADD", "SUB", "MUL", "DIV",
       "POW", "MOD", "UNM", "NOT", "SIZ", "CONCAT", "JMP", "EQ",
       "LT", "LE", "TEST", "CALL", "TAILCALL", "RETURN", "FORLOOP", "TFORLOOP",
       "TFORPREP", "SETLIST", "SETLISTO", "CLOSE", "ALTSELF", "CONSTGLOBAL", "CONSTTABLE", "DEFGLOBAL",
       "DEFTABLE", "SETSELFORGLOBAL", "GETSELFORGLOBAL", "SELFORGLOBAL", "CALLSELFORGLOBAL",
       "TAILCALLSELFORGLOBAL", "INT", "BREAK", "CLOSURE"]
OP = {n: i for i, n in enumerate(OPS)}


class Reader:
    def __init__(self, data):
        self.d, self.p = data, 0

    def u8(self):
        v = self.d[self.p]; self.p += 1; return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.p)[0]; self.p += 4; return v

    def f64(self):
        v = struct.unpack_from("<d", self.d, self.p)[0]; self.p += 8; return v

    def raw(self, n):
        v = self.d[self.p:self.p + n]; self.p += n; return v

    def cstr(self):
        n = self.u32()
        return self.raw(n)[:-1].decode("latin1") if n else ""


class Ins:
    __slots__ = ("op", "a", "b", "c", "bx", "sbx", "line", "pc")

    def __init__(self, raw, line, pc):
        self.op = raw & 0x3F
        self.c = (raw >> 6) & 0x1FF
        self.b = (raw >> 15) & 0x1FF
        self.a = (raw >> 24) & 0xFF
        self.bx = (raw >> 6) & 0x3FFFF
        self.sbx = self.bx - 131071
        self.line, self.pc = line, pc

    @property
    def name(self):
        return OPS[self.op] if self.op < len(OPS) else f"OP{self.op}"


class Proto:
    def __init__(self):
        self.intro = b""
        self.lines = []
        self.locals = []  # (name, begin, end)
        self.upvals = []
        self.consts = []
        self.protos = []
        self.code = []
        self.numparams = 0
        self.maxstack = 0

    def K(self, i):
        return self.consts[i] if i < len(self.consts) else f"K{i}"


def read_proto(r: Reader) -> Proto:
    p = Proto()
    p.intro = r.raw(12)
    # intro layout (empirical): linedefined, lastline, nups, numparams, is_vararg, maxstack
    p.numparams, p.maxstack = p.intro[9], p.intro[11]
    n = r.u32()
    p.lines = [r.u32() for _ in range(n)]
    for _ in range(r.u32()):
        name = r.cstr(); b = r.u32(); e = r.u32()
        p.locals.append((name, b, e))
    for _ in range(r.u32()):
        n2 = r.u32(); p.upvals.append(r.raw(n2).decode("latin1").rstrip("\0"))
    for _ in range(r.u32()):
        t = r.u8()
        if t == 0:
            p.consts.append(None)
        elif t == 3:
            p.consts.append(r.f64())
        elif t == 4:
            v = struct.unpack("<i", r.raw(4))[0]; p.consts.append(v)
        elif t == 5:
            p.consts.append(r.cstr())
        else:
            raise ValueError(f"unknown constant type {t} at {r.p}")
    for _ in range(r.u32()):
        r.raw(4)
        p.protos.append(read_proto(r))
    n2 = r.u32()
    assert n2 == n, (n2, n)
    for pc in range(n2):
        p.code.append(Ins(r.u32(), p.lines[pc], pc))
    return p


def load(path) -> tuple[str, Proto]:
    data = Path(path).read_bytes()
    r = Reader(data)
    r.raw(0x17)
    name = r.cstr()
    proto = read_proto(r)
    if r.p != len(data):
        raise ValueError(f"{path}: parsed {r.p}/{len(data)} bytes")
    return name, proto


def fmt_k(v):
    return repr(v) if not isinstance(v, str) else '"' + v.replace("\n", "\\n") + '"'


def disasm(proto: Proto, indent=0, label="main") -> str:
    pad = "  " * indent
    out = [f"{pad}-- function {label}: params={proto.numparams} stack={proto.maxstack}"]
    for i, (n, b, e) in enumerate(proto.locals):
        out.append(f"{pad}--   local[{i}] {n} pc {b}..{e}")
    for i, k in enumerate(proto.consts):
        out.append(f"{pad}--   K{i} = {fmt_k(k)}")
    for i, sub in enumerate(proto.protos):
        out.append(disasm(sub, indent + 1, f"{label}/{i}"))
    for ins in proto.code:
        out.append(f"{pad}{ins.pc:4d} [{ins.line:4d}] {ins.name:22s} a={ins.a:<3d} b={ins.b:<3d} c={ins.c:<3d} sbx={ins.sbx}")
    return "\n".join(out)


if __name__ == "__main__":
    name, p = load(sys.argv[1])
    print(f"-- source: {name}")
    print(disasm(p))
