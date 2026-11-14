/**
 * The curated cards of the Aktionen sheet (`A`): things that can happen in the office, each one an existing dev event
 * (`sim.events`, registered in `src/game/simEvents.ts`). Picking a card runs the event and flies the Orbit camera to `place`.
 * The sheet's search also lists every other dev event; this list only decides which ones get a card with a preview.
 */
export interface OfficeAction {
  id: string;
  label: string;
  /** 24px line icon: SVG path data, drawn with currentColor */
  icon: string;
  /** id of the dev event that runs (`dev.list()` in the console) */
  eventId: string;
  /** where it happens: the camera settles on this floor point (game metres) */
  place: { name: string; x: number; z: number };
  /** camera azimuth in degrees around the place: 0 looks from the front of the office (+z), positive turns towards +x */
  angle: number;
  /** how much closer than the overview the camera settles (2 = half the distance) */
  zoom: number;
  /** what the "Gerade passiert" chip says */
  caption: string;
  /** who goes, shown on the card */
  who: string;
}

export const OFFICE_ACTIONS: OfficeAction[] = [
  {
    id: 'printer',
    label: 'Drucken',
    icon: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
    eventId: 'printer',
    place: { name: 'Archiv, Drucker', x: 26.5, z: 1.7 },
    angle: -15,
    zoom: 3.2,
    caption: 'Jemand druckt etwas aus',
    who: 'Eine freie Person',
  },
  {
    id: 'meeting',
    label: 'Meeting',
    icon: 'M3 5h18v11H3zM8 21h8M12 16v5',
    eventId: 'meeting-room',
    place: { name: 'Glasraum', x: 32.5, z: 11.5 },
    angle: 20,
    zoom: 2.6,
    caption: 'Besprechung im Glasraum',
    who: 'Bis zu fünf Leute',
  },
  {
    id: 'coffee',
    label: 'Kaffee',
    icon: 'M4 8h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6zM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3',
    eventId: 'coffee',
    place: { name: 'Küche', x: 15, z: 2.7 },
    angle: 10,
    zoom: 3,
    caption: 'Kaffeepause in der Küche',
    who: 'Drei Leute',
  },
  {
    id: 'phone-booth',
    label: 'Telefonbox',
    icon: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    eventId: 'phone-booth',
    place: { name: 'Telefonkabine «PSST!»', x: 33.45, z: 3.85 },
    angle: -30,
    zoom: 3.6,
    caption: 'Ein Anruf in der Kabine',
    who: 'Jemand mit Telefon',
  },
  {
    id: 'foosball',
    label: 'Kicker',
    icon: 'M3 6h18v12H3zM12 6v12M7 9v6M17 9v6',
    eventId: 'foosball',
    place: { name: 'Lounge, Töggelikasten', x: 9.35, z: 13.2 },
    angle: 0,
    zoom: 3.2,
    caption: 'Eine Runde Kicker',
    who: 'Zwei Leute',
  },
  {
    id: 'pod',
    label: 'Holzhaus',
    icon: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5',
    eventId: 'pod',
    place: { name: 'Lounge, Holzhaus', x: 6.7, z: 9.1 },
    angle: 25,
    zoom: 3,
    caption: 'Zwei ziehen sich ins Holzhaus zurück',
    who: 'Zwei Leute',
  },
];

/** Problems of an action list: duplicate ids, unknown dev events, bad numbers. Empty when the list is fine. */
export function validateActions(actions: readonly OfficeAction[], eventIds: Iterable<string>): string[] {
  const known = new Set(eventIds);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const a of actions) {
    if (!a.id || seen.has(a.id)) problems.push(`duplicate or empty id "${a.id}"`);
    seen.add(a.id);
    if (!known.has(a.eventId)) problems.push(`${a.id}: no dev event "${a.eventId}"`);
    if (!a.label || !a.caption || !a.icon || !a.place.name) problems.push(`${a.id}: label, caption, icon and place name are required`);
    if (![a.place.x, a.place.z, a.angle].every(Number.isFinite)) problems.push(`${a.id}: place and angle must be numbers`);
    if (!(a.zoom > 0)) problems.push(`${a.id}: zoom must be > 0`);
  }
  return problems;
}
