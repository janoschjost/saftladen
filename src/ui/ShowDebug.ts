export interface ShowDebugHost {
  length: number;
  chapters: Array<{ name: string; t: number }>;
  paused: () => boolean;
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  seek: (t: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** `?show&debug`: a strip to test the film: play / pause, speed, a timeline to scrub and a button per chapter. Not part of the film. */
export class ShowDebug {
  private range: HTMLInputElement;
  private readout: HTMLElement;
  private play: HTMLButtonElement;
  private chapterEls: HTMLButtonElement[] = [];
  private scrubbing = false;

  constructor(private host: ShowDebugHost) {
    const root = document.createElement('div');
    root.className = 'm-show-debug';
    this.play = this.button('⏸', () => host.togglePause());
    const speeds = SPEEDS.map((s) =>
      this.button(`${s}×`, () => {
        host.setSpeed(s);
        speeds.forEach((b, i) => b.classList.toggle('is-active', SPEEDS[i] === s));
      }),
    );
    speeds[SPEEDS.indexOf(1)].classList.add('is-active');
    this.range = document.createElement('input');
    this.range.type = 'range';
    this.range.min = '0';
    this.range.max = String(host.length);
    this.range.step = '0.1';
    this.range.value = '0';
    this.range.addEventListener('pointerdown', () => (this.scrubbing = true));
    this.range.addEventListener('input', () => host.seek(Number(this.range.value)));
    this.range.addEventListener('change', () => (this.scrubbing = false));
    this.readout = document.createElement('span');
    this.readout.className = 'm-show-debug__time';
    const chapters = document.createElement('div');
    chapters.className = 'm-show-debug__chapters';
    this.chapterEls = host.chapters.map((c) => {
      const b = this.button(c.name, () => host.seek(c.t));
      chapters.append(b);
      return b;
    });
    const row = document.createElement('div');
    row.className = 'm-show-debug__row';
    row.append(this.play, ...speeds, this.range, this.readout);
    root.append(row, chapters);
    document.body.append(root);
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  /** every frame: the film is at second `t` */
  sync(t: number): void {
    if (!this.scrubbing) this.range.value = String(t);
    const at = this.host.chapters.filter((c) => c.t <= t).length - 1;
    this.readout.textContent = `${clock(t)} / ${clock(this.host.length)}`;
    this.play.textContent = this.host.paused() ? '▶' : '⏸';
    this.chapterEls.forEach((b, i) => b.classList.toggle('is-active', i === at));
  }
}
