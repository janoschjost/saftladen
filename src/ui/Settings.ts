import type { WeatherMode } from '../game/Weather';
import type { ViewMode } from '../render/Views';
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
 * The gear button (top right, key `,`) and its popover: view, names, camera follow, weather, time, Christmas, labels
 * and the links to the other panels. Esc, a click outside or the close button closes it. Values are remembered in
 * localStorage (`saftladen.settings`); under 840 px the popover is a bottom sheet (CSS).
 */
export class Settings {
  private root = document.getElementById('settings') as HTMLElement;
  private toggle = document.getElementById('open-settings') as HTMLButtonElement;
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

    this.toggle.addEventListener('click', () => this.setOpen(!this.isOpen));
    document.getElementById('settings-close')!.addEventListener('click', () => this.setOpen(false, true));
    for (const input of [this.tables, this.seats, this.rooms, this.xmas, this.follow, ...this.weather]) {
      input.addEventListener('change', () => this.apply());
    }
    for (const input of this.views) input.addEventListener('change', () => input.checked && hooks.onView(input.value as ViewMode));
    this.names.addEventListener('change', () => hooks.onNames(this.names.checked));
    // a link to another panel does its job (its own listener runs first), then the popover makes room
    this.root.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.m-settings__link')) this.setOpen(false);
    });
    // a press anywhere outside closes it (the gear button toggles by itself)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.isOpen) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.toggle.contains(t)) return;
        this.setOpen(false);
      },
      { capture: true, passive: true },
    );
    // capture: Esc (or `,` again) closes the popover first and goes no further (no deselect, no end of the day)
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.key !== 'Escape' && e.key !== ',') || !this.isOpen) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setOpen(false, true);
      },
      true,
    );
    this.apply();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** "Kamera folgt bei Aktionen" */
  get followActions(): boolean {
    return this.state.follow;
  }

  /** `refocus`: the keyboard focus goes back to the gear (closed with Esc or the close button). */
  setOpen(open: boolean, refocus = false): void {
    if (open === this.isOpen) return;
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) (this.root.querySelector('input:checked, input, button') as HTMLElement | null)?.focus({ preventScroll: true });
    else if (refocus || this.root.contains(document.activeElement)) this.toggle.focus({ preventScroll: true });
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
    };
    try {
      localStorage.setItem(SETTINGS_KEY, serializeSettings(this.state));
    } catch {
      /* ignore */
    }
    this.hooks.onChange(this.state);
  }
}
