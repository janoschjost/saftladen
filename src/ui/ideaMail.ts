/** "Idee senden": the mailto for a feature idea or request, to both devs, with a German template that leads through the topics. */
export const IDEA_MAIL_TO = ['marco.rieser@vitamin2.ch', 'janosch.jost@vitamin2.ch'];
export const IDEA_MAIL_SUBJECT = 'Saftladen: Idee / Feature-Wunsch';

export function ideaMailBody(gameUrl: string): string {
  return [
    'Hallo Marco, hallo Janosch',
    '',
    'ich habe eine Idee für den Saftladen:',
    '',
    '1. Worum geht es? (ein Satz als Titel)',
    '',
    '',
    '2. Was soll passieren? (Was sieht man, wer macht was, wann?)',
    '',
    '',
    '3. Wozu? (Warum wäre das gut oder lustig?)',
    '',
    '',
    '4. Wo im Spiel? (Ansicht, Uhrzeit, Person, Raum)',
    `   ${gameUrl}`,
    '',
    '',
    '5. Sonstiges (Beispiele, Bilder, Links)',
    '',
    '',
    'Danke und liebe Grüsse',
  ].join('\n');
}

export function ideaMailHref(gameUrl: string): string {
  const q = `subject=${encodeURIComponent(IDEA_MAIL_SUBJECT)}&body=${encodeURIComponent(ideaMailBody(gameUrl))}`;
  return `mailto:${IDEA_MAIL_TO.join(',')}?${q}`;
}

/** Keeps the link's address current: the game URL changes with the view, so it is filled in as the link is used. */
export function installIdeaMail(link: HTMLAnchorElement): void {
  const update = () => (link.href = ideaMailHref(location.href));
  update();
  for (const ev of ['pointerdown', 'focus', 'click'] as const) link.addEventListener(ev, update);
}
