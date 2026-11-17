import type { WeatherMode } from '../game/Weather';
import type { ViewMode } from '../render/Views';
import { Popover } from './Popover';
import { parseSettings, serializeSettings, SETTINGS_KEY, type SettingsState } from './settingsState';

export type { SettingsState } from './settingsState';

export interface SettingsHooks {
  /** labels, weather, Christmas or the follow switch changed (also once at start) */
  onChange: (state: SettingsState) => void;
  /** a view segment was picked */
  onView: (mode: ViewMode) => void;
  /** the Namen switch was flipped */
  onNames: (on: boolean) => void;
}

/**
 * The gear button (top right, key `,`) with its popover (view, names, camera follow, labels, links to the other
 * panels) and the sun button next to it with the environment popover (weather, time, Christmas). Esc, a click outside
 * or the close button closes them; only one is open at a time. Values are remembered in localStorage
 * (`saftladen.settings`); under 840 px the popovers are bottom sheets (CSS).
 */
export class Settings {
  private pop: Popover;
  private env: Popover;
  private root = document.getElementById('settings') as HTMLElement;
  private tables = document.getElementById('setting-tables') as HTMLInputElement;
  private seats = document.getElementById('setting-seats') as HTMLInputElement;
  private rooms = document.getElementById('setting-rooms') as HTMLInputElement;
  private xmas = document.getElementById('setting-xmas') as HTMLInputElement;
  private follow = document.getElementById('setting-follow') as HTMLInputElement;
  private names = document.getElementById('setting-names') as HTMLInputElement;
  private weather = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-weather"]'));
  private views = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-view"]'));
  private state: SettingsState;

  constructor(private hooks: SettingsHooks) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SETTINGS_KEY);
    } catch {
      /* storage may be unavailable */
    }
    this.state = parseSettings(raw);
    this.tables.checked = this.state.tables;
    this.seats.checked = this.state.seats;
    this.rooms.checked = this.state.rooms;
    this.xmas.checked = this.state.xmas;
    this.follow.checked = this.state.follow;
    this.setWeatherValue(this.state.weather);

    this.pop = new Popover(this.root, document.getElementById('open-settings') as HTMLButtonElement, {
      close: document.getElementById('settings-close'),
      key: ',',
      onOpen: () => this.env.setOpen(false),
    });
    this.env = new Popover(document.getElementById('env') as HTMLElement, document.getElementById('open-env') as HTMLButtonElement, {
      close: document.getElementById('env-close'),
      onOpen: () => this.pop.setOpen(false),
    });
    for (const input of [this.tables, this.seats, this.rooms, this.xmas, this.follow, ...this.weather]) {
      input.addEventListener('change', () => this.apply());
    }
    for (const input of this.views) input.addEventListener('change', () => input.checked && hooks.onView(input.value as ViewMode));
    this.names.addEventListener('change', () => hooks.onNames(this.names.checked));
    // a link to another panel does its job (its own listener runs first), then the popover makes room
    this.root.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.m-settings__link')) this.setOpen(false);
    });
    this.apply();
  }

  /** The settings popover is open (the environment one has its own button). */
  get isOpen(): boolean {
    return this.pop.isOpen;
  }

  /** "Kamera folgt bei Aktionen" */
  get followActions(): boolean {
    return this.state.follow;
  }

  /** Opens the settings popover, or closes both popovers. `refocus`: the focus goes back to the button. */
  setOpen(open: boolean, refocus = false): void {
    this.pop.setOpen(open, refocus);
    if (!open) this.env.setOpen(false, refocus);
  }

  /** Marks the current view (keys 1-4 change it too); the day-mode camera has no segment. */
  setView(mode: ViewMode): void {
    for (const input of this.views) input.checked = input.value === mode;
  }

  /** Mirrors the names state (key N). */
  setNames(on: boolean): void {
    this.names.checked = on;
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

  private apply(): void {
    this.state = {
      tables: this.tables.checked,
      seats: this.seats.checked,
      rooms: this.rooms.checked,
      weather: this.getWeather(),
      xmas: this.xmas.checked,
      follow: this.follow.checked,
      chat: this.state.chat,
    };
    this.save();
    this.hooks.onChange(this.state);
  }

  /** Whether the crew chat was left open; undefined until the player toggled it. */
  get chatOpen(): boolean | undefined {
    return this.state.chat;
  }

  /** Remembers the crew chat open or closed (`saftladen.settings`). */
  setChatOpen(open: boolean): void {
    this.state = { ...this.state, chat: open };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, serializeSettings(this.state));
    } catch {
      /* ignore */
    }
  }
}
