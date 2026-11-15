import type { AdvProgress, BattleProgress, SaveData } from './types';

const STORAGE_KEY = 'bookworm-adventures-save';

function defaultSave(): SaveData {
  return { deluxeHighScore: 0, battle: {}, adv: {} };
}

export function loadSave(): SaveData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSave();
  try {
    return { ...defaultSave(), ...JSON.parse(raw) } as SaveData;
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function recordDeluxeScore(score: number): SaveData {
  const save = loadSave();
  if (score > save.deluxeHighScore) save.deluxeHighScore = score;
  writeSave(save);
  return save;
}

export function getBattleProgress(campaignId: string): BattleProgress {
  const save = loadSave();
  return save.battle[campaignId] ?? { monsterIndex: 0, wins: 0 };
}

export function setBattleProgress(campaignId: string, progress: BattleProgress): SaveData {
  const save = loadSave();
  save.battle[campaignId] = progress;
  writeSave(save);
  return save;
}

export const newAdvProgress = (): AdvProgress => ({ book: 1, chapter: 1, enemy: 0, checkpoint: 0, xp: 0, done: [] });

export function getAdvProgress(game: string): AdvProgress | undefined {
  return loadSave().adv[game];
}

export function setAdvProgress(game: string, progress: AdvProgress): void {
  const save = loadSave();
  save.adv[game] = progress;
  writeSave(save);
}

export function clearAdvProgress(game: string): void {
  const save = loadSave();
  delete save.adv[game];
  writeSave(save);
}
