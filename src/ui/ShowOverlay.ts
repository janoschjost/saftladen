/** What the Christmas show puts over the picture (#275): letterbox bars, subtitles with name plates, title cards, the dip to black. */
export class ShowOverlay {
  private root = document.getElementById('show') as HTMLElement;
  private sub = document.getElementById('show-sub') as HTMLElement;
  private plates = document.getElementById('show-plates') as HTMLElement;
  private card = document.querySelector('#show .m-show__card') as HTMLElement;
  private head = document.getElementById('show-title') as HTMLElement;
  private headSub = document.getElementById('show-title-sub') as HTMLElement;
  private fadeEl = document.getElementById('show-fade') as HTMLElement;
  private pause = document.getElementById('show-paused') as HTMLElement;

  /** Bars and the stage on (the HUD is hidden by `body.is-show`) or off. */
  set active(on: boolean) {
    this.root.hidden = !on;
    document.body.classList.toggle('is-show', on);
  }

  /** One subtitle line; `null` takes it away. `who`: name and role of the people it is about. */
  say(text: string | null, who: Array<{ name: string; role: string }> = []): void {
    this.sub.textContent = text ?? '';
    this.sub.classList.toggle('is-on', !!text);
    this.plates.replaceChildren(
      ...(text ? who : []).map((p) => {
        const el = document.createElement('span');
        el.className = 'm-show__plate';
        const name = document.createElement('b');
        name.textContent = p.name;
        el.append(name, document.createTextNode(p.role));
        return el;
      }),
    );
    this.plates.classList.toggle('is-on', !!text && who.length > 0);
  }

  title(head: string | null, sub = ''): void {
    this.head.textContent = head ?? '';
    this.headSub.textContent = head ? sub : '';
    this.card.classList.toggle('is-on', !!head);
  }

  /** The picture goes to black (true) or comes back (false) in `seconds`; 0 is at once. */
  fade(black: boolean, seconds: number): void {
    this.fadeEl.style.transitionDuration = `${seconds}s`;
    this.fadeEl.classList.toggle('is-black', black);
  }

  setPaused(on: boolean): void {
    this.pause.hidden = !on;
    document.body.classList.toggle('is-show-paused', on);
  }
}
