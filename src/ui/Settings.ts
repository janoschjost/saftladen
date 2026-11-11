const KEY = 'saftladen.settings';

export interface SettingsState {
  tables: boolean;
  seats: boolean;
  rooms: boolean;
}

/** Settings panel: toggles for the table (desk row) labels and the seat numbers. Remembered in localStorage. */
export class Settings {
  private root = document.getElementById('settings') as HTMLElement;
  private toggle = document.getElementById('toggle-settings') as HTMLButtonElement;
  private tables = document.getElementById('setting-tables') as HTMLInputElement;
  private seats = document.getElementById('setting-seats') as HTMLInputElement;
  private rooms = document.getElementById('setting-rooms') as HTMLInputElement;

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
    this.toggle.addEventListener('click', () => {
      this.root.hidden = !this.root.hidden;
      this.toggle.setAttribute('aria-pressed', String(!this.root.hidden));
    });
    for (const input of [this.tables, this.seats, this.rooms]) input.addEventListener('change', () => this.apply());
    this.apply();
  }

  private apply(): void {
    const state = { tables: this.tables.checked, seats: this.seats.checked, rooms: this.rooms.checked };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    this.onChange(state);
  }
}
