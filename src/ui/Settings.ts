import { storage } from '../game/storage';
import type { WeatherMode } from '../game/Weather';
import type { SeasonSetting } from '../game/Season';
import type { ViewMode } from '../render/Views';
import { cycleIcons } from './iconCycle';
import { Popover } from './Popover';
import { parseSettings, serializeSettings, SETTINGS_KEY, type SettingsState } from './settingsState';

export type { SettingsState } from './settingsState';

export interface SettingsHooks {
  /** weather, Christmas or the follow switch changed (also once at start) */
  onChange: (state: SettingsState) => void;
  /** a view segment was picked */
  onView: (mode: ViewMode) => void;
  /** the Namen switch was flipped */
  onNames: (on: boolean) => void;
}

/**
 * The gear button (top right, key `,`) with its popover (view, names, camera follow) and the sun button next to it with the environment popover (weather, time, Christmas). Esc, a click outside
 * or the close button closes them; only one is open at a time. Values are remembered in localStorage
 * (`saftladen.settings`); under 840 px the popovers are bottom sheets (CSS).
 */
export class Settings {
  private pop: Popover;
  private env: Popover;
  private root = document.getElementById('settings') as HTMLElement;
  private xmas = document.getElementById('setting-xmas') as HTMLInputElement;
  private follow = document.getElementById('setting-follow') as HTMLInputElement;
  private names = document.getElementById('setting-names') as HTMLInputElement;
  private weather = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-weather"]'));
  private seasons = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-season"]'));
  private views = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setting-view"]'));
  private state: SettingsState;

  constructor(private hooks: SettingsHooks) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(SETTINGS_KEY);
    } catch {
      /* storage may be unavailable */
    }
    this.state = parseSettings(raw);
    this.xmas.checked = this.state.xmas;
    this.follow.checked = this.state.follow;
    this.setWeatherValue(this.state.weather);
    this.setSeasonValue(this.state.season);

    this.pop = new Popover(this.root, document.getElementById('open-settings') as HTMLButtonElement, {
      close: document.getElementById('settings-close'),
      key: ',',
      onOpen: () => this.env.setOpen(false),
    });
    this.env = new Popover(document.getElementById('env') as HTMLElement, document.getElementById('open-env') as HTMLButtonElement, {
      close: document.getElementById('env-close'),
      onOpen: () => this.pop.setOpen(false),
    });
    // the Auto chips show a random icon of their row and swap it now and then, while the popover is open
    for (const chip of document.querySelectorAll<HTMLElement>('#env [data-cycle]')) cycleIcons(chip, () => this.env.isOpen);
    for (const input of [this.xmas, this.follow, ...this.weather, ...this.seasons]) {
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

  /** Set the season segment from outside (dev events). */
  setSeason(season: SeasonSetting): void {
    this.setSeasonValue(season);
    this.apply();
  }

  private setSeasonValue(season: SeasonSetting): void {
    for (const input of this.seasons) input.checked = input.value === season;
  }

  private getSeason(): SeasonSetting {
    return (this.seasons.find((i) => i.checked)?.value as SeasonSetting) ?? 'auto';
  }

  private getWeather(): WeatherMode {
    return (this.weather.find((i) => i.checked)?.value as WeatherMode) ?? 'auto';
  }

  private apply(): void {
    this.state = {
      weather: this.getWeather(),
      season: this.getSeason(),
      xmas: this.xmas.checked,
      follow: this.follow.checked,
    };
    try {
      storage.setItem(SETTINGS_KEY, serializeSettings(this.state));
    } catch {
      /* ignore */
    }
    this.hooks.onChange(this.state);
  }
}
