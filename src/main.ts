import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameMenuScene } from './scenes/GameMenuScene';
import { DeluxeScene } from './scenes/DeluxeScene';
import { BattleScene } from './scenes/BattleScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ChapterIntroScene } from './scenes/ChapterIntroScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#2b2015',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 620,
  },
  scene: [BootScene, MainMenuScene, GameMenuScene, DeluxeScene, ChapterIntroScene, BattleScene, SettingsScene],
});

if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// On phones the game is designed to be played fullscreen/landscape — without it, the fixed
// 960x620 canvas gets heavily letterboxed on a tall portrait screen (empty bars top/bottom).
// Rather than leave that dead space blank, cover it with an explicit "go fullscreen" prompt.
// Fullscreen (and the orientation lock, where supported) can only be requested from a direct
// user gesture, which is exactly what this button tap is.
if (window.matchMedia('(pointer: coarse)').matches) {
  const overlay = document.getElementById('rotate-overlay')!;
  const btn = document.getElementById('rotate-fullscreen-btn')!;

  const updateOverlay = () => {
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    overlay.classList.toggle('show', portrait && !document.fullscreenElement);
  };

  // Phaser's Scale Manager computes the canvas size from the #app element's box as soon as it
  // sees a resize, but on a fullscreen/orientation-lock transition the browser reports a stale
  // intermediate viewport for a beat (iOS and Android both do this) — Phaser locks onto that
  // wrong size and never re-checks until something else triggers a resize, which is exactly why
  // a physical 180° rotation "fixes" it: that's a second, late, correctly-sized resize event.
  // Force a few explicit re-checks instead of waiting on one.
  const resync = () => {
    for (const delay of [0, 150, 350, 600, 1000]) setTimeout(() => game.scale.refresh(), delay);
  };

  btn.addEventListener('click', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.('landscape').catch(() => {}).finally(resync);
    resync();
  });

  window.addEventListener('orientationchange', () => { updateOverlay(); resync(); });
  window.matchMedia('(orientation: portrait)').addEventListener('change', () => { updateOverlay(); resync(); });
  document.addEventListener('fullscreenchange', () => { updateOverlay(); resync(); });
  updateOverlay();
}
