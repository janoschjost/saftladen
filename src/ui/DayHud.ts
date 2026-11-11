import type { DayMeter } from '../game/Day';

/** Top-centre card while a day is played: who, stopwatch, task list (filled by the stories) and an exit button. */
export class DayHud {
  private root = document.getElementById('day-hud') as HTMLElement;
  private name = document.getElementById('day-hud-name') as HTMLElement;
  private status = document.getElementById('day-hud-status') as HTMLElement;
  private clock = document.getElementById('day-hud-clock') as HTMLElement;
  private tasks = document.getElementById('day-hud-tasks') as HTMLElement;
  private meter = document.getElementById('day-hud-meter') as HTMLElement;
  private meterLabel = document.getElementById('day-hud-meter-label') as HTMLElement;
  private meterFill = document.getElementById('day-hud-meter-fill') as HTMLElement;
  private pointer = document.getElementById('day-pointer') as HTMLElement;
  private pointerDist = document.getElementById('day-pointer-dist') as HTMLElement;
  private pointerArrow = document.getElementById('day-pointer-arrow') as HTMLElement;
  private result = document.getElementById('day-result') as HTMLElement;
  private shown = '';

  constructor(onExit: () => void) {
    document.getElementById('day-hud-exit')!.addEventListener('click', onExit);
  }

  show(name: string): void {
    this.root.hidden = false;
    this.name.textContent = name;
  }

  hide(): void {
    this.root.hidden = true;
    this.result.hidden = true;
    this.pointer.hidden = true;
    this.meter.hidden = true;
  }

  /** Marker for the nearest target: sits on it when it is on screen, else at the screen edge pointing its way. `null` hides it. */
  setPointer(at: { x: number; y: number } | null, metres = 0): void {
    if (!at) {
      this.pointer.hidden = true;
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = 72;
    const cx = w / 2;
    const cy = h / 2;
    const on = at.x > m && at.x < w - m && at.y > m && at.y < h - m;
    let { x, y } = at;
    if (!on) {
      const dx = at.x - cx;
      const dy = at.y - cy;
      const k = Math.min((w / 2 - m) / (Math.abs(dx) || 1), (h / 2 - m) / (Math.abs(dy) || 1));
      x = cx + dx * k;
      y = cy + dy * k;
    }
    this.pointer.hidden = false;
    this.pointer.style.transform = `translate(${x}px, ${y}px)`;
    this.pointerArrow.hidden = on;
    this.pointerArrow.style.transform = `rotate(${Math.atan2(at.y - cy, at.x - cx) + Math.PI / 2}rad)`;
    const text = `${metres} m`;
    if (this.pointerDist.textContent !== text) this.pointerDist.textContent = text;
  }

  showResult(r: { name: string; total: string; best: string | null; record: boolean; rows: Array<{ title: string; time: string }> }, onAgain: () => void, onExit: () => void): void {
    this.pointer.hidden = true;
    this.result.hidden = false;
    this.result.classList.remove('is-failed');
    (document.getElementById('day-result-title') as HTMLElement).textContent = r.record ? 'Neue Bestzeit!' : 'Geschafft!';
    (document.getElementById('day-result-total') as HTMLElement).textContent = r.total;
    (document.getElementById('day-result-best') as HTMLElement).textContent = r.best ? `Bestzeit ${r.best}` : r.record ? `Schneller als je zuvor, ${r.name}` : '';
    document.getElementById('day-result-rows')!.replaceChildren(
      ...r.rows.map((row) => {
        const li = document.createElement('li');
        const a = document.createElement('span');
        a.textContent = row.title;
        const b = document.createElement('span');
        b.textContent = row.time;
        li.append(a, b);
        return li;
      }),
    );
    const again = document.getElementById('day-result-again') as HTMLButtonElement;
    const exit = document.getElementById('day-result-exit') as HTMLButtonElement;
    again.onclick = onAgain;
    exit.onclick = onExit;
    again.focus({ preventScroll: true });
  }

  /** The bar of the current task (label, fill 0..1, traffic-light mood); `null` hides it. */
  setMeter(m: DayMeter | null): void {
    this.meter.hidden = !m;
    if (!m) return;
    if (this.meterLabel.textContent !== m.label) this.meterLabel.textContent = m.label;
    this.meter.dataset.mood = m.mood;
    this.meterFill.style.transform = `scaleX(${Math.min(1, Math.max(0, m.value))})`;
  }

  /** The player lost: the same card as the result, with the reason instead of a time. */
  showFail(reason: string, onAgain: () => void, onExit: () => void): void {
    this.pointer.hidden = true;
    this.result.hidden = false;
    this.result.classList.add('is-failed');
    (document.getElementById('day-result-title') as HTMLElement).textContent = 'Erwischt!';
    (document.getElementById('day-result-total') as HTMLElement).textContent = '';
    (document.getElementById('day-result-best') as HTMLElement).textContent = reason;
    document.getElementById('day-result-rows')!.replaceChildren();
    const again = document.getElementById('day-result-again') as HTMLButtonElement;
    const exit = document.getElementById('day-result-exit') as HTMLButtonElement;
    again.onclick = onAgain;
    exit.onclick = onExit;
    again.focus({ preventScroll: true });
  }

  /** A line under the name ("kommt gleich ins Büro…"); '' clears it. */
  setStatus(text: string): void {
    this.status.textContent = text;
    this.status.hidden = !text;
  }

  setClock(seconds: number): void {
    const s = Math.floor(seconds);
    const text = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (text === this.shown) return;
    this.shown = text;
    this.clock.textContent = text;
  }

  setTasks(items: Array<{ text: string; done: boolean }>): void {
    this.tasks.hidden = !items.length;
    this.tasks.replaceChildren(
      ...items.map((t) => {
        const li = document.createElement('li');
        li.className = 'm-day-hud__task';
        li.classList.toggle('is-done', t.done);
        li.textContent = t.text;
        return li;
      }),
    );
  }
}
