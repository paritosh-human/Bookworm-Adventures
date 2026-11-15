// First-appearance "Hint!" boxes for special tiles. Strings are the original game's tooltip text
// (TooltipText.luc constants); "#...#" marks the highlighted words.
export interface Hint {
  title: string;
  lines: string[];
}

export const TILE_HINTS: Record<string, Hint> = {
  topaz: { title: 'Topaz Tile:', lines: ['Gives 10% damage boost.'] },
  amethyst: { title: 'Amethyst Tile:', lines: ['#Poisons enemy#.', 'Also gives 15% damage boost.'] },
  saphire: { title: 'Sapphire Tile:', lines: ['#Freezes enemy# for 1 turn.', 'Also gives 25% damage boost.'] },
  emerald: { title: 'Emerald Tile:', lines: ['#Heals Lex# for two hearts.', 'Also gives 20% damage boost.'] },
  garnet: { title: 'Garnet Tile:', lines: ['#Weakens enemy# attacks.', 'Also gives 30% damage boost.'] },
  ruby: { title: 'Ruby Tile:', lines: ['#Burns enemy#.', 'Also gives 35% damage boost.'] },
  crystal: { title: 'Crystal Tile:', lines: ['#Purifies# Lex and the grid.', '#Lex becomes invincible# for 1 turn.', 'Also gives 50% damage boost.'] },
  diamond: { title: 'Diamond Tile:', lines: ['Fully #heals Lex#.', 'Gives #1 of each potion# type.', 'Also gives 100% damage boost.'] },
  smash: { title: 'Smashed Tile:', lines: ['Tile still usable but causes #no damage# to enemy.', 'Tile returns to normal when number reaches zero.'] },
  lock: { title: 'Locked Tile:', lines: ['Tile #cannot be selected#.'] },
  plague: { title: 'Plagued Tile:', lines: ['Tile causes #no damage# to enemy and', 'may #infect other tiles# if not used or purified.'] },
  petrify: { title: 'Petrified Tile:', lines: ['Tile #cannot be selected# until it breaks free.'] },
};
