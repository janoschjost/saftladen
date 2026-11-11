/** Who can be played in "Ein Tag im Leben" (ids = team ids). The tasks of each story are added per character. */
export interface DayCharacter {
  id: string;
  tagline: string;
}

export const DAY_CHARACTERS: readonly DayCharacter[] = [
  { id: 'jan-hasler', tagline: 'Zwischen Kunden, Calls und Geschäftsleitung.' },
  { id: 'sandro-hagen', tagline: 'Beratung, Strategie und zu wenig Stunden am Tag.' },
  { id: 'jeerapat-wang', tagline: 'Layouts, Lernen und noch eine Korrekturschlaufe.' },
];
