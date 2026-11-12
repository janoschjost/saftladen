import { describe, expect, it } from 'vitest';
import { NavGrid } from './NavGrid';
import { describeState, gridPixels, pathPoints, type DebugWalker } from './debugView';

const walker = (o: Partial<DebugWalker> = {}): DebugWalker => ({ id: 'x', state: 'idle', path: [], ...o });

describe('dev.overlays', () => {
  it('grid pixels match the nav grid cell by cell, also after the layout changes', () => {
    const nav = new NavGrid(6, 4, 0.5);
    const check = () => {
      const px = gridPixels(nav);
      expect(px.length).toBe(6 * 4 * 4);
      for (let z = 0; z < 4; z++)
        for (let x = 0; x < 6; x++) {
          const i = (z * 6 + x) * 4;
          const blocked = px[i] > px[i + 1]; // red wins over green
          expect(blocked, `cell ${x},${z}`).toBe(!nav.walkable(x, z));
        }
    };
    check();
    nav.block(1, 1, 2, 2);
    check();
    nav.clear();
    nav.block(4, 0);
    check();
  });

  it('state labels say what somebody is doing', () => {
    expect(describeState(walker())).toBe('wander · idle');
    expect(describeState(walker({ state: 'walk', run: {} }))).toBe('run · walk');
    expect(describeState(walker({ task: { phase: 'work' } }))).toBe('desk:work · idle');
    expect(describeState(walker({ inMeeting: true, meetPhase: 'gather', task: { phase: 'work' } }))).toBe('meeting:gather · idle');
    expect(describeState(walker({ held: true }))).toBe('held · idle');
    expect(describeState(walker({ presence: 'out', awayKind: 'home' }))).toBe('out:home');
    expect(describeState(walker({ presence: 'leaving', awayKind: 'errand' }))).toBe('leaving:errand');
  });

  it('pets get their own labels', () => {
    expect(describeState(walker({ owner: {}, state: 'walk' }))).toBe('pet:walk');
    expect(describeState(walker({ owner: {}, away: true }))).toBe('pet:away');
    expect(describeState(walker({ owner: {}, petted: {} }))).toBe('pet:petted');
    expect(describeState(walker({ owner: {}, sleep: 0.9 }))).toBe('pet:sleep');
  });

  it('paths start where the walker is and run through the waypoints still ahead', () => {
    const at = { x: 1, z: 1 };
    expect(pathPoints(walker(), at)).toEqual([]);
    expect(pathPoints(walker({ path: [{ x: 2, z: 1 }, { x: 2, z: 3 }] }), at)).toEqual([at, { x: 2, z: 1 }, { x: 2, z: 3 }]);
    expect(pathPoints(walker({ away: true, path: [{ x: 2, z: 1 }] }), at)).toEqual([]);
  });
});
