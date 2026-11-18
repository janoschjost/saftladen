import { describe, expect, it } from 'vitest';
import { OFFICE_ACTIONS as actions } from '../data/actions';
import { icon, iconNames } from './icons';

describe('icons', () => {
  it('ui.icons: every name of the set draws an inline SVG that takes the text colour', () => {
    for (const name of iconNames) {
      const svg = icon(name, 18, 'x');
      expect(svg).toMatch(/^<svg class="x" viewBox="0 0 256 256" width="18" height="18"/);
      expect(svg).toContain('fill="currentColor"');
      expect(svg).toContain('<path');
    }
  });

  it('ui.icons: every Aktionen card uses an icon of the set', () => {
    for (const a of actions) expect(iconNames).toContain(a.icon);
  });
});
