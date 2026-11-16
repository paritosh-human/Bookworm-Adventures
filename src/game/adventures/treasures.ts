// Treasure effects, from treasures/*.lua (names + lore) and their hooks
// (ProcessAttackEffects / RespondToAttack / ModifyPotionDropRate / gem hooks).
// The scripts keep magnitudes in native tables, so numbers marked APPROX are mine.

export interface TreasureMods {
  /** flat hearts added to every word (Heph's Hammer, Hand of Hercules) */
  flatDamage: number;
  /** extra hearts for a specific word (letters / word-class bonuses) */
  wordBonus: (word: string) => number;
  /** hearts healed when a matching word is played (Tablet of the Ages) */
  wordHeal: (word: string) => number;
  /** hearts removed from every enemy hit (Aegis, Poseidon's Shield) */
  damageReduction: number;
  stunResist: number; // 0..1 chance
  poisonResist: number;
  fireResist: number;
  tileResist: number; // smash / lock / petrify
  /** extra hearts for Lex (Golden Fleece) */
  extraHearts: number;
  gemChanceMult: number;
  gemBonusAdd: number;
  /** extra turns on poison / fire (Grim's Timepiece, Wanderer's Hourglass) */
  ailmentExtraTurns: number;
  /** chance a word stuns the enemy for its next turn (Magic Pen) */
  enemyStunChance: number;
  potionDropBonus: number;
  healPotionMult: number;
  attackPotionMult: number;
  /** words containing "qua" also purify Lex (Quadrumvir Signet) */
  purifyOnWord: (word: string) => boolean;
}

const COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'violet', 'pink', 'black', 'white', 'brown', 'gray', 'grey', 'crimson', 'scarlet', 'indigo', 'azure', 'teal', 'gold', 'silver', 'tan', 'cyan', 'amber', 'lime', 'navy', 'rose', 'ivory', 'maroon', 'beige'];
const METALS = ['iron', 'steel', 'gold', 'silver', 'copper', 'tin', 'lead', 'zinc', 'brass', 'bronze', 'nickel', 'metal', 'chrome', 'platinum', 'mercury', 'cobalt', 'titanium', 'alloy', 'aluminum'];
const MAMMALS = ['cat', 'dog', 'bat', 'rat', 'cow', 'pig', 'ape', 'elk', 'fox', 'bear', 'deer', 'lion', 'wolf', 'goat', 'seal', 'mole', 'mouse', 'horse', 'sheep', 'tiger', 'whale', 'camel', 'zebra', 'otter', 'moose', 'rabbit', 'monkey', 'hyena', 'badger', 'beaver', 'donkey', 'walrus', 'weasel', 'gorilla', 'giraffe', 'panther', 'leopard', 'buffalo', 'dolphin', 'hamster', 'kitten', 'puppy', 'lamb', 'bull', 'boar', 'hare', 'lynx', 'mule', 'ox', 'yak', 'gnu', 'ram', 'sow'];

let REAL: Record<string, Set<string>> = {};
/** Swap in the game's real word lists (scripts/wordlists: colors, metals, animals). */
export function useWordlists(l: Record<string, string[]>) {
  REAL = Object.fromEntries(Object.entries(l).map(([k, v]) => [k, new Set(v)]));
}
const has = (list: string[]) => (w: string) => {
  const key = list === COLORS ? 'colors' : list === METALS ? 'metals' : list === MAMMALS ? 'animals' : '';
  return (key && REAL[key] ? REAL[key].has(w.toLowerCase()) : false) || list.includes(w.toLowerCase());
};
const count = (w: string, ch: string) => [...w.toLowerCase()].filter((c) => c === ch).length;

export function emptyMods(): TreasureMods {
  return {
    flatDamage: 0, wordBonus: () => 0, wordHeal: () => 0, damageReduction: 0, stunResist: 0, poisonResist: 0,
    fireResist: 0, tileResist: 0, extraHearts: 0, gemChanceMult: 1, gemBonusAdd: 0, ailmentExtraTurns: 0,
    enemyStunChance: 0, potionDropBonus: 0, healPotionMult: 1, attackPotionMult: 1, purifyOnWord: () => false,
  };
}

