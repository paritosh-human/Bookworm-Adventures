// Per-enemy position tweaks, in 800x600 layout pixels, added on top of the default enemy position.
// Key = the enemy's .pam name (the `pam[0]` of the creature in game_data.json, e.g. "1Hound",
// "6Grim"). +x moves right, +y moves down.
//
//   '1Hound': { x: -20, y: 10 },
export const ENEMY_OFFSETS: Record<string, { x?: number; y?: number }> = { 'WarHound': {x: -50}};
