import type { ViewMode } from '../render/Views';
import { chromeVisibility, escLayer, hintItems, modeName, paletteKey, type EscLayer } from './chromeRules';
import type { Palette } from './Palette';
import type { SidePanel } from './SidePanel';
import type { Timeline } from './Timeline';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Mode-adaptive chrome: shows only the controls that work in the current camera mode (table in `chrome.ts`),
 * keeps the key-hint line and the mode badge current, lights the walk keys and answers what Esc closes next.
 */
export class Chrome {
  private dock = $('dock');
  private topbar = $('topbar');
  private title = document.querySelector('.m-hud-title') as HTMLElement;
  private badge = $('mode-badge');
  private hintLine = $('hint-line');
  private planTools = $('plan-tools');
  private walkKeys = $('walk-keys');
  private walkBack = $('walk-back');
  /** the camera mode, and the mode the controls follow: the day-in-the-life counts from the moment it starts, even while the camera has not moved yet */
  private viewMode: ViewMode = 'orbit';
  private day = false;
  private mode: ViewMode = 'orbit';
  private selection = false;
  private hintKey = '';
  private rendered = false;
  private help = $('help');

  constructor(
    private side: SidePanel,
    private timeline: Timeline,
    private palette: Palette,
    onLeaveWalk: () => void,
  ) {
    $('palette-keycap').textContent = paletteKey();
    this.walkBack.addEventListener('click', onLeaveWalk);
    $('help-close').addEventListener('click', () => this.setHelp(false));
    // keys light up while they are held
    const keycaps = [...this.walkKeys.querySelectorAll<HTMLElement>('[data-code]')];
    const light = (code: string, on: boolean) => {
      for (const k of keycaps) if (k.dataset.code!.split(' ').includes(code)) k.classList.toggle('is-down', on);
    };
    window.addEventListener('keydown', (e) => light(e.code, true));
    window.addEventListener('keyup', (e) => light(e.code, false));
    window.addEventListener('blur', () => keycaps.forEach((k) => k.classList.remove('is-down')));
    this.setMode('orbit');
  }

  get helpOpen(): boolean {
    return !this.help.hidden;
  }

  setHelp(open: boolean): void {
    this.help.hidden = !open;
  }

  /** The mode the controls follow. */
  get effectiveMode(): ViewMode {
    return this.mode;
  }

  setMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.update();
  }

  setDay(day: boolean): void {
    this.day = day;
    this.update();
  }

  private update(): void {
    const mode: ViewMode = this.day ? 'third' : this.viewMode;
    if (mode === this.mode && this.rendered) return;
    this.rendered = true;
    const wasWalk = this.mode === 'walk';
    this.mode = mode;
    const v = chromeVisibility(mode);
    this.dock.hidden = !v.dock;
    this.topbar.hidden = !v.title;
    this.title.hidden = !v.title;
    this.badge.hidden = !v.badge;
    this.badge.textContent = modeName(mode);
    this.planTools.hidden = !v.planTools;
    this.walkBack.hidden = !v.walk;
    this.walkKeys.hidden = !v.walk;
    if (v.walk && !wasWalk) {
      // the key hint shows bright for a few seconds, then dims (CSS animation, restarted here)
      this.walkKeys.classList.remove('is-fresh');
      void this.walkKeys.offsetWidth;
      this.walkKeys.classList.add('is-fresh');
    }
    if (!v.side || !v.timeline) this.setHelp(false);
    this.timeline.setAllowed(v.timeline);
    this.side.setMode(mode);
    this.renderHint();
  }

  /** Somebody is selected (changes the key hints). */
  setSelection(selected: boolean): void {
    if (selected === this.selection) return;
    this.selection = selected;
    this.renderHint();
  }

  /** What Esc closes next, given what is open right now. */
  escLayer(selection: boolean): EscLayer | null {
    return escLayer({ mode: this.mode, palette: this.palette.isOpen || this.helpOpen, selection, timeline: this.timeline.wantsOpen, panel: this.side.tab !== null });
  }

  /** Closes one layer of the controls (palette / timeline / panel). Selection and mode are the game's to leave. */
  closeLayer(layer: EscLayer): void {
    if (layer === 'palette') {
      if (this.palette.isOpen) this.palette.close();
      else this.setHelp(false);
    } else if (layer === 'timeline') this.timeline.setOpen(false);
    else if (layer === 'panel') this.side.close();
  }

  private renderHint(): void {
    const items = hintItems(this.mode, this.selection);
    const key = items.map((i) => `${i.keys}|${i.label}`).join(',');
    this.hintLine.hidden = !items.length;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintLine.replaceChildren(
      ...items.map((i) => {
        const span = document.createElement('span');
        span.className = 'm-hint-line__item';
        const kbd = document.createElement('kbd');
        kbd.className = 'm-keycap';
        kbd.textContent = i.keys;
        span.append(kbd, ` ${i.label}`);
        return span;
      }),
    );
  }
}
