import Phaser from 'phaser';
import { makeButton } from '../game/ui';
import { clearAdvProgress, getAdvProgress, loadSave, newAdvProgress, setAdvProgress } from '../game/saveManager';
import { playCutscene } from '../game/cutscene';

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

    const saved = getAdvProgress('adventures');
    const startNew = () => {
      clearAdvProgress('adventures');
      setAdvProgress('adventures', newAdvProgress());
      playCutscene('/adventures/cutscenes/intro.swf', 21).then(() => this.scene.start('ChapterIntro'));
    };
    if (saved) {
      makeButton(this, width / 2, 270, 340, 56, `Continue Adventures (Book ${saved.book}, Ch. ${saved.chapter})`, () => this.scene.start('ChapterIntro'));
      makeButton(this, width / 2, 340, 340, 44, 'New Adventure', startNew);
    } else {
      makeButton(this, width / 2, 270, 340, 56, 'Bookworm Adventures', startNew);
    }

    const vol2 = makeButton(this, width / 2, saved ? 400 : 340, 340, 56, 'Bookworm Adventures Volume 2', () => {
      vol2.text.setText('Volume 2: data decoded, gameplay not built yet');
      vol2.text.setFontSize('13px');
    });

    this.add
      .text(width / 2, 480, `Deluxe high score: ${save.deluxeHighScore}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#a08a5f',
      })
      .setOrigin(0.5);
  }
}
