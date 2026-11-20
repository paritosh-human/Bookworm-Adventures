import Phaser from 'phaser';
import { flushLoader } from './pam/pamLoader';

// Background music, decoded once from the original music.mo3 tracker module (see
// scripts/extract_music.sh) into 16 separate loopable .ogg tracks under public/adventures/music/.
// Shared by both Adventures games — Volume 2's own extracted data has no music file of its own;
// its scripts reference the same MUSIC_* song-position constants as Volume 1, so it reuses this.
const MUSIC_BASE = 'adventures/music/';

let current: Phaser.Sound.BaseSound | undefined;
let currentTrack: number | undefined;

function trackKey(n: number): string {
  return `music_song_${String(n).padStart(2, '0')}`;
}

async function loadTrack(scene: Phaser.Scene, n: number): Promise<void> {
  const key = trackKey(n);
  if (scene.cache.audio.exists(key)) return;
  scene.load.audio(key, `${MUSIC_BASE}song_${String(n).padStart(2, '0')}.ogg`);
  await flushLoader(scene);
}

/** Plays track `n` on loop, replacing whatever is currently playing. A no-op if it's already
 * the one playing, so callers can call this on every scene update without restarting it. */
export async function playMusic(scene: Phaser.Scene, n: number, volume = 0.45): Promise<void> {
  if (currentTrack === n && current?.isPlaying) return;
  await loadTrack(scene, n);
  stopMusic();
  const key = trackKey(n);
  current = scene.sound.add(key, { loop: true, volume });
  current.play();
  currentTrack = n;
}

export function stopMusic(): void {
  current?.stop();
  current?.destroy();
  current = undefined;
  currentTrack = undefined;
}
