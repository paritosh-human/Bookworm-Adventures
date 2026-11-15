import adventures from '../../assets/adventures/game_data.json';
import adventuresVol2 from '../../assets/adventures/game_data_vol2.json';
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
