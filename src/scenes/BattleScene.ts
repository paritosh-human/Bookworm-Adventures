import Phaser from 'phaser';
import { LetterGrid, type GridTile } from '../game/LetterGrid';
import { isValidWord } from '../game/wordValidator';
import { getAdvProgress, newAdvProgress, setAdvProgress } from '../game/saveManager';
import { loadPamActorAssets, pamImageTextureKey } from '../game/pam/pamLoader';
import { PamActor } from '../game/pam/PamActor';
import { bookNumbers, creaturePam, getBook, getChapter, getCreature, getLore, getTreasure, EFFECT_ICON } from '../game/adventures/gameData';
import { combineTreasures } from '../game/adventures/treasures';
import { TILE_HINTS } from '../game/adventures/hints';
import { ENEMY_OFFSETS } from '../game/adventures/enemyOffsets';
import { BattleModel, levelForXp, xpForLevel, type EnemyTurn, type TileRequest } from '../game/adventures/BattleModel';
import { GEM_BONUS_PCT, MIN_WORD_LENGTH, lexAttackFrame, rollGem, rollPotion, type Potion } from '../game/adventures/rules';
import { letterDef } from '../game/letterTiles';
import { makeButton } from '../game/ui';
import type { AdvProgress } from '../game/types';

const GAME = 'adventures' as const;

// The original battle screen is an 800x600 layout: name bars along the top, a
// sky "stage" for Lex and the enemy, and a bottom panel (curtains, pedestals,
// a bookshelf in the middle that holds the letter board). We center that
// layout in our 960x620 canvas; L(x, y) converts original-layout coordinates.
const OX = 80;
const OY = 10;
const L = (x: number, y: number): [number, number] => [x + OX, y + OY];

// Creature pams are authored on an 800x500 canvas whose feet line sits ~330px down; this lifts
// that canvas so the feet land on the arena's ground.
const STAGE_Y = -55;
const ACTOR_SCALE = 1;
const LEX_SCALE = 1;

const DEPTH_MIDGROUND = 0.5;
const DEPTH_FIGHTING_GROUND = 0.8;
const DEPTH_ACTORS = 1;
const DEPTH_FRAME = 2;
const DEPTH_UI = 3;
const DEPTH_BANNER = 10;

