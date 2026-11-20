// A single persisted on/off switch for all game audio (music + sfx), independent of the
// per-game save data. Phaser's sound manager is shared across every scene, so muting it in
// any one scene silences the whole game.
const KEY = 'bookworm-adventures-muted';

export function isMuted(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(KEY, muted ? '1' : '0');
}
