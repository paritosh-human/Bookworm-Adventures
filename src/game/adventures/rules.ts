// Core Bookworm Adventures rules, taken from the original scripts:
//  - letter bonuses: scripts/main.lua (LETTER_BONUSES)
//  - word value / damage:  TileEngine.GetWordValue / GetFullWordValue (adjusted
//    length -> hearts lookup; the lookup table itself lives in the game's native
//    code and is the community-documented one)
//  - enemy attack choice: AttackBaseClass.GetUrgency + common.UrgencyChooser
// Health is measured in hearts with quarter-heart granularity.
import type { AttackDef } from './types.ts';

export const MIN_WORD_LENGTH = 3;

/** Extra "letters" each letter is worth towards a word's adjusted length. */
export const LETTER_BONUS: Record<string, number> = {
  a: 0, b: 0.25, c: 0.25, d: 0, e: 0, f: 0.25, g: 0, h: 0.25, i: 0, j: 0.75, k: 0.75,
  l: 0, m: 0.25, n: 0, o: 0, p: 0.25, q: 1.75, r: 0, s: 0, t: 0, u: 0, v: 0.5, w: 0.5,
  x: 1, y: 0.5, z: 1,
};

/** Pip frame on a tile: 0 bronze, 1 silver, 2 gold (same thresholds as Tile.lua). */
export function pipFrame(letter: string): 0 | 1 | 2 {
  const b = LETTER_BONUS[letter.toLowerCase()] ?? 0;
  if (b <= 0) return 0;
  return b < 0.75 ? 1 : 2;
}

/** Base damage in hearts by adjusted word length. */
export const DAMAGE_BY_LENGTH: Record<number, number> = {
  3: 0.5, 4: 0.75, 5: 1, 6: 1.5, 7: 2, 8: 2.75, 9: 3.5, 10: 4.5, 11: 5.5, 12: 6.75,
  13: 8, 14: 9.5, 15: 11, 16: 13,
};

export const floorQuarter = (x: number) => Math.floor(x * 4 + 1e-9) / 4;
export const ceilQuarter = (x: number) => Math.ceil(x * 4 - 1e-9) / 4;

export function adjustedLength(word: string): number {
  let sum = 0;
  for (const ch of word.toLowerCase()) sum += 1 + (LETTER_BONUS[ch] ?? 0);
  return Math.ceil(sum - 1e-9);
}

export function baseDamage(word: string): number {
  if (word.length < MIN_WORD_LENGTH) return 0;
  const len = Math.min(16, Math.max(MIN_WORD_LENGTH, adjustedLength(word)));
  return DAMAGE_BY_LENGTH[len];
}

/** Hearts of damage for a word. `gemPct` is the summed gem bonus (0.15 = +15%). */
export function wordDamage(word: string, gemPct = 0, offenseBonus = 0, outMult = 1): number {
  const base = baseDamage(word);
  if (base <= 0) return 0;
  const boosted = ceilQuarter(base * (1 + gemPct)) + base * offenseBonus;
  return Math.max(0.25, floorQuarter(boosted * outMult));
}

/** Which Lex attack animation to play for a word (LexDefaultAttack.SetupPreAttack). */
export function lexAttackFrame(word: string, rand: () => number = Math.random): string {
  const len = adjustedLength(word);
  const pair: [number, number] =
    len <= 3 ? [1, 2] : len <= 4 ? [2, 3] : len <= 6 ? [3, 4] : len <= 8 ? [4, 5] : len <= 10 ? [5, 6] : len <= 12 ? [6, 7] : [7, 7];
  return `attack${rand() < 0.5 ? pair[0] : pair[1]}`;
}

// ---- enemy attack selection ----

export interface AttackState {
  def: AttackDef;
  counter: number;
}

export const newAttackStates = (defs: AttackDef[]): AttackState[] =>
  defs.map((def) => ({ def, counter: 0 }));

export function urgency(s: AttackState): number {
  const { min, max } = s.def;
  if (s.counter < min) return 0; // CanAttack: rate counter must reach min
  if (max === min) return 100;
  if (max < min) return 1;
  const pct = ((s.counter - min + 1) / (max - min + 1)) * 100;
  return Math.min(100, Math.max(1, Math.floor(pct)));
}

/** common.UrgencyChooser: urgency>=100 attacks are forced (random among them),
 * otherwise a weighted roulette over the available attacks. */
export function chooseAttack(states: AttackState[], rand: () => number = Math.random): AttackState | null {
  const avail = states.map((s) => ({ s, u: urgency(s) })).filter((x) => x.u > 0);
  if (avail.length === 0) return null;
  const forced = avail.filter((x) => x.u >= 100);
  if (forced.length) return forced[Math.floor(rand() * forced.length)].s;
  const total = avail.reduce((t, x) => t + x.u, 0);
  let roll = rand() * total;
  for (const x of avail) {
    roll -= x.u;
    if (roll < 0) return x.s;
  }
  return avail[avail.length - 1].s;
}

// ---- gems ----
// Gem effects come from tiles/*Tile.lua (emerald heals 2, crystal purifies, garnet halves the
// enemy's next two attacks, diamond heals fully + grants potions); texts in hints.ts.
export const GEM_BONUS_PCT: Record<string, number> = {
  // BattleEngine.lua GEM_BONUS_PCT (topaz's 10% is from its tooltip)
  topaz: 0.1, amethyst: 0.15, saphire: 0.25, emerald: 0.2, garnet: 0.3, ruby: 0.35, crystal: 0.5, diamond: 1.0,
};
export const GEM_POWER: Record<string, number> = {
  topaz: 1, amethyst: 1, ruby: 2, saphire: 2, emerald: 2, garnet: 2, crystal: 3, diamond: 3,
};
const GEM_TIERS: string[][] = [
  ['topaz', 'amethyst'],
  ['ruby', 'saphire', 'emerald', 'garnet'],
  ['crystal', 'diamond'],
];

export const BONUS_CHANCE = { base: 10, max: 50, perExtraLetter: 5 };

/** Possibly spawn a gem for a word of `len` letters; returns the gem id or null. */
export function rollGem(len: number, rand: () => number = Math.random, chanceMult = 1): string | null {
  const chance = Math.min(BONUS_CHANCE.max * chanceMult, (BONUS_CHANCE.base + BONUS_CHANCE.perExtraLetter * Math.max(0, len - 3)) * chanceMult);
  if (rand() * 100 >= chance) return null;
  const tier = len >= 8 ? (rand() < 0.4 ? 2 : 1) : len >= 5 ? (rand() < 0.35 ? 1 : 0) : 0;
  const pool = GEM_TIERS[tier];
  return pool[Math.floor(rand() * pool.length)];
}

// ---- potions ----
// items/*.lua: Health "Restores lost health" (+2 hearts), Attack Bonus "Next attack gets x2 damage",
// Purification clears ailments + damaged tiles. Drop chances live in native code (APPROX).
export type Potion = 'health' | 'attack' | 'purify';
export const POTION_DROP_CHANCE = 0.35;
export const POTION_HEAL = 2;
export const POTION_ATTACK_MULT = 2;

export function rollPotion(bonus = 0, rand: () => number = Math.random): Potion | null {
  if (rand() >= POTION_DROP_CHANCE + bonus) return null;
  return (['health', 'attack', 'purify'] as const)[Math.floor(rand() * 3)];
}
