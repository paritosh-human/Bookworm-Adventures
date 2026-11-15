// Pure battle state machine (no Phaser) so the rules can be unit-tested.
// Effect semantics come from the decompiled effects/*.lua + creature scripts;
// where the scripts defer to native code the choice is marked APPROX.
import type { CreatureDef, EffectDef } from './types.ts';
import { chooseAttack, newAttackStates, wordDamage, POTION_ATTACK_MULT, POTION_HEAL, type AttackState, type Potion } from './rules.ts';
import { emptyMods, type TreasureMods } from './treasures.ts';

export interface Ailment {
  kind: 'cut' | 'poison' | 'fire';
  dmg: number;
  turns: number;
}

export type TileEffectKind = 'smash' | 'lock' | 'plague' | 'petrify' | 'fire' | 'vowel' | 'steal';
export interface TileRequest {
  kind: TileEffectKind;
  count: number;
  /** how many turns the tile stays disabled (smash/lock/petrify) */
  turns: number;
}

export interface EnemyTurn {
  /** Lex was stunned: his turn was skipped (enemy does not attack this round, status text only) */
  attackName: string;
  attackFrame: string;
  description: string;
  damage: number;
  healed: number;
  stunned: boolean;
  newAilments: Ailment[];
  tiles: TileRequest[];
  ailmentDamage: number;
  weakened: boolean;
  boosted: boolean;
  lexDead: boolean;
  /** the enemy was stunned by a treasure and did nothing */
  skipped: boolean;
  /** Lex's treasures resisted part of the attack */
  resisted: string[];
}

export const LEX_BASE_HEARTS = 3;
/** Cumulative XP needed to reach level n+1 (APPROX curve: gXPLevel is not in the scripts). */
export const xpForLevel = (level: number) => 10 * level ** 3;
export const levelForXp = (xp: number) => {
  let l = 1;
  while (xp >= xpForLevel(l)) l++;
  return l;
};

/** Lex.GiveLevelBonus cycles on level % 3: 0 -> health, 1 -> attack, 2 -> defense. */
export function levelBonuses(level: number) {
  let health = 0, attack = 0, defense = 0;
  for (let l = 2; l <= level; l++) {
    const k = l % 3;
    if (k === 0) health += 1; // APPROX: +1 heart
    else if (k === 1) attack += 0.1; // APPROX: +10% damage
    else defense += 0.25; // APPROX: -0.25 hearts per hit
  }
  return { health, attack, defense };
}

const floorQ = (x: number) => Math.floor(x * 4 + 1e-9) / 4;

export class BattleModel {
  readonly lexMax: number;
  lex: number;
  readonly enemyMax: number;
  enemy: number;
  stunTurns = 0;
  ailments: Ailment[] = [];
  /** Lex outgoing damage multipliers (weaken), each lasting `turns` of his attacks */
  lexMults: { mult: number; turns: number }[] = [];
  /** Enemy outgoing multiplier for its next attack(s) */
  enemyMults: { mult: number; turns: number }[] = [];
  attacks: AttackState[];
  turn = 0;
  private bonus: ReturnType<typeof levelBonuses>;
  readonly mods: TreasureMods;
  /** the enemy loses its next turn (Magic Pen) */
  enemySkips = false;
  /** hearts Lex healed by the last word (Tablet of the Ages) */
  lastWordHeal = 0;
  lastWordPurify = false;

  readonly creature: CreatureDef;
  private rand: () => number;

  constructor(creature: CreatureDef, level = 1, lexHearts?: number, rand: () => number = Math.random, mods: TreasureMods = emptyMods()) {
    this.creature = creature;
    this.rand = rand;
    this.mods = mods;
    this.bonus = levelBonuses(level);
    this.lexMax = LEX_BASE_HEARTS + this.bonus.health + mods.extraHearts;
    this.lex = lexHearts ?? this.lexMax;
    this.enemyMax = creature.hearts ?? 1;
    this.enemy = this.enemyMax;
    this.attacks = newAttackStates(creature.attacks);
  }

  get lexDead() { return this.lex <= 0; }
  get enemyDead() { return this.enemy <= 0; }

  /** Lex plays a word. Returns the damage dealt. */
  playerAttack(word: string, gemPct = 0): number {
    let out = 1;
    if (this.lexMults.length) {
      out = this.lexMults.reduce((m, e) => m * e.mult, 1);
      for (const e of this.lexMults) e.turns--;
      this.lexMults = this.lexMults.filter((e) => e.turns > 0);
    }
    let dmg = wordDamage(word, gemPct + this.mods.gemBonusAdd * (gemPct > 0 ? 1 : 0), this.bonus.attack, out);
    if (dmg > 0) dmg = floorQ(dmg + (this.mods.flatDamage + this.mods.wordBonus(word)) * out);
    this.enemy = Math.max(0, this.enemy - dmg);
    this.lastWordHeal = this.mods.wordHeal(word);
    if (this.lastWordHeal) this.heal(this.lastWordHeal);
    this.lastWordPurify = this.mods.purifyOnWord(word);
    if (this.lastWordPurify) this.purifyLex();
    if (this.mods.enemyStunChance > 0 && this.rand() < this.mods.enemyStunChance) this.enemySkips = true;
    return dmg;
  }

  heal(amount: number) {
    this.lex = Math.min(this.lexMax, this.lex + amount);
  }

  /** Use a potion. Returns false when it would do nothing (the original shows a 'not needed' dialog). */
  usePotion(kind: Potion): boolean {
    if (kind === 'health') {
      if (this.lex >= this.lexMax) return false;
      this.heal(POTION_HEAL * this.mods.healPotionMult);
      return true;
    }
    if (kind === 'attack') {
      if (this.lexMults.some((m) => m.mult > 1)) return false; // one power-up at a time
      this.lexMults.push({ mult: POTION_ATTACK_MULT + (this.mods.attackPotionMult - 1), turns: 1 });
      return true;
    }
    this.purifyLex();
    return true;
  }

