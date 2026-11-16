import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { BOB_RANGE, BOSS, DJ, NOTICE, REACH, YELL, YELLS } from './Boombox';
import type { Desk } from './Office';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { cycleOf } from './TimeOfDay';

installHeadlessDom();

/**
 * Sandro's boombox (`Boombox.ts`, #177) on the whole office: when the gag starts, the scene from the music to the
 * boombox on Donata's desk, the next day, and how it ends when one of the two is taken away mid-scene. The look
 * (boombox, notes, bobbing, gestures) is checked by eye.
 */

interface Stage {
  sim: Sim;
  dj: Person;
  boss: Person;
  desk: Desk;
}

const dist = (a: Person, b: { x: number; z: number }) => Math.hypot(a.pos.x - b.x, a.pos.z - b.z);

/** walkable cells within a metre of `p`: room to stand and to be run up to */
function room(sim: Sim, p: { x: number; z: number }): number {
  const c = sim.nav.toCell(p);
  let n = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (sim.nav.walkable(c.cx + dx, c.cz + dz)) n++;
  return n;
}

/**
 * The most open walkable spot `d` metres from `from`, at least 1 m from `avoid`, in sight the way the gag looks: from
 * Sandro (`fromDj`: `from` is him) to Donata (her chair does not block it).
 */
function spotNear(sim: Sim, from: { x: number; z: number }, d: number, avoid?: { x: number; z: number }, fromDj = false): { x: number; z: number } {
  let best: { x: number; z: number } | null = null;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const p = sim.nav.nearestWalkable({ x: from.x + Math.sin(a) * d, z: from.z + Math.cos(a) * d }, 1);
    if (!p || Math.abs(Math.hypot(p.x - from.x, p.z - from.z) - d) > 0.4 || !(fromDj ? sim.nav.lineClear(from, p, 0.8) : sim.nav.lineClear(p, from, 0.8))) continue;
    if (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < 1) continue;
    if (!best || room(sim, p) > room(sim, best)) best = p;
  }
  if (!best) throw new Error(`no spot ${d} m from ${JSON.stringify(from)}`);
  return best;
}

/** Donata at her desk, Sandro standing `d` metres away in sight of her, both in for good; everybody else out. */
function stage(d = 3): Stage {
  const sim = office();
  for (const p of sim.people) if (p.id !== DJ && p.id !== BOSS) sim.scenario.put(p.id, 'errand');
  const boss = sim.person(BOSS);
  // her desk is the one in the most open part of the office: room to run, whatever the layout
  const open = [...sim.office.desks].sort((a, b) => room(sim, b.approach) - room(sim, a.approach))[0];
  sim.office.assign(boss, open.number);
  sim.scenario.put(BOSS, 'desk', 'stay');
  const desk = boss.task!.desk;
  sim.scenario.put(DJ, spotNear(sim, desk.seat, d, desk.approach), 'stay');
  return { sim, dj: sim.person(DJ), boss, desk };
}

/** Starts the scene by hand and steps until `stage` (false: not reached within `seconds`). */
function until(s: Stage, stage: string | null, seconds = 30): boolean {
  return run(s.sim, seconds, () => s.sim.boombox.stage === stage);
}

/** Nobody is stuck in the scene: no pose, no run, no pin of hers, the stop ends. */
function released(s: Stage): void {
  expect(s.sim.boombox.active).toBe(false);
  for (const p of [s.dj, s.boss]) {
    expect(p.boomPose).toBeNull();
    expect(p.boomCarry).toBe(false);
    expect(p.rush).toBe(false);
    expect(p.scripted).toBeNull();
  }
  expect(s.sim.boombox.dancers.size).toBe(0);
  expect(s.sim.boombox.notes).toHaveLength(0);
  // a stop of the scene ends right away
  for (const p of [s.dj, s.boss]) expect(p.playerChat?.t ?? 0).toBeLessThanOrEqual(0.3);
}

