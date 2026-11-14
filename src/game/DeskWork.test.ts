import { describe, expect, it } from 'vitest';
import { DeskWork, type DeskActivity } from './DeskWork';
import { setSeed } from './rng';

/** Runs one sitting and returns how long each activity lasted plus the arm angles seen. */
function sit(role: string, seed: number, secs = 600, restless = false) {
  setSeed(seed);
  const d = new DeskWork(role, restless);
  const time: Record<DeskActivity, number> = { type: 0, mouse: 0, read: 0, lean: 0 };
  const armL: number[] = [];
  for (let i = 0; i < secs * 30; i++) {
    d.update(1 / 30);
    time[d.activity] += 1 / 30;
    armL.push(d.pose.armL);
  }
  return { time, armL, d };
}

describe('desk.typing-mouse', () => {
  it('desk.typing-mouse devs type more, designers use the mouse more', () => {
    const dev = sit('Developer Backend', 1, 1200).time;
    const design = sit('Grafik Design', 1, 1200).time;
    expect(dev.type).toBeGreaterThan(dev.mouse * 2);
    expect(design.mouse).toBeGreaterThan(design.type);
  });

  it('desk.typing-mouse has typing, mouse, reading and leaning states', () => {
    const t = sit('Marketing', 3, 1500).time;
    for (const k of Object.keys(t) as DeskActivity[]) expect(t[k], k).toBeGreaterThan(0);
  });

  it('desk.typing-mouse typing comes in bursts with pauses', () => {
    setSeed(5);
    const d = new DeskWork('Developer', false);
    let bursts = 0;
    let prev = false;
    let pauses = 0;
    for (let i = 0; i < 30 * 600; i++) {
      d.update(1 / 30);
      const typing = d.typeAmt > 0.5;
      if (typing && !prev) bursts++;
      if (!typing && d.activity === 'type' && d.typeAmt < 0.1) pauses++;
      prev = typing;
    }
    expect(bursts).toBeGreaterThan(5);
    expect(pauses).toBeGreaterThan(30);
  });

  it('desk.typing-mouse two people never move in sync', () => {
    setSeed(7);
    const a = new DeskWork('Developer', false);
    const b = new DeskWork('Developer', false);
    let same = 0;
    const n = 30 * 120;
    for (let i = 0; i < n; i++) {
      a.update(1 / 30);
      b.update(1 / 30);
      if (Math.abs(a.pose.armL - b.pose.armL) < 0.005 && Math.abs(a.pose.armR - b.pose.armR) < 0.005) same++;
    }
    expect(same / n).toBeLessThan(0.1);
  });

  it('desk.typing-mouse poses stay in a sane range', () => {
    const { armL, d } = sit('Grafik', 9, 600, true);
    expect(Math.min(...armL)).toBeGreaterThan(-1.5);
    expect(Math.max(...armL)).toBeLessThan(-0.4);
    expect(Math.abs(d.pose.lean)).toBeLessThan(0.3);
  });
});
