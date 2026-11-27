import { describe, expect, it } from 'vitest';
import { ideaMailBody, ideaMailHref, IDEA_MAIL_SUBJECT } from './ideaMail';

describe('ui.ideamail', () => {
  const url = 'http://localhost:5173/?seed=1&time=11#orbit';

  it('ui.ideamail: mailto goes to both devs with the subject set', () => {
    const href = ideaMailHref(url);
    expect(href.startsWith('mailto:marco.rieser@vitamin2.ch,janosch.jost@vitamin2.ch?')).toBe(true);
    const q = new URLSearchParams(href.split('?')[1]);
    expect(q.get('subject')).toBe(IDEA_MAIL_SUBJECT);
    expect(q.get('body')).toBe(ideaMailBody(url));
  });

  it('ui.ideamail: the body is German, has the five topics and the game URL', () => {
    const body = ideaMailBody(url);
    for (const t of ['Worum geht es?', 'Was soll passieren?', 'Wozu?', 'Wo im Spiel?', 'Sonstiges']) expect(body).toContain(t);
    expect(body).toContain(url);
  });
});
