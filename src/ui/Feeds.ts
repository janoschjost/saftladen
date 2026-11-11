import { makeCollapsible } from './collapsible';

export interface FeedEntry {
  id: string;
  name: string;
  variant: number;
  room: string;
}

export interface FeedTile {
  variant: number;
  rect: DOMRect;
}

/**
 * Live "webcam" tiles of the people working from home. The tiles are empty DOM boxes: the game draws the home office
 * scenes into the main canvas behind them (see Game.renderFeeds), the DOM only adds the frame and the overlays.
 */
export class Feeds {
  private root = document.getElementById('feeds') as HTMLElement;
  private grid = document.getElementById('feeds-grid') as HTMLElement;
  private count = document.getElementById('feeds-count') as HTMLElement;
  private tilesEls = new Map<string, { el: HTMLElement; variant: number; activity: HTMLElement; time: HTMLElement }>();
  private clock = 0;

  constructor() {
    makeCollapsible(this.root, this.root.querySelector('.m-feeds__title') as HTMLElement, 'saftladen.feeds.collapsed', 'dock');
  }

  sync(entries: FeedEntry[]): void {
    const ids = new Set(entries.map((e) => e.id));
    for (const [id, t] of this.tilesEls) {
      if (ids.has(id)) continue;
      t.el.remove();
      this.tilesEls.delete(id);
    }
    for (const e of entries) {
      if (this.tilesEls.has(e.id)) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'm-feed';
      el.title = 'Klicken zum Vergrössern';
      el.innerHTML =
        '<span class="m-feed__live">Live</span><span class="m-feed__name"></span><span class="m-feed__activity"></span><span class="m-feed__time"></span>';
      (el.querySelector('.m-feed__name') as HTMLElement).textContent = e.name.split(' ')[0];
      el.addEventListener('click', () => this.focus(e.id));
      this.grid.appendChild(el);
      this.tilesEls.set(e.id, { el, variant: e.variant, activity: el.querySelector('.m-feed__activity') as HTMLElement, time: el.querySelector('.m-feed__time') as HTMLElement });
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = String(entries.length);
  }

  /** Enlarge one tile (click again to shrink). */
  focus(id: string): void {
    const t = this.tilesEls.get(id);
    if (!t) return;
    const large = !t.el.classList.contains('is-large');
    for (const o of this.tilesEls.values()) o.el.classList.remove('is-large');
    t.el.classList.toggle('is-large', large);
    this.root.hidden = false;
  }

  setActivity(id: string, text: string): void {
    const t = this.tilesEls.get(id);
    if (t && t.activity.textContent !== text) t.activity.textContent = text;
  }

  /** Ticks the timestamp in the corner of each tile. */
  tick(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = 0.5;
    const now = new Date().toLocaleTimeString('de-CH');
    for (const t of this.tilesEls.values()) if (t.time.textContent !== now) t.time.textContent = now;
  }

  /** Screen rectangles of the visible tiles, to draw the scenes into. */
  tiles(): Array<FeedTile & { id: string }> {
    if (this.root.hidden) return [];
    const out: Array<FeedTile & { id: string }> = [];
    for (const [id, t] of this.tilesEls) {
      const rect = t.el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      out.push({ id, variant: t.variant, rect });
    }
    return out;
  }
}
