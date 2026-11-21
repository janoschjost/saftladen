import { bubbleSeconds } from './sonLines';

/** What Ariana says in Marco's home office feed, and what Marco answers (St. Gallen German; she calls him "Chäfer"). */
export interface ArianaLine {
  ari: string;
  marco: string;
}

/** By day: she comes to hug him. */
export const ARIANA_DAY_LINES: ArianaLine[] = [
  { ari: 'Chäfer, magsch mi umarme?', marco: 'Sicher! Chum zu mir.' },
  { ari: 'Hesch Zit für e Umarmig?', marco: 'Klar, chum.' },
  { ari: 'Hey Chäfer, hesch schnell Zit?', marco: 'Mhm, sicher, chum.' },
  { ari: 'Chäfer, i vermisse di!', marco: 'Mhm, i di au!' },
  { ari: 'Chääfer...', marco: 'Mhm, was?' },
  { ari: 'Te quiero', marco: 'Y yo a ti' },
  { ari: 'Bisch gad konzentriert?', marco: 'Es goht, ha scho schnell Zit.' },
];

/** At night (22:00 to 07:00): she asks him to come to bed. */
export const ARIANA_NIGHT_LINES: ArianaLine[] = [
  { ari: 'Chäfer, chunsch au is Bett?', marco: 'Jo, gad, bi fasch fertig.' },
  { ari: 'I goh is Bett.', marco: 'Mhm, i chume au gad.' },
  { ari: 'Magsch mer na Narnia vorlese?', marco: 'Mhm, chume gad.' },
  { ari: 'I bi scho mega müed.', marco: 'Oh, i au, aber de Claude isch gad na dra.' },
];

/** The night, in clock hours: she asks for bed from here to here (over midnight) */
const NIGHT = { from: 22, to: 7 };
export const isNightHour = (hour: number): boolean => hour >= NIGHT.from || hour < NIGHT.to;

/** How long the hug lasts (seconds) */
export const HUG_SECONDS = 4.5;

/** the share of the stays in the home office that she comes to, and when (seconds into the stay, while he types) */
export const ARIANA_VISIT = { chance: 0.35, after: [12, 60] as [number, number] };

/** When she comes during this stay (seconds), or never: `chance` and `when` are two rolls in [0, 1). */
export function arianaVisitAt(chance: number, when: number): number {
  if (chance >= ARIANA_VISIT.chance) return Infinity;
  const [from, to] = ARIANA_VISIT.after;
  return from + when * (to - from);
}

/** he answers as soon as she is done (seconds between the two bubbles; never both at once) */
export const REPLY_GAP = 0.15;

/** he starts to get up while he finishes his sentence: the hug follows it this soon (seconds) */
export const HUG_GAP = 0.2;

/** She starts to speak this long (seconds) before she stops next to him, on her way in */
export const SPEAK_LEAD = 1.6;

/**
 * When each bubble is up and when the hug is on, in seconds from the moment she stops next to him (hers starts earlier,
 * `SPEAK_LEAD` before, so it is negative then); `talk` is the whole stay.
 */
export function arianaTimeline(line: ArianaLine): {
  sonEnd: number;
  dadStart: number;
  dadEnd: number;
  hugStart: number;
  hugEnd: number;
  talk: number;
} {
  const sonEnd = bubbleSeconds(line.ari) - SPEAK_LEAD;
  const dadStart = sonEnd + REPLY_GAP;
  const dadEnd = dadStart + bubbleSeconds(line.marco);
  const hugStart = dadEnd + HUG_GAP;
  const hugEnd = hugStart + HUG_SECONDS;
  // she lets go and walks out at once; he sits down and rolls back to the desk meanwhile (no goodbye wave)
  return { sonEnd, dadStart, dadEnd, hugStart, hugEnd, talk: hugEnd + 0.6 };
}
