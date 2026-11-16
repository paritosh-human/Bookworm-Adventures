import type { GameId } from './gameData';

// Which of the two Adventures games is being played; decides save slot, data and asset folders.
let current: GameId = 'adventures';
export const setGame = (g: GameId) => { current = g; };
export const curGame = (): GameId => current;
/** public/ folder holding the per-game art (pams, arenas, map, sound cues). */
export const assetBase = (): string => (current === 'adventures2' ? 'adventures-vol2' : 'adventures');
/** texture-key prefix so Vol. 1 and Vol. 2 art with the same file name never collide */
export const keyPrefix = (): string => (current === 'adventures2' ? 'v2_' : '');
