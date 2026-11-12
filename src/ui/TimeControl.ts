import { cycleOf, type TimeOfDay } from '../game/TimeOfDay';

const KEY = 'saftladen.time.auto';
/** Hours shown under the slider. */
const TICKS = [0, 6, 12, 18, 24];
/** Hours where the sky changes colour on the slider track (the gradient lives in SCSS). */
const SKY = { dawn: 5, morning: 8, evening: 18, night: 21 };

/**
 * Time-of-day slider + clock in the environment popover. The slider position is the cycle (midnight .. midnight);
 * its track is painted like the sky (night, dawn, day, dusk) and hour ticks sit under it at the right places.
 */
export class TimeControl {
  private slider = document.getElementById('time-slider') as HTMLInputElement;
  private clock = document.getElementById('time-clock') as HTMLOutputElement;
  private auto = document.getElementById('time-auto') as HTMLInputElement;
  private box = document.getElementById('time') as HTMLElement;
  private dragging = false;
  private shown = '';
  private night: boolean | null = null;

  constructor(private tod: TimeOfDay) {
    try {
      this.auto.checked = localStorage.getItem(KEY) !== '0';
    } catch {
      /* storage may be unavailable */
    }
    tod.auto = this.auto.checked;
    for (const [name, hour] of Object.entries(SKY)) this.box.style.setProperty(`--sky-${name}`, `${(cycleOf(hour) * 100).toFixed(2)}%`);
    const ticks = document.getElementById('time-ticks')!;
    ticks.replaceChildren(
      ...TICKS.map((hour) => {
        const li = document.createElement('li');
        li.className = 'm-time__tick';
        li.textContent = String(hour);
        li.style.setProperty('--at', String(cycleOf(hour)));
        return li;
      }),
    );
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
    if (this.box.closest('[hidden]')) return; // the popover is closed: nothing to show (it catches up when it opens)
    if (!this.dragging) this.slider.value = String(Math.round(this.tod.cycle * 1000));
    this.box.style.setProperty('--at', String(this.tod.cycle));
    const c = this.tod.clock;
    if (c !== this.shown) {
      this.shown = c;
      this.clock.textContent = c;
    }
    if (this.tod.night !== this.night) {
      this.night = this.tod.night;
      this.box.dataset.sky = this.night ? 'night' : 'day';
    }
  }
}
