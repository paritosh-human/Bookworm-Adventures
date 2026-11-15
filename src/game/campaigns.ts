import type { Campaign } from './types';
import adventures1Creatures from '../assets/adventures/creatures.json';

// Real monster roster (names + lore) pulled from the original game's
// Book1/Book2/Book3 creature scripts — see scripts/extract_pak.py. HP and
// attack are an approximated difficulty curve: the real per-monster combat
// stats are compiled into PopCap Lua bytecode (.luc files) in the original
// game, not stored as plain data, so they weren't directly extractable.
export const CAMPAIGNS: Record<string, Campaign> = {
  adventures1: {
    id: 'adventures1',
    title: 'Bookworm Adventures',
    monsters: adventures1Creatures,
  },
  adventures2: {
    id: 'adventures2',
    title: 'Bookworm Adventures Volume 2',
    monsters: [
      { name: 'Sand Wyrm', maxHp: 35, attackMin: 2, attackMax: 6 },
      { name: 'Mummy Scribe', maxHp: 48, attackMin: 3, attackMax: 7 },
      { name: 'The Forgotten King', maxHp: 70, attackMin: 4, attackMax: 9 },
    ],
  },
};
