/**
 * A panel that opens under a round HUD button (settings, environment). Esc, `key`, a press outside or the close button
 * close it; the keyboard focus goes into it on open and back to the button on close. `onOpen` lets the owner close its
 * sibling popover.
 */
export class Popover {
  constructor(
    readonly root: HTMLElement,
    readonly toggle: HTMLButtonElement,
    private opts: { close?: HTMLElement | null; key?: string; onOpen?: () => void } = {},
  ) {
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
    return !this.root.hidden;
  }

  /** `refocus`: the keyboard focus goes back to the button (closed with Esc or the close button). */
  setOpen(open: boolean, refocus = false): void {
    if (open === this.isOpen) return;
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      this.opts.onOpen?.();
      (this.root.querySelector('input:checked, input, button') as HTMLElement | null)?.focus({ preventScroll: true });
    } else if (refocus || this.root.contains(document.activeElement)) this.toggle.focus({ preventScroll: true });
  }
}
