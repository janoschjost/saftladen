import { describe, expect, it } from 'vitest';
import { resolveSeason, seasonOfMonth } from './Season';

describe('weather.season: Auto follows the calendar month', () => {
  it('weather.season: March to May spring, June to August summer, September to November autumn, December to February winter', () => {
    const names = Array.from({ length: 12 }, (_, m) => seasonOfMonth(m));
    expect(names).toEqual(['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']);
  });

  it('weather.season: a chosen season wins over the date, Auto takes the date', () => {
    expect(resolveSeason('auto', new Date(2026, 6, 1))).toBe('summer');
    expect(resolveSeason('winter', new Date(2026, 6, 1))).toBe('winter');
  });
});
