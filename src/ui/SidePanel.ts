import { chromeVisibility, PANEL_TABS, type PanelTab } from './chromeRules';
import type { ViewMode } from '../render/Views';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Listener = (tab: PanelTab | null) => void;

/**
 * The one side panel: five tabs, never two panels at once. Opening it shrinks the scene (see `inset()`), it never covers it.
 * Under the tablet breakpoint it is a bottom sheet instead of a column on the right.
 */
export class SidePanel {
  private root = $('side');
  private bg = $('side-bg');
  readonly scroll = $('side-scroll');
  private tabs = new Map<PanelTab, HTMLButtonElement>();
  private panels = new Map<PanelTab, HTMLElement>();
  private toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-panel]')];
  private narrow = matchMedia('(max-width: 840px)');
  private listeners: Listener[] = [];
  private layoutListeners: Array<() => void> = [];
  private mode: ViewMode = 'orbit';
  private clip = '';
  /** the open tab (null = closed); in modes without a panel it stays set but nothing shows */
  tab: PanelTab | null = null;

  constructor() {
    for (const tab of PANEL_TABS) {
      const button = $<HTMLButtonElement>(`tab-${tab}`);
      this.tabs.set(tab, button);
      this.panels.set(tab, $(`panel-${tab}`));
      button.addEventListener('click', () => this.toggle(tab));
      button.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = PANEL_TABS[(PANEL_TABS.indexOf(tab) + step + PANEL_TABS.length) % PANEL_TABS.length];
        this.show(next);
        this.tabs.get(next)?.focus();
      });
    }
    for (const b of this.toggles) b.addEventListener('click', () => this.toggle(b.dataset.panel as PanelTab));
    this.narrow.addEventListener('change', () => this.apply());
    this.apply();
  }

  /** the panel is on screen (open, and the camera mode has a panel) */
  get shown(): boolean {
    return this.tab !== null && chromeVisibility(this.mode).side;
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  /** The scene area changed: resize the camera viewport. */
  onLayout(fn: () => void): void {
    this.layoutListeners.push(fn);
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.apply(false);
  }

  /** Show this tab (opens the panel if it is closed). */
  show(tab: PanelTab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.apply();
  }

  /** Dock buttons and tabs act as toggles: the second click closes. */
  toggle(tab: PanelTab): void {
    if (this.tab === tab && this.shown) this.close();
    else this.show(tab);
  }

  close(): void {
    if (this.tab === null) return;
    this.tab = null;
    this.apply();
  }

  /** Pixels the panel takes from the right and from the bottom of the window. */
  inset(): { right: number; bottom: number } {
    if (!this.shown) return { right: 0, bottom: 0 };
    return this.narrow.matches ? { right: 0, bottom: this.root.offsetHeight } : { right: this.root.offsetWidth, bottom: 0 };
  }

  /** The panel is white everywhere except where a live feed shines through from the canvas behind it. */
  maskOut(rects: DOMRect[]): void {
    const box = this.root.getBoundingClientRect();
    const holes = rects
      .map((r) => `M${Math.round(r.left - box.left)} ${Math.round(r.top - box.top)}h${Math.round(r.width)}v${Math.round(r.height)}h${-Math.round(r.width)}Z`)
      .join('');
    const clip = holes ? `path(evenodd, "M0 0H${Math.round(box.width)}V${Math.round(box.height)}H0Z${holes}")` : '';
    if (clip === this.clip) return;
    this.clip = clip;
    this.bg.style.clipPath = clip;
  }

  private apply(notify = true): void {
    const shown = this.shown;
    this.root.hidden = !shown;
    for (const [tab, button] of this.tabs) {
      const on = this.tab === tab;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on || (this.tab === null && tab === 'people') ? 0 : -1;
      this.panels.get(tab)!.hidden = !on;
    }
    for (const b of this.toggles) b.setAttribute('aria-pressed', String(this.tab === b.dataset.panel && shown));
    if (notify) for (const fn of this.listeners) fn(this.tab);
    // the rest of the chrome (top bar, dock, timeline) centres on the scene area
    const inset = this.inset();
    document.documentElement.style.setProperty('--inset-right', `${inset.right}px`);
    document.documentElement.style.setProperty('--inset-bottom', `${inset.bottom}px`);
    for (const fn of this.layoutListeners) fn();
  }
}

let instance: SidePanel | null = null;
/** The panel is created on first use, so the editor panel can reach it before the game has built everything. */
export function sidePanel(): SidePanel {
  return (instance ??= new SidePanel());
}
