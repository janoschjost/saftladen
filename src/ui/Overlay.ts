export class Overlay {
  private tooltip = document.getElementById('tooltip') as HTMLElement;
  private tipImage = document.getElementById('tooltip-image') as HTMLImageElement;
  private tipName = document.getElementById('tooltip-name') as HTMLElement;
  private tipRole = document.getElementById('tooltip-role') as HTMLElement;
  private labels = document.getElementById('labels') as HTMLElement;
  private toggle = document.getElementById('toggle-names') as HTMLButtonElement;
  private meta = document.getElementById('hud-meta') as HTMLElement;
  private labelEls = new Map<string, HTMLElement>();
  private bubbleEls = new Map<string, HTMLElement>();
  namesVisible = false;

  constructor() {
    this.toggle.addEventListener('click', () => this.toggleNames());
  }

  setMeta(text: string): void {
    this.meta.textContent = text;
  }

  initLabels(items: Array<{ id: string; name: string }>): void {
    for (const it of items) {
      const el = document.createElement('span');
      el.className = 'm-label';
      el.textContent = it.name.split(' ')[0];
      el.hidden = true;
      this.labels.appendChild(el);
      this.labelEls.set(it.id, el);
    }
  }

  /** Speech bubbles above the people who are currently speaking. */
  setBubbles(items: Array<{ id: string; text: string; x: number; y: number }>): void {
    const active = new Set<string>();
    for (const it of items) {
      active.add(it.id);
      let el = this.bubbleEls.get(it.id);
      if (!el) {
        el = document.createElement('span');
        el.className = 'm-bubble';
        this.labels.appendChild(el);
        this.bubbleEls.set(it.id, el);
      }
      if (el.textContent !== it.text) el.textContent = it.text;
      el.hidden = false;
      el.style.transform = `translate(${Math.round(it.x - el.offsetWidth / 2)}px, ${Math.round(it.y - el.offsetHeight - 6)}px)`;
    }
    for (const [id, el] of this.bubbleEls) if (!active.has(id)) el.hidden = true;
  }

  toggleNames(): void {
    this.namesVisible = !this.namesVisible;
    this.toggle.setAttribute('aria-pressed', String(this.namesVisible));
    for (const el of this.labelEls.values()) el.hidden = !this.namesVisible;
  }

  placeLabels(items: Array<{ id: string; x: number; y: number; hidden?: boolean }>): void {
    for (const it of items) {
      const el = this.labelEls.get(it.id);
      if (!el) continue;
      if (el.style.visibility !== (it.hidden ? 'hidden' : '')) el.style.visibility = it.hidden ? 'hidden' : '';
      if (it.hidden) continue;
      const w = el.offsetWidth;
      el.style.transform = `translate(${Math.round(it.x - w / 2)}px, ${Math.round(it.y - el.offsetHeight)}px)`;
    }
  }

  showTooltip(name: string, role: string, portrait: string | null, at: { x: number; y: number }): void {
    if (this.tooltip.hidden) this.tooltip.hidden = false;
    if (this.tipName.textContent !== name) {
      this.tipName.textContent = name;
      this.tipRole.textContent = role;
      if (portrait) {
        this.tipImage.src = portrait.startsWith('data:') ? portrait : import.meta.env.BASE_URL + portrait;
        this.tipImage.hidden = false;
      } else {
        this.tipImage.hidden = true;
      }
    }
    const w = this.tooltip.offsetWidth;
    const h = this.tooltip.offsetHeight;
    this.tooltip.style.transform = `translate(${Math.round(at.x - w / 2)}px, ${Math.round(at.y - h - 8)}px)`;
  }

  hideTooltip(): void {
    if (!this.tooltip.hidden) {
      this.tooltip.hidden = true;
      this.tipName.textContent = '';
    }
  }
}
