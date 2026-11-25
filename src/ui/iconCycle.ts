import { fxRandom } from '../game/rng';
import { icon, iconNames, type IconName } from './icons';

/** Seconds a cycling icon stays, from .. to (picked at random each time). */
export const CYCLE_SECONDS = [2, 5] as const;

/** A random one of `names` that is not `current` (the first pick may be any). */
export function nextIcon(names: readonly IconName[], current: IconName | null, rnd: () => number = fxRandom): IconName {
  const pool = names.filter((n) => n !== current);
  return pool[Math.floor(rnd() * pool.length)];
}

/**
 * The "Auto" chip of a segment row shows a random icon of the row at the start, and swaps it for another one at random
 * times (every 2-5 s) while `active()` says so (the popover is open); not at all with reduced motion.
 */
export function cycleIcons(chip: HTMLElement, active: () => boolean): void {
  const names = (chip.dataset.cycle ?? '').split(',').filter((n): n is IconName => (iconNames as string[]).includes(n));
  if (names.length < 2) return;
  const show = (name: IconName) => {
    chip.dataset.icon = name;
    chip.querySelector('span')!.innerHTML = icon(name, 20);
  };
  show(nextIcon(names, null));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tick = () => {
    if (active()) show(nextIcon(names, chip.dataset.icon as IconName));
    setTimeout(tick, (CYCLE_SECONDS[0] + fxRandom() * (CYCLE_SECONDS[1] - CYCLE_SECONDS[0])) * 1000);
  };
  setTimeout(tick, CYCLE_SECONDS[0] * 1000);
}
