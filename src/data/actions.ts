import type { IconName } from '../ui/icons';
/**
 * The curated cards of the Aktionen sheet (`A`): things that can happen in the office, each one an existing dev event
 * (`sim.events`, registered in `src/game/simEvents.ts`). Picking a card runs the event and flies the Orbit camera to `place`.
 * Every main action is a card, and the sheet shows nothing else: one card per thing that happens, never a start and an end
 * (`…-end` events, status reads and events that only set up a test situation have none; they stay in the dev panel).
 */
export interface OfficeAction {
  id: string;
  label: string;
  /** name in the app's icon set (`src/ui/icons.ts`) */
  icon: IconName;
  /** id of the dev event that runs (`dev.list()` in the console) */
  eventId: string;
  /** where it happens: the camera settles on this floor point (game metres). Without `place` (and `angle`, `zoom`) the camera only follows the first person it moves */
  place?: { name: string; x: number; z: number };
  /** camera azimuth in degrees around the place: 0 looks from the front of the office (+z), positive turns towards +x */
  angle?: number;
  /** how much closer than the overview the camera settles (2 = half the distance) */
  zoom?: number;
  /** `false`: no still of the people doing it yet (`public/actions/<id>.webp`), the card shows its icon instead */
  still?: false;
  /** what the "Gerade passiert" chip says */
  caption: string;
  /** who goes, shown on the card */
  who: string;
}

/** An action that has a place to fly to. */
export type PlacedAction = OfficeAction & Required<Pick<OfficeAction, 'place' | 'angle' | 'zoom'>>;
export const isPlaced = (a: OfficeAction | null | undefined): a is PlacedAction => !!a && !!a.place && a.angle !== undefined && a.zoom !== undefined;

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
    id: 'nerf',
    label: 'Nerf-Gefecht',
    icon: 'crosshair',
    eventId: 'nerf',
    place: { name: 'Büro', x: 21.5, z: 6.6 },
    angle: -20,
    zoom: 2,
    caption: 'Nerf-Duell im Büro',
    who: 'Zwei Devs',
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
  {
    id: 'oscar-tidy',
    label: 'Oscar räumt auf',
    icon: 'broom',
    eventId: 'oscar-tidy',
    place: { name: 'Büro, bei Oscars Platz', x: 15.5, z: 10.5 },
    angle: 30,
    zoom: 2.4,
    caption: 'Oscar räumt mit Polizeimütze auf',
    who: 'Oscar',
  },
  {
    id: 'snow',
    label: 'Schneefall',
    icon: 'snow',
    eventId: 'snow',
    place: { name: 'Vordach am Eingang', x: 6.25, z: 17 },
    angle: 20,
    zoom: 2.4,
    caption: 'Es schneit vor dem Büro',
    who: 'Alle draussen',
  },
  {
    id: 'storm',
    label: 'Gewitter',
    icon: 'storm',
    eventId: 'storm',
    place: { name: 'Vordach am Eingang', x: 6.25, z: 17 },
    angle: -20,
    zoom: 2.4,
    caption: 'Gewitter über dem Büro',
    who: 'Alle am Fenster und draussen',
  },
  {
    id: 'mess',
    label: 'Chaos',
    icon: 'zap',
    eventId: 'mess',
    place: { name: 'Büro, offene Fläche', x: 20, z: 8 },
    angle: 20,
    zoom: 3,
    caption: 'Überall liegt Zeug herum',
    who: 'Alle zusammen',
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
    if (!a.label || !a.caption || !a.icon) problems.push(`${a.id}: label, caption and icon are required`);
    const shot = [a.place, a.angle, a.zoom].filter((v) => v !== undefined).length;
    if (shot !== 0 && shot !== 3) problems.push(`${a.id}: place, angle and zoom come together`);
    else if (isPlaced(a)) {
      if (!a.place.name) problems.push(`${a.id}: place needs a name`);
      if (![a.place.x, a.place.z, a.angle].every(Number.isFinite)) problems.push(`${a.id}: place and angle must be numbers`);
      if (!(a.zoom > 0)) problems.push(`${a.id}: zoom must be > 0`);
    }
  }
  return problems;
}
