import type { TimeOfDay } from '../game/TimeOfDay';

const KEY = 'saftladen.time.auto';

/** Time-of-day slider + clock in the settings panel. The slider position is the cycle (midnight .. midnight). */
export class TimeControl {
  private slider = document.getElementById('time-slider') as HTMLInputElement;
  private clock = document.getElementById('time-clock') as HTMLOutputElement;
  private auto = document.getElementById('time-auto') as HTMLInputElement;
  private dragging = false;
  private shown = '';

  constructor(private tod: TimeOfDay) {
    try {
      this.auto.checked = localStorage.getItem(KEY) !== '0';
    } catch {
      /* storage may be unavailable */
    }
    tod.auto = this.auto.checked;
    this.slider.addEventListener('pointerdown', () => (this.dragging = true));
    window.addEventListener('pointerup', () => (this.dragging = false), { passive: true });
    this.slider.addEventListener('input', () => tod.setCycle(Number(this.slider.value) / 1000));
    this.auto.addEventListener('change', () => {
      tod.auto = this.auto.checked;
      try {
        localStorage.setItem(KEY, this.auto.checked ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    this.sync();
  }

  /** Follows the clock while it runs by itself. */
  sync(): void {
    if (!this.dragging) this.slider.value = String(Math.round(this.tod.cycle * 1000));
    const c = this.tod.clock;
    if (c !== this.shown) {
      this.shown = c;
      this.clock.textContent = c;
    }
  }
}
