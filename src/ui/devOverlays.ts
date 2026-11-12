import { OVERLAY_KINDS, type DebugOverlays, type OverlayKind } from '../game/DebugOverlays';

const LABELS: Record<OverlayKind, string> = { grid: 'Nav-Grid', states: 'Zustände', paths: 'Pfade' };

/** Dev panel section: one toggle per debug overlay (pressed = on). */
export function overlaySection(overlays: DebugOverlays) {
  return (body: HTMLElement, status: HTMLElement): void => {
    const h = document.createElement('h3');
    h.className = 'm-dev__group';
    h.textContent = 'Debug-Overlays';
    const wrap = document.createElement('div');
    wrap.className = 'm-dev__buttons';
    for (const kind of OVERLAY_KINDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-button';
      b.dataset.overlay = kind;
      b.textContent = LABELS[kind];
      b.setAttribute('aria-pressed', String(overlays.on[kind]));
      b.addEventListener('click', () => {
        const on = !overlays.on[kind];
        overlays.set(kind, on);
        b.setAttribute('aria-pressed', String(on));
        status.textContent = `${LABELS[kind]} ${on ? 'an' : 'aus'}`;
      });
      wrap.appendChild(b);
    }
    body.append(h, wrap);
  };
}
