import type { WeatherMode } from '../game/Weather';
import { exclusivePanel } from './exclusive';

const KEY = 'saftladen.settings';

export interface SettingsState {
  tables: boolean;
  seats: boolean;
  rooms: boolean;
  weather: WeatherMode;
  xmas: boolean;
}

const WEATHER: WeatherMode[] = ['auto', 'sun', 'rain'];

/** Settings panel: label toggles and weather. Remembered in localStorage. */
export class Settings {
  private root = document.getElementById('settings') as HTMLElement;
  private toggle = document.getElementById('toggle-settings') as HTMLButtonElement;
  private tables = document.getElementById('setting-tables') as HTMLInputElement;
  private seats = document.getElementById('setting-seats') as HTMLInputElement;
  private rooms = document.getElementById('setting-rooms') as HTMLInputElement;
  private xmas = document.getElementById('setting-xmas') as HTMLInputElement;
  private weather = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-weather"]'));

  constructor(private onChange: (state: SettingsState) => void) {
    let saved: Partial<SettingsState> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      /* storage may be unavailable */
    }
    this.tables.checked = saved.tables ?? true;
    this.seats.checked = saved.seats ?? true;
    this.rooms.checked = saved.rooms ?? true;
    this.xmas.checked = saved.xmas ?? new Date().getMonth() === 11; // December: on by default
    this.setWeatherValue(WEATHER.includes(saved.weather as WeatherMode) ? (saved.weather as WeatherMode) : 'auto');
    const closeOthers = exclusivePanel('settings', () => this.setOpen(false));
    this.toggle.addEventListener('click', () => {
      this.setOpen(this.root.hidden === true);
      if (!this.root.hidden) closeOthers();
    });
    for (const input of [this.tables, this.seats, this.rooms, this.xmas, ...this.weather]) {
      input.addEventListener('input', () => this.apply());
      input.addEventListener('change', () => this.apply());
    }
    this.apply();
  }

  /** Set the weather segment from outside (dev events). */
  setWeather(mode: WeatherMode): void {
    this.setWeatherValue(mode);
    this.apply();
  }

  private setWeatherValue(mode: WeatherMode): void {
    for (const input of this.weather) input.checked = input.value === mode;
  }

  private getWeather(): WeatherMode {
    return (this.weather.find((i) => i.checked)?.value as WeatherMode) ?? 'auto';
  }

  private setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-pressed', String(open));
  }

  private apply(): void {
    const state: SettingsState = {
      tables: this.tables.checked,
      seats: this.seats.checked,
      rooms: this.rooms.checked,
      weather: this.getWeather(),
      xmas: this.xmas.checked,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify({ tables: state.tables, seats: state.seats, rooms: state.rooms, weather: state.weather, xmas: state.xmas }));
    } catch {
      /* ignore */
    }
    this.onChange(state);
  }
}
