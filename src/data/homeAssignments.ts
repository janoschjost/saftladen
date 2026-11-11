import { HOME_COUNT, SPECIAL_HOME } from '../render/homeOffice';

const KEY = 'saftladen.homes';

/** Which home office room belongs to whom (person id -> room index). Persisted in localStorage; people without an entry get a free room on demand. */
let assigned: Record<string, number> = {};
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  for (const [id, v] of Object.entries(raw)) if (Number.isInteger(v) && v >= 0 && v < HOME_COUNT) assigned[id] = v;
} catch {
  /* storage may be unavailable or corrupt */
}

/** The room reserved for this person: their special room, their assigned one, or null (= any free room). */
export function homeRoomOf(id: string): number | null {
  if (id in SPECIAL_HOME) return SPECIAL_HOME[id];
  return id in assigned ? assigned[id] : null;
}

/** Person who owns this regular room, if any. */
export function homeOwnerOf(room: number): string | null {
  return Object.entries(assigned).find(([, v]) => v === room)?.[0] ?? null;
}

/** Rooms reserved for somebody other than `id`. */
export function reservedRooms(id: string): Set<number> {
  return new Set(Object.entries(assigned).filter(([o]) => o !== id).map(([, v]) => v));
}

/** Assigns a regular room (null = automatic). A room has one owner: whoever held it before loses it. */
export function assignHomeRoom(id: string, room: number | null): void {
  if (id in SPECIAL_HOME) return;
  for (const [o, v] of Object.entries(assigned)) if (o === id || v === room) delete assigned[o];
  if (room !== null) assigned[id] = room;
  try {
    localStorage.setItem(KEY, JSON.stringify(assigned));
  } catch {
    /* ignore */
  }
}
