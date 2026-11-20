/** Thin wrapper over the Vibration API. Only Android Chrome/Firefox actually have a motor to
 * fire — iOS Safari has no Vibration API at all and desktop browsers ignore it — so every call
 * here is a safe no-op anywhere it isn't supported. */
const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function fire(pattern: number | number[]): void {
  if (supported) navigator.vibrate(pattern);
}

// Reference point for "full power" tap intensity — hit/hurt/heavy events are allowed to feel
// stronger than this on purpose, so a tile tap (select OR deselect) is capped at 80% of it and
// never reads as a real hit.
const FULL_POWER_MS = 50;
const TAP_CAP_MS = Math.round(FULL_POWER_MS * 0.8);

export const haptics = {
  /** Tapping a letter tile or a UI button. */
  tap: () => fire(10),
  /** Selecting or deselecting a letter tile (word length is the word's size *after* this tap).
   * Stronger for silver/gold tier or gem-bearing "power" tiles, and ramps up as the word being
   * built gets longer — capped so it never crosses 80% of full haptic power. */
  tileTap: (power: boolean, wordLength: number) => {
    const base = power ? 14 : 6;
    const growth = Math.min(Math.max(wordLength - 1, 0), 7) * 4;
    fire(Math.min(base + growth, TAP_CAP_MS));
  },
  /** A submitted word was rejected (too short / not in the dictionary). */
  reject: () => fire([20, 40, 20]),
  /** Lex's word lands a hit on the enemy. */
  hit: () => fire(15),
  /** The enemy lands a hit on Lex. */
  hurt: () => fire(35),
  /** Battle won or lost. */
  heavy: () => fire([30, 50, 30, 50, 30]),
};
