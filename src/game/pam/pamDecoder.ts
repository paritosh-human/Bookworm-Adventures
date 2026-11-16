/**
 * Decoder for PopCap PAM (PopCap AniMation) v1 files, as used by Bookworm
 * Adventures / Volume 2 for Lex and monster animations.
 *
 * Reverse-engineered from the file's own byte layout (there's no public spec
 * for this specific 2008-era version), cross-checked against the versioned
 * Rust reference decoder at https://github.com/LambdaEd1th/pam-codec (MIT),
 * whose version-1 code path this mirrors. See scripts/decode_pam.py for the
 * Python prototype this was validated against (byte-exact on every sample
 * file: parser position lands exactly on EOF with nothing left over).
 */

const PAM_MAGIC = 0xbaf01954;

const FrameFlag = { REMOVES: 1, ADDS: 2, MOVES: 4, FRAME_NAME: 8, STOP: 16, COMMANDS: 32 } as const;
const MoveFlag = {
  SRC_RECT: 32768,
  ROTATE: 16384,
  COLOR: 8192,
  MATRIX: 4096,
  LONG_COORDS: 2048,
  ANIM_FRAME_NUM: 1024,
} as const;

export interface ImageInfo {
  name: string;
  /** [rotationDegreesIshUnits, x, y] registration/anchor offset for this image. */
  transform: [number, number, number] | [number, number, number, number, number, number];
}

export interface AddsInfo {
  index: number;
  sprite: boolean;
  additive: boolean;
  resource: number;
  name: string | null;
  timeScale: number;
}

export interface MovesInfo {
  index: number;
  /** [x, y] or [rotation, x, y] or [a, c, b, d, x, y] depending on what changed. */
  transform: number[];
  color: [number, number, number, number] | null;
}

export interface FrameInfo {
  label: string | null;
  stop: boolean;
  remove: { index: number }[];
  append: AddsInfo[];
  change: MovesInfo[];
  /** engine commands attached to the frame, e.g. ['slide', '-390 20'] or ['causeDamage', ''] */
  commands: [string, string][];
}

export interface SpriteInfo {
  frame: FrameInfo[];
}

export interface PamInfo {
  version: number;
  frameRate: number;
  image: ImageInfo[];
  sprite: SpriteInfo[];
  mainSprite: SpriteInfo | null;
  /** authored canvas size in px (stored in twips) */
  size: [number, number];
}

class Reader {
  pos = 0;
  constructor(private view: DataView) {}

