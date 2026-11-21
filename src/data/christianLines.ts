/** What Christian Davatz, the ghost of the Ordnungskreis, mutters while he tidies up (German, short: a speech bubble is small). */
export type LineKind = 'arrive' | 'mop' | 'tidy' | 'lunchbox' | 'bin' | 'done';

export const CHRISTIAN_LINES: Readonly<Record<LineKind, readonly string[]>> = {
  arrive: ['Wie sieht es hier aus?!', 'Seit ich weg bin…'],
  mop: ['Das war mal mein Platz…', 'Jannik, wirklich?!', 'Hier wird jetzt geputzt.'],
  tidy: ['Wer lässt hier Tassen stehen?!', 'Früher war das anders…', 'Ordnung ist das halbe Leben.', 'Das ist doch kein Zustand!', 'Flaschen ins Recycling!', 'Untragbar!'],
  lunchbox: ['Das riecht ja furchtbar!', 'Wer vergisst sein Znüni?!', 'Das Zeug lebt ja schon!'],
  bin: ['Der Papierkorb quillt über!'],
  done: ['Passt. Fürs Erste.'],
};

/** The longest a line may be: longer ones get squeezed in the bubble. */
export const MAX_LINE = 30;
