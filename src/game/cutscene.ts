// Plays the original game's Flash (.swf) cutscenes using Ruffle — an
// open-source Flash Player emulator (WASM) — since Flash itself was
// discontinued in 2020 and no browser can run .swf natively anymore.
// This shows the *actual* original cutscene file, not a re-encoded video.

interface RufflePlayerElement extends HTMLElement {
  ruffle(): { load(url: string): Promise<void> };
}

interface RuffleAPI {
  createPlayer(): RufflePlayerElement;
}

declare global {
  interface Window {
    RufflePlayer?: { newest(): RuffleAPI };
  }
}

let ruffleScriptLoaded: Promise<void> | null = null;

function loadRuffleScript(): Promise<void> {
  if (ruffleScriptLoaded) return ruffleScriptLoaded;
  ruffleScriptLoaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/ruffle/ruffle.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Ruffle'));
    document.head.appendChild(script);
  });
  return ruffleScriptLoaded;
}

/** Plays a .swf cutscene full-screen with a skip button, resolving when the
 * player skips or the movie's length (`durationSeconds`) elapses. Fails open:
 * any load error just resolves immediately so a missing/broken cutscene never
 * blocks the game from starting. */
export async function playCutscene(swfUrl: string, durationSeconds?: number): Promise<void> {
  const overlay = document.getElementById('cutscene-overlay');
  const stage = document.getElementById('cutscene-stage');
  const skipButton = document.getElementById('cutscene-skip');
  if (!overlay || !stage || !skipButton) return;

  try {
    await loadRuffleScript();
    const ruffle = window.RufflePlayer?.newest();
    if (!ruffle) return;

    const player = ruffle.createPlayer();
    player.style.setProperty('width', '100%', 'important');
    player.style.setProperty('height', '100%', 'important');
    stage.innerHTML = '';
    stage.appendChild(player);
    overlay.hidden = false;

    await new Promise<void>((resolve) => {
      let endTimer: number | undefined;
      const finish = () => {
        window.clearTimeout(endTimer);
        skipButton.removeEventListener('click', finish);
        overlay.hidden = true;
        stage.innerHTML = '';
        resolve();
      };
      skipButton.addEventListener('click', finish);
      player
        .ruffle()
        .load(swfUrl)
        .then(() => {
          // Ruffle has no end-of-movie event for arbitrary SWFs, so advance on
          // the movie's known length (frames / fps from its header).
          if (durationSeconds) endTimer = window.setTimeout(finish, (durationSeconds + 1) * 1000);
        })
        .catch(finish);
    });
  } catch {
    overlay.hidden = true;
  }
}
