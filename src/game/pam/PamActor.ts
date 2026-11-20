import Phaser from 'phaser';
import type { FrameInfo, PamInfo, SpriteInfo } from './pamDecoder';

interface ActiveFragment {
  kind: 'image' | 'sprite';
  resource: number;
  x: number;
  y: number;
  rotation: number;
  matrix: [number, number, number, number] | null;
  color: [number, number, number, number] | null;
  birthFrame: number;
  /** born during the replayed loop pass (re-added every loop) rather than before it */
  bornInLoop?: boolean;
  timeScale: number;
}

function computeActiveFragments(sprite: SpriteInfo, startFrame: number, targetFrame: number, wrap?: [number, number, number]): Map<number, ActiveFragment> {
  const active = new Map<number, ActiveFragment>();
  const end = Math.min(targetFrame, sprite.frame.length - 1);
  // Looping: the engine never resets the pose at the loop point, so a frame that comes after a wrap
  // continues from the pose at the loop's last frame (frames only list what changed). Replay the
  // whole first pass, then the loop again up to the target.
  const order: number[] = [];
  let loopFrom = Infinity; // index in `order` where the replayed loop pass starts
  if (wrap && targetFrame >= wrap[0]) {
    for (let f = startFrame; f <= Math.min(wrap[1], sprite.frame.length - 1); f++) order.push(f);
    loopFrom = order.length;
    for (let f = wrap[0]; f <= end; f++) order.push(f);
  } else {
    for (let f = startFrame; f <= end; f++) order.push(f);
  }
  for (let k = 0; k < order.length; k++) {
    const f = order[k];
    const frame: FrameInfo = sprite.frame[f];
    for (const rem of frame.remove) active.delete(rem.index);
    for (const add of frame.append) {
      active.set(add.index, {
        kind: add.sprite ? 'sprite' : 'image',
        resource: add.resource,
        x: 0,
        y: 0,
        rotation: 0,
        matrix: null,
        color: null,
        birthFrame: f,
        bornInLoop: k >= loopFrom,
        timeScale: add.timeScale,
      });
    }
    for (const change of frame.change) {
      const existing = active.get(change.index);
      if (!existing) continue;
      const t = change.transform;
      if (t.length === 6) {
        existing.matrix = [t[0], t[1], t[2], t[3]];
        existing.rotation = 0;
      } else if (t.length === 3) {
        existing.matrix = null;
        existing.rotation = t[0];
      } else {
        // a position-only move ([x, y]) means no rotation / scale: reset the tilt from earlier frames
        existing.matrix = null;
        existing.rotation = 0;
      }
      existing.x = t[t.length - 2];
      existing.y = t[t.length - 1];
      if (change.color) existing.color = change.color;
    }
  }
  return active;
}

/** Rotation values are radians; a full matrix [a, b, c, d] is decomposed into
 * rotation + scale (any shear is dropped — Phaser objects don't skew). */
function applyTransform(obj: Phaser.GameObjects.Container, frag: ActiveFragment) {
  if (frag.matrix) {
    const [a, b, c, d] = frag.matrix;
    const sx = Math.hypot(a, b) || 1;
    obj.setRotation(Math.atan2(b, a));
    obj.setScale(sx, (a * d - b * c) / sx);
  } else {
    obj.setRotation(frag.rotation);
  }
}

/** Finds [startFrame, endFrame] for a named segment (e.g. "idle"): from the
 * labeled frame up to (but not including) the next label or stop. */
export function findLabelRange(sprite: SpriteInfo, label: string): [number, number] {
  const frames = sprite.frame;
  const start = frames.findIndex((f) => f.label === label);
  if (start === -1) return [0, frames.length - 1];
  let end = frames.length - 1;
  for (let i = start + 1; i < frames.length; i++) {
    if (frames[i].label || frames[i].stop) {
      end = i;
      break;
    }
  }
  return [start, end];
}

/** Plays one PAM main-sprite's named segment as a looping Phaser display
 * tree. Rebuilds the tree each tick rather than diffing — simple, and cheap
 * enough at the scale of a single on-screen character (tens of pieces). */
