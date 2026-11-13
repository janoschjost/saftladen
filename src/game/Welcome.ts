import type { Person } from './Person';
import type { Presence } from './Presence';
import { random } from './rng';
import type { Social } from './Social';

/**
 * How many greet, how many of them walk over (only from within `reach` metres, getting up from their desk if need
 * be), standing distance (m), seconds the cheer lasts, seconds a walker gets to arrive (the visitor waits as long).
 */
const WELCOME = { crowd: 5, walkers: 2, stand: 1.1, reach: 12, hold: 5, timeout: 20 };

const gesture = () => (random() < 0.6 ? 'cheer' : 'wave');

/**
 * A remote worker walks into the office (rare, see `Schedule.visitChance`): the nearest few drop what they do, the
 * two closest walk over, everybody cheers or waves, and the visitor waves back.
 */
export class Welcome {
  /** the call over the first greeter ("Zlatko! 🎉") while the cheer lasts */
  call: { who: Person; text: string; t: number } | null = null;
  /** greeters walking over to the visitor (held there until their cheer is done) */
  private walkers: Array<{ p: Person; to: Person; pin: Person['scripted']; t: number; cheered: boolean }> = [];
  private last = new Map<Person, Person['presence']>();

  update(dt: number, people: Person[], presence: Presence, social: Social): void {
    for (const p of people) {
      const was = this.last.get(p);
      if (p.presence === 'in' && was !== 'in' && presence.claimGreeting(p) && was !== undefined) this.greet(p, people, social); // already here at the start: nobody to welcome
      this.last.set(p, p.presence);
    }
    if (this.call && (this.call.t -= dt) <= 0) this.call = null;
    if (this.walkers.length) this.walkers = this.walkers.filter((w) => {
      const s = w.p.scripted === w.pin ? w.pin : null; // somebody else may have taken them over meanwhile
      if (s?.arrived && !w.cheered && w.p.moving < 0.2) {
        w.cheered = true;
        w.t = WELCOME.hold;
        w.p.welcome(gesture(), random() * 0.5, WELCOME.hold);
        w.to.welcome('wave', 0.3, WELCOME.hold); // waves back at whoever comes over
      }
      if (s && (w.t -= dt) > 0) return true;
      if (s) w.p.unpin();
      return false;
    });
  }

  private greet(v: Person, people: Person[], social: Social): void {
    const near = people
      .filter((o) => o !== v && o.inOffice && !o.held && !o.controlled && !o.talk && !o.playerChat && !o.inMeeting && !o.snackLeft && !o.run && !o.meetJob && !o.printJob && !o.foosJob && !o.vapeJob && !o.coffeeJob && !o.phoneJob)
      .map((o) => ({ o, dx: v.pos.x - o.pos.x, dz: v.pos.z - o.pos.z }))
      .map((n) => ({ ...n, d: Math.hypot(n.dx, n.dz) || 1 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, WELCOME.crowd);
    let walkers = 0;
    for (const { o, dx, dz, d } of near) {
      social.leave(o);
      if (walkers < WELCOME.walkers && d > WELCOME.stand && d < WELCOME.reach) {
        walkers++;
        o.interrupt();
        o.pinTo({ at: { x: v.pos.x - (dx / d) * WELCOME.stand, z: v.pos.z - (dz / d) * WELCOME.stand }, yaw: Math.atan2(dx, dz), walk: true });
        this.walkers.push({ p: o, to: v, pin: o.scripted, t: WELCOME.timeout, cheered: false });
      } else {
        o.talkTo(v.pos, WELCOME.hold); // turns to the visitor unless tied to a desk
        o.welcome(gesture(), 0.2 + random() * 0.8, WELCOME.hold);
      }
    }
    const first = near[0]?.o;
    if (!first) return;
    // waits at the door for the ones who come over
    if (v.talkTo(first.pos, walkers ? WELCOME.timeout : WELCOME.hold)) v.welcome('wave', 0.6, WELCOME.hold);
    this.call = { who: first, text: `${v.member.name.split(' ')[0]}! 🎉`, t: WELCOME.hold };
  }
}
