export type Tier = 'bronze' | 'silver' | 'gold';

export interface LetterDef {
  letter: string;
  points: number;
  tier: Tier;
}

export interface Monster {
  name: string;
  maxHp: number;
  attackMin: number;
  attackMax: number;
  lore?: string | null;
  book?: number;
}

export interface Campaign {
  id: string;
  title: string;
  monsters: Monster[];
}

export interface BattleProgress {
  monsterIndex: number;
  wins: number;
}

/** Where the player is in an Adventures game (positions into game_data.json). */
export interface AdvProgress {
  book: number;
  chapter: number;
  /** index into the chapter's enemy list */
  enemy: number;
  /** enemy index the player restarts from after a defeat (last checkpoint) */
  checkpoint: number;
  xp: number;
  /** Lex's hearts carried between fights (undefined = full) */
  hearts?: number;
  /** chapters already beaten, "book-chapter" */
  done: string[];
  potions?: { health: number; attack: number; purify: number };
  /** treasure script ids won from bosses, oldest first; the newest three are equipped (APPROX) */
  treasures?: string[];
}

export interface SaveData {
  deluxeHighScore: number;
  battle: Record<string, BattleProgress>;
  adv: Record<string, AdvProgress>;
}