  u8(): number {
    return this.view.getUint8(this.pos++);
  }
  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  string(): string {
    const len = this.u16();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
}

function readImageInfo(r: Reader, version: number): ImageInfo {
  const name = r.string();
  if (version >= 2) {
    // v2+: full 2x2 matrix (16.16) + translation (twips)
    const a = r.i32() / 65536;
    const b = r.i32() / 65536;
    const c = r.i32() / 65536;
    const d = r.i32() / 65536;
    const tx = r.i16() / 20;
    const ty = r.i16() / 20;
    return { name, transform: [a, c, b, d, tx, ty] };
  }
  const rotation = r.i16() / 1000;
  const x = r.i16() / 20;
  const y = r.i16() / 20;
  return { name, transform: [rotation, x, y] };
}

function readRemovesInfo(r: Reader): { index: number } {
  const num = r.u16();
  let index = num & 2047;
  if (index === 2047) index = r.i32();
  return { index };
}

function readAddsInfo(r: Reader): AddsInfo {
  const num = r.u16();
  let index = num & 2047;
  if (index === 2047) index = r.i32();
  const sprite = (num & 32768) !== 0;
  const additive = (num & 16384) !== 0;
  const resource = r.u8();
  if (num & 8192) r.i16(); // preload_frame, unused for playback
  const name = num & 4096 ? r.string() : null;
  const timeScale = num & 2048 ? r.i32() / 65536 : 1.0;
  return { index, sprite, additive, resource, name, timeScale };
}

function readMovesInfo(r: Reader): MovesInfo {
  const num7 = r.u16();
  let index = num7 & 1023;
  if (index === 1023) index = r.i32();

  const hasMatrix = (num7 & MoveFlag.MATRIX) !== 0;
  const hasRotate = (num7 & MoveFlag.ROTATE) !== 0;
  let transform: number[];
  if (hasMatrix) {
    const a = r.i32() / 65536;
    const b = r.i32() / 65536;
    const c = r.i32() / 65536;
    const d = r.i32() / 65536;
    transform = [a, c, b, d, 0, 0];
  } else if (hasRotate) {
    transform = [r.i16() / 1000, 0, 0];
  } else {
    transform = [0, 0];
  }

  const x = num7 & MoveFlag.LONG_COORDS ? r.i32() / 20 : r.i16() / 20;
  const y = num7 & MoveFlag.LONG_COORDS ? r.i32() / 20 : r.i16() / 20;
  transform[transform.length - 2] = x;
  transform[transform.length - 1] = y;

  if (num7 & MoveFlag.SRC_RECT) {
    r.i16();
    r.i16();
    r.i16();
    r.i16();
  }

  let color: [number, number, number, number] | null = null;
  if (num7 & MoveFlag.COLOR) {
    color = [r.u8() / 255, r.u8() / 255, r.u8() / 255, r.u8() / 255];
  }

  if (num7 & MoveFlag.ANIM_FRAME_NUM) r.i16();

  return { index, transform, color };
}

function readFrameInfo(r: Reader): FrameInfo {
  const flags = r.u8();
  const frame: FrameInfo = { label: null, stop: false, remove: [], append: [], change: [], commands: [] };

  if (flags & FrameFlag.REMOVES) {
    let count = r.u8();
    if (count === 255) count = r.u16();
    for (let i = 0; i < count; i++) frame.remove.push(readRemovesInfo(r));
  }
  if (flags & FrameFlag.ADDS) {
    let count = r.u8();
    if (count === 255) count = r.u16();
    for (let i = 0; i < count; i++) frame.append.push(readAddsInfo(r));
  }
  if (flags & FrameFlag.MOVES) {
    let count = r.u8();
    if (count === 255) count = r.u16();
    for (let i = 0; i < count; i++) frame.change.push(readMovesInfo(r));
  }
  if (flags & FrameFlag.FRAME_NAME) frame.label = r.string();
  frame.stop = (flags & FrameFlag.STOP) !== 0;
  if (flags & FrameFlag.COMMANDS) {
    const count = r.u8();
    for (let i = 0; i < count; i++) {
      const name = r.string();
      const arg = r.string();
      frame.commands.push([name, arg]);
    }
  }
  return frame;
}

function readSpriteInfo(r: Reader, version: number): SpriteInfo {
  if (version >= 4) {
    r.string();
    if (version >= 6) r.string();
    r.i32();
  }
  const frameCount = r.u16();
  if (version >= 5) {
    r.i16();
    r.i16();
  }
  const frame: FrameInfo[] = [];
  for (let i = 0; i < frameCount; i++) frame.push(readFrameInfo(r));
  return { frame };
}

export function decodePam(buffer: ArrayBuffer): PamInfo {
  const view = new DataView(buffer);
  const r = new Reader(view);
  const magic = r.u32();
  if (magic !== PAM_MAGIC) throw new Error(`bad PAM magic 0x${magic.toString(16)}`);
  const version = r.i32();
  if (version < 1 || version > 6) throw new Error(`unsupported PAM version ${version}`);

  r.u8(); // frame_rate (u8) — the per-sprite/main frame rate below is what we actually use for playback
  const frameRate = view.getUint8(8) || 12;
  r.i16();
  r.i16(); // position
  const width = r.u16() / 20;
  const height = r.u16() / 20;

  const imageCount = r.u16();
  const image: ImageInfo[] = [];
  for (let i = 0; i < imageCount; i++) image.push(readImageInfo(r, version));

  const spriteCount = r.u16();
  const sprite: SpriteInfo[] = [];
  for (let i = 0; i < spriteCount; i++) sprite.push(readSpriteInfo(r, version));

  const hasMainSprite = version <= 3 ? true : r.u8() !== 0;
  const mainSprite = hasMainSprite ? readSpriteInfo(r, version) : null;

  return { version, frameRate, image, sprite, mainSprite, size: [width, height] };
}
