import { storage } from '../game/storage';
import type { ViewSnapshot } from '../render/Views';

const KEY = 'saftladen.state';

/** What is remembered between visits: time of day, weekday, camera (all views) and the selected person. */
export interface SavedState {
  cycle?: number;
  /** 0 = Monday .. 6 = Sunday */
  weekday?: number;
  view?: ViewSnapshot;
  selected?: string;
}

export function loadState(): SavedState {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function saveState(state: SavedState): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}
