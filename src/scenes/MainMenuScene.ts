import Phaser from 'phaser';
import { makeButton } from '../game/ui';
import { clearAdvProgress, getAdvProgress, loadSave, newAdvProgress, setAdvProgress } from '../game/saveManager';
import { playCutscene } from '../game/cutscene';
import { bookNumbers, getBook, type GameId } from '../game/adventures/gameData';
import { setGame } from '../game/adventures/gameContext';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width } = this.scale;
    const save = loadSave();

    this.add
      .text(width / 2, 70, 'Bookworm Adventures', {
        fontFamily: 'Georgia, serif',
        fontSize: '40px',
        color: '#f2e6c9',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 108, 'web edition', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);

    makeButton(this, width / 2, 200, 340, 56, 'Bookworm Deluxe (Classic)', () => {
      this.scene.start('Deluxe');
    });

    const entry = (game: GameId, label: string, y: number, intro: string) => {
      const saved = getAdvProgress(game);
      const startNew = () => {
        setGame(game);
        const first = bookNumbers(game)[0];
        clearAdvProgress(game);
        setAdvProgress(game, { ...newAdvProgress(), book: first, chapter: getBook(game, first)!.chapters[0].n });
        playCutscene(intro, 21).then(() => this.scene.start('ChapterIntro'));
      };
      if (saved) {
        makeButton(this, width / 2 - 60, y, 270, 50, `Continue · Book ${saved.book} Ch. ${saved.chapter} · match ${saved.enemy + 1}`, () => {
          setGame(game);
          this.scene.start('Battle'); // straight back into the match you left
        });
        makeButton(this, width / 2 + 145, y, 100, 50, 'New Game', () => {
          // keeps your history: pick any chapter you have completed (or the next one) on the map
          setGame(game);
          this.scene.start('ChapterIntro', { book: saved.book, chapter: saved.chapter });
        });
      } else {
        makeButton(this, width / 2, y, 340, 50, label, startNew);
      }
    };
    entry('adventures', 'Bookworm Adventures', 270, '/adventures/cutscenes/intro.swf');
    entry('adventures2', 'Adventures Volume 2', 340, '/adventures-vol2/cutscenes/intro.swf');

    makeButton(this, width / 2, 410, 200, 40, 'Settings', () => this.scene.start('Settings'));
    this.add
      .text(width / 2, 470, `Deluxe high score: ${save.deluxeHighScore}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);
  }
}
