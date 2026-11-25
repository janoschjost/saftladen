export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** The settings choice: one season, or `auto` (follows the calendar month of the real date). */
export type SeasonSetting = 'auto' | Season;

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_SETTINGS: readonly SeasonSetting[] = ['auto', ...SEASONS];

/** What a season does to Auto weather and the light. */
export interface SeasonProfile {
  /** stretches the dry spells between two showers */
  dry: number;
  /** stretches how long a shower lasts */
  wet: number;
  /** share of the showers that fall as snow */
  snow: number;
  /** share of the showers that are thunderstorms (what is left is plain rain) */
  storm: number;
  /** the sky leans towards this colour by day */
  tint: string;
  /** how far (0..1) */
  tintAmount: number;
}

export const SEASON_PROFILE: Record<Season, SeasonProfile> = {
  spring: { dry: 0.8, wet: 0.8, snow: 0, storm: 0.05, tint: '#e3f1dc', tintAmount: 0.12 }, // short, frequent showers, fresh green light
  summer: { dry: 1.8, wet: 0.8, snow: 0, storm: 0.2, tint: '#fff0c8', tintAmount: 0.14 }, // mostly dry, now and then a storm, warm light
  autumn: { dry: 0.6, wet: 1.4, snow: 0, storm: 0.08, tint: '#f1d7b0', tintAmount: 0.14 }, // wet, amber light
  winter: { dry: 1, wet: 1.2, snow: 0.9, storm: 0, tint: '#dce8f6', tintAmount: 0.14 }, // snow instead of rain, cold light
};

/** Meteorological seasons by month (0 = January): March to May spring, June to August summer, September to November autumn. */
export function seasonOfMonth(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** The season a setting means right now. */
export function resolveSeason(setting: SeasonSetting, now = new Date()): Season {
  return setting === 'auto' ? seasonOfMonth(now.getMonth()) : setting;
}
