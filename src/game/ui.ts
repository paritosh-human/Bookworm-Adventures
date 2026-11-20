import Phaser from 'phaser';
import { isMuted, setMuted } from './audioSettings';
import { haptics } from './haptics';

/** A small round music on/off badge, drawn in the same gold-on-dark style as the rest of the
 * UI (no dedicated icon asset exists in the extracted art for this). Mutes the whole game's
 * sound manager — every scene shares one — and persists the choice across reloads. */
export function createMusicToggle(scene: Phaser.Scene, x: number, y: number, radius = 20): Phaser.GameObjects.Container {
  const bg = scene.add.circle(0, 0, radius, 0x3b2a1a).setStrokeStyle(2, 0xd4af37);
  const icon = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, icon]);
  bg.setInteractive({ useHandCursor: true });

  // Track the on/off state ourselves rather than reading `scene.sound.mute` back: the WebAudio
  // sound manager's mute getter reflects an AudioParam that's scheduled via setValueAtTime, which
  // doesn't always read back as updated in the same tick it's set — our own flag is the source of
  // truth for the icon and for persistence; `scene.sound.mute =` is still what actually silences it.
  let muted = isMuted();

  const draw = () => {
    bg.setFillStyle(muted ? 0x241a10 : 0x3b2a1a);
    icon.clear();
    icon.fillStyle(muted ? 0x8a7a64 : 0xf2e6c9, 1);
    // speaker body: a little box + triangle "cone", like a simple speaker glyph
    icon.fillRect(-10, -5, 6, 10);
    icon.fillTriangle(-4, -5, 5, -11, 5, 11);
    icon.fillTriangle(-4, 5, 5, 11, -4, -5);
    if (muted) {
      // a bold red "X" over the whole badge — unmistakable even at small sizes
      icon.lineStyle(4, 0xe6503c, 1);
      icon.beginPath();
      icon.moveTo(-11, -11);
      icon.lineTo(11, 11);
      icon.moveTo(11, -11);
      icon.lineTo(-11, 11);
      icon.strokePath();
    } else {
      // sound waves
      icon.lineStyle(2, 0xf2e6c9, 1);
      icon.beginPath();
      icon.arc(3, 0, 6, -0.7, 0.7, false);
      icon.moveTo(9, -8);
      icon.arc(3, 0, 11, -0.7, 0.7, false);
      icon.strokePath();
    }
  };
  scene.sound.mute = muted;
  draw();

  bg.on('pointerover', () => bg.setFillStyle(muted ? 0x332416 : 0x543c24));
  bg.on('pointerout', () => draw());
  bg.on('pointerdown', () => {
    haptics.tap();
    muted = !muted;
    scene.sound.mute = muted;
    setMuted(muted);
    draw();
  });

  return container;
}

/** Applies the persisted mute setting; call once when a scene with audio starts. */
export function applyMutePreference(scene: Phaser.Scene): void {
  scene.sound.mute = isMuted();
}

/** Fullscreen toggle badge. On phones, entering fullscreen also requests a landscape
 * orientation lock — the lock only takes effect while fullscreen (and only on browsers that
 * support the Screen Orientation API, e.g. Android Chrome; iOS Safari has no lock API at all,
 * so there it's a no-op and the player just rotates manually). */
export function createFullscreenToggle(scene: Phaser.Scene, x: number, y: number, radius = 20): Phaser.GameObjects.Container {
  const bg = scene.add.circle(0, 0, radius, 0x3b2a1a).setStrokeStyle(2, 0xd4af37);
  const icon = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, icon]);
  bg.setInteractive({ useHandCursor: true });

  const draw = () => {
    const full = scene.scale.isFullscreen;
    icon.clear();
    icon.lineStyle(2.5, 0xf2e6c9, 1);
    // four corner brackets; pointing inward when fullscreen, outward otherwise
    const a = full ? 5 : 3;
    const b = full ? 3 : 5;
    const corners: [number, number, number, number][] = [
      [-11, -11, -11 + b, -11 + a],
      [-11, -11, -11 + a, -11 + b],
      [11, -11, 11 - b, -11 + a],
      [11, -11, 11 - a, -11 + b],
      [-11, 11, -11 + b, 11 - a],
      [-11, 11, -11 + a, 11 - b],
      [11, 11, 11 - b, 11 - a],
      [11, 11, 11 - a, 11 - b],
    ];
    icon.beginPath();
    for (const [sx, sy, ex, ey] of corners) {
      icon.moveTo(sx, sy);
      icon.lineTo(ex, ey);
    }
    icon.strokePath();
  };
  draw();

  bg.on('pointerover', () => bg.setFillStyle(0x543c24));
  bg.on('pointerout', () => bg.setFillStyle(0x3b2a1a));
  bg.on('pointerdown', () => {
    haptics.tap();
    if (scene.scale.isFullscreen) {
      scene.scale.stopFullscreen();
    } else {
      scene.scale.startFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.('landscape').catch(() => {});
    }
  });
  scene.scale.on('enterfullscreen', draw);
  scene.scale.on('leavefullscreen', draw);

  return container;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const bg = scene.add
    .rectangle(x, y, width, height, 0x3b2a1a)
    .setStrokeStyle(2, 0xd4af37)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#f2e6c9',
    })
    .setOrigin(0.5);

  bg.on('pointerover', () => bg.setFillStyle(0x543c24));
  bg.on('pointerout', () => bg.setFillStyle(0x3b2a1a));
  bg.on('pointerdown', () => {
    haptics.tap();
    if (scene.cache.audio.exists('buttonclick')) scene.sound.play('buttonclick');
    onClick();
  });

  return { bg, text };
}
