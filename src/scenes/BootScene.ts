import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('tile', 'deluxe/images/tile.gif');
    this.load.image('tile_gold', 'deluxe/images/tile_gold.gif');

    this.load.audio('buttonclick', 'deluxe/sounds/buttonclick.ogg');
    this.load.audio('chomp', 'deluxe/sounds/chomp.ogg');
    this.load.audio('bad', 'deluxe/sounds/bad.ogg');
    this.load.audio('screenburngameover', 'deluxe/sounds/screenburngameover.ogg');

    for (const name of ['ui_top', 'ui_bottom1', 'ui_bottom2']) {
      this.load.image(`battle_${name}`, `adventures/images/battle_${name}.png`);
    }
    this.load.image('battle_curtain_left', 'adventures/images/battle_curtain_left.jpg');
    this.load.image('battle_curtain_right', 'adventures/images/battle_curtain_right.jpg');
    this.load.spritesheet('battle_tile', 'adventures/images/battle_tile_basic.jpg', { frameWidth: 50, frameHeight: 50 });
    this.load.spritesheet('battle_pips', 'adventures/images/battle_pips.png', { frameWidth: 11, frameHeight: 11 });
    this.load.spritesheet('hearts', 'adventures/images/hearts.png', { frameWidth: 23, frameHeight: 19 });
    this.load.spritesheet('btn_attack', 'adventures/images/btn_attack.png', { frameWidth: 244, frameHeight: 60 });
    this.load.spritesheet('btn_enemy_attacking', 'adventures/images/btn_enemy_attacking.png', { frameWidth: 244, frameHeight: 60 });
    this.load.spritesheet('btn_scramble', 'adventures/images/btn_scramble.png', { frameWidth: 168, frameHeight: 37 });
    this.load.spritesheet('btn_menu', 'adventures/images/btn_menu.png', { frameWidth: 168, frameHeight: 37 });
    this.load.image('ui_potion_pedestal', 'adventures/images/ui_potion_pedestal.png');
    this.load.image('ui_treasure_pedestal', 'adventures/images/ui_treasure_pedestal.png');
    this.load.image('lore_plate', 'adventures/images/lore_plate.png');
    for (const [k, w, h] of [['health', 62, 64], ['attack', 69, 65], ['purify', 53, 63]] as const) {
      this.load.spritesheet(`item_${k}`, `adventures/images/item_${k}.png`, { frameWidth: w, frameHeight: h });
    }
    for (const b of [1, 2, 3]) for (let n = 1; n <= 10; n++) this.load.image(`treasure_${b}-${n}`, `adventures/images/treasure_${b}-${n}.png`);
    this.load.audio('newtreasure', 'adventures/sounds/newtreasure.ogg');
    this.load.image('bestword_paper', 'adventures/images/bestword_paper.png');
    this.load.image('bestword_title', 'adventures/images/bestword_title.png');
    for (const k of ['box', 'title', 'down']) this.load.image(`hint_${k}`, `adventures/images/hint_${k}.png`);
    this.load.image('boss_banner', 'adventures/images/boss_banner.png');
    this.load.image('boss_text', 'adventures/images/boss_text.png');
    this.load.image('checkpoint_reached', 'adventures/images/checkpoint_reached.png');
    this.load.spritesheet('tile_smashed', 'adventures/images/tile_smashed.png', { frameWidth: 50, frameHeight: 50 });
    this.load.spritesheet('tile_plagued', 'adventures/images/tile_plagued.png', { frameWidth: 50, frameHeight: 50 });
    this.load.image('tile_locked', 'adventures/images/tile_locked.png');
    for (const gem of ['amethyst', 'crystal', 'diamond', 'emerald', 'garnet', 'ruby', 'saphire', 'topaz']) {
      this.load.image(`gem_${gem}`, `adventures/images/gem_${gem}.png`);
    }
    this.load.image('heart_full', 'adventures/images/heart_full.png');
    this.load.image('heart_empty', 'adventures/images/heart_empty.png');
    for (const book of [1, 2, 3]) {
      this.load.image(`arena_book${book}`, `adventures/images/arena_book${book}.jpg`);
    }
    this.load.image('lex_happy', 'adventures/images/portrait_lex_happy.jpg');
    this.load.image('lex_worried', 'adventures/images/portrait_lex_worried.jpg');
    this.load.audio('lex_chomp', 'adventures/sounds/lex_chomp.ogg');
    this.load.audio('battle_bad', 'adventures/sounds/buzzer.ogg');
    this.load.audio('crowdcheer', 'adventures/sounds/crowdcheer.ogg');
  }

  create() {
    this.scene.start('MainMenu');
  }
}
