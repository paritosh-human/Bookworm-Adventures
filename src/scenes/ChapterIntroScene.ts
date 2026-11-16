import Phaser from 'phaser';
import { bookNumbers, getBook, getChapter } from '../game/adventures/gameData';
import { getAdvProgress, setAdvProgress } from '../game/saveManager';
import { assetBase, curGame } from '../game/adventures/gameContext';

// The original book map screen: the book's map at (mapX, 0), chapter icons at the
// positions from the book script, framed by the shared UI pieces, with the
// chapter description on a parchment box below.
// Chapter choice: every completed chapter plus the next one is playable. Only the saved position
// (book / chapter / enemy) can be resumed; starting another chapter replaces it.
const OX = 80;
const OY = 10;
const L = (x: number, y: number): [number, number] => [x + OX, y + OY];

const MAP_ASSETS = ['ui_top', 'ui_bot', 'ui_left', 'ui_right', 'ui_descripbox', 'ui_banner_lrg', 'ui_maplex', 'checkmark', 'btn_continue'];

export class ChapterIntroScene extends Phaser.Scene {
  private selBook = 1;
  private selChapter = 1;

  constructor() {
    super('ChapterIntro');
  }

  init(data: { book?: number; chapter?: number }) {
    const p = getAdvProgress(curGame());
    this.selBook = data?.book ?? p?.book ?? 1;
    this.selChapter = data?.chapter ?? (data?.book !== undefined ? this.firstPlayable(data.book) : p?.chapter ?? 1);
  }

  /** Chapters in play order across books. */
  private order(): { book: number; chapter: number }[] {
    const g = curGame();
    return bookNumbers(g).flatMap((b) => getBook(g, b)!.chapters.map((c) => ({ book: b, chapter: c.n })));
  }

  private unlocked(book: number, chapter: number): boolean {
    const p = getAdvProgress(curGame());
    if (!p) return false;
    const done = new Set(p.done);
    if (done.has(`${book}-${chapter}`)) return true;
    // the frontier: first chapter not yet completed
    const frontier = this.order().find((c) => !done.has(`${c.book}-${c.chapter}`));
    return !!frontier && frontier.book === book && frontier.chapter === chapter;
  }

  private firstPlayable(book: number): number {
    const chs = getBook(curGame(), book)?.chapters ?? [];
    return (chs.find((c) => this.unlocked(book, c.n)) ?? chs[0]).n;
  }

