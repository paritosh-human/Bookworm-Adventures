import Phaser from 'phaser';
import { createMusicToggle, makeButton } from '../game/ui';
import { clearAdvProgress, getAdvProgress, newAdvProgress, setAdvProgress } from '../game/saveManager';
import { playCutscene } from '../game/cutscene';
import { bookNumbers, getBook, type GameId } from '../game/adventures/gameData';
import { setGame } from '../game/adventures/gameContext';

const TITLES: Record<GameId, { label: string; intro: string }> = {
  adventures: { label: 'Bookworm Adventures', intro: '/adventures/cutscenes/intro.swf' },
  adventures2: { label: 'Adventures Volume 2', intro: '/adventures-vol2/cutscenes/intro.swf' },
};

/** Per-game menu reached from the main menu: Resume / New Game (opens the chapter map) / Reset. */
export class GameMenuScene extends Phaser.Scene {
  private game_!: GameId;
  private layer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('GameMenu');
  }

  init(data: { game: GameId }) {
    this.game_ = data.game;
  }

  create() {
    const { width } = this.scale;
    const g = this.game_;
    const info = TITLES[g];
    setGame(g);

    createMusicToggle(this, width - 40, 40);

    this.add.text(width / 2, 90, info.label, { fontFamily: 'Georgia, serif', fontSize: '32px', color: '#f2e6c9' }).setOrigin(0.5);

    const saved = getAdvProgress(g);
    this.add
      .text(width / 2, 130, saved ? `Book ${saved.book} · Chapter ${saved.chapter} · match ${saved.enemy + 1}` : 'Not started', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);

    if (saved) {
      makeButton(this, width / 2, 210, 320, 54, 'Resume', () => {
        setGame(g);
        this.scene.start('Battle'); // straight back into the match you left
      });
    } else {
      const bg = this.add.rectangle(width / 2, 210, 320, 54, 0x241a10).setStrokeStyle(2, 0x5a4a30);
      this.add.text(width / 2, 210, 'Resume', { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#6a5a44' }).setOrigin(0.5);
      void bg;
    }

    makeButton(this, width / 2, 280, 320, 54, 'New Game', () => this.openMap());
    makeButton(this, width / 2, 350, 320, 54, 'Reset', () => this.confirmReset());
    makeButton(this, width / 2, 450, 200, 44, 'Back', () => this.scene.start('MainMenu'));
  }

  /** Opens the chapter map: creates a fresh save (and plays the intro once) the very first
   * time, otherwise just navigates there with the existing history intact (nothing is reset —
   * any completed chapter, or the next one, can be picked from the map). */
  private async openMap() {
    const g = this.game_;
    setGame(g);
    const existing = getAdvProgress(g);
    if (!existing) {
      const first = bookNumbers(g)[0];
      setAdvProgress(g, { ...newAdvProgress(), book: first, chapter: getBook(g, first)!.chapters[0].n });
      await playCutscene(TITLES[g].intro, 21);
    }
    this.scene.start('ChapterIntro');
  }

  private confirmReset() {
    for (const o of this.layer) o.destroy();
    const { width, height } = this.scale;
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(10).setInteractive();
    const box = this.add.rectangle(width / 2, height / 2, 520, 200, 0x2b2015).setStrokeStyle(2, 0xd4af37).setDepth(11);
    const msg = this.add
      .text(width / 2, height / 2 - 40, `Really clear all ${TITLES[this.game_].label} progress?\nThis cannot be undone.`, {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#f2e6c9',
        align: 'center',
        wordWrap: { width: 460 },
      })
      .setOrigin(0.5)
      .setDepth(12);
    const yes = makeButton(this, width / 2 - 110, height / 2 + 50, 180, 44, 'Yes, clear it', () => {
      clearAdvProgress(this.game_);
      this.scene.restart({ game: this.game_ });
    });
    const no = makeButton(this, width / 2 + 110, height / 2 + 50, 180, 44, 'Cancel', () => {
      for (const o of this.layer) o.destroy();
      this.layer = [];
    });
    for (const b of [yes, no]) {
      b.bg.setDepth(12);
      b.text.setDepth(13);
    }
    this.layer = [shade, box, msg, yes.bg, yes.text, no.bg, no.text];
  }
}
