/** What Zlatko's little son says in the home office feed, and what Zlatko answers (Serbian, Latin script). */
export interface SonLine {
  son: string;
  dad: string;
}

export const SON_LINES: SonLine[] = [
  { son: 'Tata, hoćeš da se igraš sa mnom?', dad: 'Dolazim za malo, sine!' },
  { son: 'Tata, gladan sam!', dad: 'Evo, odmah ćemo nešto pojesti!' },
  { son: 'Tata, vidi, bager!', dad: 'Vau, kakav veliki bager!' },
  { son: 'Tata, kad ćeš da završiš?', dad: 'Evo, samo još malo, sine.' },
  { son: 'Tata, mogu li i ja da kucam?', dad: 'Može, sine, ali samo malo!' },
  { son: 'Tata, piški mi se!', dad: 'Idi, sine, znaš gde je toalet!' },
  { son: 'Tata, pogledaj šta sam nacrtao!', dad: 'Joj, kako lepo! Bravo, sine!' },
];

/** how long a bubble stays up (seconds): at least 3, about 1 s per 12 characters */
export const bubbleSeconds = (text: string): number => Math.max(3, text.length / 12);

/** the pause between the two bubbles, and the son's goodbye wave after the second (seconds) */
export const SON_GAP = 0.6;
export const SON_BYE = 1.2;

/** When each bubble is up, in seconds from the moment the boy stands next to Papa; `talk` is the whole stay. */
export function sonTimeline(line: SonLine): { sonEnd: number; dadStart: number; dadEnd: number; talk: number } {
  const sonEnd = bubbleSeconds(line.son);
  const dadStart = sonEnd + SON_GAP;
  const dadEnd = dadStart + bubbleSeconds(line.dad);
  return { sonEnd, dadStart, dadEnd, talk: dadEnd + SON_GAP + SON_BYE };
}
