import { describe, expect, it } from 'vitest';
import { awayStatus } from '../i18n/strings';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { rosterEntries } from './rosterEntries';
import { cycleOf } from './TimeOfDay';
import type { Sim } from './Sim';

installHeadlessDom();

const entries = (sim: Sim) => rosterEntries(sim.presence.listed, () => null);
const first = (name: string) => name.split(' ')[0];

/** the office at 22:00, two seconds in */
function night(): Sim {
  const sim = office({ cycle: cycleOf(22) });
  run(sim, 2);
  return sim;
}

describe('presence.roster', () => {
  it('presence.roster: everybody who is not in the office is listed, also at night', () => {
    const sim = night();
    const out = sim.people.filter((p) => p.presence !== 'in');
    expect(out.length).toBeGreaterThan(sim.people.length / 2);
    expect(entries(sim).map((e) => e.id).sort()).toEqual(out.map((p) => p.id).sort());
    expect(entries(sim).some((e) => e.kind === 'off')).toBe(true);
  });

  it('presence.roster: errand and home office rows keep their kind, off duty rows are "Zuhause" without a countdown', () => {
    const sim = night();
    const [a, b] = sim.people.filter((p) => p.presence === 'in' || p.awayKind === 'off').map((p) => p.id);
    sim.scenario.put(a, 'errand');
    sim.scenario.put(b, 'home');
    const rows = entries(sim);
    expect(rows.find((e) => e.id === a)?.kind).toBe('errand');
    expect(rows.find((e) => e.id === b)?.kind).toBe('home');
    const off = rows.find((e) => e.kind === 'off')!;
    expect(off.phase).toBe('out');
    expect(awayStatus(off.kind, off.phase, off.left)).toBe('Zuhause');
    expect(awayStatus('off', 'out', 12)).not.toMatch(/\d/);
  });

  it('presence.roster: by day, people who are off duty are rows too; somebody in the office is not', () => {
    const sim = office();
    run(sim, 2);
    const rows = entries(sim);
    for (const p of sim.people) expect(rows.some((e) => e.id === p.id), p.id).toBe(p.presence !== 'in');
    // the day has ended for one of them: they are a row at once
    const gone = sim.people.find((p) => p.presence === 'in')!;
    sim.scenario.put(gone.id, 'home');
    expect(entries(sim).some((e) => e.id === gone.id)).toBe(true);
  });

  it('presence.roster: rows are alphabetical by the name shown, whatever the reason they are out', () => {
    const sim = night();
    const names = entries(sim).map((e) => first(e.name));
    expect(names.length).toBeGreaterThan(10);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  });

  it('presence.roster: people removed in the dev panel are not listed, and are again when restored', () => {
    const sim = night();
    const p = sim.people.find((o) => o.presence !== 'in')!;
    const gone = sim.people.find((o) => o.presence === 'in') ?? sim.people.find((o) => o !== p)!;
    sim.presence.remove(gone);
    sim.presence.remove(p);
    expect(entries(sim).some((e) => e.id === p.id || e.id === gone.id)).toBe(false);
    sim.presence.restore(p);
    expect(entries(sim).some((e) => e.id === p.id)).toBe(true);
  });

  it('presence.roster: somebody off duty called back at night walks in through the door, stays in and leaves the list', () => {
    const sim = night();
    const p = sim.people.find((o) => o.presence === 'out' && o.awayKind === 'off')!;
    sim.presence.callBack(p);
    expect(run(sim, 60, () => p.presence === 'in')).toBe(true);
    expect(entries(sim).some((e) => e.id === p.id)).toBe(false);
    // still there an hour past the end of their day
    sim.tod.jumpTo(cycleOf(23));
    run(sim, 120);
    expect(p.presence).toBe('in');
  });

  it('presence.door-flow: "Alle zurückholen" at night brings everybody listed in, two at most on their way in at once', () => {
    const sim = night();
    const listed = entries(sim).length;
    expect(listed).toBeGreaterThan(10);
    sim.presence.callAllBack();
    let most = 0;
    expect(
      run(
        sim,
        600,
        () => entries(sim).length === 0,
        () => (most = Math.max(most, sim.people.filter((p) => p.presence === 'returning').length)),
      ),
    ).toBe(true);
    expect(most).toBeLessThanOrEqual(2);
  });
});
