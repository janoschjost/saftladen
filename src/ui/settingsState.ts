import type { WeatherMode } from '../game/Weather';
import { SEASON_SETTINGS, type SeasonSetting } from '../game/Season';

/** localStorage key of the settings popover (weather, Christmas, camera follow). */
export const SETTINGS_KEY = 'saftladen.settings';

export interface SettingsState {
  weather: WeatherMode;
  /** the season Auto weather follows: one of them, or the calendar month */
  season: SeasonSetting;
  xmas: boolean;
  /** "Kamera folgt bei Aktionen": the camera trails the lead person of an action */
  follow: boolean;
}

export const WEATHER_MODES: readonly WeatherMode[] = ['auto', 'sun', 'rain', 'snow', 'storm'];

/** Defaults: auto weather, camera follows; Christmas only in December. */
export function defaultSettings(now = new Date()): SettingsState {
  return { weather: 'auto', season: 'auto', xmas: now.getMonth() === 11, follow: true };
}

/** Reads the stored JSON; anything missing, of the wrong type or unreadable falls back to the default. */
export function parseSettings(raw: string | null, now = new Date()): SettingsState {
  const d = defaultSettings(now);
  let saved: Record<string, unknown> = {};
  try {
    const v = JSON.parse(raw ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) saved = v;
  } catch {
    /* corrupt: defaults */
  }
  const bool = (k: keyof SettingsState, fallback: boolean) => (typeof saved[k] === 'boolean' ? (saved[k] as boolean) : fallback);
  return {
    weather: WEATHER_MODES.includes(saved.weather as WeatherMode) ? (saved.weather as WeatherMode) : d.weather,
    season: SEASON_SETTINGS.includes(saved.season as SeasonSetting) ? (saved.season as SeasonSetting) : d.season,
    xmas: bool('xmas', d.xmas),
    follow: bool('follow', d.follow),
  };
}

export function serializeSettings(s: SettingsState): string {
  return JSON.stringify({ weather: s.weather, season: s.season, xmas: s.xmas, follow: s.follow });
}
