/** What the dev panel needs to take people and pets out of the sim and back (dev server only, see `Game`). */
export interface DevCast {
  list(): Array<{ id: string; name: string; kind: 'person' | 'pet' }>;
  removed(): string[];
  set(id: string, removed: boolean): string | null;
}

/** Dev panel section: a toggle per person and pet, pressed = taken out of the sim. */
export const castSection = (cast: DevCast) => (root: HTMLElement, status: HTMLElement): void => {
  const out = new Set(cast.removed());
  for (const [title, kind] of [['Personen', 'person'], ['Tiere', 'pet']] as const) {
    const h = document.createElement('h3');
    h.className = 'm-dev__group';
    h.textContent = `${title} entfernen`;
    const wrap = document.createElement('div');
    wrap.className = 'm-dev__buttons';
    for (const c of cast.list().filter((e) => e.kind === kind)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-button';
      b.dataset.id = c.id;
      b.textContent = c.name;
      b.setAttribute('aria-pressed', String(out.has(c.id)));
      b.addEventListener('click', () => {
        const removed = b.getAttribute('aria-pressed') !== 'true';
        const msg = cast.set(c.id, removed);
        if (msg === null) return;
        b.setAttribute('aria-pressed', String(removed));
        status.textContent = msg;
      });
      wrap.appendChild(b);
    }
    root.append(h, wrap);
  }
};
