import Phaser from 'phaser';
import { createMusicToggle, makeButton } from '../game/ui';
import { playMusic } from '../game/music';
import { MENU_TRACK } from '../game/adventures/musicMap';

/** Home-page settings: reset progress (each reset asks for confirmation first). Per-game
 * Adventures resets live in each game's own menu (GameMenuScene) now. */
export class SettingsScene extends Phaser.Scene {
  private layer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Settings');
  }

  create() {
    const { width } = this.scale;
    playMusic(this, MENU_TRACK);
    createMusicToggle(this, width - 40, 40);
    this.add.text(width / 2, 70, 'Settings', { fontFamily: 'Georgia, serif', fontSize: '36px', color: '#f2e6c9' }).setOrigin(0.5);
    this.add.text(width / 2, 120, 'Reset progress', { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#a08a5f' }).setOrigin(0.5);

    const items: { label: string; what: string; run: () => void }[] = [
      { label: 'Reset EVERYTHING', what: 'ALL saved history for every game', run: () => localStorage.removeItem('bookworm-adventures-save') },
    ];
    items.forEach((it, i) => makeButton(this, width / 2, 190 + i * 62, 380, 48, it.label, () => this.confirm(it)));
    makeButton(this, width / 2, 500, 200, 44, 'Back', () => this.scene.start('MainMenu'));
  }

  private confirm(it: { label: string; what: string; run: () => void }) {
    for (const o of this.layer) o.destroy();
    const { width, height } = this.scale;
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(10).setInteractive();
    const box = this.add.rectangle(width / 2, height / 2, 520, 200, 0x2b2015).setStrokeStyle(2, 0xd4af37).setDepth(11);
    const msg = this.add.text(width / 2, height / 2 - 40, `Really clear ${it.what}?\nThis cannot be undone.`, { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#f2e6c9', align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5).setDepth(12);
    const yes = makeButton(this, width / 2 - 110, height / 2 + 50, 180, 44, 'Yes, clear it', () => {
      it.run();
      this.scene.start('MainMenu');
    });
    const no = makeButton(this, width / 2 + 110, height / 2 + 50, 180, 44, 'Cancel', () => {
      for (const o of this.layer) o.destroy();
      this.layer = [];
    });
    for (const b of [yes, no]) { b.bg.setDepth(12); b.text.setDepth(13); }
    this.layer = [shade, box, msg, yes.bg, yes.text, no.bg, no.text];
  }
}
