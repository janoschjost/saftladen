import { OFFICE_ACTIONS, validateActions, type OfficeAction } from '../data/actions';
import type { DevEvents } from '../game/DevEvents';

/** What the sheet hands to the game when something is picked: a curated card, or a plain dev event from the search. */
export interface SheetPick {
  eventId: string;
  label: string;
  action: OfficeAction | null;
}

export interface ActionSheetHooks {
  onPick: (pick: SheetPick) => void;
  /** Draw one preview per card into its canvas. Called once, when the sheet opens for the first time. */
  onPreviews: (items: Array<{ action: OfficeAction; canvas: HTMLCanvasElement }>) => void;
  /** the sheet opened or closed */
  onToggle?: (open: boolean) => void;
}

/** preview bitmap size (16:9) */
export const PREVIEW = { width: 480, height: 270 } as const;

const SLIDE_MS = 300;
const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), { className }, text === undefined ? {} : { textContent: text });

/**
 * Aktionen sheet (`A` or the button bottom centre): slides up with a card per curated action (`src/data/actions.ts`),
 * each with a live preview of its place. The search also lists every other dev event. Number keys 1-9 start the
 * matching card while it is open; Esc, the scrim or the close button close it.
 */
export class ActionSheet {
  private root = document.getElementById('action-sheet') as HTMLElement;
  private button = document.getElementById('open-actions') as HTMLButtonElement;
  private cardsEl = document.getElementById('action-cards') as HTMLElement;
  private moreEl = document.getElementById('action-more') as HTMLElement;
  private emptyEl = document.getElementById('action-empty') as HTMLElement;
  private search = document.getElementById('action-search') as HTMLInputElement;
  private cards: Array<{ action: OfficeAction; li: HTMLLIElement; button: HTMLButtonElement; key: HTMLElement; canvas: HTMLCanvasElement }> = [];
  private previewsDone = false;
  private closing = 0;

  constructor(
    private events: DevEvents,
    private hooks: ActionSheetHooks,
  ) {
    const problems = validateActions(
      OFFICE_ACTIONS,
      this.events.list().map((e) => e.id),
    );
    if (problems.length) console.warn(`[actions] ${problems.join('; ')}`);
    for (const action of OFFICE_ACTIONS) {
      if (problems.some((p) => p.startsWith(`${action.id}:`))) continue;
      const li = el('li', 'm-sheet__card-item');
      const button = el('button', 'm-card');
      button.type = 'button';
      button.dataset.action = action.id;
      const canvas = el('canvas', 'm-card__preview');
      canvas.width = PREVIEW.width;
      canvas.height = PREVIEW.height;
      canvas.setAttribute('aria-hidden', 'true');
      const key = el('kbd', 'm-card__key');
      const label = el('span', 'm-card__label');
      label.innerHTML = svg(action.icon);
      label.append(action.label);
      const place = el('small', 'm-card__place', action.place.name);
      const who = el('small', 'm-card__who', action.who);
      button.append(canvas, key, label, place, who);
      button.addEventListener('click', () => this.pick({ eventId: action.eventId, label: action.label, action }));
      li.append(button);
      this.cardsEl.append(li);
      this.cards.push({ action, li, button, key, canvas });
    }
    this.button.addEventListener('click', () => this.toggle());
    document.getElementById('action-sheet-close')!.addEventListener('click', () => this.close(true));
    document.getElementById('action-sheet-scrim')!.addEventListener('click', () => this.close());
    this.search.addEventListener('input', () => this.filter());
    // capture: number keys must not switch the view (1-4) while the sheet is open, Esc closes the sheet first
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.close(true);
          return;
        }
        if (e.target === this.search) return;
        const n = /^Digit([1-9])$/.exec(e.code)?.[1];
        if (!n || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.visibleCards()[Number(n) - 1]?.button.click();
      },
      true,
    );
    this.filter();
  }

  get isOpen(): boolean {
    return !this.root.hidden && !this.closing;
  }

  toggle(): void {
    if (this.isOpen) this.close(true);
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    window.clearTimeout(this.closing);
    this.closing = 0;
    this.root.hidden = false;
    void this.root.offsetWidth; // start the slide from below
    this.root.classList.add('is-open');
    this.button.setAttribute('aria-expanded', 'true');
    document.body.classList.add('has-open-sheet');
    if (!this.previewsDone) {
      this.previewsDone = true;
      this.hooks.onPreviews(this.cards.map((c) => ({ action: c.action, canvas: c.canvas })));
    }
    (this.visibleCards()[0]?.button ?? this.search).focus({ preventScroll: true });
    this.hooks.onToggle?.(true);
  }

  /** `refocus`: give the keyboard focus back to the Aktionen button. */
  close(refocus = false): void {
    if (this.root.hidden || this.closing) return;
    this.root.classList.remove('is-open');
    this.button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-open-sheet');
    const done = () => {
      this.closing = 0;
      this.root.hidden = true;
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else this.closing = window.setTimeout(done, SLIDE_MS);
    if (refocus || this.root.contains(document.activeElement)) this.button.focus({ preventScroll: true });
    this.hooks.onToggle?.(false);
  }

  private pick(p: SheetPick): void {
    this.close();
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.hooks.onPick(p);
  }

  private visibleCards() {
    return this.cards.filter((c) => !c.li.hidden);
  }

  /** Cards whose label, caption or place match; with a query also the other dev events (plain entries). */
  private filter(): void {
    const q = this.search.value.trim().toLowerCase();
    const has = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));
    for (const c of this.cards) c.li.hidden = !has(c.action.label, c.action.caption, c.action.place.name, c.action.eventId);
    this.visibleCards().forEach((c, i) => (c.key.textContent = i < 9 ? String(i + 1) : ''));
    const curated = new Set(this.cards.map((c) => c.action.eventId));
    const more = q ? this.events.list().filter((e) => !curated.has(e.id) && has(e.label, e.id, e.group)) : [];
    this.moreEl.replaceChildren(
      ...more.map((e) => {
        const li = el('li', 'm-sheet__more-item');
        const b = el('button', 'm-sheet__entry', e.label);
        b.type = 'button';
        b.dataset.event = e.id;
        b.append(el('small', 'm-sheet__entry-group', e.group));
        b.addEventListener('click', () => this.pick({ eventId: e.id, label: e.label, action: null }));
        li.append(b);
        return li;
      }),
    );
    this.moreEl.hidden = more.length === 0;
    this.emptyEl.hidden = this.visibleCards().length > 0 || more.length > 0;
  }
}
