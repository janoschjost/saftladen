import { cycleOf, SPEEDS, WEEKDAYS, type Speed, type TimeOfDay } from '../game/TimeOfDay';
import { dialAngle, dialHour, dialPoint, dialSlice, stepHour } from './clockDial';

const KEY = 'saftladen.time.auto';
const SPEED_KEY = 'saftladen.time.speed';
const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
/** the dark slice on the dial */
const NIGHT = [21, 5] as const;
/** Hours shown under the slider. */
const TICKS = [0, 6, 12, 18, 24];
/** Hours where the sky changes colour on the slider track (the gradient lives in SCSS). */
const SKY = { dawn: 5, morning: 8, evening: 18, night: 21 };

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
};

/**
 * The clock: the 24 h dial in the HUD (drag the hand or click the dial to jump to a time, arrow keys step 15 min),
 * weekday chooser and speed buttons (pause, 1x, 10x, 25x); plus the time slider and auto switch in the environment popover,
 * whose track is painted like the sky with hour ticks under it. Pause and speed act on the whole game and are remembered
 * (`saftladen.time.auto`, `saftladen.time.speed`).
 */
export class TimeControl {
  private slider = document.getElementById('time-slider') as HTMLInputElement;
  private clock = document.getElementById('time-clock') as HTMLOutputElement;
  private auto = document.getElementById('time-auto') as HTMLInputElement;
  private box = document.getElementById('time') as HTMLElement;
  private dial = document.getElementById('clock-dial') as unknown as SVGSVGElement;
  private hand = document.getElementById('clock-hand') as unknown as SVGLineElement;
  private time = document.getElementById('clock-time') as HTMLOutputElement;
  private day = document.getElementById('clock-day') as HTMLSelectElement;
  private speeds = [...document.querySelectorAll<HTMLButtonElement>('#clock [data-speed]')];
  private dragging = false;
  /** pointer dragging the dial hand */
  private dialPointer: number | null = null;
  private shown = '';
  private night: boolean | null = null;
  private shownState = '';
  private shownAngle = -1;

  constructor(private tod: TimeOfDay) {
    try {
      this.auto.checked = localStorage.getItem(KEY) !== '0';
      const speed = Number(localStorage.getItem(SPEED_KEY));
      if ((SPEEDS as readonly number[]).includes(speed)) tod.speed = speed as Speed;
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
    this.buildDial();
    this.bindDial();
    for (const [i, name] of WEEKDAYS.entries()) this.day.add(new Option(name, String(i)));
    this.day.addEventListener('change', () => {
      tod.pickWeekday(Number(this.day.value));
      this.sync();
    });
    for (const b of this.speeds) {
      b.addEventListener('click', () => {
        const s = Number(b.dataset.speed);
        if (s !== 0) this.setSpeed(s as Speed);
        this.tod.pinned = false;
        this.setAuto(s !== 0);
        this.sync();
      });
    }
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

  /** Night slice and hour ticks (numbers at 0, 6, 12, 18). */
  private buildDial(): void {
    const ns = 'http://www.w3.org/2000/svg';
    const el = (name: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v);
      return e;
    };
    document.getElementById('clock-night')!.setAttribute('d', dialSlice(NIGHT[0], NIGHT[1], 48));
    const ticks = document.getElementById('clock-ticks')!;
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      const [x1, y1] = dialPoint(h, major ? 39 : 43);
      const [x2, y2] = dialPoint(h, 47);
      ticks.appendChild(el('line', { x1, y1, x2, y2, class: major ? 'm-clock__tick m-clock__tick--major' : 'm-clock__tick' }));
      if (!major) continue;
      const [x, y] = dialPoint(h, 29);
      const t = el('text', { x, y, class: 'm-clock__label' });
      t.textContent = String(h);
      ticks.appendChild(t);
    }
  }

  /** Press or drag on the dial: the hand follows (and the light), letting go jumps there. Arrow keys: 15 min, Page keys: 1 h. */
  private bindDial(): void {
    const hourAt = (e: PointerEvent) => {
      const r = this.dial.getBoundingClientRect();
      return dialHour(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
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
    const angle = Math.round(dialAngle(tod.hour) * 10) / 10;
    if (angle !== this.shownAngle) {
      this.shownAngle = angle;
      this.hand.setAttribute('transform', `rotate(${angle})`);
    }
    const state = `${tod.weekday}|${tod.scale}`;
    if (state !== this.shownState) {
      this.shownState = state;
      if (document.activeElement !== this.day) this.day.value = String(tod.weekday);
      this.day.title = DAY_NAMES[tod.weekday];
      this.auto.checked = tod.auto;
      for (const b of this.speeds) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === tod.scale));
    }
    if (popover && tod.night !== this.night) {
      this.night = tod.night;
      this.box.dataset.sky = this.night ? 'night' : 'day';
    }
  }
}
