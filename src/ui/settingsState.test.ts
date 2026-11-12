import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, serializeSettings } from './settingsState';

const june = new Date(2026, 5, 1);
const december = new Date(2026, 11, 1);

describe('hud.settings', () => {
  it('starts with labels on, auto weather and the camera following actions', () => {
    expect(parseSettings(null, june)).toEqual({ tables: true, seats: true, rooms: true, weather: 'auto', xmas: false, follow: true });
  });

  it('turns Christmas on by default only in December', () => {
    expect(defaultSettings(december).xmas).toBe(true);
    expect(parseSettings('{}', december).xmas).toBe(true);
    expect(parseSettings('{"xmas":false}', december).xmas).toBe(false);
  });

  it('keeps stored values, including "Kamera folgt bei Aktionen" off', () => {
    const s = parseSettings('{"tables":false,"seats":true,"rooms":false,"weather":"rain","xmas":true,"follow":false}', june);
    expect(s).toEqual({ tables: false, seats: true, rooms: false, weather: 'rain', xmas: true, follow: false });
  });

  it('falls back per field on bad data', () => {
    expect(parseSettings('not json', june)).toEqual(defaultSettings(june));
    expect(parseSettings('[1,2]', june)).toEqual(defaultSettings(june));
    const s = parseSettings('{"weather":"hail","follow":"yes","tables":0}', june);
    expect(s.weather).toBe('auto');
    expect(s.follow).toBe(true);
    expect(s.tables).toBe(true);
  });

  it('round-trips through the stored JSON', () => {
    const s = { tables: false, seats: false, rooms: true, weather: 'sun' as const, xmas: false, follow: false };
    expect(parseSettings(serializeSettings(s), june)).toEqual(s);
  });
});
