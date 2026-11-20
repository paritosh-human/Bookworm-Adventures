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

  btn.addEventListener('click', () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.('landscape').catch(() => {});
  });

  window.addEventListener('orientationchange', updateOverlay);
  window.matchMedia('(orientation: portrait)').addEventListener('change', updateOverlay);
  document.addEventListener('fullscreenchange', updateOverlay);
  updateOverlay();
}
