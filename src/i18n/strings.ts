/**
 * The one table for all presence wording (who is in / out of the office, and the actions around it).
 * UI and game code read their labels from here: no presence string is spelled out anywhere else.
 */

/** Where an absent person is: popped out for a while, or working from home. */
export type AwayKindLabel = 'errand' | 'home';
/** What an absent person is doing right now: on the way out, gone, or on the way back in. */
export type AwayPhase = 'leave' | 'out' | 'return';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const strings = {
  /** the welcome card for first-time visitors */
  welcome: {
    title: 'Willkommen im Saftladen',
    help: 'Hilfe',
    start: "Los geht's",
    /** speech bubble of the greeting GL member */
    greeting: (first: string) => `Hoi, ich bin ${first} von der Geschäftsleitung. Schön, dass du vorbeischaust! Kurz, bevor es losgeht:`,
    bullets: [
      'Der Saftladen ist unsere Agentur als kleine Spielwelt: Das Team arbeitet, plaudert und pausiert ganz von selbst.',
      'Schau dich um mit den Ansichten 1–4 (Iso, Orbit, Grundriss, Rundgang). Klick auf eine Person, um ihr zu folgen.',
      'Oben rechts: die Sonne für Wetter und Tageszeit, das Zahnrad für Einstellungen, Figuren und Plätze. Mit A startest du Aktionen.',
    ],
  },

  presence: {
    /** the "not in the office" list */
    panel: {
      title: 'Nicht im Büro',
      callAllBack: 'Alle zurückholen',
      callBack: 'Zurück ins Büro holen',
      callBackName: (first: string) => `${first} zurückholen`,
    },
    /** what a person is doing, one key per action */
    action: {
      leave: { errand: 'Geht raus', home: 'Geht ins Homeoffice' },
      return: 'Kommt zurück',
    },
    /** where a person is while away */
    state: {
      errand: (seconds: number) => `Weg · zurück in ${clock(seconds)}`,
      home: 'Homeoffice',
    },
    /** tooltip of a row in the list */
    hint: {
      errand: 'Kurz weg, gleich zurück',
      home: 'Arbeitet im Homeoffice: klicken für Livebild',
    },
    /** buttons on the card of the selected person */
    command: {
      errand: 'Rausschicken',
      home: 'Ins Homeoffice',
      homeFull: 'Alle Homeoffices sind besetzt',
    },
    /** chips in the title bar */
    count: {
      inOffice: (n: number) => `${n} im Büro`,
      errand: (n: number) => `${n} weg`,
      home: (n: number) => `${n} im Homeoffice`,
    },
    /** dev panel + status messages */
    event: {
      group: 'Anwesenheit',
      someoneLeaves: { errand: 'Jemand geht raus', home: 'Jemand geht ins Homeoffice' },
      leaves: { errand: (first: string) => `${first} geht raus`, home: (first: string) => `${first} geht ins Homeoffice` },
      allReturn: 'Alle kommen zurück',
      calledBack: (first: string) => `${first} war nicht im Büro und kommt zurück: nochmal klicken, sobald er da ist`,
      arriving: (firsts: string[]) => `${firsts.join(' und ')} ${firsts.length > 1 ? 'kommen' : 'kommt'} gleich ins Büro …`,
    },
  },
  /** Kompensiertier Kurt, Marco's alter ego (#32) */
  alterEgo: {
    role: 'Kompensiertier',
    label: { off: 'Marco geht als Kurt heim', home: 'Kurt im Homeoffice', errand: 'Marco unterwegs (Kurt am Bildschirm)' },
    event: { off: 'Marco dreht sich und geht als Kurt heim', home: 'Marco arbeitet als Kurt im Homeoffice', errand: 'Marco ist unterwegs, sein Bildschirm zeigt Kurt' },
  },
} as const;

/** Status line of somebody in the "not in the office" list. */
export function awayStatus(kind: AwayKindLabel, phase: AwayPhase, secondsLeft: number): string {
  const p = strings.presence;
  if (phase === 'leave') return p.action.leave[kind];
  if (phase === 'return') return p.action.return;
  return kind === 'home' ? p.state.home : p.state.errand(secondsLeft);
}
