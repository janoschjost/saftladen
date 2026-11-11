import type { ViewSnapshot } from '../render/Views';

const KEY = 'saftladen.state';

/** What is remembered between visits: time of day, camera (all views) and the selected person. */
export interface SavedState {
  cycle?: number;
  view?: ViewSnapshot;
  selected?: string;
}

export function loadState(): SavedState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}
