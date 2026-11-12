import { ax, OFFICE_D } from '../render/officeModel';
import { NAV_CELL } from '../render/World';
import type { Vec2 } from './NavGrid';

/** Model x of the entrance doorway centre (see officeModel.ts). */
const ENTRANCE_X = ax(-3.9);

const snap = (x: number): number => (Math.floor(x / NAV_CELL) + 0.5) * NAV_CELL;

/** The entrance in the front wall: people walk out and in here. Game coordinates (metres). */
export const DOOR = {
  /** x of the doorway centre */
  x: snap(ENTRANCE_X),
  /** z of the wall */
  z: OFFICE_D,
};

/** One of the two wings of the double door: its own walking lane through the doorway. */
export interface DoorLane {
  /** which wing opens for this lane */
  wing: 'left' | 'right';
  /** free floor cell just inside the door */
  in: Vec2;
  /** the doorway cell itself */
  gate: Vec2;
  /** where people vanish / appear, on the porch in front of the door */
  out: Vec2;
}

const lane = (wing: 'left' | 'right', dx: number): DoorLane => {
  const x = snap(ENTRANCE_X + dx);
  return {
    wing,
    in: { x, z: DOOR.z - NAV_CELL * 1.5 },
    gate: { x, z: DOOR.z - NAV_CELL * 0.5 },
    out: { x, z: DOOR.z + 1.5 },
  };
};

/** Two lanes, one per wing (each wing is 1 m wide, the lane runs through its middle). */
export const DOOR_LANES: [DoorLane, DoorLane] = [lane('left', -0.5), lane('right', 0.5)];

let nextLane = 0;
/** Alternates between the lanes so two people leaving or arriving together use a wing each. */
export const pickDoorLane = (): DoorLane => DOOR_LANES[nextLane++ % 2];
