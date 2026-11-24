/** What Oscar mutters on his tidy outings (#296), a follower of Christian ("Chrigi"): German, short (a speech bubble is small). */
export type OscarLineKind = 'start' | 'tidy' | 'lunchbox' | 'bin' | 'done';

/** His line when an outing starts, word for word from the issue: one character over `MAX_LINE`, the only line allowed to be. */
export const CHRIGI = 'Was würde Chrigi davon halten?!';

export const OSCAR_LINES: Readonly<Record<OscarLineKind, readonly string[]>> = {
  start: [CHRIGI, 'Ordnungskreis im Einsatz!', 'Im Namen von Chrigi…'],
  tidy: ['Das gehört hier nicht hin!', 'Chrigi hätte das nie erlaubt.', 'Schon wieder eine Tasse?!', 'Ordnung muss sein.', 'Wer war das?!'],
  lunchbox: ['Igitt, das lebt ja!', 'Wem gehört das Znüni?!', 'Das stinkt zum Himmel!'],
  bin: ['Der Papierkorb platzt gleich!', 'Wer leert hier je den Korb?!'],
  done: ['Chrigi wäre stolz.', 'So. Fürs Erste.'],
};