describe('play.boombox', () => {
  it('play.boombox: starts when Sandro is on a break and Donata is free within reach and in sight, now and then by itself', () => {
    const s = stage();
    const { sim, dj, boss } = s;
    expect(sim.boombox.find(sim.people, sim.nav)).toEqual([dj, boss]);
    // by itself: the timer runs out, the two are there
    expect(sim.boombox.active).toBe(false);
    sim.boombox.timer = 0;
    sim.step(STEP);
    expect(sim.boombox.active).toBe(true);
    expect(sim.boombox.timer).toBeGreaterThanOrEqual(300 - 1);
    expect(sim.boombox.timer).toBeLessThanOrEqual(600);
  });

  it('play.boombox: not when Sandro is not on a break, Donata is not free, too far or out of sight', () => {
    const atDesk = stage();
    atDesk.sim.scenario.put(DJ, 'desk', 'stay');
    expect(atDesk.sim.boombox.find(atDesk.sim.people, atDesk.sim.nav)).toBeNull();

    const far = stage();
    const away = far.sim.office.desks.map((d) => d.approach).find((p) => Math.hypot(p.x - far.boss.pos.x, p.z - far.boss.pos.z) > REACH + 0.5)!;
    far.sim.scenario.put(DJ, away, 'stay');
    expect(far.sim.boombox.find(far.sim.people, far.sim.nav)).toBeNull();

    const wall = stage();
    const mid = { x: (wall.dj.pos.x + wall.boss.pos.x) / 2, z: (wall.dj.pos.z + wall.boss.pos.z) / 2 };
    const c = wall.sim.nav.toCell(mid);
    wall.sim.scenario.block(c.cx, c.cz);
    expect(wall.sim.boombox.find(wall.sim.people, wall.sim.nav)).toBeNull();

    const out = stage();
    out.sim.scenario.put(BOSS, 'errand');
    expect(out.sim.boombox.find(out.sim.people, out.sim.nav)).toBeNull();

    const talking = stage();
    talking.sim.scenario.put(BOSS, spotNear(talking.sim, talking.dj.pos, 3, undefined, true), 'stay');
    expect(talking.sim.boombox.find(talking.sim.people, talking.sim.nav)).not.toBeNull();
    expect(talking.boss.talkTo({ x: 0, z: 0 }, 10)).toBe(true); // the player talks to her
    expect(talking.sim.boombox.find(talking.sim.people, talking.sim.nav)).toBeNull();

    const meeting = stage();
    meeting.sim.scenario.put(GROUP[0], 'desk', 'stay');
    expect(meeting.sim.meetingRoom.start([meeting.boss, meeting.sim.person(GROUP[0])], meeting.sim.nav)).not.toBeNull();
    expect(meeting.sim.boombox.find(meeting.sim.people, meeting.sim.nav)).toBeNull();
    meeting.sim.boombox.timer = 0;
    run(meeting.sim, 1);
    expect(meeting.sim.boombox.active).toBe(false);

    // free on a break, standing in the room, works too
    const standing = stage();
    standing.sim.scenario.put(BOSS, spotNear(standing.sim, standing.dj.pos, 3, undefined, true), 'stay');
    expect(standing.sim.boombox.find(standing.sim.people, standing.sim.nav)).toEqual([standing.dj, standing.boss]);
  });

  it('play.boombox: music, she notices after 3 s, runs, grabs it (the music stops), yells, he walks on, the boombox ends on her desk', () => {
    const s = stage();
    const { sim, dj, boss, desk } = s;
    const box = sim.boombox;
    // somebody standing near him bobs along
    const back = { x: dj.pos.x - boss.pos.x, z: dj.pos.z - boss.pos.z };
    const len = Math.hypot(back.x, back.z);
    sim.scenario.put(GROUP[0], { x: dj.pos.x + (back.x / len) * 1.5, z: dj.pos.z + (back.z / len) * 1.5 }, 'pin'); // behind him, out of her way
    const fan = sim.person(GROUP[0]);
    expect(dist(fan, dj.pos)).toBeLessThan(BOB_RANGE);
    const walk = boss.speed;

    expect(box.start(dj, boss)).toBe(true);
    expect(box.stage).toBe('play');
    expect(box.playing).toBe(true);
    expect(box.mesh.visible).toBe(true);
    expect(box.mesh.parent).toBe(dj.rig.body);
    expect(dj.boomPose).toBe('play');
    run(sim, 1);
    expect(box.dancers.has(dj)).toBe(true);
    expect(box.dancers.has(fan)).toBe(true);
    expect(box.dancers.has(boss)).toBe(false);
    expect(box.notes.length).toBeGreaterThan(0);
    expect(boss.working).toBe(true); // she has not noticed yet

    // ~3 s in: she notices (❗), stands up from her desk and turns to him
    const t0 = 1;
    let noticed = 0;
    expect(run(sim, 5, () => box.stage === 'look', () => (noticed += STEP))).toBe(true);
    expect(t0 + noticed).toBeGreaterThan(NOTICE - 0.1);
    expect(t0 + noticed).toBeLessThan(NOTICE + 0.2);
    expect(box.bubble).toEqual({ who: boss, text: '❗' });
    expect(boss.task).toBeNull();
    expect(desk.occupant).not.toBe(boss);
    run(sim, 0.5);
    expect(boss.sit).toBe(0);
    expect(boss.playerChat?.at).toEqual({ x: dj.pos.x, z: dj.pos.z });

    // she runs, faster than she walks
    expect(until(s, 'run', 3)).toBe(true);
    expect(boss.rush).toBe(true);
    expect(boss.speed).toBeGreaterThan(walk * 1.5);
    expect(box.playing).toBe(true);

    // she grabs it: the music stops at once
    expect(until(s, 'yell', 20)).toBe(true);
    expect(dist(boss, dj.pos)).toBeLessThan(1.2);
    expect(box.playing).toBe(false);
    expect(box.notes).toHaveLength(0);
    expect(box.dancers.size).toBe(0);
    expect(box.mesh.parent).toBe(boss.rig.elbowR);
    expect(boss.boomCarry).toBe(true);
    expect(boss.rush).toBe(false);
    expect(boss.boomPose).toBe('scold');
    expect(dj.boomPose).toBe('cower');
    expect(box.taken).toBe(true);

    // she yells for ~3 s, several bubbles in a row, he stands there
    const said = new Set<string>();
    let yelled = 0;
    run(sim, YELL + 1, () => box.stage !== 'yell', () => {
      yelled += STEP;
      if (box.bubble) said.add(box.bubble.text);
      if (box.stage === 'yell') expect(dj.playerChat).not.toBeNull();
    });
    expect([...said]).toEqual(YELLS);
    expect(yelled).toBeGreaterThan(YELL - 0.1);
    expect(yelled).toBeLessThan(YELL + 0.2);

    // he walks on, she carries it to her desk
    expect(box.stage).toBe('carry');
    expect(dj.boomPose).toBeNull();
    expect(boss.boomCarry).toBe(true);
    expect(boss.task?.desk).toBe(desk);
    expect(run(sim, 60, () => !box.active, () => box.active && expect(box.mesh.parent).toBe(boss.rig.elbowR))).toBe(true);
    expect(dj.playerChat).toBeNull();
    expect(box.onDesk).toBe(desk);
    expect(box.mesh.parent).toBe(desk.root);
    expect(boss.boomCarry).toBe(false);
    expect(boss.task?.desk).toBe(desk);
    released(s);

    // no more music today
    sim.scenario.put(BOSS, 'desk', 'stay');
    sim.scenario.put(DJ, spotNear(sim, desk.seat, 3, desk.approach), 'stay');
    expect(box.find(sim.people, sim.nav)).toEqual([dj, boss]); // the two are there again
    box.timer = 0;
    run(sim, 2);
    expect(box.active).toBe(false);
    expect(box.onDesk).toBe(desk);
  });

  it('play.boombox: while the scene holds him, no random meeting, WC break, pod or phone box picks Sandro', () => {
    const s = stage();
    const { sim, dj, boss } = s;
    sim.boombox.start(dj, boss);
    run(sim, 1);
    expect(dj.playerChat).not.toBeNull();
    const others = GROUP.map((id) => {
      sim.scenario.put(id, 'desk', 'stay');
      return sim.person(id);
    });
    // their timers run out now: they pick from whoever is free
    sim.toilets.update(999, [dj], sim.nav);
    sim.pod.update(999, [dj], sim.nav);
    sim.phoneBooth.update(999, [dj], sim.nav);
    sim.meetingRoom.update(999, [dj, ...others], sim.nav);
    expect(sim.meetingRoom.current?.members ?? []).not.toContain(dj);
    expect(dj.inMeeting).toBe(false);
    expect(dj.talk).toBeNull();
    expect(sim.boombox.stage).toBe('play');
  });

  it('play.boombox: the next working day (04:00) it is gone from her desk and the gag can happen again', () => {
    const s = stage();
    const { sim, dj, boss, desk } = s;
    sim.boombox.start(dj, boss);
    expect(run(sim, 90, () => sim.boombox.onDesk)).toBe(true);
    expect(sim.boombox.taken).toBe(true);
    sim.tod.setCycle(cycleOf(3.95));
    sim.step(STEP);
    expect(sim.boombox.onDesk).toBe(desk); // still the same night
    sim.tod.setCycle(cycleOf(4.05));
    sim.step(STEP);
    expect(sim.boombox.onDesk).toBeNull();
    expect(sim.boombox.mesh.visible).toBe(false);
    expect(sim.boombox.taken).toBe(false);
    // both in and there: it starts again
    sim.scenario.put(BOSS, 'desk', 'stay');
    sim.scenario.put(DJ, spotNear(sim, boss.task!.desk.seat, 3, boss.task!.desk.approach), 'stay');
    sim.boombox.timer = 0;
    sim.step(STEP);
    expect(sim.boombox.active).toBe(true);
  });

  it('play.boombox: Sandro leaves, is picked up or called to a meeting while it plays: the scene ends, the boombox is gone, nobody stays stuck', () => {
    const left = stage();
    left.sim.boombox.start(left.dj, left.boss);
    run(left.sim, 1);
    left.sim.scenario.put(DJ, 'errand');
    left.sim.step(STEP);
    expect(left.sim.boombox.mesh.visible).toBe(false);
    expect(left.sim.boombox.taken).toBe(false);
    released(left);

    const held = stage();
    held.sim.boombox.start(held.dj, held.boss);
    expect(until(held, 'run', 6)).toBe(true);
    held.dj.held = true;
    held.sim.step(STEP);
    held.dj.held = false;
    expect(held.sim.boombox.mesh.visible).toBe(false);
    released(held);

    const meeting = stage();
    meeting.sim.scenario.put(GROUP[0], 'desk', 'stay');
    meeting.sim.boombox.start(meeting.dj, meeting.boss);
    run(meeting.sim, 1);
    meeting.sim.pull(meeting.dj);
    expect(meeting.sim.meetingRoom.start([meeting.dj, meeting.sim.person(GROUP[0])], meeting.sim.nav)).not.toBeNull();
    meeting.sim.step(STEP);
    expect(meeting.sim.boombox.mesh.visible).toBe(false);
    expect(meeting.sim.boombox.active).toBe(false);
    expect(meeting.dj.boomPose).toBeNull();
  });

  it('play.boombox: Donata is picked up on her run or leaves while carrying it: the scene ends cleanly, a boombox she took lands on her desk', () => {
    const picked = stage();
    picked.sim.boombox.start(picked.dj, picked.boss);
    expect(until(picked, 'run', 6)).toBe(true);
    picked.boss.held = true;
    picked.sim.step(STEP);
    picked.boss.held = false;
    expect(picked.sim.boombox.mesh.visible).toBe(false);
    expect(picked.sim.boombox.taken).toBe(false);
    released(picked);

    const steered = stage();
    steered.sim.boombox.start(steered.dj, steered.boss);
    expect(until(steered, 'yell', 25)).toBe(true);
    steered.sim.scenario.put(BOSS, spotNear(steered.sim, steered.boss.pos, 2), 'free'); // somebody else moves her
    steered.sim.step(STEP);
    expect(steered.sim.boombox.onDesk).toBe(steered.desk);
    released(steered);

    const gone = stage();
    gone.sim.boombox.start(gone.dj, gone.boss);
    expect(until(gone, 'carry', 30)).toBe(true);
    gone.sim.scenario.put(BOSS, 'errand');
    gone.sim.step(STEP);
    expect(gone.sim.boombox.onDesk).toBe(gone.desk);
    expect(gone.sim.boombox.taken).toBe(true);
    expect(gone.boss.boomCarry).toBe(false);
    expect(gone.boss.rush).toBe(false);
  });
});
