import { beforeEach, describe, expect, it } from 'vitest';
import type { OfficeModel } from '../render/officeModel';
import type { MeetSeat } from './Meeting';
import { NavGrid, type Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { Talk } from './Social';
import { QUEUE_MAX, Toilets } from './Toilets';
import { setSeed } from './rng';

const STEP = 1 / 60;

/** Just what Toilets reads from a person: the meeting-seat walk is reduced to "called" → `arrive()` → seated. */
class Fake {
  talk: Talk | null = null;
  held = false;
  controlled = false;
  presence = 'in';
  state: 'idle' | 'walk' = 'idle';
  timer = 0;
  gameboyOn = false;
  pos: Vec2 = { x: 5, z: 8 };
  seat: MeetSeat | null = null;
  phase: 'approach' | 'sit' | null = null;
  away = false;
  queuedAt: Vec2 | null = null;

  constructor(readonly id: string) {}

  get inMeeting(): boolean {
    return !!this.phase;
  }
  get meetSeated(): boolean {
    return this.phase === 'sit';
  }
  callToMeeting(_nav: NavGrid, seat: MeetSeat, talk: Talk): void {
    seat.occupant = this as unknown as Person;
    this.seat = seat;
    this.talk = talk;
    this.phase = 'approach';
  }
  arrive(): void {
    this.phase = 'sit';
  }
  /** stands up and walks out at once */
  dismissMeeting(): void {
    if (this.seat?.occupant === (this as unknown as Person)) this.seat.occupant = null;
    this.seat = null;
    this.phase = null;
    this.talk = null;
  }
  queueAt(_nav: NavGrid, spot: Vec2, talk: Talk): void {
    this.talk = talk;
    this.queuedAt = spot;
    this.pos = { ...spot };
  }
}
const asPerson = (f: Fake) => f as unknown as Person;

/** Two cabins side by side along z = 1 (doors at z = 1.6, facing +z), two spots to wait at. */
function washroom(): Toilets {
  const nav = new NavGrid(12, 12);
  const sign = { color: { setHex() {} } };
  const model = {
    cabins: [2.5, 4.5].map((x) => ({ seat: { x, z: 1, yaw: 0 }, doorPos: { x, z: 1.6 }, sign })),
    wait: [
      { x: 2.25, z: 4.25 },
      { x: 4.25, z: 4.25 },
    ],
  } as unknown as OfficeModel['toilets'];
  return new Toilets(model, nav);
}
const nav = new NavGrid(12, 12);
const run = (t: Toilets, seconds: number) => {
  for (let s = 0; s < seconds; s += STEP) t.update(STEP, [], nav);
};

describe('place.toilet', () => {
  beforeEach(() => setSeed(1));

  it('sends one person per cabin, the door is locked and the light red only while they sit and play', () => {
    const t = washroom();
    const locked: boolean[] = [];
    const occupied: boolean[] = [];
    t.onLocked = (_c, v) => locked.push(v);
    t.onOccupied = (_c, v) => occupied.push(v);
    const a = new Fake('a');
    expect(t.go(asPerson(a), nav)).toBe('cabin');
    expect(t.cabins[0].seat.occupant).toBe(a);
    t.update(STEP, [], nav);
    expect(t.isOccupied(t.cabins[0])).toBe(true); // reserved right away, so nobody else is sent in
    expect(occupied).toEqual([]); // the light stays green while they are still on the way
    expect(locked).toEqual([]);
    expect(a.gameboyOn).toBe(false);
    a.arrive();
    t.update(STEP, [], nav);
    expect(occupied).toEqual([true]); // the door shuts behind them: light red and door locked together
    expect(locked).toEqual([true]);
    expect(a.gameboyOn).toBe(true);
  });

  it('plays for a random while, then leaves: handheld away, door unlocked, cabin free', () => {
    const t = washroom();
    const a = new Fake('a');
    t.go(asPerson(a), nav);
    a.arrive();
    run(t, 15);
    expect(a.meetSeated).toBe(true); // at least 20 s
    run(t, 40);
    expect(a.inMeeting).toBe(false);
    expect(a.gameboyOn).toBe(false);
    t.update(STEP, [], nav);
    expect(t.cabins[0].session).toBeNull();
    expect(t.isOccupied(t.cabins[0])).toBe(false);
  });
});

describe('place.toilet-queue', () => {
  beforeEach(() => setSeed(1));

  it('an occupied cabin is never entered by a second person: they take the other one, then queue', () => {
    const t = washroom();
    const [a, b, c] = [new Fake('a'), new Fake('b'), new Fake('c')];
    expect(t.go(asPerson(a), nav)).toBe('cabin');
    expect(t.go(asPerson(b), nav)).toBe('cabin');
    expect(t.cabins.map((k) => k.seat.occupant)).toEqual([a, b]);
    expect(t.go(asPerson(c), nav)).toBe('queue');
    expect(c.inMeeting).toBe(false);
    expect(c.talk).not.toBeNull(); // waiting, nobody pulls them into a chat
    expect(t.cabins.map((k) => k.seat.occupant)).toEqual([a, b]);
    expect(t.go(asPerson(a), nav)).toBeNull(); // already in there
  });

  it('the queue is short: once it is full nobody else is sent', () => {
    const t = washroom();
    for (let i = 0; i < 2; i++) t.go(asPerson(new Fake(`in${i}`)), nav);
    for (let i = 0; i < QUEUE_MAX; i++) expect(t.go(asPerson(new Fake(`q${i}`)), nav)).toBe('queue');
    expect(t.go(asPerson(new Fake('late')), nav)).toBeNull();
    expect(t.queue.length).toBe(QUEUE_MAX);
    expect(new Set(t.queue.map((w) => w.spot)).size).toBe(QUEUE_MAX); // each waits on their own spot
  });

  it('the first in the queue goes in as soon as a cabin is free', () => {
    const t = washroom();
    const [a, b, c] = [new Fake('a'), new Fake('b'), new Fake('c')];
    t.go(asPerson(a), nav);
    t.go(asPerson(b), nav);
    t.go(asPerson(c), nav);
    a.arrive();
    b.arrive();
    run(t, 5);
    expect(c.inMeeting).toBe(false);
    a.dismissMeeting(); // done (or pulled out)
    t.update(STEP, [], nav);
    t.update(STEP, [], nav);
    expect(t.queue.length).toBe(0);
    expect(t.cabins[0].seat.occupant).toBe(c);
    expect(c.inMeeting).toBe(true);
  });

  it('gives up after waiting too long and goes elsewhere', () => {
    const t = washroom();
    const [a, b, c] = [new Fake('a'), new Fake('b'), new Fake('c')];
    t.go(asPerson(a), nav);
    t.go(asPerson(b), nav);
    t.go(asPerson(c), nav);
    run(t, 46); // a and b still on their way in: the cabins stay taken
    expect(t.cabins.every((k) => k.session)).toBe(true);
    expect(t.queue.length).toBe(0);
    expect(c.talk).toBeNull();
    expect(c.inMeeting).toBe(false);
  });

  it('leaves the queue when picked up by the player', () => {
    const t = washroom();
    const [a, b, c] = [new Fake('a'), new Fake('b'), new Fake('c')];
    t.go(asPerson(a), nav);
    t.go(asPerson(b), nav);
    t.go(asPerson(c), nav);
    c.held = true;
    t.update(STEP, [], nav);
    expect(t.queue.length).toBe(0);
  });
});
