import type { WeatherMode } from '../game/Weather';

const KEY = 'saftladen.settings';

export interface SettingsState {
  tables: boolean;
  seats: boolean;
  rooms: boolean;
  weather: WeatherMode;
  xmas: boolean;
}

const WEATHER: WeatherMode[] = ['auto', 'sun', 'rain'];

/** Umgebung tab (switches for Weihnachten and the labels) plus the weather segments of the timeline. Remembered in localStorage. */
export class Settings {
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

  get xmasOn(): boolean {
    return this.xmas.checked;
  }

  setXmas(on: boolean): void {
    this.xmas.checked = on;
    this.apply();
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
