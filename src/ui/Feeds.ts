import { makeCollapsible } from './collapsible';

/** On a phone the dock starts folded (an open feed grid would cover the office); a remembered state wins. */
const PHONE_FOLDED = matchMedia('(max-width: 840px)').matches;

export interface FeedEntry {
  id: string;
  name: string;
  variant: number;
  room: string;
}

export interface FeedTile {
  variant: number;
  rect: DOMRect;
  /** the part of the tile inside the panel (the panel clips while it opens/closes) */
  clip: DOMRect;
}

/**
 * Live "webcam" tiles of the people working from home. The tiles are empty DOM boxes: the game draws the home office
 * scenes into the main canvas behind them (see Game.renderFeeds), the DOM only adds the frame and the overlays.
 */
export class Feeds {
  private root = document.getElementById('feeds') as HTMLElement;
  private grid = document.getElementById('feeds-grid') as HTMLElement;
  private count = document.getElementById('feeds-count') as HTMLElement;
  private anims: Animation[] = [];
  private tilesEls = new Map<string, { el: HTMLElement; variant: number; activity: HTMLElement }>();
  /** the show (#275): the person whose feed fills the screen */
  private cinemaId: string | null = null;

  constructor() {
    makeCollapsible(this.root, this.root.querySelector('.m-feeds__title') as HTMLElement, 'saftladen.feeds.collapsed', 'dock', PHONE_FOLDED);
  }

  sync(entries: FeedEntry[]): void {
    const ids = new Set(entries.map((e) => e.id));
    for (const [id, t] of this.tilesEls) {
      if (ids.has(id)) continue;
      t.el.remove();
      this.tilesEls.delete(id);
    }
    for (const e of entries) {
      const tile = this.tilesEls.get(e.id);
      if (tile) {
        const name = tile.el.querySelector('.m-feed__name') as HTMLElement;
        if (name.textContent !== e.name.split(' ')[0]) name.textContent = e.name.split(' ')[0];
        continue;
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'm-feed';
      el.title = 'Klicken zum Vergrössern';
      el.innerHTML =
        '<span class="m-feed__live">Live</span><span class="m-feed__name"></span><span class="m-feed__activity"></span>';
      (el.querySelector('.m-feed__name') as HTMLElement).textContent = e.name.split(' ')[0];
      el.addEventListener('click', () => this.focus(e.id));
      this.grid.appendChild(el);
      this.tilesEls.set(e.id, { el, variant: e.variant, activity: el.querySelector('.m-feed__activity') as HTMLElement });
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = String(entries.length);
    this.applyCinema();
  }

  /** The show: one feed fills the screen (`body.is-show` styles it), `null` puts it away. Shows as soon as that person's tile exists. */
  cinema(id: string | null): void {
    this.cinemaId = id;
    this.applyCinema();
  }

  private applyCinema(): void {
    const on = this.cinemaId !== null && this.tilesEls.has(this.cinemaId);
    this.root.classList.toggle('is-cinema', on);
    for (const [id, t] of this.tilesEls) t.el.classList.toggle('is-cinema-focus', on && id === this.cinemaId);
  }

  /** Enlarge one tile (click again to shrink). The tiles and the panel glide to their new size (FLIP). */
  focus(id: string): void {
    const t = this.tilesEls.get(id);
    if (!t) return;
    const large = !t.el.classList.contains('is-large');
    const animate = !this.root.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    // First: where everything is right now (including a running animation)
    const firstRoot = this.root.getBoundingClientRect();
    const first = new Map<string, DOMRect>();
    if (animate) for (const [k, o] of this.tilesEls) first.set(k, o.el.getBoundingClientRect());
    for (const a of this.anims) a.cancel();
    this.anims = [];

    for (const o of this.tilesEls.values()) o.el.classList.remove('is-large');
    t.el.classList.toggle('is-large', large);
    this.root.hidden = false;
    if (!animate) return;

    // the enlarged tile is first in the grid: show the top before measuring the end state
    if (large) this.root.scrollTop = 0;
    const lastRoot = this.root.getBoundingClientRect();
    const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const duration = 320;
    this.root.classList.add('is-animating');
    const rootAnim = this.root.animate(
      { height: [`${firstRoot.height}px`, `${lastRoot.height}px`] },
      { duration, easing },
    );
    this.anims.push(rootAnim);
    for (const [k, o] of this.tilesEls) {
      const f = first.get(k);
      if (!f) continue;
      const l = o.el.getBoundingClientRect();
      if (!l.width || !l.height) continue;
      const dx = f.left - l.left;
      const dy = f.top - l.top;
      const sx = f.width / l.width;
      const sy = f.height / l.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
      o.el.classList.add('is-moving');
      const a = o.el.animate(
        [
          { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transformOrigin: '0 0', transform: 'none' },
        ],
        { duration, easing },
      );
      this.anims.push(a);
      const end = () => o.el.classList.remove('is-moving');
      a.onfinish = end;
      a.oncancel = end;
    }
    rootAnim.onfinish = () => {
      this.anims = [];
      this.root.classList.remove('is-animating');
    };
    rootAnim.oncancel = () => {
      if (!this.anims.includes(rootAnim)) this.root.classList.remove('is-animating');
    };
  }

  setActivity(id: string, text: string): void {
    const t = this.tilesEls.get(id);
    if (t && t.activity.textContent !== text) t.activity.textContent = text;
  }

  /** Screen rectangles of the visible tiles, to draw the scenes into. */
  tiles(): Array<FeedTile & { id: string }> {
    if (this.root.hidden || this.root.parentElement?.closest('[hidden]')) return []; // the "Leute" dock is closed
    const out: Array<FeedTile & { id: string }> = [];
    const box = this.root.getBoundingClientRect();
    for (const [id, t] of this.tilesEls) {
      const rect = t.el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      const l = Math.max(rect.left, box.left);
      const r = Math.min(rect.right, box.right);
      const tp = Math.max(rect.top, box.top);
      const b = Math.min(rect.bottom, box.bottom);
      if (r - l < 1 || b - tp < 1) continue;
      out.push({ id, variant: t.variant, rect, clip: new DOMRect(l, tp, r - l, b - tp) });
    }
    return out;
  }
}
