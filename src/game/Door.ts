import { ax, OFFICE_D } from '../render/officeModel';
import { NAV_CELL } from '../render/World';
import type { Vec2 } from './NavGrid';

/** Model x of the entrance doorway centre (see officeModel.ts). */
const ENTRANCE_X = ax(-3.9);

/** The entrance in the front wall: people walk out and in here. Game coordinates (metres). */
export const DOOR = {
  /** x of the (one nav cell wide) doorway */
  x: (Math.floor(ENTRANCE_X / NAV_CELL) + 0.5) * NAV_CELL,
  /** z of the wall */
  z: OFFICE_D,
};

/** Free floor cell just inside the door. */
export const DOOR_IN: Vec2 = { x: DOOR.x, z: DOOR.z - NAV_CELL * 1.5 };
/** The doorway cell itself. */
export const DOOR_GATE: Vec2 = { x: DOOR.x, z: DOOR.z - NAV_CELL * 0.5 };
/** Where people vanish / appear, on the porch in front of the door. */
export const DOOR_OUT: Vec2 = { x: DOOR.x, z: DOOR.z + 1.5 };
