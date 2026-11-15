import type { LetterDef, Tier } from './types';

// Approximate Scrabble-style point values, standing in for the real
// Bookworm bronze/silver/gold tables until those are pulled from the
// original game data.
const POINTS: Record<string, number> = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8,
  k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1,
  u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

// Frequency weights used to draw random tiles — common letters show up far
// more often than rare ones, same idea as the original board generator.
const FREQUENCY: Record<string, number> = {
  a: 8, b: 2, c: 3, d: 4, e: 11, f: 2, g: 2, h: 3, i: 7, j: 1,
  k: 1, l: 4, m: 2, n: 6, o: 7, p: 2, q: 1, r: 6, s: 6, t: 7,
  u: 3, v: 1, w: 2, x: 1, y: 2, z: 1,
};

function tierForPoints(points: number): Tier {
  if (points <= 2) return 'bronze';
  if (points <= 4) return 'silver';
  return 'gold';
}

const WEIGHTED_POOL: string[] = Object.entries(FREQUENCY).flatMap(([letter, weight]) =>
  Array(weight).fill(letter),
);

export function randomLetter(): string {
  return WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
}

export function letterDef(letter: string): LetterDef {
  const lower = letter.toLowerCase();
  const points = POINTS[lower] ?? 1;
  return { letter: lower, points, tier: tierForPoints(points) };
}

export const TIER_COLORS: Record<Tier, number> = {
  bronze: 0xa05a2c,
  silver: 0xb8c0c8,
  gold: 0xd4af37,
};

// The real Deluxe tile art only has two visual tiers (plain wood vs. gold),
// so bronze/silver share the same sprite — only the gold cutoff is real art.
export const DELUXE_TILE_TEXTURES: Record<Tier, string> = {
  bronze: 'tile',
  silver: 'tile',
  gold: 'tile_gold',
};
