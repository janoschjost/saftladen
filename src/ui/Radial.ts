const ANGLES = { follow: -90, steer: -18, home: 54, out: 126, info: 198 } as const;
export type RadialAct = keyof typeof ANGLES;

export interface RadialState {
  /** a person (all five buttons) or a pet (follow and info only) */
  person: boolean;
  follow: boolean;
  steer: boolean;
  home: boolean;
  out: boolean;
  /** no free home office: the Home button is disabled */
  homeFull: boolean;
  homeTitle: string;
}

/** The ring of five round buttons around the selected person. It follows them while they walk. */
export class Radial {
  private root = document.getElementById('radial') as HTMLElement;
  private buttons = new Map<RadialAct, HTMLButtonElement>();
  private pos = '';

  constructor(handlers: Record<RadialAct, () => void>) {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-act]')) {
      const act = b.dataset.act as RadialAct;
      this.buttons.set(act, b);
      const rad = (ANGLES[act] * Math.PI) / 180;
      b.style.setProperty('--cx', Math.cos(rad).toFixed(4));
      b.style.setProperty('--cy', Math.sin(rad).toFixed(4));
      b.style.setProperty('--n', String(Object.keys(ANGLES).indexOf(act)));
      b.addEventListener('click', () => handlers[act]());
    }
  }

  /** pixels from the ring's centre to the top edge of its highest button */
  get extent(): number {
    return this.root.offsetHeight / 2 + parseFloat(getComputedStyle(document.documentElement).fontSize) * 2;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** `state` null hides the ring; x / y are window pixels of the person's waist. */
  update(state: RadialState | null, x = 0, y = 0): void {
    this.root.hidden = !state;
    if (!state) return;
    const pos = `${Math.round(x)}px ${Math.round(y)}px`;
    if (pos !== this.pos) {
      this.pos = pos;
      this.root.style.translate = pos;
    }
    for (const act of ['steer', 'home', 'out'] as const) this.buttons.get(act)!.hidden = !state.person;
    const set = (act: RadialAct, pressed: boolean) => this.buttons.get(act)!.setAttribute('aria-pressed', String(pressed));
    set('follow', state.follow);
    set('steer', state.steer);
    set('home', state.home);
    set('out', state.out);
    const home = this.buttons.get('home')!;
    home.disabled = state.homeFull;
    home.title = state.homeFull ? state.homeTitle : '';
  }
}
