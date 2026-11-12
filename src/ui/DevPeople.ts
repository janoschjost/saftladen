import { FORCE_LABELS, FORCE_STATES } from '../game/forceState';

/** "Leute" section of the dev panel (dev only): pick a person, press a state to send them there. */
export class DevPeople {
  constructor(
    people: { id: string; name: string }[],
    force: (personId: string, state: string) => string,
  ) {
    const root = document.getElementById('dev-people');
    const status = document.getElementById('dev-status');
    if (!root) return;
    const h = document.createElement('h3');
    h.className = 'm-dev__group';
    h.textContent = 'Leute';
    const select = document.createElement('select');
    select.className = 'm-dev__select';
    select.setAttribute('aria-label', 'Person');
    for (const p of people) select.add(new Option(p.name, p.id));
    const wrap = document.createElement('div');
    wrap.className = 'm-dev__buttons';
    for (const state of FORCE_STATES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-button';
      b.dataset.state = state;
      b.textContent = FORCE_LABELS[state];
      b.addEventListener('click', () => {
        const msg = force(select.value, state);
        if (status) status.textContent = msg;
      });
      wrap.appendChild(b);
    }
    root.replaceChildren(h, select, wrap);
  }
}
