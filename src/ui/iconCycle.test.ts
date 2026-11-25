import { describe, expect, it } from 'vitest';
import { nextIcon } from './iconCycle';

describe('hud.environment: the Auto chips show a random icon that swaps now and then', () => {
  const names = ['weather', 'day', 'rain', 'snow', 'storm'] as const;

  it('hud.environment: the first pick may be any icon of the row', () => {
    expect(nextIcon(names, null, () => 0)).toBe('weather');
    expect(nextIcon(names, null, () => 0.99)).toBe('storm');
  });

  it('hud.environment: a swap never shows the same icon twice in a row, and always stays in the row', () => {
    let cur = nextIcon(names, null, () => 0.3);
    for (let i = 0; i < 200; i++) {
      const next = nextIcon(names, cur, () => (i * 0.37) % 1);
      expect(next).not.toBe(cur);
      expect(names).toContain(next);
      cur = next;
    }
  });
});