const POTION_INFO: Record<Potion, string> = {
  health: 'Health potion: restores lost health.',
  attack: 'Attack bonus: your next attack gets x2 damage.',
  purify: 'Purification: purifies damaged tiles and clears status ailments.',
};
const POTION_USED: Record<Potion, string> = {
  health: 'Health restored!',
  attack: 'Powered up: next attack x2!',
  purify: 'Purified!',
};

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export class BattleScene extends Phaser.Scene {
  private grid!: LetterGrid;
  private model!: BattleModel;
  private progress!: AdvProgress;

  private wordText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private lexHearts: Phaser.GameObjects.Image[] = [];
  private enemyHearts: Phaser.GameObjects.Image[] = [];
  private attackLines: Phaser.GameObjects.Text[] = [];
  private attackBtn!: Phaser.GameObjects.Image;
  private scrambleBtn!: Phaser.GameObjects.Image;
  private arenaBackdrop?: Phaser.GameObjects.Image;
  private monsterActor?: PamActor;
  private lexActor?: PamActor;
  private sceneryLayers: PamActor[] = [];
  private busy = false;
  private over = false;
  private equipped: string[] = [];
  private potionImgs: Partial<Record<Potion, Phaser.GameObjects.Image>> = {};
  private potionTexts: Partial<Record<Potion, Phaser.GameObjects.Text>> = {};
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init() {
    this.progress = getAdvProgress(GAME) ?? newAdvProgress();
    this.busy = false;
    this.over = false;
    this.lexHearts = [];
    this.enemyHearts = [];
    this.attackLines = [];
    this.sceneryLayers = [];
    this.hintQueue = [];
    this.hintOpen = false;
    this.floaters = new Map();
    this.bubbles = {};
  }

  private get chapter() {
    return getChapter(GAME, this.progress.book, this.progress.chapter)!;
  }

  private addFrameImage(key: string, x: number, y: number, originX = 0) {
    if (!this.textures.exists(key)) return;
    const [px, py] = L(x, y);
    this.add.image(px, py, key).setOrigin(originX, 0).setDepth(DEPTH_FRAME);
  }

  private uiText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
    const [px, py] = L(x, y);
    return this.add.text(px, py, text, { fontFamily: 'Georgia, serif', ...style }).setOrigin(0.5).setDepth(DEPTH_UI);
  }

  create() {
    this.cameras.main.setBackgroundColor('#14100b');
    const p = this.progress;
    const ref = this.chapter.enemies[p.enemy];
    const creature = getCreature(GAME, ref.id);
    if (!creature) throw new Error(`Unknown creature ${ref.id}`);
    this.equipped = (p.treasures ?? []).slice(-3);
    this.model = new BattleModel(creature, levelForXp(p.xp), p.hearts, Math.random, combineTreasures(this.equipped));

    this.addFrameImage('battle_curtain_left', 0, 0, 1);
    this.addFrameImage('battle_curtain_right', 800, 0, 0);

    // The arena fills the screen from the top; the name bars overlay it (reference screenshots).
    const [sx, sy] = L(0, 0);
    this.arenaBackdrop = this.add.image(sx, sy, 'arena_book1').setOrigin(0, 0).setDepth(0);
    this.loadArena();
    this.addFrameImage('battle_ui_bottom2', 0, 309);
    this.addFrameImage('battle_ui_bottom1', 0, 266);
    this.addFrameImage('battle_ui_top', 0, 0);

    // Original (CreatureBaseClass.DrawTopLayer): the enemy's name is cream text in the enemy's own bar.
    this.nameText = this.uiText(626, 11, creature.name, {
      fontSize: '11px', fontStyle: 'bold', color: '#ffd21f',
    }).setOrigin(0, 0.5).setStroke('#3a2610', 3);
    if (this.nameText.width > 78) this.nameText.setScale(78 / this.nameText.width);
    // The centre scroll (blank in the art) carries the chapter title (our choice, not in the scripts).
    this.uiText(400, 16, this.chapter.title.replace(/^Chapter \d+:\s*/, ''), { fontSize: '16px', fontStyle: 'bold', color: '#3a2610' });
    this.statusText = this.uiText(135, 62, '', { fontSize: '11px', color: '#ffe28a' }).setDepth(DEPTH_UI + 2);
    this.wordText = this.uiText(400, 298, '', { fontSize: '14px', fontStyle: 'bold', color: '#ffe28a' }).setVisible(false);
    this.messageText = this.uiText(400, 262, '', {
      fontSize: '14px', color: '#e6d3a8', align: 'center', wordWrap: { width: 560 },
    });

    const seen = new Set<string>();
    this.buildBestWords();
    this.buildAttackList(
      creature.attacks
        .map((a) => ({ name: a.name, description: a.description }))
        .filter((a) => !seen.has(a.name) && seen.add(a.name)),
    );

    const [gx, gy] = L(400 - 84, 338);
    this.grid = new LetterGrid({
      scene: this, rows: 4, cols: 4, x: gx, y: gy, tileSize: 50, showBurn: false,
      tileSheet: 'battle_tile', pipSheet: 'battle_pips', requireAdjacent: false,
      onSelectionChange: (_word, tiles) => this.syncSelectedTiles(tiles),
      onSubmit: (word, tiles) => this.handleSubmit(word, tiles),
    });
    this.raiseGridTiles();

    this.attackBtn = this.imageButton(400, 567, 'btn_attack', () => this.grid.submit());
    this.scrambleBtn = this.imageButton(151, 580, 'btn_scramble', () => this.handleScramble());
    this.imageButton(658, 580, 'btn_menu', () => {
      this.grid.destroy();
      this.scene.start('MainMenu');
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.grid.submit());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.grid.clearSelection());
    this.events.once('shutdown', () => this.cleanup());

    this.buildProgress();
    this.buildXpBar();
    this.buildPotions();
    this.buildTreasures();
    this.refreshHearts();
    this.loadMonsterActor(creaturePam(creature));
    this.loadScenery();
    this.loadLexActor();
    this.announce(ref);
    this.sayIntro();
    this.showEnemyInfo();
    this.showEnemyInfo();
    this.setMessage(`Spell a word of ${MIN_WORD_LENGTH}+ letters to attack`);
  }

  // ---- layout helpers ----

  private raiseGridTiles() {
    for (const tile of this.grid.allTiles()) {
      tile.bg.setDepth(DEPTH_UI);
      tile.pip?.setDepth(DEPTH_UI + 1);
      tile.text.setDepth(DEPTH_UI + 1);
      tile.overlay?.setDepth(DEPTH_UI + 1.5);
    }
  }

  /** A button whose texture is a spritesheet: 0 up, 1 over, 2 down, 3 disabled. */
  private imageButton(x: number, y: number, sheet: string, onClick: () => void) {
    const [px, py] = L(x, y);
    const img = this.add.image(px, py, sheet, 0).setDepth(DEPTH_UI).setInteractive({ useHandCursor: true });
    img.on('pointerover', () => img.getData('disabled') || img.setFrame(1));
    img.on('pointerout', () => img.getData('disabled') || img.setFrame(0));
    img.on('pointerdown', () => {
      if (img.getData('disabled')) return;
      img.setFrame(2);
      if (this.cache.audio.exists('buttonclick')) this.sound.play('buttonclick');
      onClick();
    });
    img.on('pointerup', () => img.getData('disabled') || img.setFrame(1));
    return img;
  }

  private setButtonEnabled(img: Phaser.GameObjects.Image, enabled: boolean) {
    img.setData('disabled', !enabled);
    img.setFrame(enabled ? 0 : 3);
  }

  // Right panel: the "Best words" scroll by default; while the enemy acts it shows the attack's
  // name and description (reference screenshots).
  private bestWords: string[] = [];
  private bestObjs: Phaser.GameObjects.GameObject[] = [];
  private bestText?: Phaser.GameObjects.Text;
  private atkObjs: Phaser.GameObjects.Text[] = [];

  private buildBestWords() {
    const [px, py] = L(552, 336);
    const paper = this.add.image(px, py, 'bestword_paper').setOrigin(0, 0).setDepth(DEPTH_UI).setScale(0.9);
    const [tx, ty] = L(660, 322);
    const title = this.add.image(tx, ty, 'bestword_title').setDepth(DEPTH_UI + 1).setScale(0.85);
    this.bestText = this.uiText(660, 368, '', { fontSize: '13px', fontStyle: 'bold', color: '#3a2610', align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0);
    this.bestObjs = [paper, title, this.bestText];
  }

  private recordBestWord(word: string, damage: number) {
    this.bestWords = [...this.bestWords, `${word.toUpperCase()}  ${damage}`].sort((a, b) => Number(b.split('  ')[1]) - Number(a.split('  ')[1]) || a.length - b.length).slice(0, 7);
    this.bestText?.setText(this.bestWords.join('\n'));
  }

  private infoObjs: Phaser.GameObjects.GameObject[] = [];

  /** A lore plate with the attack's effect icons and its name in red (PAMBasedEnemy.DrawLorePanel). */
  private buildPlate(y: number, name: string, effects: { cls: string; args: unknown[] }[]) {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const [px, py] = L(660, y);
    objs.push(this.add.image(px, py, 'lore_plate').setScale(0.86).setDepth(DEPTH_UI + 2));
    const cels = [...new Set(effects.map((e) => {
      if (e.cls === 'DamageMultiplierEffect') return (e.args as unknown[])[4] === true ? 7 : 3;
      return EFFECT_ICON[e.cls] ?? -1;
    }).filter((c) => c >= 0))];
    cels.slice(0, 3).forEach((c, i) => objs.push(this.add.image(px - 86 + i * 24, py, 'status_icons', c).setScale(0.55).setDepth(DEPTH_UI + 3)));
    objs.push(this.add.text(px + 8 + (cels.length ? 0 : 0), py, name, { fontFamily: 'Georgia, serif', fontSize: '14px', fontStyle: 'bold', color: '#c82f16', wordWrap: { width: 120 }, align: 'center' }).setOrigin(0.5).setDepth(DEPTH_UI + 3));
    return objs;
  }

  private clearInfo() {
    for (const o of this.infoObjs) o.destroy();
    this.infoObjs = [];
  }

  private buildAttackList(_attacks: { name: string; description: string }[]) {
    // placeholder kept for call-site symmetry; the panel is built on demand in showAttackInfo / showEnemyInfo
  }

  /** Enemy info (shown until Lex's first word): its special attacks and its story. */
  private showEnemyInfo() {
    const c = this.model.creature;
    const seen = new Set<string>();
    const special = c.attacks.filter((a) => a.effects.some((e) => e.cls !== 'DamageEffect') && !seen.has(a.name) && seen.add(a.name)).slice(0, 3);
    const lore = getLore(c.name);
    if (!special.length && !lore) return;
    this.clearInfo();
    for (const o of this.bestObjs) (o as Phaser.GameObjects.Image).setVisible(false);
    let y = 338;
    for (const a of special) {
      this.infoObjs.push(...this.buildPlate(y, a.name, a.effects));
      y += 42;
    }
    if (lore) {
      const [tx, ty] = L(660, y + 6);
      this.infoObjs.push(this.add.text(tx, ty, lore, { fontFamily: 'Georgia, serif', fontSize: '10px', color: '#e6d3a8', align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5, 0).setDepth(DEPTH_UI + 3));
    }
  }

  /** The enemy's current attack: its plate and description. Pass null to go back to Best words. */
  private showAttackInfo(name: string | null, description = '') {
    this.clearInfo();
    const on = !!name;
    for (const o of this.bestObjs) (o as Phaser.GameObjects.Image).setVisible(!on);
    if (!name) return;
    const atk = this.model.creature.attacks.find((a) => a.name === name);
    this.infoObjs.push(...this.buildPlate(350, name, atk?.effects ?? []));
    const [tx, ty] = L(660, 385);
    this.infoObjs.push(this.add.text(tx, ty, description, { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#e6d3a8', align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5, 0).setDepth(DEPTH_UI + 3));
  }

  private msgTween?: Phaser.Tweens.Tween;
  private setMessage(text: string, color = '#e6d3a8') {
    this.msgTween?.stop();
    this.messageText.setText(text).setColor(color).setAlpha(1).setStroke('#000000', 4);
    // transient status text, not a permanent label on the battleground
    this.msgTween = this.tweens.add({ targets: this.messageText, alpha: 0, delay: 2600, duration: 500 });
  }

  // ---- selected tiles fly up to the middle of the battleground and spell the word there ----
  private floaters = new Map<GridTile, Phaser.GameObjects.Container>();

  private setTileShown(t: GridTile, shown: boolean) {
    const a = shown ? 1 : 0;
    t.bg.setAlpha(a);
    t.text.setAlpha(a);
    t.pip?.setAlpha(a);
    t.overlay?.setAlpha(a);
  }

  private syncSelectedTiles(sel: GridTile[]) {
    const size = 44;
    const pitch = Math.min(48, 640 / Math.max(sel.length, 1));
    for (const [tile, c] of [...this.floaters]) {
      if (sel.includes(tile)) continue;
      this.floaters.delete(tile);
      const home = { x: tile.bg.x, y: tile.bg.y };
      this.tweens.add({ targets: c, x: home.x, y: home.y, duration: 160, onComplete: () => { c.destroy(); this.setTileShown(tile, true); } });
    }
    sel.forEach((tile, i) => {
      const [tx, ty] = L(400 + (i - (sel.length - 1) / 2) * pitch, 144);
      let c = this.floaters.get(tile);
      if (!c) {
        const bg = this.add.image(0, 0, 'battle_tile', 1).setDisplaySize(size, size);
        const txt = this.add.text(0, 0, tile.def.letter.toUpperCase(), { fontFamily: 'Georgia, serif', fontSize: `${Math.floor(size * 0.55)}px`, fontStyle: 'bold', color: '#1b1409' }).setOrigin(0.5);
        c = this.add.container(tile.bg.x, tile.bg.y, [bg, txt]).setDepth(DEPTH_BANNER - 2);
        if (tile.gem && this.textures.exists(`gem_${tile.gem}`)) bg.setTexture(`gem_${tile.gem}`).setDisplaySize(size, size);
        c.setSize(size, size).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.grid.deselect(tile));
        this.floaters.set(tile, c);
        this.setTileShown(tile, false);
      }
      this.tweens.add({ targets: c, x: tx, y: ty, duration: 160 });
    });
  }

  /** A played word: the floating tiles rush the enemy and vanish. */
  private consumeFloaters() {
    const [ex, ey] = L(620, 150);
    for (const [tile, c] of this.floaters) {
      this.setTileShown(tile, true);
      this.tweens.add({ targets: c, x: ex, y: ey, alpha: 0, scale: 0.4, duration: 320, onComplete: () => c.destroy() });
    }
    this.floaters.clear();
  }

  // ---- XP bar (Lex.lua: empty/full images at (79,1), cropped to the level progress) ----
  private xpFull?: Phaser.GameObjects.Image;

  private buildXpBar() {
    const [x, y] = L(79, 1);
    this.add.image(x, y, 'xp_bar_empty').setOrigin(0, 0).setDepth(DEPTH_UI);
    this.xpFull = this.add.image(x, y, 'xp_bar_full').setOrigin(0, 0).setDepth(DEPTH_UI + 1);
    this.updateXpBar();
  }

  private updateXpBar() {
    if (!this.xpFull) return;
    const xp = this.progress.xp;
    const lvl = levelForXp(xp);
    const lo = lvl > 1 ? xpForLevel(lvl - 1) : 0;
    const frac = Math.min(1, Math.max(0, (xp - lo) / (xpForLevel(lvl) - lo)));
    this.xpFull.setCrop(0, 0, this.xpFull.width * frac, this.xpFull.height);
  }

  private showLevelUp(level: number) {
    const [cx, cy] = L(400, 130);
    const banner = this.add.image(cx, cy, 'levelup_banner').setDepth(DEPTH_BANNER).setScale(0.8);
    const txt = this.add.text(cx, cy + 4, `Level ${level}!`, { fontFamily: 'Georgia, serif', fontSize: '26px', fontStyle: 'bold', color: '#ffe28a' }).setOrigin(0.5).setStroke('#3a2610', 5).setDepth(DEPTH_BANNER + 1);
    this.tweens.add({ targets: [banner, txt], alpha: 0, delay: 2200, duration: 600, onComplete: () => { banner.destroy(); txt.destroy(); } });
  }

  // ---- chapter progress strip (BattleEngine.DrawProgress): sepia minimap at (284,29), the beaten
  // fraction in colour, Lex's icon at the edge and the chapter's boss icon at the end ----
  private progressObjs: Phaser.GameObjects.Image[] = [];
  private progressColor?: Phaser.GameObjects.Image;
  private progressLex?: Phaser.GameObjects.Image;

  private buildProgress() {
    const { book, chapter } = this.progress;
    const base = 'adventures/images/map/';
    const keys = { col: `mm_b${book}c${chapter}`, sep: `mm_b${book}c${chapter}_s`, icons: `mmi_b${book}` };
    const build = () => {
      for (const o of this.progressObjs) o.destroy();
      this.progressObjs = [];
      if (!this.textures.exists(keys.col)) return;
      const [x, y] = L(284, 29);
      const w = this.textures.get(keys.col).getSourceImage().width;
      const sep = this.add.image(x, y, keys.sep).setOrigin(0, 0).setDepth(DEPTH_UI);
      this.progressColor = this.add.image(x, y, keys.col).setOrigin(0, 0).setDepth(DEPTH_UI + 1);
      this.progressObjs.push(sep, this.progressColor);
      if (this.textures.exists(keys.icons)) {
        this.progressObjs.push(this.add.image(x + w - 20, y, keys.icons, chapter).setOrigin(0, 0).setDepth(DEPTH_UI + 2));
        this.progressLex = this.add.image(x, y, keys.icons, 0).setOrigin(0.5, 0).setDepth(DEPTH_UI + 3);
        this.progressObjs.push(this.progressLex);
      }
      this.updateProgress();
    };
    let need = 0;
    const want: [string, string, (() => void) | null][] = [
      [keys.col, `${base}minimap_b${book}c${chapter}.png`, null],
      [keys.sep, `${base}minimap_b${book}c${chapter}_sepia.png`, null],
    ];
    for (const [k, u] of want) if (!this.textures.exists(k)) { this.load.image(k, u); need++; }
    if (!this.textures.exists(keys.icons)) { this.load.spritesheet(keys.icons, `${base}minimap_icons_b${book}.png`, { frameWidth: 20, frameHeight: 20 }); need++; }
    if (need) { this.load.once('complete', build); this.load.start(); } else build();
  }

  /** fraction of the chapter's enemies already beaten */
  private updateProgress() {
    if (!this.progressColor) return;
    const w = this.progressColor.width;
    const frac = this.progress.enemy / Math.max(this.chapter.enemies.length, 1);
    this.progressColor.setCrop(0, 0, Math.max(0, w * frac), this.progressColor.height);
    this.progressLex?.setX(this.progressColor.x + Math.min(Math.max(w * frac, 10), w - 30));
  }

  // ---- "Hint!" box the first time a special tile appears (ArrowHint) ----
  private hintQueue: { kind: string; tile?: GridTile }[] = [];
  private hintOpen = false;

  private queueHint(kind: string) {
    const seen = this.progress.seenHints ?? [];
    if (seen.includes(kind) || this.hintQueue.some((h) => h.kind === kind) || !TILE_HINTS[kind]) return;
    const tile = this.grid.allTiles().find((t) => t.gem === kind || t.status?.kind === kind);
    this.hintQueue.push({ kind, tile });
  }

  /** Shows the next pending hint; returns true if one opened (input stays locked until clicked). */
  private showNextHint(): boolean {
    const h = this.hintQueue.shift();
    if (!h || this.hintOpen) return false;
    const hint = TILE_HINTS[h.kind];
    this.progress.seenHints = [...(this.progress.seenHints ?? []), h.kind];
    setAdvProgress(GAME, this.progress);
    this.hintOpen = true;
    this.busy = true;
    const W = 330;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const style = { fontFamily: 'Georgia, serif', fontSize: '13px' };
    // measure rows first
    const rows = hint.lines.map((line) => line.split('#').map((seg, i) => ({ seg, hi: i % 2 === 1 })));
    const H = 70 + rows.length * 22 + 20;
    const tx = h.tile ? h.tile.bg.x : L(400, 0)[0];
    const bx = Math.min(Math.max(tx, L(W / 2 + 10, 0)[0]), L(790 - W / 2, 0)[0]);
    const by = L(0, 215 - H)[1];
    const box = this.add.nineslice(bx, by + H / 2, 'hint_box', undefined, W, H, 30, 30, 30, 30).setDepth(DEPTH_BANNER + 5);
    objs.push(box);
    objs.push(this.add.image(bx, by + 2, 'hint_title').setDepth(DEPTH_BANNER + 6));
    objs.push(this.add.text(bx, by + 28, hint.title, { ...style, fontSize: '15px', fontStyle: 'bold', color: '#ffe28a' }).setOrigin(0.5, 0).setDepth(DEPTH_BANNER + 6));
    rows.forEach((segs, ri) => {
      const texts = segs.map((s2) => this.add.text(0, 0, s2.seg, { ...style, color: s2.hi ? '#ff6a4d' : '#f2e6c9', fontStyle: s2.hi ? 'bold' : 'normal' }).setDepth(DEPTH_BANNER + 6));
      const total = texts.reduce((a, t) => a + t.width, 0);
      let x = bx - total / 2;
      for (const t of texts) { t.setPosition(x, by + 54 + ri * 22); x += t.width; objs.push(t); }
    });
    objs.push(this.add.text(bx, by + H - 20, 'Click to continue', { ...style, fontSize: '10px', color: '#a08a5f' }).setOrigin(0.5).setDepth(DEPTH_BANNER + 6));
    if (h.tile && this.textures.exists('hint_down')) {
      objs.push(this.add.image(h.tile.bg.x, by + H + 12, 'hint_down').setDepth(DEPTH_BANNER + 6));
      // glow the tile being explained
      this.tweens.add({ targets: [h.tile.bg], alpha: 0.4, yoyo: true, repeat: 5, duration: 250, onComplete: () => h.tile!.bg.setAlpha(1) });
    }
    box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      for (const o of objs) o.destroy();
      this.hintOpen = false;
      if (!this.showNextHint()) {
        this.busy = false;
        this.setButtonEnabled(this.attackBtn, true);
        this.setButtonEnabled(this.scrambleBtn, true);
      }
    });
    return true;
  }

  // ---- speech bubbles (creatures/BookN/dialog/*.lua) ----
  private bubbles: Partial<Record<'lex' | 'enemy', Phaser.GameObjects.Container>> = {};
  private say(who: 'lex' | 'enemy', text: string, ms = 2400) {
    this.bubbles[who]?.destroy();
    const [bx, by] = who === 'lex' ? L(215, 70) : L(590, 70);
    const t = this.add.text(0, 0, text.toUpperCase(), { fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'bold', color: '#1b1409', align: 'center', wordWrap: { width: 200 } }).setOrigin(0.5);
    const w = t.width + 28, h = t.height + 20;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).lineStyle(2, 0x1b1409, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    const tx = who === 'lex' ? -w / 2 + 28 : w / 2 - 28;
    g.fillTriangle(tx - 8, h / 2 - 1, tx + 8, h / 2 - 1, tx + (who === 'lex' ? -14 : 14), h / 2 + 22);
    const c = this.add.container(bx, by, [g, t]).setDepth(DEPTH_BANNER - 1);
    this.bubbles[who] = c;
    this.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 400, onComplete: () => { c.destroy(); if (this.bubbles[who] === c) delete this.bubbles[who]; } });
  }

  private pickLine<T>(lines: T[] | undefined): T | undefined {
    return lines && lines.length ? lines[Math.floor(Math.random() * lines.length)] : undefined;
  }

  private sayIntro() {
    const l = this.pickLine(this.model.creature.dialog?.intro);
    if (l) this.time.delayedCall(900, () => this.say(l.speaker, l.text));
  }

  /** Boss banner at the start of a boss fight. */
  private announce(ref: { boss: boolean }) {
    if (!ref.boss) return;
    const [cx, cy] = L(400, 150);
    const banner = this.add.image(cx, cy, 'boss_banner').setDepth(DEPTH_BANNER);
    const text = this.add.image(cx, cy + 4, 'boss_text').setDepth(DEPTH_BANNER + 1).setDepth(DEPTH_BANNER);
    this.tweens.add({ targets: [banner, text], alpha: 0, delay: 1800, duration: 600, onComplete: () => { banner.destroy(); text.destroy(); } });
  }

  // ---- asset loading ----

  private loadArena() {
    const key = `arena_b${this.progress.book}c${this.progress.chapter}`;
    const apply = () => {
      if (this.arenaBackdrop && this.textures.exists(key)) this.arenaBackdrop.setTexture(key);
    };
    if (this.textures.exists(key)) return apply();
    this.load.image(key, `adventures/images/${key}.png`);
    this.load.once('complete', apply);
    this.load.start();
  }

  private async loadLexActor() {
    try {
      const pam = await loadPamActorAssets(this, 'lex');
      if (!this.sys.isActive()) return;
      // The pam is authored in stage space (800x500): draw 1:1 from the stage origin so
      // projectiles / bites travel the right distance to the enemy.
      const [x, y] = L(-120, STAGE_Y - 10 + 330 * (ACTOR_SCALE - LEX_SCALE)); // keep his feet on the same ground line
      this.lexActor = new PamActor(this, x, y, pam, this.lexIdle(), pamImageTextureKey, { fit: false });
      this.lexActor.root.setScale(LEX_SCALE);
      this.lexActor.root.setDepth(DEPTH_ACTORS);
    } catch (err) {
      console.warn('Failed to load Lex art:', err);
    }
  }

  private lexIdle() {
    return this.model.lex <= this.model.lexMax / 3 ? 'idlesad' : 'idle';
  }

  /** Scenery pams hold stage1..stage7 labels; the stage is the enemy's position in the chapter. */
  private async loadScenery(offsetX = 0, out: PamActor[] = this.sceneryLayers) {
    const { book, chapter, enemy } = this.progress;
    const stage = 1 + Math.min(enemy, 6);
    const [x, y] = L(offsetX, 0);
    for (const [prefix, depth] of [['MG', DEPTH_MIDGROUND], ['FG', DEPTH_FIGHTING_GROUND]] as const) {
      try {
        const pam = await loadPamActorAssets(this, `${prefix}${book}-${chapter}`);
        if (!this.sys.isActive()) return;
        const layer = new PamActor(this, x, y, pam, `stage${stage}`, pamImageTextureKey, { fit: false, still: true });
        layer.root.setDepth(depth);
        out.push(layer);
      } catch (err) {
        console.warn(`No ${prefix} scenery for ${book}-${chapter}:`, err);
      }
    }
  }

  private async loadMonsterActor(stem: string, offsetX = 0) {
    try {
      const pam = await loadPamActorAssets(this, stem);
      if (!this.sys.isActive()) return;
      // Enemy pams are authored right-aligned on the 800px stage (a 400px pam sits at x=400).
      const [x, y] = L(800 - (pam.size?.[0] ?? 400) * ACTOR_SCALE + 200 + offsetX + (ENEMY_OFFSETS[stem]?.x ?? 0), STAGE_Y - 45 + (ENEMY_OFFSETS[stem]?.y ?? 0));
      this.monsterActor = new PamActor(this, x, y, pam, 'idle', pamImageTextureKey, { fit: false });
      this.monsterActor.root.setScale(ACTOR_SCALE);
      this.monsterActor.root.setDepth(DEPTH_ACTORS);
    } catch (err) {
      console.warn(`Failed to load enemy art "${stem}":`, err);
    }
  }

  private cleanup() {
    this.monsterActor?.destroy();
    this.lexActor?.destroy();
    for (const layer of this.sceneryLayers) layer.destroy();
  }

  // ---- hearts ----

  /** hearts.png frames: 0 full, 1 three-quarter, 2 half, 3 quarter, 4 empty. Up to 10 per row. */
  private drawHearts(store: Phaser.GameObjects.Image[], hp: number, max: number, edge: number, cy: number, side: 'left' | 'right') {
    for (const h of store) h.destroy();
    store.length = 0;
    const count = Math.ceil(max);
    const perRow = Math.min(count, 10);
    const pitch = 22;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 10);
      const col = i % 10;
      const fill = Math.max(0, Math.min(1, hp - i));
      const frame = fill >= 1 ? 0 : fill >= 0.75 ? 1 : fill >= 0.5 ? 2 : fill >= 0.25 ? 3 : 4;
      // left side: rows start at the screen edge; right side: rows end at the right edge
      const x = side === 'left' ? edge + col * pitch : edge - (perRow - 1 - col) * pitch;
      const [hx, hy] = L(x, cy + row * 17);
      store.push(this.add.image(hx, hy, 'hearts', frame).setDepth(DEPTH_UI));
    }
  }

  private refreshHearts() {
    this.drawHearts(this.lexHearts, this.model.lex, this.model.lexMax, 14, 38, 'left');
    this.drawHearts(this.enemyHearts, this.model.enemy, this.model.enemyMax, 786, 38, 'right');
    const s: string[] = [];
    if (this.model.stunTurns > 0) s.push('Stunned');
    for (const a of this.model.ailments) s.push(`${a.kind === 'cut' ? 'Cut' : a.kind === 'fire' ? 'Burning' : 'Poisoned'} ${a.turns}`);
    if (this.model.lexMults.some((m) => m.mult < 1)) s.push('Weakened');
    this.statusText.setText(s.join(' · '));
  }

  // ---- turn flow ----

  private gemBonus(tiles: GridTile[]) {
    return tiles.reduce((s, t) => s + (t.gem ? GEM_BONUS_PCT[t.gem] ?? 0 : 0), 0);
  }

  private applyGemEffects(tiles: GridTile[]) {
    for (const t of tiles) {
      switch (t.gem) {
        case 'emerald': this.model.heal(2); break;
        case 'diamond':
          this.model.heal(99); this.model.purifyLex(); this.grid.clearStatuses();
          for (const k of ['health', 'attack', 'purify'] as const) this.addPotion(k);
          break;
        case 'crystal': this.model.purifyLex(); this.grid.clearStatuses(); this.model.lexInvincible = 1; break;
        case 'ruby': this.model.enemyAilments.push({ kind: 'burn', dmg: 0.5, turns: 3 }); break; // APPROX numbers
        case 'amethyst': this.model.enemyAilments.push({ kind: 'poison', dmg: 0.25, turns: 4 }); break;
        case 'saphire': this.model.enemySkips = true; break;
        case 'garnet': this.model.enemyMults.push({ mult: 0.5, turns: 2 }); break;
        default: break;
      }
    }
  }

  private handleSubmit(word: string, tiles: GridTile[]) {
    if (this.over || this.busy) return;
    if (word.length < MIN_WORD_LENGTH || !isValidWord(word)) {
      if (this.cache.audio.exists('battle_bad')) this.sound.play('battle_bad');
      this.setMessage(word.length < MIN_WORD_LENGTH ? `Words need ${MIN_WORD_LENGTH}+ letters` : `"${word.toUpperCase()}" isn't a word`, '#ff8a7a');
      this.grid.clearSelection();
      return;
    }

    this.busy = true;
    this.setButtonEnabled(this.attackBtn, false);
    this.setButtonEnabled(this.scrambleBtn, false);
    if (this.cache.audio.exists('lex_chomp')) this.sound.play('lex_chomp');

    this.showAttackInfo(null);
    // smashed and plagued tiles may be used but deal no damage (tile tooltips)
    const dmgWord = tiles.filter((t) => t.status?.kind !== 'smash' && t.status?.kind !== 'plague').map((t) => t.def.letter).join('');
    const damage = dmgWord.length >= MIN_WORD_LENGTH ? this.model.playerAttack(dmgWord, this.gemBonus(tiles)) : this.model.playerAttack('', 0);
    this.recordBestWord(word, damage);
    this.consumeFloaters();
    this.applyGemEffects(tiles);
    if (this.model.lastWordPurify) this.grid.clearStatuses();
    this.grid.replaceTiles(tiles);
    this.spawnGem(word.length, tiles);
    this.raiseGridTiles();
    const extra = this.model.lastWordHeal ? ` · heals ${this.model.lastWordHeal}` : '';
    this.setMessage(`"${word.toUpperCase()}" hits for ${damage} ${damage === 1 ? 'heart' : 'hearts'}!${extra}`, '#9fd3c7');
    this.lexActor?.play(lexAttackFrame(word), this.lexIdle());
    this.monsterActor?.play('flinch', 'idle');
    this.refreshHearts();

    if (this.model.enemyDead) {
      this.time.delayedCall(700, () => this.handleVictory());
      return;
    }
    this.time.delayedCall(1100, () => this.runEnemyTurn());
  }

  private spawnGem(len: number, replaced: GridTile[]) {
    const gem = rollGem(len, Math.random, this.model.mods.gemChanceMult);
    if (!gem) return;
    const candidates = this.grid.allTiles().filter((t) => !t.gem && !t.status);
    if (candidates.length) {
      this.grid.setGem(pick(replaced.filter((t) => !t.status).concat(candidates)), gem);
      this.queueHint(gem);
    }
  }

  private handleScramble() {
    if (this.over || this.busy || this.model.stunTurns > 0) return;
    this.busy = true;
    this.setButtonEnabled(this.attackBtn, false);
    this.setButtonEnabled(this.scrambleBtn, false);
    this.grid.scramble();
    this.raiseGridTiles();
    this.setMessage('Tiles scrambled — the enemy takes its turn');
    this.time.delayedCall(800, () => this.runEnemyTurn());
  }

  private runEnemyTurn() {
    if (this.over) return;
    const turn = this.model.enemyTurn();
    if (this.model.enemyDead) {
      this.refreshHearts();
      this.handleVictory();
      return;
    }
    this.showEnemyTurn(turn);
    this.refreshHearts();
    if (turn.attackName) this.showAttackInfo(turn.attackName, turn.description);
    this.monsterActor?.play(turn.attackFrame, 'idle');
    if (turn.attackName && Math.random() < 0.5) {
      const classes = this.model.creature.attacks.find((a) => a.name === turn.attackName)?.effects.map((e) => e.cls) ?? [];
      const pool = this.model.creature.dialog?.attack.filter((d) => d.attacker === 'enemy' && classes.includes(d.effect));
      const l = this.pickLine(pool?.length ? pool : this.model.creature.dialog?.attack.filter((d) => d.attacker === 'enemy'));
      if (l) this.time.delayedCall(500, () => this.say(l.speaker, l.text));
    }
    if (turn.damage > 0 || turn.ailmentDamage > 0) {
      this.time.delayedCall(450, () => this.lexActor?.play('flinch', this.lexIdle()));
    }
    this.applyTileRequests(turn.tiles);
    this.grid.tickStatuses();
    this.spreadPlague();
    this.raiseGridTiles();

    if (turn.lexDead) {
      this.time.delayedCall(900, () => this.handleDefeat());
      return;
    }
    if (this.model.stunTurns > 0) {
      // Stunned: the player's turn is skipped and the enemy goes again.
      this.model.stunTurns--;
      this.refreshHearts();
      this.setMessage('Lex is stunned — turn skipped!', '#ff8a7a');
      this.time.delayedCall(1500, () => this.runEnemyTurn());
      return;
    }
    this.time.delayedCall(700, () => {
      if (this.showNextHint()) return;
      this.busy = false;
      this.setButtonEnabled(this.attackBtn, true);
      this.setButtonEnabled(this.scrambleBtn, true);
    });
  }

  private showEnemyTurn(t: EnemyTurn) {
    const parts: string[] = [];
    if (t.skipped) parts.push(`${this.model.creature.name} is stunned and loses its turn`);
    if (t.attackName) parts.push(`${this.model.creature.name} uses ${t.attackName}`);
    if (t.resisted.length) parts.push(`Lex resists ${[...new Set(t.resisted)].join(', ')}`);
    if (t.damage) parts.push(`${t.damage} damage`);
    if (t.ailmentDamage) parts.push(`+${t.ailmentDamage} from ailments`);
    if (t.healed) parts.push(`enemy heals ${t.healed}`);
    if (t.stunned) parts.push('Lex is stunned');
    if (t.weakened) parts.push('Lex is weakened');
    if (t.boosted) parts.push('enemy powered up');
    this.setMessage(parts.join(' · ') || `${this.model.creature.name} hesitates`, '#ffb199');
  }

  private usableTiles() {
    return this.grid.allTiles().filter((t) => !t.status);
  }

  private applyTileRequests(reqs: TileRequest[]) {
    for (const r of reqs) {
      for (let i = 0; i < r.count; i++) {
        const free = this.usableTiles();
        if (!free.length) break;
        const tile = pick(free);
        switch (r.kind) {
          case 'smash':
          case 'lock':
          case 'petrify':
            this.grid.setStatus(tile, { kind: r.kind, turns: r.turns });
            this.queueHint(r.kind);
            break;
          case 'plague':
            this.grid.setStatus(tile, { kind: 'plague', turns: 0 });
            this.queueHint('plague');
            break;
          case 'steal': {
            const gems = this.grid.allTiles().filter((t) => t.gem);
            if (gems.length) this.grid.setGem(pick(gems), undefined);
            break;
          }
          case 'vowel': {
            const vowels = free.filter((t) => VOWELS.includes(t.def.letter));
            const t = vowels.length ? pick(vowels) : undefined;
            if (t) {
              t.def = letterDef(pick(CONSONANTS.split('')));
              t.text.setText(t.def.letter.toUpperCase());
              t.pip?.setFrame(t.def.tier === 'gold' ? 2 : t.def.tier === 'silver' ? 1 : 0);
            }
            break;
          }
        }
      }
    }
  }

  /** APPROX: an unused plague tile infects a random neighbour half the time. */
  private spreadPlague() {
    const grid = this.grid.tiles;
    for (const tile of this.grid.allTiles().filter((t) => t.status?.kind === 'plague')) {
      if (Math.random() > 0.5) continue;
      const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .map(([dr, dc]) => grid[tile.row + dr]?.[tile.col + dc])
        .filter((t): t is GridTile => !!t && !t.status);
      if (neighbours.length) this.grid.setStatus(pick(neighbours), { kind: 'plague', turns: 0 });
    }
  }

  // ---- potions (items/*.lua) ----
  // Original layout: potion bubbles at (46,297) (120,297) (203,297) over pedestals at (51,312) (126,312) (202,312),
  // counts at y=354.
  private buildPotions() {
    const kinds: { kind: Potion; x: number; px: number; tx: number }[] = [
      { kind: 'health', x: 46, px: 51, tx: 94 },
      { kind: 'attack', x: 120, px: 126, tx: 175 },
      { kind: 'purify', x: 203, px: 202, tx: 242 },
    ];
    const potions = this.progress.potions ?? { health: 0, attack: 0, purify: 0 };
    for (const k of kinds) {
      const [px, py] = L(k.px, 312);
      if (this.textures.exists('ui_potion_pedestal')) this.add.image(px, py, 'ui_potion_pedestal').setOrigin(0, 0).setDepth(DEPTH_UI);
      const [ix, iy] = L(k.x, 297);
      const img = this.add.image(ix, iy, `item_${k.kind}`, 0).setOrigin(0, 0).setDepth(DEPTH_UI + 1).setInteractive({ useHandCursor: true });
      img.on('pointerover', () => this.setMessage(POTION_INFO[k.kind], '#e6d3a8'));
      img.on('pointerdown', () => this.usePotion(k.kind));
      const text = this.uiText(k.tx, 354, '', { fontSize: '12px', fontStyle: 'bold', color: '#fde69a' }).setDepth(DEPTH_UI + 2);
      this.potionImgs[k.kind] = img;
      this.potionTexts[k.kind] = text;
      void potions;
    }
    this.refreshPotions();
  }

  private refreshPotions() {
    const potions = this.progress.potions ?? { health: 0, attack: 0, purify: 0 };
    for (const kind of ['health', 'attack', 'purify'] as const) {
      const n = potions[kind];
      this.potionImgs[kind]?.setFrame(n > 0 ? 1 : 0).setAlpha(n > 0 ? 1 : 0.45);
      this.potionTexts[kind]?.setText(n > 0 ? `x${n}` : '');
    }
  }

  private addPotion(kind: Potion) {
    const p = this.progress;
    p.potions = { health: 0, attack: 0, purify: 0, ...(p.potions ?? {}) };
    p.potions[kind] += 1;
    this.refreshPotions();
  }

  private usePotion(kind: Potion) {
    if (this.over || this.busy) return;
    const potions = this.progress.potions;
    if (!potions || potions[kind] <= 0) return;
    if (!this.model.usePotion(kind)) {
      this.setMessage(kind === 'health' ? 'You already have full health!' : 'You are already powered up!', '#ff8a7a');
      return;
    }
    if (kind === 'purify') this.grid.clearStatuses();
    potions[kind] -= 1;
    setAdvProgress(GAME, this.progress);
    this.refreshPotions();
    this.refreshHearts();
    this.setMessage(POTION_USED[kind], '#9fd3c7');
  }

  // ---- treasures (treasures/*.lua) ----
  private buildTreasures() {
    // three domes under the potions: slot centres at x = 55 / 145 / 235
    this.equipped.forEach((id, i) => {
      const t = getTreasure(GAME, id);
      if (!t) return;
      const cx = 55 + i * 90;
      const [px, py] = L(cx - 35, 365);
      if (this.textures.exists('ui_treasure_pedestal')) this.add.image(px, py, 'ui_treasure_pedestal').setOrigin(0, 0).setDepth(DEPTH_UI);
      const key = `treasure_${t.book}-${t.number}`;
      if (this.textures.exists(key)) {
        const [ix, iy] = L(cx, 392);
        this.add.image(ix, iy, key).setOrigin(0.5, 0).setDepth(DEPTH_UI + 1);
      }
      const name = this.uiText(cx, 500, t.name, { fontSize: '10px', color: '#f2e6c9', align: 'center', wordWrap: { width: 84 } }).setOrigin(0.5, 0).setDepth(DEPTH_UI + 1);
      const info = name.setInteractive({ useHandCursor: true }).on('pointerover', () => this.setMessage(`${t.name}: ${t.lore}`, '#ffe28a'));
    });
  }

  private showTreasureAward(id: string) {
    const t = getTreasure(GAME, id);
    if (!t) return;
    const key = `treasure_${t.book}-${t.number}`;
    const [cx, cy] = L(400, 170);
    const box = this.add.rectangle(cx, cy, 420, 150, 0x000000, 0.75).setStrokeStyle(2, 0xd4af37).setDepth(DEPTH_BANNER);
    const parts: Phaser.GameObjects.GameObject[] = [box];
    if (this.textures.exists(key)) parts.push(this.add.image(cx - 170, cy, key).setDepth(DEPTH_BANNER + 1).setScale(1.4));
    parts.push(
      this.add.text(cx + 20, cy - 40, `New treasure: ${t.name}`, { fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#ffe28a', wordWrap: { width: 300 } }).setOrigin(0.5, 0).setDepth(DEPTH_BANNER + 1),
      this.add.text(cx + 20, cy, t.lore, { fontFamily: 'Georgia, serif', fontSize: '13px', color: '#e6d3a8', wordWrap: { width: 300 } }).setOrigin(0.5, 0).setDepth(DEPTH_BANNER + 1),
    );
    if (this.cache.audio.exists('newtreasure')) this.sound.play('newtreasure');
    this.tweens.add({ targets: parts, alpha: 0, delay: 3600, duration: 600, onComplete: () => parts.forEach((o) => o.destroy()) });
  }

  /** Walk to the next enemy: Lex walks, the scenery pans and the new enemy slides in. */
  private async advanceEnemy() {
    const p = this.progress;
    const ref = this.chapter.enemies[p.enemy];
    const creature = getCreature(GAME, ref.id);
    if (!creature) return;
    this.attackBtn.setVisible(true);
    this.setButtonEnabled(this.attackBtn, false);
    this.setButtonEnabled(this.scrambleBtn, false);
    this.over = false;
    this.busy = true;
    this.bubbles.enemy?.destroy();
    this.monsterActor?.destroy();
    this.monsterActor = undefined;
    this.model = new BattleModel(creature, levelForXp(p.xp), p.hearts, Math.random, combineTreasures(this.equipped));
    this.nameText.setText(creature.name).setScale(1);
    if (this.nameText.width > 78) this.nameText.setScale(78 / this.nameText.width);
    this.showAttackInfo(null);
    this.refreshHearts();
    this.setMessage('');

    const SLIDE = 800;
    const oldLayers = this.sceneryLayers;
    this.sceneryLayers = [];
    await Promise.all([this.loadScenery(SLIDE), this.loadMonsterActor(creaturePam(creature), SLIDE)]);
    if (!this.sys.isActive()) return;
    this.lexActor?.play('walk', 'walk');
    const movers = [...oldLayers, ...this.sceneryLayers, ...(this.monsterActor ? [this.monsterActor] : [])].map((a) => a.root);
    this.tweens.add({
      targets: movers,
      x: '-=' + SLIDE,
      duration: 1800,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        for (const l of oldLayers) l.destroy();
        this.lexActor?.play('idle', 'idle');
        this.announce(ref);
        this.sayIntro();
        this.showEnemyInfo();
        this.busy = false;
        this.setButtonEnabled(this.attackBtn, true);
        this.setButtonEnabled(this.scrambleBtn, true);
        this.setMessage(`Spell a word of ${MIN_WORD_LENGTH}+ letters to attack`);
      },
    });
  }

  // ---- win / lose ----

  private handleVictory() {
    this.over = true;
    const p = this.progress;
    const creature = this.model.creature;
    const ref = this.chapter.enemies[p.enemy];
    if (this.cache.audio.exists('crowdcheer')) this.sound.play('crowdcheer');
    this.monsterActor?.play('death', '');
    const dl = this.pickLine(creature.dialog?.death);
    if (dl) this.say(dl.speaker, dl.text, 2200);

    const levelBefore = levelForXp(p.xp);
    p.xp += creature.xp ?? 0;
    const levelAfter = levelForXp(p.xp);
    const leveled = levelAfter > levelBefore;
    p.hearts = leveled ? undefined : this.model.lex;

    const drop = rollPotion(this.model.mods.potionDropBonus);
    if (drop) this.addPotion(drop);
    const tid = creature.treasure;
    const newTreasure = tid && !(p.treasures ?? []).includes(tid) && getTreasure(GAME, tid) ? tid : null;
    if (newTreasure) p.treasures = [...(p.treasures ?? []), newTreasure];

    const nextEnemy = p.enemy + 1;
    const chapterDone = nextEnemy >= this.chapter.enemies.length;
    const msgs = [`${creature.name} defeated!`];
    if (creature.xp) msgs.push(`+${creature.xp} XP`);
    if (leveled) { msgs.push(`Level ${levelAfter}!`); this.time.delayedCall(700, () => this.showLevelUp(levelAfter)); }
    this.updateXpBar();
    if (drop) msgs.push(`found a ${drop} potion`);
    if (newTreasure) this.time.delayedCall(900, () => this.showTreasureAward(newTreasure));
    this.setMessage(msgs.join(' · '), '#ffe28a');

    if (ref.checkpoint && !chapterDone) {
      p.checkpoint = nextEnemy;
      const [cx, cy] = L(400, 170);
      const cp = this.add.image(cx, cy, 'checkpoint_reached').setDepth(DEPTH_BANNER);
      this.tweens.add({ targets: cp, alpha: 0, delay: 1500, duration: 600, onComplete: () => cp.destroy() });
    }

    let label = 'Next Enemy';
    if (chapterDone) {
      p.done = [...new Set([...p.done, `${p.book}-${p.chapter}`])];
      p.hearts = undefined;
      p.enemy = 0;
      p.checkpoint = 0;
      const nextChapter = getChapter(GAME, p.book, p.chapter + 1);
      if (nextChapter) p.chapter += 1;
      else {
        const nextBook = bookNumbers(GAME).find((b) => b > p.book);
        if (nextBook !== undefined) {
          p.book = nextBook;
          p.chapter = getBook(GAME, nextBook)!.chapters[0].n;
        } else label = 'Adventure Complete!';
      }
      if (label !== 'Adventure Complete!') label = 'Next Chapter';
    } else {
      p.enemy = nextEnemy;
    }
    this.updateProgress();
    setAdvProgress(GAME, p);

    this.time.delayedCall(1400, () =>
      this.showContinue(label, () => {
        if (label === 'Adventure Complete!') this.scene.start('MainMenu');
        else if (chapterDone) this.scene.start('ChapterIntro');
        else this.advanceEnemy();
      }),
    );
  }

  /** Replaces the Attack button with a single action once the fight is decided. */
  private showContinue(label: string, onClick: () => void) {
    this.attackBtn.setVisible(false);
    const [bx, by] = L(400, 567);
    const btn = makeButton(this, bx, by, 220, 44, label, () => {
      btn.bg.destroy();
      btn.text.destroy();
      onClick();
    });
    btn.bg.setDepth(DEPTH_UI + 2);
    btn.text.setDepth(DEPTH_UI + 3);
  }

  private handleDefeat() {
    this.over = true;
    const p = this.progress;
    this.lexActor?.play('death', '');
    this.setMessage('Lex has fallen! Retry from the last checkpoint.', '#ff8a7a');
    p.enemy = p.checkpoint;
    p.hearts = undefined;
    setAdvProgress(GAME, p);
    this.time.delayedCall(1400, () => this.showContinue('Retry', () => this.scene.restart()));
  }
}
