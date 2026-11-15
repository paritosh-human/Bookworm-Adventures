import Phaser from 'phaser';
import { randomLetter, letterDef, TIER_COLORS } from './letterTiles';
import type { LetterDef, Tier } from './types';

export interface GridTile {
  def: LetterDef;
  row: number;
  col: number;
  burn: number;
  bg: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  burnBar?: Phaser.GameObjects.Rectangle;
  pip?: Phaser.GameObjects.Image;
  /** Adventures: gem bonus on this tile (amethyst, ruby, ...). */
  gem?: string;
  /** Adventures: enemy-inflicted tile state. smash/petrify/lock disable the tile. */
  status?: { kind: 'smash' | 'petrify' | 'lock' | 'plague'; turns: number };
  overlay?: Phaser.GameObjects.Image;
}

export const DISABLING = ['smash', 'petrify', 'lock'];

export interface LetterGridOptions {
  scene: Phaser.Scene;
  rows: number;
  cols: number;
  x: number;
  y: number;
  tileSize: number;
  showBurn?: boolean;
  /** Real tile-art texture keys per tier. Falls back to flat-color
   * rectangles (tiles not yet extracted for this mode) when omitted. */
  tileTextures?: Record<Tier, string>;
  /** Spritesheet key for real tiles: frame 0 = normal, frame 1 = selected. */
  tileSheet?: string;
  /** Spritesheet key for tier pips (frame 0/1/2 = bronze/silver/gold). */
  pipSheet?: string;
  /** Deluxe chains adjacent tiles; Adventures lets you pick tiles in any order. */
  requireAdjacent?: boolean;
  onSelectionChange: (word: string, tiles: GridTile[]) => void;
  onSubmit: (word: string, tiles: GridTile[]) => void;
}

const MAX_BURN = 8;
const TIER_FRAME: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };

/** Shared letter-grid widget: chain-select adjacent tiles into a word.
 * Used by both the Deluxe puzzle mode and the Adventures battle mode. */
export class LetterGrid {
  private opts: LetterGridOptions;
  tiles: GridTile[][] = [];
  private selected: GridTile[] = [];

  constructor(opts: LetterGridOptions) {
    this.opts = opts;
    this.build();
  }

  private build() {
    const { rows, cols } = this.opts;
    for (let r = 0; r < rows; r++) {
      const row: GridTile[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(this.createTile(r, c));
      }
      this.tiles.push(row);
    }
  }

  private makeTileBg(px: number, py: number, tier: Tier): Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image {
    const { scene, tileSize } = this.opts;
    if (this.opts.tileSheet && scene.textures.exists(this.opts.tileSheet)) {
      return scene.add.image(px, py, this.opts.tileSheet, 0).setDisplaySize(tileSize, tileSize).setInteractive({ useHandCursor: true });
    }
    const textureKey = this.opts.tileTextures?.[tier];
    if (textureKey && scene.textures.exists(textureKey)) {
      return scene.add.image(px, py, textureKey).setDisplaySize(tileSize, tileSize).setInteractive({ useHandCursor: true });
    }
    return scene.add
      .rectangle(px, py, tileSize, tileSize, TIER_COLORS[tier])
      .setStrokeStyle(2, 0x2b2015)
      .setInteractive({ useHandCursor: true });
  }

  private createTile(row: number, col: number): GridTile {
    const { scene, x, y, tileSize, showBurn } = this.opts;
    const def = letterDef(randomLetter());
    const px = x + col * (tileSize + 6);
    const py = y + row * (tileSize + 6);

    const bg = this.makeTileBg(px, py, def.tier);
    const text = scene.add
      .text(px, py, def.letter.toUpperCase(), {
        fontFamily: 'Georgia, serif',
        fontSize: `${Math.floor(tileSize * 0.45)}px`,
        fontStyle: 'bold',
        color: '#1b1409',
      })
      .setOrigin(0.5);

    let burnBar: Phaser.GameObjects.Rectangle | undefined;
    if (showBurn) {
      burnBar = scene.add
        .rectangle(px, py + tileSize / 2 - 3, tileSize, 4, 0xc0392b)
        .setOrigin(0.5, 0.5);
      burnBar.setScale(0, 1);
    }

    let pip: Phaser.GameObjects.Image | undefined;
    if (this.opts.pipSheet && scene.textures.exists(this.opts.pipSheet)) {
      pip = scene.add.image(px + tileSize / 2 - 9, py + tileSize / 2 - 9, this.opts.pipSheet, TIER_FRAME[def.tier]);
    }
    const tile: GridTile = { def, row, col, burn: 0, bg, text, burnBar, pip };
    bg.on('pointerdown', () => this.trySelect(tile));
    return tile;
  }

  private isAdjacent(a: GridTile, b: GridTile): boolean {
    return a !== b && Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
  }

  private trySelect(tile: GridTile) {
    if (tile.status && DISABLING.includes(tile.status.kind)) return;
    const last = this.selected[this.selected.length - 1];
    if (this.selected.includes(tile)) {
      this.deselect(tile);
      return;
    }
    if (last && this.opts.requireAdjacent !== false && !this.isAdjacent(last, tile)) return;
    this.selected.push(tile);
    this.refreshHighlight();
    this.emitSelection();
  }

  /** Remove one tile from the word (any position). */
  deselect(tile: GridTile) {
    this.selected = this.selected.filter((t) => t !== tile);
    this.refreshHighlight();
    this.emitSelection();
  }

