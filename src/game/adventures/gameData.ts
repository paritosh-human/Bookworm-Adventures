import adventures from '../../assets/adventures/game_data.json';
import adventuresVol2 from '../../assets/adventures/game_data_vol2.json';
import lore from '../../assets/adventures/creatures.json';
import type { BookDef, ChapterDef, CreatureDef, GameData, TreasureDef } from './types';

export type GameId = 'adventures' | 'adventures2';

const DATA: Record<GameId, GameData> = {
  adventures: adventures as unknown as GameData,
  adventures2: adventuresVol2 as unknown as GameData,
};

const lowerIndex = new Map<GameId, Map<string, CreatureDef>>();

export function getBook(game: GameId, book: number): BookDef | undefined {
  return DATA[game].books[String(book)];
}

export function bookNumbers(game: GameId): number[] {
  return Object.keys(DATA[game].books).map(Number).sort((a, b) => a - b);
}

export function getChapter(game: GameId, book: number, chapter: number): ChapterDef | undefined {
  return getBook(game, book)?.chapters.find((c) => c.n === chapter);
}

/** Creature ids in the books don't always match script ids in case/spelling
 * (e.g. PharoahofOld), so look them up case-insensitively. */
export function getCreature(game: GameId, id: string): CreatureDef | undefined {
  let idx = lowerIndex.get(game);
  if (!idx) {
    idx = new Map(Object.values(DATA[game].creatures).map((c) => [c.id.toLowerCase(), c]));
    lowerIndex.set(game, idx);
  }
  return DATA[game].creatures[id] ?? idx.get(id.toLowerCase());
}

/** The folder the creature's art lives in (pam stems are shared across games' public/adventures/pam). */
export function creaturePam(c: CreatureDef): string {
  return c.pam[0];
}

export function getTreasure(game: GameId, id: string): TreasureDef | undefined {
  return DATA[game].treasures?.[id];
}

const LORE = new Map((lore as { name: string; lore?: string | null }[]).map((c) => [c.name, (c.lore ?? '').replace(/@/g, '').replace(/\s*\n\s*/g, ' ').trim()]));
/** The enemy's story blurb from its .lore file (Books 1-3 enemies only). */
export function getLore(name: string): string {
  return LORE.get(name) ?? '';
}

/** status_icons.png cel for an effect (the effect's mLoreIconCel; -1 = no icon). */
export const EFFECT_ICON: Record<string, number> = {
  DamageEffect: -1, DamageAilment: 2, PoisonAilment: 1, FireAilment: 0, StunEffect: 4, FreezeEffect: 5,
  PetrifyEffect: 6, DestroyedTileEffect: 10, LockTileEffect: 11, PoisonTileEffect: 12, HealEffect: 15,
  PurifyEffect: 15, StealTileEffect: 16, VowelToConsonantEffect: 17,
  DamageMultiplierEffect: 3, // APPROX: 3 = weaken / 7 = boost (cels not named in the scripts)
};
