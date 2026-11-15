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
  timeScale: number;
}

function computeActiveFragments(sprite: SpriteInfo, startFrame: number, targetFrame: number): Map<number, ActiveFragment> {
  const active = new Map<number, ActiveFragment>();
  const end = Math.min(targetFrame, sprite.frame.length - 1);
  for (let f = startFrame; f <= end; f++) {
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
  private scene: Phaser.Scene;
  private pam: PamInfo;
  private loopStart: number;
  private loopEnd: number;
  private frame: number;
  private frameStep = 1;
  private returnLabel: string | null = null;
  private timer?: Phaser.Time.TimerEvent;
  private textureKey: (imageName: string) => string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    pam: PamInfo,
    label: string,
    textureKey: (imageName: string) => string,
    opts: { maxSize?: number; fit?: boolean; still?: boolean } = {},
  ) {
    this.scene = scene;
    this.pam = pam;
    this.textureKey = textureKey;
    this.root = scene.add.container(x, y);
    const main = pam.mainSprite ?? { frame: [] };
    [this.loopStart, this.loopEnd] = findLabelRange(main, label);
    // `still` layers (scenery) show one settled frame instead of looping.
    const hasStopEnd = !!main.frame[this.loopEnd]?.stop && !main.frame[this.loopEnd]?.label;
    this.frame = opts.still ? (hasStopEnd ? this.loopEnd : Math.max(this.loopStart, this.loopEnd - 1)) : this.loopStart;
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
        [this.loopStart, this.loopEnd] = findLabelRange(main, this.returnLabel);
        this.returnLabel = null;
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
    this.buildInto(this.root, main, 0, this.frame);
  }

  private buildInto(parent: Phaser.GameObjects.Container, sprite: SpriteInfo, startFrame: number, targetFrame: number) {
    const active = computeActiveFragments(sprite, startFrame, targetFrame);
    for (const frag of active.values()) {
      if (frag.kind === 'image') {
        const img = this.pam.image[frag.resource];
        if (!img) continue;
        const key = this.textureKey(img.name);
        if (!this.scene.textures.exists(key)) continue;
        // The fragment's transform places the joint; the image hangs off it at
        // its stored pivot offset (top-left origin), rotated by its own angle.
        const holder = this.scene.add.container(frag.x, frag.y);
        applyTransform(holder, frag);
        const gameImg = this.scene.add.image(img.transform[1], img.transform[2], key).setOrigin(0, 0);
        gameImg.setRotation(img.transform[0]);
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
        const elapsed = Math.floor((targetFrame - frag.birthFrame) * frag.timeScale);
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
