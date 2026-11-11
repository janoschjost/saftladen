export interface SeatPerson {
  id: string;
  name: string;
}

/** Seat assignment: a number label above every desk and a panel where each person gets a seat number (or none = picks any free desk). */
export class Seats {
  private root = document.getElementById('seats') as HTMLElement;
  private list = document.getElementById('seats-list') as HTMLElement;
  private toggle = document.getElementById('toggle-seats') as HTMLButtonElement;
  private labels = document.getElementById('labels') as HTMLElement;
  private labelEls: HTMLElement[] = [];
  private selects = new Map<string, HTMLSelectElement>();
  open = false;

  constructor(
    private deskCount: number,
    private people: SeatPerson[],
    private onAssign: (personId: string, number: number | null) => void,
  ) {
    for (let n = 1; n <= deskCount; n++) {
      const el = document.createElement('span');
      el.className = 'm-seat-label';
      el.textContent = String(n);
      this.labels.appendChild(el);
      this.labelEls.push(el);
    }
    for (const p of people) {
      const li = document.createElement('li');
      li.className = 'm-seats__row';
      const name = document.createElement('span');
      name.className = 'm-seats__name';
      name.textContent = p.name;
      const select = document.createElement('select');
      select.className = 'm-seats__select';
      select.setAttribute('aria-label', `Platz für ${p.name}`);
      select.addEventListener('change', () => this.onAssign(p.id, select.value ? Number(select.value) : null));
      li.append(name, select);
      this.list.appendChild(li);
      this.selects.set(p.id, select);
    }
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-pressed', String(open));
  }

  /** seat number -> id of the person it is assigned to */
  setOwners(owners: Map<number, string>): void {
    const nameOf = (id: string) => this.people.find((p) => p.id === id)?.name.split(' ')[0] ?? '';
    for (const p of this.people) {
      const select = this.selects.get(p.id)!;
      select.replaceChildren(new Option('Kein Platz', ''));
      for (let n = 1; n <= this.deskCount; n++) {
        const owner = owners.get(n);
        select.add(new Option(owner && owner !== p.id ? `${n} · ${nameOf(owner)}` : String(n), String(n)));
      }
      const own = [...owners].find(([, id]) => id === p.id)?.[0];
      select.value = own ? String(own) : '';
    }
    this.labelEls.forEach((el, i) => {
      const owner = owners.get(i + 1);
      el.textContent = owner ? `${i + 1} · ${nameOf(owner)}` : String(i + 1);
    });
  }

  placeLabels(items: Array<{ number: number; x: number; y: number; hidden: boolean }>): void {
    for (const it of items) {
      const el = this.labelEls[it.number - 1];
      if (!el) continue;
      if (el.style.visibility !== (it.hidden ? 'hidden' : '')) el.style.visibility = it.hidden ? 'hidden' : '';
      if (it.hidden) continue;
      el.style.transform = `translate(${Math.round(it.x - el.offsetWidth / 2)}px, ${Math.round(it.y - el.offsetHeight)}px)`;
    }
  }
}
