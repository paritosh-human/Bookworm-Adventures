// Shapes of src/assets/adventures/game_data.json, extracted from the original
// game's scripts by scripts/extract_game_data.py.

export interface EffectDef {
  cls: string;
  args: unknown[];
}

export interface AttackDef {
  effects: EffectDef[];
  /** Turns before the attack can be used / the turn it is guaranteed (see urgency in rules.ts). */
  min: number;
  max: number;
  /** Animation label played on the creature's .pam (attack1, attack2, ...). */
  frame: string;
  name: string;
  description: string;
}

export interface CreatureDef {
  id: string;
  name: string;
  /** Health in hearts (quarter-heart granularity). */
  hearts: number;
  xp: number;
  treasure: string | null;
  pam: string[];
  attacks: AttackDef[];
  defense: string | null;
  book: number;
  defenses?: { list: { name: string; description: string }[]; bonusMult: number };
  dialog?: {
    intro: { text: string; speaker: 'lex' | 'enemy' }[];
    attack: { text: string; speaker: 'lex' | 'enemy'; attacker: string; effect: string }[];
    death: { text: string; speaker: 'lex' | 'enemy' }[];
  };
}

export interface EnemyRef {
  id: string;
  boss: boolean;
  checkpoint: boolean;
}

export interface ChapterDef {
  n: number;
  /** screen position (800x600 layout) of the chapter icon on the map */
  x: number;
  y: number;
  title: string;
  description: string;
  enemies: EnemyRef[];
  arena?: { id: string; path: string | null };
}

export interface BookDef {
  title: string | null;
  mapX: number;
  mapY: number;
  chapters: ChapterDef[];
}

export interface TreasureDef {
  id: string;
  name: string;
  lore: string;
  book: number;
  number: number;
}

export interface GameData {
  books: Record<string, BookDef>;
  creatures: Record<string, CreatureDef>;
  treasures: Record<string, TreasureDef>;
  wordlists: Record<string, string[]>;
}