  /** Remove every ailment/stun from Lex (Crystal gem, purify potion). */
  purifyLex() {
    this.ailments = [];
    this.stunTurns = 0;
    this.lexMults = this.lexMults.filter((e) => e.mult >= 1);
  }

  /** The enemy takes its turn. */
  enemyTurn(): EnemyTurn {
    this.turn++;
    for (const s of this.attacks) s.counter++;
    const skipped = this.enemySkips;
    this.enemySkips = false;
    const pick = skipped ? null : chooseAttack(this.attacks, this.rand);
    const result: EnemyTurn = {
      attackName: '', attackFrame: 'attack1', description: '', damage: 0, healed: 0, stunned: false,
      newAilments: [], tiles: [], ailmentDamage: 0, weakened: false, boosted: false, lexDead: false, skipped, resisted: [],
    };
    if (pick) {
      const def = pick.def;
      result.attackName = def.name;
      result.attackFrame = def.frame;
      result.description = def.description;
      pick.counter = 0;
      this.applyEffects(def.effects, result);
    }
    // ailments tick after the attack (newly applied ones tick immediately)
    for (const a of this.ailments) {
      this.lex = Math.max(0, this.lex - a.dmg);
      result.ailmentDamage += a.dmg;
      a.turns--;
    }
    this.ailments = this.ailments.filter((a) => a.turns > 0);
    result.lexDead = this.lex <= 0;
    return result;
  }

  private applyEffects(effects: EffectDef[], r: EnemyTurn) {
    // damage first, then buffs so "boost next attack" applies to the following attack
    const ordered = [...effects].sort((a, b) => Number(a.cls === 'DamageMultiplierEffect') - Number(b.cls === 'DamageMultiplierEffect'));
    for (const e of ordered) {
      const a = e.args as number[];
      switch (e.cls) {
        case 'DamageEffect': {
          let d = a[0] ?? 0;
          if (this.enemyMults.length) {
            d *= this.enemyMults.reduce((m, x) => m * x.mult, 1);
            for (const x of this.enemyMults) x.turns--;
            this.enemyMults = this.enemyMults.filter((x) => x.turns > 0);
          }
          d = floorQ(d - this.bonus.defense - this.mods.damageReduction);
          d = this.mods.damageReduction > 0 ? Math.max(0, d) : Math.max(0.25, d);
          if (d === 0) r.resisted.push('damage');
          this.lex = Math.max(0, this.lex - d);
          r.damage += d;
          break;
        }
        case 'StunEffect':
          if (this.rand() < this.mods.stunResist) r.resisted.push('stun');
          else if (this.rand() * 100 < (a[1] ?? 100)) { this.stunTurns += a[0] ?? 1; r.stunned = true; }
          break;
        case 'FreezeEffect': // APPROX: a frozen board acts like a stun for its duration
          this.stunTurns += a[0] ?? 1; r.stunned = true;
          break;
        case 'DamageAilment': r.newAilments.push(this.addAilment('cut', a)); break;
        case 'PoisonAilment':
          if (this.rand() < this.mods.poisonResist) r.resisted.push('poison');
          else r.newAilments.push(this.addAilment('poison', a, this.mods.ailmentExtraTurns));
          break;
        case 'FireAilment':
          if (this.rand() < this.mods.fireResist) r.resisted.push('fire');
          else r.newAilments.push(this.addAilment('fire', a, this.mods.ailmentExtraTurns));
          break;
        case 'DamageMultiplierEffect': {
          const mult = a[0], turns = a[1] ?? 1;
          if ((e.args as unknown[])[4] === true) { this.enemyMults.push({ mult, turns }); r.boosted = true; }
          else { this.lexMults.push({ mult, turns }); r.weakened = true; }
          break;
        }
        case 'HealEffect': {
          const before = this.enemy;
          this.enemy = Math.min(this.enemyMax, this.enemy + (a[0] ?? 0));
          r.healed += this.enemy - before;
          break;
        }
        case 'PurifyEffect': break; // the enemy has no ailments in this model
        case 'DestroyedTileEffect': this.pushTile(r, { kind: 'smash', count: a[1] ?? 1, turns: a[0] ?? 2 }); break;
        case 'LockTileEffect': this.pushTile(r, { kind: 'lock', count: 1, turns: a[0] ?? 5 }); break;
        case 'PoisonTileEffect': r.tiles.push({ kind: 'plague', count: 1, turns: 0 }); break;
        case 'PetrifyEffect': this.pushTile(r, { kind: 'petrify', count: a[0] ?? 1, turns: 3 }); break;
        case 'StealTileEffect': r.tiles.push({ kind: 'steal', count: 1, turns: 0 }); break;
        case 'VowelToConsonantEffect': r.tiles.push({ kind: 'vowel', count: a[0] ?? 1, turns: 0 }); break;
        default: break;
      }
    }
  }

  /** args: [damagePerTurn, ?, turns, ?] - the second value is unused by the scripts we read (APPROX). */
  private pushTile(r: EnemyTurn, req: TileRequest) {
    if (this.rand() < this.mods.tileResist) r.resisted.push('tile');
    else r.tiles.push(req);
  }

  private addAilment(kind: Ailment['kind'], a: number[], extraTurns = 0): Ailment {
    const ail = { kind, dmg: a[0] ?? 0.25, turns: (a[2] ?? 3) + extraTurns };
    this.ailments.push(ail);
    return ail;
  }
}
