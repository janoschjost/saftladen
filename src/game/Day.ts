import type * as THREE from 'three';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';

/** What a task of "Ein Tag im Leben" gets to work with. */
export interface DayCtx {
  scene: THREE.Scene;
  nav: NavGrid;
  person: Person;
  /** speech bubble above the played person (or above `who`) */
  say(text: string, who?: Person): void;
  /** keys held right now (`KeyboardEvent.code`) */
  keys: ReadonlySet<string>;
  /** somebody else of the team (null when unknown) */
  other(id: string): Person | null;
  /** the person sits down at their desk and stays pinned there (false when there is no desk) */
  seat(person: Person): boolean;
  /** the person leaves what they were doing, walks to `at` (when `walk`) and stands there turned to `yaw` until `release` */
  pin(person: Person, spot: { at: Vec2; yaw: number; turn?: number; walk?: boolean }): void;
  release(person: Person): void;
}

/** How the on-screen meter of a task looks: a label, a bar and a mood (colour). */
export interface DayMeter {
  label: string;
  /** 0..1 */
  value: number;
  mood: 'safe' | 'warn' | 'danger';
}

/** One job of a story. Created fresh per run; `start` builds its props, `dispose` removes them again. */
export interface DayTask {
  readonly title: string;
  /** short progress text next to the title ("3 / 8") */
  readonly progress: string;
  /** true once the player has finished it */
  readonly done: boolean;
  /** floor spots the player should head for (the on-screen pointer aims at the nearest) */
  readonly targets: readonly Vec2[];
  /** other people (team ids) who have to be in the office for this task */
  readonly needs?: readonly string[];
  /** false = the player does not walk the person around (default: true) */
  readonly walk?: boolean;
  /** false while the task still sets up; the stopwatch waits */
  readonly ready?: boolean;
  /** set (with a reason) when the player lost; the day stops and offers a retry */
  readonly failed?: string | null;
  /** a bar under the task list */
  readonly meter?: DayMeter | null;
  start(ctx: DayCtx): void;
  update(dt: number, ctx: DayCtx): void;
  dispose(): void;
}

/** Formats seconds as mm:ss.t */
export function formatTime(seconds: number): string {
  const t = Math.floor(seconds * 10);
  const s = Math.floor(t / 10);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${t % 10}`;
}
