import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, serializeSettings } from './settingsState';

const june = new Date(2026, 5, 1);
const december = new Date(2026, 11, 1);

describe('hud.settings', () => {
  it('starts with labels off, auto weather and the camera following actions', () => {
    expect(parseSettings(null, june)).toEqual({ tables: false, seats: false, rooms: false, weather: 'auto', season: 'auto', xmas: false, follow: true });
  });

  it('turns Christmas on by default only in December', () => {
    expect(defaultSettings(december).xmas).toBe(true);
    expect(parseSettings('{}', december).xmas).toBe(true);
    expect(parseSettings('{"xmas":false}', december).xmas).toBe(false);
  });

  it('keeps stored values, including "Kamera folgt bei Aktionen" off', () => {
    const s = parseSettings('{"tables":false,"seats":true,"rooms":false,"weather":"rain","xmas":true,"follow":false}', june);
    expect(s).toEqual({ tables: false, seats: true, rooms: false, weather: 'rain', season: 'auto', xmas: true, follow: false });
  });

  it('falls back per field on bad data', () => {
    expect(parseSettings('not json', june)).toEqual(defaultSettings(june));
    expect(parseSettings('[1,2]', june)).toEqual(defaultSettings(june));
    const s = parseSettings('{"weather":"hail","follow":"yes","tables":0}', june);
    expect(s.weather).toBe('auto');
    expect(s.follow).toBe(true);
    expect(s.tables).toBe(false);
  });

  it('weather.season: the season defaults to Auto and an unknown value falls back to it', () => {
    expect(defaultSettings(june).season).toBe('auto');
    expect(parseSettings('{"season":"monsoon","weather":"hail"}', june)).toMatchObject({ season: 'auto', weather: 'auto' });
    expect(parseSettings('{"season":"autumn","weather":"snow"}', june)).toMatchObject({ season: 'autumn', weather: 'snow' });
  });

  it('round-trips through the stored JSON', () => {
    const s = { tables: false, seats: false, rooms: true, weather: 'storm' as const, season: 'winter' as const, xmas: false, follow: false };
    expect(parseSettings(serializeSettings(s), june)).toEqual(s);
  });
});
