import type { TeamMember } from '../data/types';
import { random, type Rng } from './rng';

/**
 * Kompensiertier "Kurt", Marco's alter ego (#32). Marco turns into Kurt when he goes home (end of day, leaving for the
 * home office), sometimes works from home as Kurt, and Kurt shows on his monitor while he is out during block times.
 */
export const KURT = {
  name: 'Kurt',
  /** chance per home office spell to show Kurt in the feed instead of Marco */
  homeChance: 0.2,
  /** seconds of the spin on the spot before walking out; the skin swaps halfway */
  spin: 1,
  /** block times at work (game clock hours): only then does his empty desk show Kurt on the monitor */
  screen: { from: 8.5, to: 17 },
};

/** Why somebody walks out of the door. Only going home turns an alter ego on (not lunch, errands or a hand-sent person). */
export type LeaveReason = 'end' | 'home' | 'errand' | 'lunch' | 'manual';

export function transformsOnLeave(member: Pick<TeamMember, 'alterEgo'>, reason: LeaveReason): boolean {
  return !!member.alterEgo && (reason === 'end' || reason === 'home');
}

/** Rolled once per home office spell: does the feed show the alter ego? Draws no number for people without one. */
export function rollHomeAlter(member: Pick<TeamMember, 'alterEgo'>, rnd: Rng = random): boolean {
  return !!member.alterEgo && rnd() < KURT.homeChance;
}

/**
 * Kurt on Marco's office monitor: while Marco is out of the office and not in the home office, nobody sits at the
 * desk, and the clock is within block times. Otherwise the screen behaves as usual.
 */
export function kurtOnScreen(s: { hour: number; presence: 'in' | 'leaving' | 'out' | 'returning'; awayKind: 'errand' | 'home' | 'off' | null; deskUsed: boolean }): boolean {
  const h = s.hour % 24;
  return s.presence === 'out' && s.awayKind !== 'home' && !s.deskUsed && h >= KURT.screen.from && h < KURT.screen.to;
}
