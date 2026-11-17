import { describe, expect, it } from 'vitest';
import { chatBlocks } from '../data/chatBlocks';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import type { Sim } from './Sim';

installHeadlessDom();

/** Only `ids` are in the office (at their desks, held in); everybody else is out on an errand, a few in the home office. */
function only(sim: Sim, ids: readonly string[]): void {
  sim.people
    .filter((p) => !ids.includes(p.id))
    .forEach((p, i) => sim.scenario.put(p.id, i < 4 ? 'home' : 'errand'));
  for (const id of ids) sim.scenario.put(id, 'desk', 'stay');
}

describe('CrewChat', () => {
  it('chat.voice: a coffee break posts an ask by one of the two and an answer by the other', () => {
    const sim = office();
    only(sim, GROUP.slice(0, 2));
    sim.step(1 / 60); // the chat takes stock of the start
    const before = sim.chat.messages.length;
    expect(sim.events.trigger('coffee')).toMatch(/Kaffeepause/);
    run(sim, 8, () => sim.chat.messages.filter((m) => m.topic === 'coffee').length >= 2);
    const coffee = sim.chat.messages.slice(before).filter((m) => m.topic === 'coffee');
    expect(coffee.length).toBeGreaterThanOrEqual(2);
    expect(new Set(coffee.slice(0, 2).map((m) => m.by))).toEqual(new Set(GROUP.slice(0, 2)));
    // the writer's bubble shows the message
    expect(sim.chat.speaking.map((s) => s.text)).toContain(coffee[coffee.length - 1].text);
  });

  it('chat.voice: idle lines come every 20-60 s from people in the office; nobody away or at home writes', () => {
    const sim = office();
    only(sim, GROUP);
    sim.step(1 / 60);
    const start = sim.chat.messages.length;
    run(sim, 200);
    const idle = sim.chat.messages.slice(start).filter((m) => m.topic === 'random' || m.topic === 'complaint');
    expect(idle.length).toBeGreaterThanOrEqual(3);
    expect(idle.length).toBeLessThanOrEqual(10);
    for (const m of sim.chat.messages.slice(start)) expect(GROUP).toContain(m.by);
    const idleLines = [...chatBlocks.random.during!, ...chatBlocks.complaint.during!].map((l) => l.toLowerCase().replace(/[^\p{L}]/gu, '').slice(0, 6));
    // a shared idle line in somebody's style: still recognisable
    expect(idle.some((m) => idleLines.some((l) => m.text.toLowerCase().replace(/[^\p{L}]/gu, '').includes(l)))).toBe(true);
  });

  it('chat.voice: the server rack posts the dev cursing while fixing and reporting when it runs again', () => {
    const sim = office();
    only(sim, ['andrew-jelley', 'linda-peter']);
    sim.step(1 / 60);
    expect(sim.events.trigger('server-rack')).toMatch(/Andrew repariert/);
    const done = run(sim, 60, () => sim.chat.messages.some((m) => m.topic === 'server' && m.by === 'andrew-jelley' && sim.serverRack.free));
    expect(done).toBe(true);
    const dev = sim.chat.messages.filter((m) => m.topic === 'server' && m.by === 'andrew-jelley');
    expect(dev.length).toBe(2);
  });

  it('chat.voice: the chat rolls its own dice: the simulation runs as without it, and the same seed gives the same chat', () => {
    const take = () => {
      const sim = office();
      run(sim, 120);
      return { chat: sim.chat.messages.map((m) => `${m.by}: ${m.text}`), where: sim.people.map((p) => `${p.pos.x.toFixed(3)},${p.pos.z.toFixed(3)}`) };
    };
    const a = take();
    const b = take();
    expect(a.chat.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('chat.voice: a dev event per topic makes somebody in the office write about it', () => {
    const sim = office();
    only(sim, GROUP.slice(0, 1));
    expect(sim.events.trigger('chat-lunch')).toMatch(/^Oscar: /);
    expect(sim.chat.messages.at(-1)).toMatchObject({ by: GROUP[0], topic: 'lunch' });
  });
});