/** Combine the equipped treasures (script class names) into one set of modifiers. */
export function combineTreasures(ids: string[]): TreasureMods {
  const m = emptyMods();
  const wordBonuses: ((w: string) => number)[] = [];
  const wordHeals: ((w: string) => number)[] = [];
  for (const id of ids) {
    switch (id) {
      case 'HephaestusHammer': m.flatDamage += 0.5; break;
      case 'HandOfHercules': m.flatDamage += 1; wordBonuses.push((w) => (has(METALS)(w) ? 1 : 0)); break;
      case 'ArtemisBow': wordBonuses.push((w) => 0.25 * (count(w, 'x') + count(w, 'y') + count(w, 'z'))); break; // APPROX
      case 'ArchOfApollo': wordBonuses.push((w) => 0.75 * (count(w, 'x') + count(w, 'y') + count(w, 'z'))); break; // APPROX
      case 'WoodenParrot': wordBonuses.push((w) => 0.25 * count(w, 'r')); break; // APPROX: R tiles count double
      case 'TomeOfTheAncients': wordBonuses.push((w) => (has(COLORS)(w) ? 1 : 0)); break;
      case 'TabletOfTheAges': wordBonuses.push((w) => (has(COLORS)(w) ? 1 : 0)); wordHeals.push((w) => (has(COLORS)(w) ? 1 : 0)); break;
      case 'WolfbaneNecklace': wordBonuses.push((w) => (has(MAMMALS)(w) ? 1 : 0)); break;
      case 'SlayerTalisman': wordBonuses.push((w) => (has(MAMMALS)(w) ? 1.5 : 0)); break;
      case 'HopeOfQua': wordBonuses.push((w) => (w.toLowerCase().includes('qua') ? 1 : 0)); break;
      case 'AegisOfAthena': m.damageReduction += 1; break;
      case 'PoseidonsShield': m.damageReduction += 0.5; break;
      case 'IcarusSandals': m.stunResist = Math.max(m.stunResist, 0.5); break;
      case 'TheseusBoots': m.stunResist = 1; break;
      case 'CloakOfShades': m.poisonResist = Math.max(m.poisonResist, 0.5); break;
      case 'RobeOfTheShiftingEye': m.poisonResist = Math.max(m.poisonResist, 0.5); m.fireResist = Math.max(m.fireResist, 0.5); break;
      case 'GorgonHead': m.tileResist = Math.max(m.tileResist, 0.5); break; // petrify only in the original; APPROX: all tile effects
      case 'GargantuanGirdle': m.tileResist = Math.max(m.tileResist, 0.5); break;
      case 'ImmortalWrappings': m.tileResist = Math.max(m.tileResist, 0.8); break;
      case 'GoldenFleece': m.extraHearts += 1; break;
      case 'EndlessGemPouch': m.gemChanceMult = Math.max(m.gemChanceMult, 2); break;
      case 'JeweledKey': m.gemChanceMult = Math.max(m.gemChanceMult, 1.5); break;
      case 'ScimitarOfJustice': m.gemBonusAdd += 0.1; break;
      case 'FatesCoin': m.ailmentExtraTurns += 3; break;
      case 'WanderersCharm': m.ailmentExtraTurns += 1; break;
      case 'MagicPen': m.enemyStunChance = Math.max(m.enemyStunChance, 0.2); break;
      case 'MagistratesMap': m.potionDropBonus += 0.15; break;
      case 'SilverCompass': m.potionDropBonus += 0.3; break;
      case 'MagicGenieLamp': m.healPotionMult = Math.max(m.healPotionMult, 1.5); m.attackPotionMult = Math.max(m.attackPotionMult, 1.5); break;
      case 'SphinxLantern': m.healPotionMult = Math.max(m.healPotionMult, 1.5); break;
      default: break;
    }
    if (id === 'HopeOfQua') {
      const prev = m.purifyOnWord;
      m.purifyOnWord = (w) => prev(w) || w.toLowerCase().includes('qua');
    }
  }
  m.wordBonus = (w) => wordBonuses.reduce((s, f) => s + f(w), 0);
  m.wordHeal = (w) => wordHeals.reduce((s, f) => s + f(w), 0);
  return m;
}
