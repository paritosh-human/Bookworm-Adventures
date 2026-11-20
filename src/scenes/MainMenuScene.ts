import Phaser from 'phaser';
import { createMusicToggle, makeButton } from '../game/ui';
import { stopMusic } from '../game/music';

/** Top-level menu: pick a game. Each Adventures game then opens its own
 * Resume / New Game / Reset menu (GameMenuScene). */
export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width } = this.scale;
    stopMusic();

    createMusicToggle(this, width - 40, 40);

    this.add
      .text(width / 2, 90, 'Bookworm Adventures', {
        fontFamily: 'Georgia, serif',
        fontSize: '40px',
        color: '#f2e6c9',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 128, 'web edition', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);

    makeButton(this, width / 2, 240, 340, 56, 'Bookworm Adventures', () => {
      this.scene.start('GameMenu', { game: 'adventures' });
    });
    makeButton(this, width / 2, 310, 340, 56, 'Adventures Volume 2', () => {
      this.scene.start('GameMenu', { game: 'adventures2' });
    });

    makeButton(this, width / 2, 390, 200, 40, 'Settings', () => this.scene.start('Settings'));
  }
}
