export class Overlay {
  private tooltip = document.getElementById('tooltip') as HTMLElement;
  private tipImage = document.getElementById('tooltip-image') as HTMLImageElement;
  private tipName = document.getElementById('tooltip-name') as HTMLElement;
  private tipRole = document.getElementById('tooltip-role') as HTMLElement;
  private labels = document.getElementById('labels') as HTMLElement;
  private labelEls = new Map<string, HTMLElement>();
  private reticle = document.getElementById('reticle') as HTMLElement;
  private reticlePrompt = document.getElementById('reticle-prompt') as HTMLElement;
  private labelClip = '';
  namesVisible = false;
  /** called whenever the name labels are switched on or off (the settings switch mirrors it) */
  onNames: ((on: boolean) => void) | null = null;

  /** Walk-mode crosshair: `null` hides it, '' shows the dot only, text adds the interaction hint below it. */
  setReticle(prompt: string | null): void {
    this.reticle.hidden = prompt === null;
    const has = !!prompt;
    this.reticlePrompt.hidden = !has;
    if (has && this.reticlePrompt.textContent !== prompt) this.reticlePrompt.textContent = prompt;
    this.reticle.classList.toggle('is-active', has);
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

  /**
   * Cuts holes into the label layer where the live feeds are: their tiles are see-through (the scenes are drawn
   * into the canvas behind), so the name labels of the office would otherwise show on top of the video.
   */
  maskOut(rects: DOMRect[]): void {
    const holes = rects.map((r) => `M${Math.round(r.left)} ${Math.round(r.top)}h${Math.round(r.width)}v${Math.round(r.height)}h${-Math.round(r.width)}Z`).join('');
    const clip = holes ? `path(evenodd, "M0 0H${window.innerWidth}V${window.innerHeight}H0Z${holes}")` : '';
    if (clip === this.labelClip) return;
    this.labelClip = clip;
    this.labels.style.clipPath = clip;
  }

  toggleNames(): void {
    this.setNames(!this.namesVisible);
  }

  setNames(on: boolean): void {
    this.namesVisible = on;
    for (const el of this.labelEls.values()) el.hidden = !on;
    this.onNames?.(on);
  }

  placeLabels(items: Array<{ id: string; x: number; y: number; hidden?: boolean; name?: string }>): void {
    for (const it of items) {
      const el = this.labelEls.get(it.id);
      if (!el) continue;
      const name = it.name?.split(' ')[0];
      if (name && el.textContent !== name) el.textContent = name; // e.g. Marco walking out as Kurt
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
      this.tipRole.hidden = !role;
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