export class PamActor {
  readonly root: Phaser.GameObjects.Container;
  get info(): PamInfo {
    return this.pam;
  }
  private scene: Phaser.Scene;
  private pam: PamInfo;
  private loopStart: number;
  private loopEnd: number;
  private frame: number;
  private frameStep = 1;
  private returnLabel: string | null = null;
  /** true once the current segment has looped back to its start at least once */
  private wrapped = false;
  /** how many times the current segment has looped */
  private loops = 0;
  private timer?: Phaser.Time.TimerEvent;
  private textureKey: (imageName: string) => string;
  /** image names (lowercase, "(add)" stripped) to never render — e.g. a gag prop authored
   * to be removed only on a much later frame our looped-segment replay never reaches. */
  private hide?: Set<string>;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    pam: PamInfo,
    label: string,
    textureKey: (imageName: string) => string,
    opts: { maxSize?: number; fit?: boolean; still?: boolean; hide?: Set<string> } = {},
  ) {
    this.scene = scene;
    this.pam = pam;
    this.textureKey = textureKey;
    this.hide = opts.hide;
    this.root = scene.add.container(x, y);
    const main = pam.mainSprite ?? { frame: [] };
    [this.loopStart, this.loopEnd] = findLabelRange(main, label);
    // `still` layers (scenery) show one settled frame instead of looping.
    const hasStopEnd = !!main.frame[this.loopEnd]?.stop && !main.frame[this.loopEnd]?.label;
    this.frame = opts.still ? (hasStopEnd ? this.loopEnd : Math.max(this.loopStart, this.loopEnd - 1)) : this.loopStart;
    this.wrapped = !opts.still && label.startsWith('idle');
    this.loops = this.wrapped ? 1 : 0;
    this.render();
    if (opts.fit !== false) this.fitTo(x, y, opts.maxSize ?? 220);
    if (opts.still) return;
    const fps = Math.max(pam.frameRate, 1);
    // The display tree is rebuilt every tick, so cap that at ~30/s and step
    // several source frames per tick for 60fps animations (e.g. Lex).
    this.frameStep = Math.max(1, Math.round(fps / 30));
    this.timer = scene.time.addEvent({
      delay: (1000 / fps) * this.frameStep,
      loop: true,
      callback: () => this.tick(),
    });
  }

  /** Each creature's body-part coordinates have their own, unpredictable
   * origin — this scales the built tree to fit a target box and recenters
   * it, so every monster lands in roughly the same on-screen spot. */
  private fitTo(targetX: number, targetY: number, maxSize: number) {
    this.root.setScale(1);
    const bounds = this.root.getBounds();
    if (bounds.width === 0 || bounds.height === 0) return;
    const scale = Math.min(1, maxSize / Math.max(bounds.width, bounds.height));
    this.root.setScale(scale);
    const scaledBounds = this.root.getBounds();
    this.root.x += targetX - (scaledBounds.x + scaledBounds.width / 2);
    this.root.y += targetY - (scaledBounds.y + scaledBounds.height / 2);
  }

  /** Plays a named segment once, then loops `thenLabel` (or holds the last frame if ''). */
  play(label: string, thenLabel: string) {
    const main = this.pam.mainSprite;
    if (!main) return;
    const [start, end] = findLabelRange(main, label);
    this.loopStart = start;
    this.loopEnd = end;
    this.frame = start;
    this.returnLabel = thenLabel;
    // an idle clip is a loop: show it from the very first frame in its steady-state pose
    this.wrapped = label.startsWith('idle');
    this.loops = this.wrapped ? 1 : 0;
  }

  private tick() {
    this.frame += this.frameStep;
    if (this.frame > this.loopEnd) {
      const main = this.pam.mainSprite;
      if (this.returnLabel === '') {
        // Hold the final pose (e.g. after a death animation).
        this.frame = this.loopEnd;
        this.timer?.remove();
        this.render();
        return;
      }
      if (this.returnLabel && main) {
        const nextLabel = this.returnLabel;
        [this.loopStart, this.loopEnd] = findLabelRange(main, this.returnLabel);
        this.returnLabel = null;
        this.wrapped = nextLabel.startsWith('idle');
        this.loops = this.wrapped ? 1 : 0;
      } else {
        this.wrapped = true;
        this.loops++;
      }
      this.frame = this.loopStart;
    }
    this.render();
  }

  private render() {
    this.root.removeAll(true);
    const main = this.pam.mainSprite;
    if (!main) return;
    // Always replay from frame 0: a named segment (e.g. "idle") is often just
    // a marker label with no appends of its own — it keeps animating whatever
    // fragments an earlier segment (e.g. "intro") already added and never
    // removed, so the display list has to be built cumulatively from the top.
    this.buildInto(this.root, main, 0, this.frame, this.wrapped ? [this.loopStart, this.loopEnd, this.loops] : undefined);
  }

  private buildInto(parent: Phaser.GameObjects.Container, sprite: SpriteInfo, startFrame: number, targetFrame: number, wrap?: [number, number, number]) {
    const active = computeActiveFragments(sprite, startFrame, targetFrame, wrap);
    for (const frag of active.values()) {
      if (frag.kind === 'image') {
        const img = this.pam.image[frag.resource];
        if (!img) continue;
        if (this.hide?.has(img.name.replace(/^\(add\)/, '').toLowerCase())) continue;
        const key = this.textureKey(img.name);
        if (!this.scene.textures.exists(key)) continue;
        // The fragment's transform places the joint; the image hangs off it at
        // its stored pivot offset (top-left origin), rotated by its own angle.
        const holder = this.scene.add.container(frag.x, frag.y);
        applyTransform(holder, frag);
        const gameImg = this.scene.add.image(img.transform.length === 6 ? img.transform[4] : img.transform[1], img.transform.length === 6 ? img.transform[5] : img.transform[2], key).setOrigin(0, 0);
        if (img.transform.length === 6) {
          // v2+ images carry a full matrix [a, c, b, d, x, y]: rotation + scale, origin at the stored offset
          // the stored matrix is in twips (identity = 20)
          const [ma, mc, mb, md, ix, iy] = [img.transform[0] / 20, img.transform[1] / 20, img.transform[2] / 20, img.transform[3] / 20, img.transform[4], img.transform[5]];
          gameImg.setPosition(ix, iy);
          gameImg.setRotation(Math.atan2(mc, ma));
          gameImg.setScale(Math.hypot(ma, mc), Math.hypot(mb, md));
        } else gameImg.setRotation(img.transform[0]);
        // "(add)" images are authored for additive blending (black = transparent).
        if (img.name.startsWith('(add)')) gameImg.setBlendMode(Phaser.BlendModes.ADD);
        if (frag.color) {
          gameImg.setAlpha(frag.color[3]);
          const [r, g, b] = frag.color;
          if (r < 0.99 || g < 0.99 || b < 0.99) gameImg.setTint(Phaser.Display.Color.GetColor(r * 255, g * 255, b * 255));
        }
        holder.add(gameImg);
        parent.add(holder);
      } else {
        const sub = this.pam.sprite[frag.resource];
        if (!sub) continue;
        const subContainer = this.scene.add.container(frag.x, frag.y);
        applyTransform(subContainer, frag);
        parent.add(subContainer);
        const subFrameCount = sub.frame.length || 1;
        // nested sprites keep their own clock running through loop wraps (no jump back to frame 0)
        const clock = wrap && !frag.bornInLoop ? targetFrame + wrap[2] * (wrap[1] - wrap[0] + 1) : targetFrame;
        const elapsed = Math.floor((clock - frag.birthFrame) * frag.timeScale);
        const subTarget = ((elapsed % subFrameCount) + subFrameCount) % subFrameCount;
        this.buildInto(subContainer, sub, 0, subTarget);
      }
    }
  }

  destroy() {
    this.timer?.remove();
    this.root.destroy();
  }
}

