import Phaser from 'phaser';
import { decodePam, type PamInfo } from './pamDecoder';
import { assetBase, keyPrefix } from '../adventures/gameContext';

// Some image names in the .pam data carry a literal "(add)" tag (an
// animator/editor annotation, not part of the actual filename on disk).
function cleanImageName(imageName: string): string {
  return imageName.replace(/^\(add\)/, '');
}

export function pamImageTextureKey(imageName: string): string {
  return `pamimg_${keyPrefix()}${cleanImageName(imageName)}`;
}

/** Runs the scene loader until nothing is pending. Several things queue files at once (pams, arena,
 * minimap, sounds); Phaser ignores start() while a load is running and never revisits files that were
 * added during its final pass, so keep restarting until the list is empty. */
export function flushLoader(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const l = scene.load;
      if (l.list.size === 0 && !l.isLoading()) return resolve();
      if (!l.isLoading()) l.start();
      l.once(Phaser.Loader.Events.COMPLETE, () => setTimeout(check, 0));
    };
    check();
  });
}
const runLoader = flushLoader;

const pamCache = new Map<string, PamInfo>();
const cacheKey = (stem: string) => `${assetBase()}/${stem}`;

/** Loads a creature's .pam file plus every body-part image it references,
 * then returns the decoded animation data. Caches by file so switching back
 * to a previously-seen monster is instant. */
export async function loadPamActorAssets(scene: Phaser.Scene, pamFileStem: string): Promise<PamInfo> {
  const cached = pamCache.get(cacheKey(pamFileStem));
  if (cached) return cached;

  const binaryKey = `pambin_${keyPrefix()}${pamFileStem}`;
  scene.load.binary(binaryKey, `${assetBase()}/pam/${pamFileStem}.pam`);
  await runLoader(scene);
  const buffer = scene.cache.binary.get(binaryKey) as ArrayBuffer;
  const pam = decodePam(buffer);

  for (const img of pam.image) {
    const key = pamImageTextureKey(img.name);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `${assetBase()}/pam/images_rgba/${cleanImageName(img.name)}.png`);
    }
  }
  await runLoader(scene);

  pamCache.set(cacheKey(pamFileStem), pam);
  return pam;
}
