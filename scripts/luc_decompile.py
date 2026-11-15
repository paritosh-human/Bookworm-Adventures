#!/usr/bin/env python3
"""Symbolic decompiler for PopLua (.luc): turns register code into Lua-like source.

Straight-line code is reconstructed fully (calls, table sets, constants, local
names from debug info). Control flow is emitted as `if cond goto Lx` / labels,
which is readable enough for these small game scripts.
"""
import sys
from pathlib import Path

from luc import OP, Proto, fmt_k, load

LABEL = "L{}"


def decompile(proto: Proto, name="main", indent=0) -> str:
    pad = "  " * indent
    out: list[str] = []

    # function names inside the main chunk: CLOSURE tmp ; SETTABLE tbl K tmp
    names: dict[int, str] = {}
    for i, ins in enumerate(proto.code):
        if ins.op == OP["CLOSURE"]:
            nxt = proto.code[i + 1] if i + 1 < len(proto.code) else None
            if nxt and nxt.op == OP["SETTABLE"] and nxt.c == ins.a and nxt.b >= 250:
                names[ins.c] = str(proto.K(nxt.b - 250))
            elif nxt and nxt.op in (OP["SETGLOBAL"],) and nxt.a == ins.a:
                names[ins.c] = str(proto.K(nxt.bx))

    # jump targets -> labels
    targets = set()
    for ins in proto.code:
        if ins.op == OP["JMP"]:
            targets.add(ins.pc + 1 + ins.sbx)
        if ins.op in (OP["FORLOOP"], OP["TFORLOOP"]):
            targets.add(ins.pc + 1 + ins.sbx)
        if ins.op in (OP["TFORPREP"],):
            targets.add(ins.pc + 1 + ins.sbx)

    def active_locals(pc):
        return [n for (n, b, e) in proto.locals if b <= pc <= e]

    def K(i):
        v = proto.K(i)
        return fmt_k(v)

    def kname(i):
        v = proto.K(i)
        return v if isinstance(v, str) else fmt_k(v)

    regs: dict[int, str] = {}
    method: dict[int, bool] = {}
    top = [0]  # highest register written by a multi-result (c==0) call
    nparams = proto.numparams

    def R(r, pc):
        act = active_locals(pc)
        if r < len(act) and r in regs and regs[r] is None:
            return act[r]
        if r in regs:
            return regs[r]
        if r < len(act):
            return act[r]
        return f"R{r}"

    def RK(x, pc):
        return K(x - 250) if x >= 250 else R(x, pc)

    def dot(obj, key):
        if isinstance(key, str) and key.startswith('"') and key[1:-1].isidentifier():
            return f"{obj}.{key[1:-1]}"
        return f"{obj}[{key}]"

    def set_local_if_declared(r, pc, expr):
        """emit `local name = expr` if a local starts right after this instruction"""
        for (n, b, e) in proto.locals:
            if b == pc + 1:
                act = [x for x in proto.locals if x[1] <= pc + 1 <= x[2]]
                idx = [x[0] for x in act].index(n)
                if idx == r:
                    out.append(f"{pad}local {n} = {expr}")
                    regs[r] = None  # resolve via local name afterwards
                    return True
        return False

    for i, ins in enumerate(proto.code):
        pc = ins.pc
        if pc in targets:
            out.append(f"{pad}::{LABEL.format(pc)}::")
        op = ins.name
        a, b, c = ins.a, ins.b, ins.c
        if op == "MOVE":
            regs[a] = R(b, pc)
        elif op == "LOADK":
            regs[a] = K(ins.bx)
        elif op == "LOADBOOL":
            regs[a] = "true" if b else "false"
        elif op == "LOADNIL":
            for r in range(a, b + 1):
                regs[r] = "nil"
        elif op in ("GETGLOBAL",):
            regs[a] = kname(ins.bx)
        elif op == "GETSELFORGLOBAL":
            regs[a] = kname(c)
        elif op == "GETUPVAL":
            regs[a] = proto.upvals[b] if b < len(proto.upvals) else f"up{b}"
        elif op == "GETTABLE":
            regs[a] = dot(R(b, pc), RK(c, pc))
        elif op == "SELF":
            obj = R(b, pc)
            regs[a + 1] = obj
            regs[a] = f"{obj}:{kname(c - 250)}" if c >= 250 else f"{obj}:{R(c, pc)}"
            method[a] = True
        elif op == "SELFORGLOBAL":
            regs[a] = kname(c - 250) if c >= 250 else R(c, pc)
            regs[a + 1] = "<self>"
            method[a] = False
        elif op == "NEWTABLE":
            tname = f"tbl{pc}"
            out.append(f"{pad}local {tname} = {{}}")
            regs[a] = tname
        elif op == "SETTABLE":
            out.append(f"{pad}{dot(R(a, pc), RK(b, pc))} = {RK(c, pc)}")
        elif op == "SETGLOBAL":
            out.append(f"{pad}{kname(ins.bx)} = {R(a, pc)}")
        elif op in ("DEFGLOBAL",):
            out.append(f"{pad}-- defglobal K{ins.bx} = {R(a, pc)}")
        elif op == "SETLIST":
            n = b + 1
            items = [R(a + 1 + j, pc) for j in range(n)]
            out.append(f"{pad}-- {R(a, pc)} list = {{{', '.join(items)}}}")
        elif op in ("ADD", "SUB", "MUL", "DIV", "POW", "MOD"):
            sym = {"ADD": "+", "SUB": "-", "MUL": "*", "DIV": "/", "POW": "^", "MOD": "%"}[op]
            regs[a] = f"({RK(b, pc)} {sym} {RK(c, pc)})"
        elif op == "UNM":
            regs[a] = f"-{R(b, pc)}"
        elif op == "NOT":
            regs[a] = f"not {R(b, pc)}"
        elif op == "SIZ":
            regs[a] = f"#{R(b, pc)}"
        elif op == "CONCAT":
            regs[a] = " .. ".join(R(x, pc) for x in range(b, c + 1))
        elif op == "CLOSURE":
            fname = names.get(ins.c, f"fn{ins.c}")
            regs[a] = f"<closure {fname}>"
        elif op in ("CALL", "CALLSELFORGLOBAL", "TAILCALL", "TAILCALLSELFORGLOBAL"):
            fn = regs.get(a, f"R{a}")
            is_method = method.get(a, False) and op in ("CALL", "TAILCALL")
            if op in ("CALLSELFORGLOBAL", "TAILCALLSELFORGLOBAL"):
                nargs = max(b - 2, 0) if b > 0 else max(top[0] - a - 1, 0)
                args = [R(a + 2 + j, pc) for j in range(nargs)]
            else:
                nargs = b - 1 if b > 0 else max(top[0] - a, 0)
                first = a + 2 if is_method else a + 1
                args = [R(a + 1 + j, pc) for j in range(nargs)]
                if is_method and args:
                    args = args[1:]
            call = f"{fn}({', '.join(args)})"
            if op.startswith("TAILCALL"):
                out.append(f"{pad}return {call}")
            elif c == 1:
                out.append(f"{pad}{call}")
            else:
                if c == 0:
                    top[0] = a
                if not set_local_if_declared(a, pc, call):
                    regs[a] = call
        elif op == "RETURN":
            if b == 1:
                if pc != len(proto.code) - 1:
                    out.append(f"{pad}return")
            else:
                vals = [R(a + j, pc) for j in range(b - 1)]
                out.append(f"{pad}return {', '.join(vals)}")
        elif op == "JMP":
            out.append(f"{pad}goto {LABEL.format(pc + 1 + ins.sbx)}")
        elif op in ("EQ", "LT", "LE"):
            sym = {"EQ": "==", "LT": "<", "LE": "<="}[op]
            nxt = proto.code[i + 1] if i + 1 < len(proto.code) else None
            tgt = LABEL.format(nxt.pc + 1 + nxt.sbx) if nxt and nxt.op == OP["JMP"] else "?"
            cond = f"{RK(b, pc)} {sym} {RK(c, pc)}"
            out.append(f"{pad}if {'not ' if a == 0 else ''}({cond}) then goto {tgt}")
        elif op == "TEST":
            nxt = proto.code[i + 1] if i + 1 < len(proto.code) else None
            tgt = LABEL.format(nxt.pc + 1 + nxt.sbx) if nxt and nxt.op == OP["JMP"] else "?"
            out.append(f"{pad}if test({R(b, pc)}, {c}) then goto {tgt}")
        elif op in ("FORLOOP", "TFORLOOP", "TFORPREP"):
            out.append(f"{pad}-- {op} a={a} -> {LABEL.format(pc + 1 + ins.sbx)}")
        elif op == "DEFTABLE":
            out.append(f"{pad}{dot(R(a, pc), kname(b - 250) if b >= 250 else R(b, pc))} = {RK(c, pc)}")
        elif op in ("INT", "CLOSE", "BREAK", "SETLISTO", "CONSTGLOBAL", "CONSTTABLE", "SETUPVAL", "ALTSELF", "SETSELFORGLOBAL", "GETSELFORGLOBAL"):
            out.append(f"{pad}-- {op} a={a} b={b} c={c} bx={ins.bx}")
        else:
            out.append(f"{pad}-- {op} a={a} b={b} c={c}")

    body = "\n".join(out)
    subs = []
    for idx, sub in enumerate(proto.protos):
        fname = names.get(idx, f"fn{idx}")
        subs.append(f"{pad}function {fname}(params={sub.numparams})\n{decompile(sub, fname, indent + 1)}\n{pad}end")
    return "\n".join(subs + [body]) if subs else body


def decompile_file(path) -> str:
    src, proto = load(path)
    return f"-- {src}\n" + decompile(proto)


if __name__ == "__main__":
    print(decompile_file(sys.argv[1]))
