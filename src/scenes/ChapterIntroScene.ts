import Phaser from 'phaser';
import { getBook, getChapter } from '../game/adventures/gameData';
import { getAdvProgress } from '../game/saveManager';

// The original book map screen: the book's map at (mapX, 0), chapter icons at the
// positions from the book script, framed by the shared UI pieces, with the
// chapter description on a parchment box below.
const OX = 80;
const OY = 10;
const L = (x: number, y: number): [number, number] => [x + OX, y + OY];

const MAP_ASSETS = ['ui_top', 'ui_bot', 'ui_left', 'ui_right', 'ui_descripbox', 'ui_banner_lrg', 'ui_maplex', 'checkmark', 'btn_continue'];

export class ChapterIntroScene extends Phaser.Scene {
  constructor() {
    super('ChapterIntro');
  }

  preload() {
    const p = getAdvProgress('adventures');
    const book = p?.book ?? 1;
    const base = 'adventures/images/map/';
    for (const k of MAP_ASSETS) {
      const key = `map_${k}`;
      if (this.textures.exists(key)) continue;
      if (k === 'ui_maplex') this.load.spritesheet(key, `${base}${k}.png`, { frameWidth: 25, frameHeight: 40 });
      else if (k === 'btn_continue') this.load.spritesheet(key, `${base}${k}.png`, { frameWidth: 244, frameHeight: 52 });
      else this.load.image(key, `${base}${k}.png`);
    }
    for (const k of [`map_b${book}`, `banner_b${book}`]) if (!this.textures.exists(`map_${k}`)) this.load.image(`map_${k}`, `${base}${k}.png`);
    for (let n = 1; n <= 10; n++) {
      const k = `icon_b${book}c${n}`;
      if (!this.textures.exists(`map_${k}`)) this.load.image(`map_${k}`, `${base}${k}.png`);
    }
  }

  create() {
    const p = getAdvProgress('adventures');
    if (!p) {
      this.scene.start('MainMenu');
      return;
    }
    const book = getBook('adventures', p.book)!;
    this.cameras.main.setBackgroundColor('#14100b');

    const img = (x: number, y: number, key: string, depth: number, originX = 0, originY = 0) => {
      const [px, py] = L(x, y);
      return this.add.image(px, py, key).setOrigin(originX, originY).setDepth(depth);
    };

    img(book.mapX, book.mapY, `map_map_b${p.book}`, 0);

    // Chapter icons: done = checkmark, current = Lex marker, later chapters dimmed.
    const doneSet = new Set(p.done);
    for (const ch of book.chapters) {
      const key = `map_icon_b${p.book}c${ch.n}`;
      if (!this.textures.exists(key)) continue;
      const done = doneSet.has(`${p.book}-${ch.n}`);
      const current = ch.n === p.chapter;
      const icon = img(ch.x, ch.y, key, 1).setAlpha(done || current ? 1 : 0.45);
      if (done) img(ch.x + icon.width / 2, ch.y + icon.height / 2, 'map_checkmark', 2, 0.5, 0.5);
      if (current) {
        const lex = img(ch.x + icon.width / 2, ch.y - 6, 'map_ui_maplex', 3, 0.5, 1);
        this.tweens.add({ targets: lex, y: lex.y - 4, yoyo: true, repeat: -1, duration: 600 });
        let f = 0;
        this.time.addEvent({ delay: 180, loop: true, callback: () => lex.setFrame(++f % 5) });
      }
    }

    // Frame pieces on top of the map.
    img(0, 0, 'map_ui_top', 5);
    img(0, 449, 'map_ui_bot', 5);
    img(0, 90, 'map_ui_left', 6);
    img(765, 90, 'map_ui_right', 6);
    img(400 - 256, 0, 'map_ui_banner_lrg', 7);
    img(400, 13, `map_banner_b${p.book}`, 8, 0.5, 0);
    img(175, 431, 'map_ui_descripbox', 9);

    const chapter = getChapter('adventures', p.book, p.chapter);
    const [tx, ty] = L(215, 461);
    const style = { fontFamily: 'Georgia, serif', color: '#3a2610', wordWrap: { width: 370 } } as const;
    this.add.text(tx, ty, chapter?.title ?? `Chapter ${p.chapter}`, { ...style, fontSize: '15px', fontStyle: 'bold' }).setDepth(10);
    this.add.text(tx, ty + 20, (chapter?.description ?? '').trim(), { ...style, fontSize: '12px' }).setDepth(10);

    // Continue / Back / Menu
    const [cx, cy] = L(400, 548);
    const cont = this.add.image(cx, cy, 'map_btn_continue', 0).setOrigin(0.5, 0).setDepth(11).setInteractive({ useHandCursor: true });
    cont.on('pointerover', () => cont.setFrame(1));
    cont.on('pointerout', () => cont.setFrame(0));
    cont.on('pointerdown', () => this.scene.start('Battle'));
    for (const [x0, x1] of [[36, 135], [664, 762]] as const) {
      const [zx, zy] = L((x0 + x1) / 2, 504);
      this.add.rectangle(zx, zy, x1 - x0, 30, 0xffffff, 0).setDepth(12).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('MainMenu'));
    }
  }
}