  preload() {
    const book = this.selBook;
    const base = `${assetBase()}/images/map/`;
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
    const p = getAdvProgress(curGame());
    if (!p) {
      this.scene.start('MainMenu');
      return;
    }
    const g = curGame();
    const book = getBook(g, this.selBook)!;
    this.cameras.main.setBackgroundColor('#14100b');

    const img = (x: number, y: number, key: string, depth: number, originX = 0, originY = 0) => {
      const [px, py] = L(x, y);
      return this.add.image(px, py, key).setOrigin(originX, originY).setDepth(depth);
    };

    img(book.mapX, book.mapY, `map_map_b${this.selBook}`, 0);

    const doneSet = new Set(p.done);
    const descTitle = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', color: '#3a2610', fontSize: '15px', fontStyle: 'bold', wordWrap: { width: 370 } }).setDepth(10);
    const descBody = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', color: '#3a2610', fontSize: '12px', wordWrap: { width: 370 } }).setDepth(10);
    const [tx, ty] = L(215, 461);
    descTitle.setPosition(tx, ty);
    descBody.setPosition(tx, ty + 20);
    const showChapter = (n: number) => {
      const ch = getChapter(g, this.selBook, n);
      descTitle.setText(ch?.title ?? `Chapter ${n}`);
      descBody.setText((ch?.description ?? '').trim());
    };

    // Chapter icons: completed ones and the next one can be picked; later ones are dimmed.
    const rings: Record<number, Phaser.GameObjects.Image> = {};
    let lexMarker: Phaser.GameObjects.Image | undefined;
    const placeLex = (n: number) => {
      const ch = book.chapters.find((c) => c.n === n);
      const icon = rings[n];
      if (!ch || !icon) return;
      const [lx, ly] = L(ch.x + icon.width / 2, ch.y - 6);
      lexMarker?.destroy();
      lexMarker = this.add.image(lx, ly, 'map_ui_maplex', 0).setOrigin(0.5, 1).setDepth(3);
      this.tweens.add({ targets: lexMarker, y: ly - 4, yoyo: true, repeat: -1, duration: 600 });
      let f = 0;
      this.time.addEvent({ delay: 180, loop: true, callback: () => lexMarker?.active && lexMarker.setFrame(++f % 5) });
    };
    const refreshButton = () => {
      const resume = this.selBook === p.book && this.selChapter === p.chapter && p.enemy > 0;
      cont.setData('resume', resume);
      cover.setVisible(!resume);
      label.setText(resume ? '' : 'Begin');
    };

    for (const ch of book.chapters) {
      const key = `map_icon_b${this.selBook}c${ch.n}`;
      if (!this.textures.exists(key)) continue;
      const open = this.unlocked(this.selBook, ch.n);
      const icon = img(ch.x, ch.y, key, 1).setAlpha(open ? 1 : 0.4);
      rings[ch.n] = icon;
      if (doneSet.has(`${this.selBook}-${ch.n}`)) img(ch.x + icon.width / 2, ch.y + icon.height / 2, 'map_checkmark', 2, 0.5, 0.5);
      if (open) {
        icon.setInteractive({ useHandCursor: true });
        icon.on('pointerover', () => icon.setScale(1.08));
        icon.on('pointerout', () => icon.setScale(1));
        icon.on('pointerdown', () => {
          this.selChapter = ch.n;
          showChapter(ch.n);
          placeLex(ch.n);
          refreshButton();
        });
      }
    }

    // Frame pieces on top of the map.
    img(0, 0, 'map_ui_top', 5);
    img(0, 449, 'map_ui_bot', 5);
    img(0, 90, 'map_ui_left', 6);
    img(765, 90, 'map_ui_right', 6);
    img(400 - 256, 0, 'map_ui_banner_lrg', 7);
    img(400, 13, `map_banner_b${this.selBook}`, 8, 0.5, 0);
    img(175, 431, 'map_ui_descripbox', 9);

    // Continue / Begin
    const [cx, cy] = L(400, 548);
    const cont = this.add.image(cx, cy, 'map_btn_continue', 0).setOrigin(0.5, 0).setDepth(11).setInteractive({ useHandCursor: true });
    // the button art says "Continue"; for "Begin" a plain cover goes over the word
    const cover = this.add.rectangle(cx, cy + 26, 170, 30, 0x6cc424).setStrokeStyle(2, 0x2f5a10).setDepth(11.5);
    const label = this.add.text(cx, cy + 26, '', { fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'bold', color: '#1b1409' }).setOrigin(0.5).setDepth(12);
    cont.on('pointerover', () => cont.setFrame(1));
    cont.on('pointerout', () => cont.setFrame(0));
    cont.on('pointerdown', () => {
      if (!cont.getData('resume')) {
        // starting a different chapter (or a chapter from its first match) replaces the saved position
        setAdvProgress(g, { ...p, book: this.selBook, chapter: this.selChapter, enemy: 0, checkpoint: 0, hearts: undefined });
      }
      this.scene.start('Battle');
    });

    showChapter(this.selChapter);
    placeLex(this.selChapter);
    refreshButton();

    // Book navigation (only books that have an unlocked chapter)
    const books = bookNumbers(g).filter((b) => getBook(g, b)!.chapters.some((c) => this.unlocked(b, c.n)));
    const i = books.indexOf(this.selBook);
    const arrow = (x: number, txt: string, target: number | undefined) => {
      if (target === undefined) return;
      const [ax, ay] = L(x, 60);
      this.add.text(ax, ay, txt, { fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'bold', color: '#ffe28a', backgroundColor: '#3a2610', padding: { x: 8, y: 4 } })
        .setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.scene.restart({ book: target }));
    };
    arrow(100, '◀ Book', i > 0 ? books[i - 1] : undefined);
    arrow(700, 'Book ▶', i >= 0 && i < books.length - 1 ? books[i + 1] : undefined);

    for (const [x0, x1] of [[36, 135], [664, 762]] as const) {
      const [zx, zy] = L((x0 + x1) / 2, 504);
      this.add.rectangle(zx, zy, x1 - x0, 30, 0xffffff, 0).setDepth(12).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('MainMenu'));
    }
  }
}
