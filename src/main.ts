import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { DeluxeScene } from './scenes/DeluxeScene';
import { BattleScene } from './scenes/BattleScene';
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
  scene: [BootScene, MainMenuScene, DeluxeScene, ChapterIntroScene, BattleScene],
});

if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
