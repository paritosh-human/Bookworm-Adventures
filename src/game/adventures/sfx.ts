import type Phaser from 'phaser';
import { flushLoader } from '../pam/pamLoader';
import sounds from '../../assets/adventures/sounds.json';
import pamSoundsV1 from '../../assets/adventures/pam_sounds.json';
import pamSoundsV2 from '../../assets/adventures/pam_sounds_vol2.json';
import { assetBase, curGame } from './gameContext';

const modules = import.meta.glob('../../assets/adventures/sounds_vol2.json', { eager: true }) as Record<string, { default: unknown }>;
const SOUNDS_V2 = (Object.values(modules)[0]?.default ?? {}) as Record<string, Cues>;

type Cues = { engage?: string; death?: string; hit?: string; attacks: Record<string, string> };
const CUES = sounds as Record<string, Cues>;

export const LEX_ATTACK_SOUND: Record<string, string> = {
  attack1: 'BluntImpact_Dry.wav', attack2: 'BluntImpact_Dry.wav', attack3: 'BluntImpact_Dry.wav',
  attack4: 'BluntImpact_WithWoosh.ogg', attack5: 'fire3.ogg', attack6: 'SwordSpearImpact_WithWoosh.ogg', attack7: 'fire6.ogg',
};

export function creatureCues(id: string): Cues | undefined {
  return (curGame() === 'adventures2' ? SOUNDS_V2 : CUES)[id];
}

/** Play a file from public/adventures/sounds/fx, loading it on first use. */
export function playSfx(scene: Phaser.Scene, file: string | undefined, volume = 0.7, shared = false) {
  if (!file) return;
  const base = shared ? 'adventures' : assetBase();
  const key = `fx_${base}_${file}`;
  if (scene.cache.audio.exists(key)) {
    scene.sound.play(key, { volume });
    return;
  }
  scene.load.audio(key, `${base}/sounds/fx/${file}`);
  flushLoader(scene).then(() => {
    if (scene.sys.isActive() && scene.cache.audio.exists(key)) scene.sound.play(key, { volume });
  });
}

/** File for a SOUND_* id used by a `playsound` command inside a .pam clip. */
export function pamSoundFile(id: string): string | undefined {
  return ((curGame() === 'adventures2' ? pamSoundsV2 : pamSoundsV1) as Record<string, string>)[id];
}
