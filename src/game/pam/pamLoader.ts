import Phaser from 'phaser';
import { decodePam, type PamInfo } from './pamDecoder';

// Some image names in the .pam data carry a literal "(add)" tag (an
// animator/editor annotation, not part of the actual filename on disk).
function cleanImageName(imageName: string): string {
  return imageName.replace(/^\(add\)/, '');
}

export function pamImageTextureKey(imageName: string): string {
  return `pamimg_${cleanImageName(imageName)}`;
}

function runLoader(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

const pamCache = new Map<string, PamInfo>();

/** Loads a creature's .pam file plus every body-part image it references,
 * then returns the decoded animation data. Caches by file so switching back
 * to a previously-seen monster is instant. */
export async function loadPamActorAssets(scene: Phaser.Scene, pamFileStem: string): Promise<PamInfo> {
  const cached = pamCache.get(pamFileStem);
  if (cached) return cached;

  const binaryKey = `pambin_${pamFileStem}`;
  scene.load.binary(binaryKey, `adventures/pam/${pamFileStem}.pam`);
  await runLoader(scene);
  const buffer = scene.cache.binary.get(binaryKey) as ArrayBuffer;
  const pam = decodePam(buffer);

  for (const img of pam.image) {
    const key = pamImageTextureKey(img.name);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `adventures/pam/images_rgba/${cleanImageName(img.name)}.png`);
    }
  }
  await runLoader(scene);

  pamCache.set(pamFileStem, pam);
  return pam;
}
