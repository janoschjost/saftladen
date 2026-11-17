import type { WeatherMode } from '../game/Weather';

/** localStorage key of the settings popover (labels, weather, Christmas, camera follow). */
export const SETTINGS_KEY = 'saftladen.settings';

export interface SettingsState {
  /** row / table labels */
  tables: boolean;
  /** seat numbers */
  seats: boolean;
  /** room numbers */
  rooms: boolean;
  weather: WeatherMode;
  xmas: boolean;
  /** "Kamera folgt bei Aktionen": the camera trails the lead person of an action */
  follow: boolean;
  /** the crew chat panel was left open (true) or closed; unset until the player toggles it (open on desktop, closed on phone) */
  chat?: boolean;
}

export const WEATHER_MODES: readonly WeatherMode[] = ['auto', 'sun', 'rain'];

/** Defaults: all labels on, auto weather, camera follows; Christmas only in December. */
export function defaultSettings(now = new Date()): SettingsState {
  return { tables: true, seats: true, rooms: true, weather: 'auto', xmas: now.getMonth() === 11, follow: true };
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
    tables: bool('tables', d.tables),
    seats: bool('seats', d.seats),
    rooms: bool('rooms', d.rooms),
    weather: WEATHER_MODES.includes(saved.weather as WeatherMode) ? (saved.weather as WeatherMode) : d.weather,
    xmas: bool('xmas', d.xmas),
    follow: bool('follow', d.follow),
    ...(typeof saved.chat === 'boolean' ? { chat: saved.chat } : {}),
  };
}

export function serializeSettings(s: SettingsState): string {
  return JSON.stringify({ tables: s.tables, seats: s.seats, rooms: s.rooms, weather: s.weather, xmas: s.xmas, follow: s.follow, chat: s.chat });
}
