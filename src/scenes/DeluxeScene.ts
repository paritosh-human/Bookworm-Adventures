import Phaser from 'phaser';
import { LetterGrid, type GridTile } from '../game/LetterGrid';
import { isValidWord } from '../game/wordValidator';
import { recordDeluxeScore } from '../game/saveManager';
import { makeButton } from '../game/ui';
import { DELUXE_TILE_TEXTURES } from '../game/letterTiles';

export class DeluxeScene extends Phaser.Scene {
  private grid!: LetterGrid;
  private wordText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private score = 0;
  private over = false;

  constructor() {
    super('Deluxe');
  }

  create() {
    this.score = 0;
    this.over = false;
    const { width } = this.scale;

    this.add
      .text(width / 2, 30, 'Bookworm Deluxe', {
        fontFamily: 'Georgia, serif',
        fontSize: '28px',
        color: '#f2e6c9',
      })
      .setOrigin(0.5);

    this.scoreText = this.add.text(30, 30, 'Score: 0', {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#f2e6c9',
    });

    this.wordText = this.add
      .text(width / 2, 90, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '26px',
        color: '#ffe28a',
      })
      .setOrigin(0.5);

    this.messageText = this.add
      .text(width / 2, 125, 'Chain adjacent letters, then press Enter', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);

    this.grid = new LetterGrid({
      scene: this,
      rows: 4,
      cols: 4,
      x: width / 2 - (4 * 66) / 2 + 30,
      y: 180,
      tileSize: 60,
      showBurn: true,
      tileTextures: DELUXE_TILE_TEXTURES,
      onSelectionChange: (word) => this.wordText.setText(word.toUpperCase()),
      onSubmit: (word, tiles) => this.handleSubmit(word, tiles),
    });

    makeButton(this, width / 2, 460, 160, 44, 'Submit', () => this.grid.submit());
    makeButton(this, width / 2, 520, 160, 40, 'Back to Menu', () => {
      this.grid.destroy();
      this.scene.start('MainMenu');
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.grid.submit());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.grid.clearSelection());
  }

  private handleSubmit(word: string, tiles: GridTile[]) {
    if (this.over) return;
    if (!isValidWord(word)) {
      if (this.cache.audio.exists('bad')) this.sound.play('bad');
      this.messageText.setText(`"${word.toUpperCase()}" isn't a word`).setColor('#c0392b');
      this.grid.clearSelection();
      return;
    }

    if (this.cache.audio.exists('chomp')) this.sound.play('chomp');
    const points = tiles.reduce((sum, t) => sum + t.def.points, 0) * tiles.length;
    this.score += points;
    this.scoreText.setText(`Score: ${this.score}`);
    this.messageText.setText(`+${points} for "${word.toUpperCase()}"`).setColor('#a08a5f');

    this.grid.replaceTiles(tiles);
    const burnedOut = this.grid.tickBurn(tiles);
    if (burnedOut) this.gameOver();
  }

  private gameOver() {
    this.over = true;
    if (this.cache.audio.exists('screenburngameover')) this.sound.play('screenburngameover');
    const save = recordDeluxeScore(this.score);
    this.messageText
      .setText(`Game over! Final score ${this.score} (best: ${save.deluxeHighScore})`)
      .setColor('#c0392b');
    makeButton(this, this.scale.width / 2, 400, 160, 44, 'Play Again', () => {
      this.grid.destroy();
      this.scene.restart();
    });
  }
}
