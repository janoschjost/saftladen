import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office } from '../test/office';
import { OFFICE_ACTIONS, validateActions, type OfficeAction } from './actions';

installHeadlessDom();

/** The dev events of a real office (`src/game/simEvents.ts`): every card must run one of them. */
const registered = office().events.list().map((e) => e.id);

describe('actions.list', () => {
  it('finds the registered dev events', () => {
    expect(registered).toEqual(expect.arrayContaining(['printer', 'meeting-room', 'coffee', 'phone-booth', 'foosball', 'pod']));
  });

  it('every card runs an existing dev event and is complete', () => {
    expect(validateActions(OFFICE_ACTIONS, registered)).toEqual([]);
  });

  it('has the default cards in order', () => {
    expect(OFFICE_ACTIONS.map((a) => [a.label, a.eventId])).toEqual([
      ['Drucken', 'printer'],
      ['Meeting', 'meeting-room'],
      ['Kaffee', 'coffee'],
      ['Telefonbox', 'phone-booth'],
      ['Kicker', 'foosball'],
      ['Holzhaus', 'pod'],
      ['Mariokart', 'meeting-kart'],
      ['WC', 'toilet'],
      ['Gespräch', 'meeting-chat'],
      ['Nerf-Gefecht', 'nerf'],
      ['Fotoshooting', 'photo-shoot'],
      ['Serverschrank', 'server-rack'],
    ]);
  });

  it('places lie inside the office (41 x 15 m plus walls)', () => {
    for (const a of OFFICE_ACTIONS) {
      expect(a.place.x).toBeGreaterThan(0);
      expect(a.place.x).toBeLessThan(43);
      expect(a.place.z).toBeGreaterThan(0);
      expect(a.place.z).toBeLessThan(19);
    }
  });

  it('reports unknown events, duplicates and bad numbers', () => {
    const base = OFFICE_ACTIONS[0];
    const bad: OfficeAction[] = [
      { ...base, eventId: 'nope' },
      { ...base, zoom: 0 },
      { ...base, id: 'x', angle: Number.NaN },
    ];
    const problems = validateActions(bad, registered);
    expect(problems.some((p) => p.includes('no dev event "nope"'))).toBe(true);
    expect(problems.some((p) => p.includes('duplicate'))).toBe(true);
    expect(problems.some((p) => p.includes('zoom'))).toBe(true);
    expect(problems.some((p) => p.includes('angle'))).toBe(true);
  });
});
