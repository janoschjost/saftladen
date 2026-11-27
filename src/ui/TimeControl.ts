import { storage } from '../game/storage';
import { icon } from './icons';
import { cycleOf, DEFAULT_SPEED, SPEEDS, type Speed, type TimeOfDay } from '../game/TimeOfDay';
import { stepHour, trackHour } from './clockDial';

const KEY = 'saftladen.time.auto';
const SPEED_KEY = 'saftladen.time.speed';
const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
/** Hours shown under the slider. */
const TICKS = [0, 6, 12, 18, 24];
/** Hours where the sky changes colour on the slider track (the gradient lives in SCSS). */
const SKY = { dawn: 5, morning: 8, evening: 18, night: 21 };

const store = (key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
};

/**
 * The clock: a progress pill in the HUD: day or night icon, the time, and a bar as wide as the day, coloured like the sky
 * it has passed (press or drag it to jump to a time, arrow keys step 15 min); a stepper (− 1× +) walks through pause, 0.5x, 1x, 2x, 10x, 25x;
 * plus the time slider and auto switch in the environment popover,
 * whose track is painted like the sky with hour ticks under it. Pause and speed act on the whole game and are remembered
 * (`saftladen.time.auto`, `saftladen.time.speed`).
 */
export class TimeControl {
  private slider = document.getElementById('time-slider') as HTMLInputElement;
  private clock = document.getElementById('time-clock') as HTMLOutputElement;
  private auto = document.getElementById('time-auto') as HTMLInputElement;
  private box = document.getElementById('time') as HTMLElement;
  private dial = document.getElementById('clock-dial') as HTMLElement;
  private pill = document.getElementById('clock') as HTMLElement;
  private rate = document.getElementById('clock-rate') as HTMLOutputElement;
  private slower = document.getElementById('clock-slower') as HTMLButtonElement;
  private faster = document.getElementById('clock-faster') as HTMLButtonElement;
  private time = document.getElementById('clock-time') as HTMLOutputElement;
  private dragging = false;
  /** pointer dragging along the bar */
  private dialPointer: number | null = null;
  private shown = '';
  private night: boolean | null = null;
  private shownState = '';
  private shownBar = '';

  constructor(private tod: TimeOfDay) {
    try {
      this.auto.checked = storage.getItem(KEY) !== '0';
      const speed = Number(storage.getItem(SPEED_KEY));
      tod.speed = (SPEEDS as readonly number[]).includes(speed) ? (speed as Speed) : DEFAULT_SPEED;
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
    // live while dragging (the light follows), a jump once let go (the people follow)
    this.slider.addEventListener('input', () => {
      tod.setCycle(Number(this.slider.value) / 1000);
      this.sync();
    });
    this.slider.addEventListener('change', () => tod.jumpTo(Number(this.slider.value) / 1000));
    this.auto.addEventListener('change', () => {
      this.tod.pinned = false;
      this.setAuto(this.auto.checked);
    });
    this.bindDial();
    this.slower.addEventListener('click', () => this.stepSpeed(-1));
    this.faster.addEventListener('click', () => this.stepSpeed(1));
    this.sync();
  }

  private setAuto(on: boolean): void {
    this.tod.auto = on;
    this.auto.checked = on;
    store(KEY, on ? '1' : '0');
  }

  private setSpeed(s: Speed): void {
    this.tod.speed = s;
    store(SPEED_KEY, String(s));
  }

  /** The stepper: one stop slower or faster along pause, 0.5x, 1x, 2x, 10x, 25x. */
  private stepSpeed(by: number): void {
    const stops = [0, ...SPEEDS];
    const at = stops.indexOf(this.tod.scale);
    const s = stops[Math.min(stops.length - 1, Math.max(0, (at < 0 ? stops.indexOf(DEFAULT_SPEED) : at) + by))];
    if (s !== 0) this.setSpeed(s as Speed);
    this.tod.pinned = false;
    this.setAuto(s !== 0);
    this.sync();
  }

  /** Press or drag along the bar: the time follows (and the light), letting go jumps there. Arrow keys: 15 min, Page keys: 1 h. */
  private bindDial(): void {
    const hourAt = (e: PointerEvent) => {
      const r = this.dial.getBoundingClientRect();
      return trackHour((e.clientX - r.left) / r.width);
    };
    this.dial.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dial.focus();
      this.dialPointer = e.pointerId;
      this.dial.setPointerCapture(e.pointerId);
      this.tod.setCycle(cycleOf(hourAt(e)));
      this.sync();
    });
    this.dial.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dialPointer) return;
      this.tod.setCycle(cycleOf(hourAt(e)));
      this.sync();
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.dialPointer) return;
      this.dialPointer = null;
      this.tod.jumpTo(this.tod.cycle);
    };
    this.dial.addEventListener('pointerup', end);
    this.dial.addEventListener('pointercancel', end);
    this.dial.addEventListener('keydown', (e) => {
      const step = ({ ArrowRight: 15, ArrowUp: 15, ArrowLeft: -15, ArrowDown: -15, PageUp: 60, PageDown: -60 } as Record<string, number>)[e.key];
      if (!step) return;
      e.preventDefault();
      e.stopPropagation(); // the arrows steer people / the camera otherwise
      this.tod.jumpToHour(stepHour(this.tod.hour, step));
      this.sync();
    });
  }

  /** Follows the clock while it runs by itself (every frame), and right away after the player changed it. */
  sync(): void {
    const tod = this.tod;
    // the HUD clock is always on screen; the popover only needs to follow while it is open (it catches up when it opens)
    const popover = !this.box.closest('[hidden]');
    if (popover) {
      if (!this.dragging) this.slider.value = String(Math.round(tod.cycle * 1000));
      this.box.style.setProperty('--at', String(tod.cycle));
    }
    const c = tod.clock;
    if (`${tod.weekday} ${c}` !== this.shown) {
      this.shown = `${tod.weekday} ${c}`;
      this.clock.textContent = c;
      this.time.textContent = c;
      const [h, m] = c.split(':').map(Number);
      this.dial.setAttribute('aria-valuenow', String(h * 60 + m));
      this.dial.setAttribute('aria-valuetext', `${DAY_NAMES[tod.weekday]}, ${c}`);
    }
    // the bar fills up to now; the icon is the sun by day and the moon at night
    const hour = Math.round(tod.hour * 60) / 60;
    const bar = `${hour}`;
    if (bar !== this.shownBar) {
      this.shownBar = bar;
      this.pill.style.setProperty('--at', String(hour / 24));
    }
    const state = `${tod.weekday}|${tod.scale}|${tod.night}`;
    if (state !== this.shownState) {
      this.shownState = state;
      this.auto.checked = tod.auto;
      if (tod.scale === 0) {
        this.rate.innerHTML = icon('pause', 14, 'm-clock__pause');
        this.rate.setAttribute('aria-label', 'Pausiert');
      } else {
        this.rate.textContent = `${tod.scale}×`;
        this.rate.removeAttribute('aria-label');
      }
      this.slower.disabled = tod.scale === 0;
      this.faster.disabled = tod.scale === SPEEDS[SPEEDS.length - 1];
      this.pill.classList.toggle('is-night', tod.night);
    }
    if (popover && tod.night !== this.night) {
      this.night = tod.night;
      this.box.dataset.sky = this.night ? 'night' : 'day';
    }
  }
}
