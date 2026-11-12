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
      errand: 'Raus',
      home: 'Nach Hause',
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
  /** the controls: dock, timeline, palette, radial menu, side panel */
  chrome: {
    mode: { iso: 'Iso', orbit: 'Orbit', plan: 'Grundriss', walk: 'Rundgang', third: 'Ein Tag im Leben' },
    tab: { people: 'Leute', seats: 'Plätze', env: 'Umgebung', editor: 'Editor', dev: 'Dev' },
    palette: {
      open: 'Befehle',
      placeholder: 'Befehl, Person oder Ereignis suchen …',
      empty: 'Nichts gefunden.',
      pick: 'wählen',
      run: 'ausführen',
      close: 'schliessen',
      group: { view: 'Ansicht', show: 'Anzeigen', panel: 'Panel', events: 'Ereignisse', people: 'Leute' },
      namesOn: 'Namen anzeigen',
      namesOff: 'Namen ausblenden',
      timelineOpen: 'Zeitleiste öffnen',
      timelineClose: 'Zeitleiste schliessen',
      xmas: 'Weihnachten',
      rain: 'Wetter Regen',
      dry: 'Wetter Trocken',
      auto: 'Wetter Auto',
      day: 'Ein Tag im Leben',
      pickerOpen: 'Figuren ansehen',
      help: 'Steuerung',
    },
    timeline: { label: 'Tageszeit', pause: 'Pause', auto: 'Zeit läuft', weather: 'Wetter', events: { meeting: 'Meeting', lunch: 'Mittag', end: 'Feierabend' } },
    weather: { auto: 'Auto', sun: 'Trocken', rain: 'Regen' },
    radial: { info: 'Info', follow: 'Folgen', steer: 'Steuern', home: 'Home', out: 'Raus' },
    away: (n: number) => `${n} draussen`,
    people: { inOffice: 'Im Büro', outside: 'Draussen', hint: 'Person anklicken, um sie auszuwählen.', atDesk: 'Am Platz', meeting: 'Meeting', talking: 'Im Gespräch', walking: 'Unterwegs', pet: 'Tier' },
    walkBack: 'Zurück zur Ansicht',
  },
} as const;

/** Status line of somebody in the "not in the office" list. */
export function awayStatus(kind: AwayKindLabel, phase: AwayPhase, secondsLeft: number): string {
  const p = strings.presence;
  if (phase === 'leave') return p.action.leave[kind];
  if (phase === 'return') return p.action.return;
  return kind === 'home' ? p.state.home : p.state.errand(secondsLeft);
}
