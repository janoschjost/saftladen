import type { Dog } from './Dog';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import { PET_HEIGHT } from './petPose';
import { random } from './rng';

const REACH = 1.5; // metres: a passer-by this close to a pet may stop to stroke it
const CHECK = 0.4; // seconds between two looks
const CHANCE = 0.3; // per look and passer-by
const OWNER_CHANCE = 0.02; // owners pet their own pet much less often (they are always next to it)
const STROKE = { min: 3, max: 6 }; // seconds
const PERSON_GAP = { min: 35, max: 90 }; // seconds before the same person pets again

const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

/** Passers-by stop to pet the office dogs and cats; pets bark / meow when somebody comes through the front door. */
export class PetCare {
  /** called when somebody starts stroking a pet */
  onPet: (dog: Dog, by: Person) => void = () => {};
  /** called when a pet barks / meows */
  onBark: (dog: Dog) => void = () => {};
  private timer = 5;
  private clock = 0;
  private next = new WeakMap<Person, number>();

  private free(p: Person): boolean {
    return (
      p.inOffice && !p.task && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob && !p.snackLeft && !p.phoneJob && !p.run && !p.coffeeJob && !p.inMeeting
    );
  }

  update(dt: number, people: readonly Person[], pets: readonly Dog[], nav: NavGrid): void {
    this.clock += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CHECK;
    for (const dog of pets) {
      if (dog.away || dog.petted || dog.held || dog.fixed || dog.sleep > 0.3 || dog.petCooldown > 0) continue;
      for (const p of people) {
        if ((this.next.get(p) ?? 0) > this.clock || !this.free(p)) continue;
        const own = p === dog.owner;
        if (!own && p.moving < 0.3) continue; // strangers have to be passing by
        if (Math.hypot(p.pos.x - dog.pos.x, p.pos.z - dog.pos.z) > REACH) continue;
        if (random() > (own ? OWNER_CHANCE : CHANCE)) continue;
        if (!p.petDog(dog.pos, between(STROKE), dog.isCat ? PET_HEIGHT.cat : PET_HEIGHT.dog)) continue;
        dog.petBy(p, p.playerChat?.total ?? 4, nav);
        this.next.set(p, this.clock + between(PERSON_GAP));
        this.onPet(dog, p);
        break;
      }
    }
  }

  /** Somebody walks in: pets nearby that are awake announce it. */
  greet(pets: readonly Dog[]): void {
    for (const dog of pets) {
      if (dog.away || dog.sleep > 0.4 || dog.barkT > 0 || random() > 0.6) continue;
      dog.bark();
      this.onBark(dog);
    }
  }
}