  private refreshHighlight() {
    for (const row of this.tiles) {
      for (const tile of row) this.applyLook(tile);
    }
  }

  /** Re-skin a tile from its selected / gem / status state. */
  applyLook(tile: GridTile) {
    const isSelected = this.selected.includes(tile);
    const scene = this.opts.scene;
    if (tile.bg instanceof Phaser.GameObjects.Image && this.opts.tileSheet) {
      const st = tile.status?.kind;
      tile.bg.clearTint();
      if (st === 'smash' && scene.textures.exists('tile_smashed')) tile.bg.setTexture('tile_smashed', 0);
      else if (st === 'plague' && scene.textures.exists('tile_plagued')) tile.bg.setTexture('tile_plagued', isSelected ? 1 : 0);
      else if (st === 'petrify') { tile.bg.setTexture(this.opts.tileSheet, 0); tile.bg.setTint(0x777777); }
      else if (tile.gem && scene.textures.exists(`gem_${tile.gem}`)) {
        tile.bg.setTexture(`gem_${tile.gem}`);
        if (isSelected) tile.bg.setTint(0xffe28a);
      } else tile.bg.setTexture(this.opts.tileSheet, isSelected ? 1 : 0);
      if (st === 'lock') {
        if (!tile.overlay && scene.textures.exists('tile_locked')) {
          tile.overlay = scene.add.image(tile.bg.x, tile.bg.y, 'tile_locked').setDisplaySize(this.opts.tileSize, this.opts.tileSize);
        }
        tile.overlay?.setDepth(tile.bg.depth + 0.5);
      } else if (tile.overlay) {
        tile.overlay.destroy();
        tile.overlay = undefined;
      }
    } else if (tile.bg instanceof Phaser.GameObjects.Image) {
      if (isSelected) tile.bg.setTint(0xffe28a);
      else tile.bg.clearTint();
    } else {
      tile.bg.setStrokeStyle(isSelected ? 4 : 2, isSelected ? 0xffe28a : 0x2b2015);
    }
  }

  /** Adventures helpers ------------------------------------------------ */
  allTiles(): GridTile[] {
    return this.tiles.flat();
  }

  setGem(tile: GridTile, gem: string | undefined) {
    tile.gem = gem;
    this.applyLook(tile);
  }

  setStatus(tile: GridTile, status: GridTile['status']) {
    tile.status = status;
    this.selected = this.selected.filter((t) => t !== tile);
    this.applyLook(tile);
    this.emitSelection();
  }

  /** One enemy round: decrement timed statuses; expired tiles get fresh letters. */
  tickStatuses() {
    for (const tile of this.allTiles()) {
      const st = tile.status;
      if (!st || st.kind === 'plague') continue;
      st.turns--;
      if (st.turns <= 0) {
        tile.status = undefined;
        this.replaceTiles([tile]);
      }
    }
  }

  clearStatuses() {
    for (const tile of this.allTiles()) {
      if (tile.status) {
        tile.status = undefined;
        this.applyLook(tile);
      }
    }
  }

  /** Re-roll every usable tile (Scramble button). */
  scramble() {
    this.replaceTiles(this.allTiles().filter((t) => !t.status || !DISABLING.includes(t.status.kind)), true);
  }

  private emitSelection() {
    this.opts.onSelectionChange(this.currentWord(), [...this.selected]);
  }

  currentWord(): string {
    return this.selected.map((t) => t.def.letter).join('');
  }

  clearSelection() {
    this.selected = [];
    this.refreshHighlight();
    this.emitSelection();
  }

  submit() {
    if (this.selected.length < 2) return;
    this.opts.onSubmit(this.currentWord(), [...this.selected]);
  }

  replaceTiles(tilesToReplace: GridTile[], keepGems = false) {
    for (const tile of tilesToReplace) {
      if (!keepGems) tile.gem = undefined;
      tile.status = undefined;
      tile.def = letterDef(randomLetter());
      tile.text.setText(tile.def.letter.toUpperCase());
      tile.pip?.setFrame(TIER_FRAME[tile.def.tier]);
      if (tile.bg instanceof Phaser.GameObjects.Image && this.opts.tileSheet) {
        this.applyLook(tile); // real tile art is tier-independent; the pip carries the tier
      } else if (tile.bg instanceof Phaser.GameObjects.Image) {
        const textureKey = this.opts.tileTextures?.[tile.def.tier];
        if (textureKey) tile.bg.setTexture(textureKey).setDisplaySize(this.opts.tileSize, this.opts.tileSize);
      } else {
        tile.bg.setFillStyle(TIER_COLORS[tile.def.tier]);
      }
      tile.burn = 0;
      tile.burnBar?.setScale(0, 1);
    }
    this.clearSelection();
  }

  /** Advances the burn timer on every tile except the ones just used.
   * Returns true once any tile has burned out (Deluxe mode game-over). */
  tickBurn(exclude: GridTile[]): boolean {
    let gameOver = false;
    for (const row of this.tiles) {
      for (const tile of row) {
        if (exclude.includes(tile)) continue;
        tile.burn += 1;
        tile.burnBar?.setScale(Math.min(tile.burn / MAX_BURN, 1), 1);
        if (tile.burn >= MAX_BURN) gameOver = true;
      }
    }
    return gameOver;
  }

  destroy() {
    for (const row of this.tiles) {
      for (const tile of row) {
        tile.bg.destroy();
        tile.text.destroy();
        tile.burnBar?.destroy();
        tile.pip?.destroy();
        tile.overlay?.destroy();
      }
    }
  }
}
