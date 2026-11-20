import type { IconName } from '../ui/icons';
/**
 * The curated cards of the Aktionen sheet (`A`): things that can happen in the office, each one an existing dev event
 * (`sim.events`, registered in `src/game/simEvents.ts`). Picking a card runs the event and flies the Orbit camera to `place`.
 * The sheet's search also lists every other dev event; this list only decides which ones get a card with a preview.
 */
export interface OfficeAction {
  id: string;
  label: string;
  /** name in the app's icon set (`src/ui/icons.ts`) */
  icon: IconName;
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
    icon: 'printer',
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
    icon: 'meeting',
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
    icon: 'coffee',
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
    icon: 'phone',
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
    icon: 'foosball',
    eventId: 'foosball',
    place: { name: 'Lounge, Töggelikasten', x: 9.35, z: 13.2 },
    angle: 180,
    zoom: 3.2,
    caption: 'Eine Runde Kicker',
    who: 'Zwei Leute',
  },
  {
    id: 'pod',
    label: 'Holzhaus',
    icon: 'home',
    eventId: 'pod',
    place: { name: 'Lounge, Holzhaus', x: 6.7, z: 9.1 },
    angle: 25,
    zoom: 3,
    caption: 'Zwei ziehen sich ins Holzhaus zurück',
    who: 'Zwei Leute',
  },
  {
    id: 'kart',
    label: 'Mariokart',
    icon: 'gamepad',
    eventId: 'meeting-kart',
    place: { name: 'Glasraum', x: 32.5, z: 11.5 },
    angle: -25,
    zoom: 2.6,
    caption: 'Mittags-Mariokart im Glasraum',
    who: 'Drei Leute',
  },
  {
    id: 'toilet',
    label: 'WC',
    icon: 'toilet',
    eventId: 'toilet',
    place: { name: 'Waschraum, WC-Kabinen', x: 12, z: 1.4 },
    angle: 10,
    zoom: 3.4,
    caption: 'Jemand geht aufs WC',
    who: 'Eine freie Person',
  },
  {
    id: 'chat',
    label: 'Gespräch',
    icon: 'chat',
    eventId: 'meeting-chat',
    place: { name: 'Flur', x: 21.5, z: 6.6 },
    angle: 15,
    zoom: 3,
    caption: 'Zwei unterhalten sich im Flur',
    who: 'Zwei Leute',
  },
  {
    id: 'nerf',
    label: 'Nerf-Gefecht',
    icon: 'crosshair',
    eventId: 'nerf',
    place: { name: 'Büro', x: 21.5, z: 6.6 },
    angle: -20,
    zoom: 2,
    caption: 'Nerf-Gefecht im Büro',
    who: 'Ein Dev und ein Opfer',
  },
  {
    id: 'photo-shoot',
    label: 'Fotoshooting',
    icon: 'camera',
    eventId: 'photo-shoot',
    place: { name: 'Fotostudio', x: 30.4, z: 1.7 },
    angle: 15,
    zoom: 3,
    caption: 'Fotoshooting im Studio',
    who: 'Eine freie Person',
  },
  {
    id: 'server-rack',
    label: 'Serverschrank',
    icon: 'server',
    eventId: 'server-rack',
    place: { name: 'Serverschrank', x: 26.3, z: 1.3 },
    angle: -10,
    zoom: 3.4,
    caption: 'Der Serverschrank ist kaputt',
    who: 'Ein Dev',
  },
  {
    id: 'boombox',
    label: 'Boombox',
    icon: 'speaker',
    eventId: 'boombox',
    place: { name: 'Büro, bei Donata', x: 25.5, z: 10.5 },
    angle: 15,
    zoom: 2.4,
    caption: 'Die Boombox wird ausgepackt',
    who: 'Sandro (und Donata)',
  },
  {
    id: 'bonfire',
    label: 'Lagerfeuer',
    icon: 'campfire',
    eventId: 'bonfire',
    place: { name: 'Büro, offene Fläche', x: 20, z: 8 },
    angle: 20,
    zoom: 2.6,
    caption: 'Elia baut ein Lagerfeuer',
    who: 'Elia (und wer mit dem Feuerlöscher kommt)',
  },
  {
    id: 'mail-letter',
    label: 'Brief',
    icon: 'mail',
    eventId: 'mail-letter',
    place: { name: 'Briefkästen am Eingang', x: 7.65, z: 16.2 },
    angle: 15,
    zoom: 3.4,
    caption: 'Eine Taube bringt einen Brief',
    who: 'Eine Taube und ein Lernender',
  },
  {
    id: 'mail-parcel',
    label: 'Paket',
    icon: 'package',
    eventId: 'mail-parcel',
    place: { name: 'Briefkästen am Eingang', x: 7.65, z: 16.2 },
    angle: -15,
    zoom: 3.4,
    caption: 'Eine Drohne liefert ein Paket',
    who: 'Eine Drohne und ein Lernender',
  },
  {
    id: 'smoke',
    label: 'Rauchpause',
    icon: 'smoke',
    eventId: 'smoke',
    place: { name: 'Vordach am Eingang', x: 6.25, z: 16.2 },
    angle: 25,
    zoom: 3,
    caption: 'Rauchpause vor der Tür',
    who: 'Ein Raucher',
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
