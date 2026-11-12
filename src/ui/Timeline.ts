import { strings } from '../i18n/strings';
import { cycleOfHour, type TimeOfDay } from '../game/TimeOfDay';
import { hourToShare } from './chromeRules';

const KEY = 'saftladen.time.auto';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Markers above the track: a static list for now (the Presence schedule is per person). */
const EVENTS: Array<{ hour: number; label: string }> = [
  { hour: 11, label: strings.chrome.timeline.events.meeting },
  { hour: 12.5, label: strings.chrome.timeline.events.lunch },
  { hour: 17.5, label: strings.chrome.timeline.events.end },
];

const pad = (n: number) => String(n).padStart(2, '0');
const clockOf = (hour: number) => `${pad(Math.floor(hour) % 24)}:${pad(Math.floor((hour % 1) * 60))}`;

/**
 * Time as a first-class control: the clock chip in the dock opens a strip with a 24 h track you can drag (keyboard too),
 * event markers that jump to their time, and Auto / Pause. The Umgebung tab keeps the same switch.
 */
export class Timeline {
  private root = $('timeline');
  private range = $<HTMLInputElement>('timeline-range');
  private handle = $('timeline-handle');
  private bubble = $('timeline-bubble');
  private play = $<HTMLButtonElement>('timeline-auto');
  private autoSwitch = $<HTMLInputElement>('time-auto');
  private chip = $<HTMLButtonElement>('dock-clock');
  private chipTime = $('dock-time');
  private dragging = false;
  private shown = '';
  private wanted = false;
  private allowed = true;

  constructor(private tod: TimeOfDay) {
    let auto = true;
    try {
      auto = localStorage.getItem(KEY) !== '0';
    } catch {
      /* storage may be unavailable */
    }
    this.setAuto(auto, false);
    this.chip.addEventListener('click', () => this.setOpen(!this.wanted));
    this.play.addEventListener('click', () => this.setAuto(!tod.auto));
    this.autoSwitch.addEventListener('change', () => this.setAuto(this.autoSwitch.checked));
    this.range.addEventListener('pointerdown', () => (this.dragging = true));
    window.addEventListener(
      'pointerup',
      () => {
        if (!this.dragging) return;
        this.dragging = false;
        this.range.blur(); // a mouse drag must not leave the slider eating the hotkeys
      },
      { passive: true },
    );
    this.range.addEventListener('input', () => this.jump(Number(this.range.value) / 60));
    const list = $('timeline-events');
    for (const e of EVENTS) {
      const li = document.createElement('li');
      li.className = 'm-timeline__event';
      li.style.left = `${hourToShare(e.hour) * 100}%`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-timeline__marker';
      b.innerHTML = '<span class="m-timeline__marker-time"></span><span class="m-timeline__marker-label"></span>';
      (b.children[0] as HTMLElement).textContent = clockOf(e.hour);
      (b.children[1] as HTMLElement).textContent = e.label;
      b.setAttribute('aria-label', `${e.label} ${clockOf(e.hour)}`);
      b.addEventListener('click', () => this.jump(e.hour));
      li.appendChild(b);
      list.appendChild(li);
    }
    this.apply();
    this.sync();
  }

  get open(): boolean {
    return this.wanted && this.allowed;
  }

  /** the strip may show in this camera mode */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.apply();
  }

  setOpen(open: boolean): void {
    this.wanted = open;
    this.apply();
  }

  /** wanted, even if the camera mode hides it right now */
  get wantsOpen(): boolean {
    return this.wanted;
  }

  setAuto(on: boolean, persist = true): void {
    this.tod.auto = on;
    if (!persist) return;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** Jump to a clock hour (drag, marker, keyboard). */
  jump(hour: number): void {
    this.tod.setCycle(cycleOfHour(hour));
    this.sync();
  }

  /** Follows the clock while it runs by itself. */
  sync(): void {
    const tod = this.tod;
    const clock = tod.clock;
    if (clock !== this.shown) {
      this.shown = clock;
      this.chipTime.textContent = clock;
      this.bubble.textContent = clock;
      this.range.setAttribute('aria-valuetext', clock);
    }
    this.chip.classList.toggle('is-night', tod.day < 0.5);
    const pct = `${hourToShare(tod.hour) * 100}%`;
    if (this.handle.style.left !== pct) this.handle.style.left = pct;
    if (!this.dragging) this.range.value = String(Math.round(tod.hour * 60));
    const auto = tod.auto;
    if (this.autoSwitch.checked !== auto) this.autoSwitch.checked = auto;
    this.play.setAttribute('aria-pressed', String(auto));
    this.play.setAttribute('aria-label', auto ? 'Zeit läuft: pausieren' : 'Zeit steht: fortsetzen');
    this.play.title = auto ? strings.chrome.timeline.pause : strings.chrome.timeline.auto;
  }

  private apply(): void {
    const open = this.open;
    this.root.hidden = !open;
    this.chip.setAttribute('aria-expanded', String(open));
    this.chip.setAttribute('aria-pressed', String(open));
  }
}
