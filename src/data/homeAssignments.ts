import { storage } from '../game/storage';
import { HOME_COUNT } from '../render/homeOffice';
import { team } from './team';
import { HOME_ROOMS } from './types';

const KEY = 'saftladen.homes';
/** stored for someone whose team-data room was switched to "automatic" in the character view */
const AUTO = -1;

/**
 * Which home office room belongs to whom (person id -> room index).
 * Defaults come from the team data (`homeRoom`); the character view can override them per browser (localStorage).
 * Rooms after the eight regular ones are somebody's own and can't be reassigned.
 */
const defaults: Record<string, number> = {};
for (const m of team) if (m.homeRoom) defaults[m.id] = HOME_ROOMS.indexOf(m.homeRoom);

let overrides: Record<string, number> = {};
try {
  const raw = JSON.parse(storage.getItem(KEY) ?? '{}') as Record<string, number>;
  for (const [id, v] of Object.entries(raw)) if (Number.isInteger(v) && v >= AUTO && v < HOME_COUNT) overrides[id] = v;
} catch {
  /* storage may be unavailable or corrupt */
}

const isOwnRoom = (room: number) => room >= HOME_COUNT;

/** Team defaults with the browser's overrides on top; a regular room has one owner (the override wins). */
function effective(): Record<string, number> {
  const out: Record<string, number> = { ...defaults };
  for (const [id, room] of Object.entries(overrides)) {
    if (id in defaults && isOwnRoom(defaults[id])) continue; // own rooms are fixed
    delete out[id];
    if (room === AUTO) continue;
    for (const [o, v] of Object.entries(out)) if (v === room && !isOwnRoom(v)) delete out[o];
    out[id] = room;
  }
  return out;
}

/** The room reserved for this person, or null (= any free regular room). */
export function homeRoomOf(id: string): number | null {
  return effective()[id] ?? null;
}

/** Whether the person has a room of their own (fixed, not one of the regular rooms). */
export function hasOwnRoom(id: string): boolean {
  return id in defaults && isOwnRoom(defaults[id]);
}

/** Person who owns this regular room, if any. */
export function homeOwnerOf(room: number): string | null {
  return Object.entries(effective()).find(([, v]) => v === room)?.[0] ?? null;
}

/** Rooms reserved for somebody other than `id`. */
export function reservedRooms(id: string): Set<number> {
  return new Set(Object.entries(effective()).filter(([o]) => o !== id).map(([, v]) => v));
}

/** Assigns a regular room in this browser (null = automatic). A room has one owner: whoever held it before loses it. */
export function assignHomeRoom(id: string, room: number | null): void {
  if (hasOwnRoom(id)) return;
  for (const [o, v] of Object.entries(overrides)) if (o === id || (room !== null && v === room)) delete overrides[o];
  overrides[id] = room ?? AUTO;
  try {
    storage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}
