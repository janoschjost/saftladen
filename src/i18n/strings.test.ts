import { expect, test } from 'vitest';
import { awayStatus } from './strings';

test('presence.roster: an errand counts down, somebody held out for good shows no countdown', () => {
  expect(awayStatus('errand', 'out', 75)).toBe('Weg · zurück in 1:15');
  expect(awayStatus('errand', 'out', Infinity)).toBe('Weg');
  expect(awayStatus('home', 'out', Infinity)).toBe('Homeoffice');
});