export interface AttackTiming {
  /** ms the animation plays */
  animMs: number;
  /** ms into the animation at which the hit lands (the causeDamage command), -1 if none */
  hitMs: number;
  /** slide toward the target before the attack (px at scale 1) and its speed in px per update */
  slide: { dist: number; speed: number } | null;
  /** `playsound` commands: ms into the clip and the SOUND_* id */
  sounds: { ms: number; id: string }[];
}

/** Reads an attack clip's engine commands: `slide "<dist> <speed>"` (move toward the target, then
 * back) and `causeDamage` (the frame where the hit lands). */
export function attackTiming(pam: PamInfo, label: string): AttackTiming {
  const main = pam.mainSprite;
  const t: AttackTiming = { animMs: 0, hitMs: -1, slide: null, sounds: [] };
  if (!main) return t;
  const [start, end] = findLabelRange(main, label);
  const fps = Math.max(pam.frameRate, 1);
  t.animMs = ((end - start) * 1000) / fps;
  for (let f = start; f <= Math.min(end, main.frame.length - 1); f++) {
    for (const [name, arg] of main.frame[f].commands ?? []) {
      if (name === 'causeDamage' && t.hitMs < 0) t.hitMs = ((f - start) * 1000) / fps;
      if (name.toLowerCase() === 'playsound' && arg) t.sounds.push({ ms: ((f - start) * 1000) / fps, id: arg.split(' ')[0] });
      if (name === 'slide') {
        const [d, v] = arg.split(' ').map(Number);
        if (Number.isFinite(d) && Number.isFinite(v) && v > 0) t.slide = { dist: d, speed: v };
      }
    }
  }
  return t;
}
