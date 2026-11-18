/**
 * A panel that opens above a round HUD button (controls, environment, settings); only one is open at a time. Esc, `key`, a press outside or the close button
 * close it; the keyboard focus goes into it on open and back to the button on close. `onOpen` lets the owner close its
 * sibling popover.
 */
export class Popover {
  private static all = new Set<Popover>();
  private closing: Animation | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly toggle: HTMLButtonElement,
    private opts: { close?: HTMLElement | null; key?: string; onOpen?: () => void } = {},
  ) {
    Popover.all.add(this);
    toggle.addEventListener('click', () => this.setOpen(!this.isOpen));
    opts.close?.addEventListener('click', () => this.setOpen(false, true));
    // a press anywhere outside closes it (the button toggles by itself)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.isOpen) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.toggle.contains(t)) return;
        this.setOpen(false);
      },
      { capture: true, passive: true },
    );
    // capture: Esc (or the key again) closes the popover first and goes no further (no deselect, no end of the day)
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen || (e.key !== 'Escape' && e.key !== opts.key)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.setOpen(false, true);
      },
      true,
    );
  }

  get isOpen(): boolean {
    return !this.root.hidden && !this.closing;
  }

  /** a short fade and rise when it opens, the same back when it closes (none with reduced motion) */
  private animate(open: boolean): void {
    this.closing?.cancel();
    this.closing = null;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.root.hidden = !open;
      return;
    }
    const hide = { opacity: 0, transform: 'translateY(0.75rem) scale(0.97)' };
    const show = { opacity: 1, transform: 'none' };
    this.root.hidden = false;
    const a = this.root.animate(open ? [hide, show] : [show, hide], { duration: open ? 180 : 130, easing: 'ease-out' });
    if (open) return;
    this.closing = a;
    a.onfinish = () => {
      if (this.closing !== a) return;
      this.closing = null;
      this.root.hidden = true;
    };
  }

  /** `refocus`: the keyboard focus goes back to the button (closed with Esc or the close button). */
  setOpen(open: boolean, refocus = false): void {
    if (open === this.isOpen) return;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) for (const other of Popover.all) if (other !== this) other.setOpen(false);
    this.animate(open);
    if (open) {
      this.opts.onOpen?.();
      (this.root.querySelector('input:checked, input, button') as HTMLElement | null)?.focus({ preventScroll: true });
    } else if (refocus || this.root.contains(document.activeElement)) this.toggle.focus({ preventScroll: true });
  }
}
