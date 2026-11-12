import { sidePanel } from './SidePanel';

export interface FeedEntry {
  id: string;
  name: string;
  variant: number;
  room: string;
}

export interface FeedTile {
  variant: number;
  rect: DOMRect;
  /** the part of the tile inside the scrolling panel */
  clip: DOMRect;
}

/**
 * Live "webcam" tiles of the people working from home. The tiles are empty DOM boxes: the game draws the home office
 * scenes into the main canvas behind them (see Game.renderFeeds), the DOM only adds the frame and the overlays.
 */
export class Feeds {
  private root = document.getElementById('feeds') as HTMLElement;
  private scroller = document.getElementById('side-scroll') as HTMLElement;
  private grid = document.getElementById('feeds-grid') as HTMLElement;
  private count = document.getElementById('feeds-count') as HTMLElement;
  private anims: Animation[] = [];
  private tilesEls = new Map<string, { el: HTMLElement; variant: number; activity: HTMLElement }>();

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
        '<span class="m-feed__live">Live</span><span class="m-feed__name"></span><span class="m-feed__activity"></span>';
      (el.querySelector('.m-feed__name') as HTMLElement).textContent = e.name.split(' ')[0];
      el.addEventListener('click', () => this.focus(e.id));
      this.grid.appendChild(el);
      this.tilesEls.set(e.id, { el, variant: e.variant, activity: el.querySelector('.m-feed__activity') as HTMLElement });
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = entries.length ? `· ${entries.length}` : '';
  }

  /** Enlarge one tile (click again to shrink). The tiles glide to their new size (FLIP). */
  focus(id: string): void {
    const t = this.tilesEls.get(id);
    if (!t) return;
    const large = !t.el.classList.contains('is-large');
    // a feed lives in the Leute tab: show it
    sidePanel().show('people');
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches && !!t.el.offsetParent;
    // First: where everything is right now (including a running animation)
    const first = new Map<string, DOMRect>();
    if (animate) for (const [k, o] of this.tilesEls) first.set(k, o.el.getBoundingClientRect());
    for (const a of this.anims) a.cancel();
    this.anims = [];

    for (const o of this.tilesEls.values()) o.el.classList.remove('is-large');
    t.el.classList.toggle('is-large', large);
    if (large) t.el.scrollIntoView({ block: 'nearest' });
    if (!animate) return;

    const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const duration = 320;
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
  }

  setActivity(id: string, text: string): void {
    const t = this.tilesEls.get(id);
    if (t && t.activity.textContent !== text) t.activity.textContent = text;
  }

  /** Screen rectangles of the visible tiles, to draw the scenes into. */
  tiles(): Array<FeedTile & { id: string }> {
    if (this.root.hidden || !this.root.offsetParent) return [];
    const out: Array<FeedTile & { id: string }> = [];
    const box = this.scroller.getBoundingClientRect();
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
