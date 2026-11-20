// The original music.mo3 bundles 16 subsongs with no names, just numeric positions (the scripts
// reference them symbolically, e.g. MUSIC_GREEK_MAP / MUSIC_ARABIAN_BATTLE / MUSIC_MONSTER_BOSS_FIGHT
// for Books 1-3 — but the actual numeric values those constants hold live outside the decompiled
// .luc scripts, so they couldn't be recovered directly). This mapping is a best-effort guess from
// each subsong's rendered length (scripts/extract_music.sh): 4 long (~3-4 min) tracks look like
// loopable "ambient" cues (one shared map theme + 3 per-book battle themes), and several ~40-55s
// tracks look like punchier boss themes. IT HASN'T BEEN VERIFIED BY EAR — if a track sounds wrong
// for its book, swap the index here.
export interface BookMusic {
  map: number;
  battle: number;
  boss: number;
}

const DEFAULT: BookMusic = { map: 0, battle: 5, boss: 6 };

const BOOK_MUSIC: Record<number, BookMusic> = {
  1: { map: 0, battle: 5, boss: 6 }, // Greek (Book 1: Oedipus Lex)
  2: { map: 0, battle: 8, boss: 7 }, // Arabian (Book 2)
  3: { map: 0, battle: 9, boss: 10 }, // "Monster" (Book 3)
  // Volume 2's books (0, 4, 5, 6) share the same module but have no clear mapping of their own —
  // cycle through the same three battle/boss pairs as a reasonable placeholder.
  0: DEFAULT,
  4: { map: 0, battle: 5, boss: 6 },
  5: { map: 0, battle: 8, boss: 7 },
  6: { map: 0, battle: 9, boss: 10 },
};

export function musicFor(book: number): BookMusic {
  return BOOK_MUSIC[book] ?? DEFAULT;
}

/** Played on the main menu and each game's Resume/New Game/Reset menu — reuses the same
 * long ambient track as the chapter maps rather than guessing at a distinct menu cue. */
export const MENU_TRACK = 0;
